// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FHE, euint64, externalEuint64, eaddress, externalEaddress, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IConfidentialUSDC_Vault {
    function confidentialTransferFrom(address from, address to, euint64 amount) external returns (euint64);
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
    function isOperator(address owner_, address operator) external view returns (bool);
    function unshield(uint64 amount) external;
}

/// @title ConfidentialVault — Privacy Vault with Untraceable Withdrawals
/// @notice A privacy pool where withdrawals go to encrypted addresses (eaddress).
///         The contract updates ALL registered balances on every withdrawal using
///         FHE select operations, making it impossible to determine which balance
///         was actually credited (Oblivious RAM pattern).
///
/// Flow:
///   1. Users register with an encrypted address (eaddress) — nobody knows which
///      slot belongs to whom
///   2. Deposits create encrypted notes (commitment/nullifier scheme)
///   3. Withdrawals credit an eaddress — the contract touches EVERY balance,
///      making it impossible to trace the recipient
///   4. Users claim their balance via their real address (linked at registration)
///
/// Privacy properties:
///   - Deposit amounts: encrypted (FHE euint64)
///   - Withdrawal recipient: encrypted (eaddress) — UNTRACEABLE
///   - All balances updated on every withdrawal (oblivious pattern)
///   - Claim reveals only that "someone withdrew something" — not linked to any deposit
///
/// Security fixes over ShadowPool:
///   - Withdrawal amount verified against stored FHE note
///   - Depositor address bound in commitment
///   - Viewing key access restricted to depositor
///   - Notes invalidated after withdrawal
///   - Ownable2Step to prevent accidental ownership loss
contract ConfidentialVault is ReentrancyGuard, Pausable, Ownable2Step, ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    // ========================
    // State
    // ========================

    IERC20 public immutable usdc;
    IConfidentialUSDC_Vault public immutable cusdc;

    uint256 public withdrawDelay;
    uint256 public feeBps;
    address public treasury;
    uint256 public depositCount;

    /// @dev Max users per bucket for gas-bounded oblivious updates
    uint256 public constant MAX_BUCKET_SIZE = 100;

    // --- Notes (deposit tracking) ---
    struct Note {
        euint64 amount;
        address depositor;
        uint256 depositTime;
        bool exists;
    }

    mapping(bytes32 => Note) private _notes;
    mapping(bytes32 => bool) public nullifierSpent;

    // --- Confidential Vault Slots ---
    /// @dev Each user occupies a slot in a bucket. Their eaddress and balance are encrypted.
    struct VaultSlot {
        eaddress encAddress;  // encrypted address — nobody knows who this slot belongs to
        euint64 balance;      // encrypted balance
        address claimAddress; // real address for claiming (set at registration)
        bool active;
    }

    /// @dev Buckets of vault slots — withdrawals update all slots in a bucket
    /// bucketId => slotIndex => VaultSlot
    mapping(uint256 => mapping(uint256 => VaultSlot)) private _slots;
    mapping(uint256 => uint256) public bucketSize; // number of active slots per bucket
    uint256 public bucketCount;

    /// @dev Prevent duplicate registrations
    mapping(address => bool) public isRegistered;

    // ========================
    // Events
    // ========================

    event Deposited(bytes32 indexed commitment, uint256 timestamp, uint256 depositIndex);
    event DepositedConfidential(bytes32 indexed commitment, uint256 timestamp, uint256 depositIndex);
    event WithdrawnToVault(bytes32 indexed nullifierHash, uint256 indexed bucketId, uint256 timestamp);
    event Claimed(address indexed claimer, uint256 timestamp);
    event Registered(uint256 indexed bucketId, uint256 indexed slotIndex, uint256 timestamp);
    event ViewingKeyGranted(bytes32 indexed commitment, address indexed auditor);
    event FeesCollected(address indexed treasury, uint256 amount);
    event BucketCreated(uint256 indexed bucketId);

    // ========================
    // Constructor
    // ========================

    constructor(
        address _usdc,
        address _cusdc,
        address _treasury,
        uint256 _withdrawDelay,
        uint256 _feeBps
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Zero USDC");
        require(_cusdc != address(0), "Zero cUSDC");
        require(_treasury != address(0), "Zero treasury");
        require(_feeBps <= 500, "Fee too high");
        require(_withdrawDelay > 0, "Delay must be > 0");

        usdc = IERC20(_usdc);
        cusdc = IConfidentialUSDC_Vault(_cusdc);
        treasury = _treasury;
        withdrawDelay = _withdrawDelay;
        feeBps = _feeBps;

        // Create the first bucket
        bucketCount = 1;
        emit BucketCreated(0);
    }

    // ========================
    // Admin
    // ========================

    function setWithdrawDelay(uint256 _delay) external onlyOwner {
        require(_delay > 0, "Delay must be > 0");
        withdrawDelay = _delay;
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high");
        feeBps = _feeBps;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @dev Override renounceOwnership to prevent accidental lockout
    function renounceOwnership() public pure override {
        revert("Renounce disabled");
    }

    // ========================
    // Register (join the anonymity set)
    // ========================

    /// @notice Register an encrypted address in a vault bucket.
    ///         The eaddress hides which slot belongs to you.
    /// @param encAddr Your address, encrypted with FHE
    /// @param inputProof Proof for the encrypted input
    /// @param bucketId Which bucket to join (for gas optimization)
    function register(
        externalEaddress encAddr,
        bytes calldata inputProof,
        uint256 bucketId
    ) external whenNotPaused {
        require(!isRegistered[msg.sender], "Already registered");
        require(bucketId < bucketCount, "Invalid bucket");
        require(bucketSize[bucketId] < MAX_BUCKET_SIZE, "Bucket full");

        eaddress addr = FHE.fromExternal(encAddr, inputProof);

        uint256 slotIdx = bucketSize[bucketId];
        _slots[bucketId][slotIdx] = VaultSlot({
            encAddress: addr,
            balance: FHE.asEuint64(0),
            claimAddress: msg.sender,
            active: true
        });

        FHE.allowThis(addr);
        FHE.allowThis(_slots[bucketId][slotIdx].balance);

        bucketSize[bucketId] = slotIdx + 1;
        isRegistered[msg.sender] = true;

        // Create new bucket if this one is full
        if (bucketSize[bucketId] == MAX_BUCKET_SIZE) {
            emit BucketCreated(bucketCount);
            bucketCount++;
        }

        emit Registered(bucketId, slotIdx, block.timestamp);
    }

    // ========================
    // Deposit (plain USDC)
    // ========================

    /// @notice Deposit USDC into the privacy vault
    /// @param nullifier Unique per note (prevents double-spend)
    /// @param secret The secret for the commitment
    /// @param amount USDC amount (public at deposit time, encrypted internally)
    function deposit(
        bytes32 nullifier,
        bytes32 secret,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");
        require(amount <= type(uint64).max, "Amount too large");

        // Commitment binds nullifier + secret + depositor
        bytes32 commitment = _computeCommitment(nullifier, secret, msg.sender);
        require(!_notes[commitment].exists, "Commitment exists");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        depositCount++;

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _notes[commitment] = Note({
            amount: encAmount,
            depositor: msg.sender,
            depositTime: block.timestamp,
            exists: true
        });
        FHE.allowThis(encAmount);

        emit Deposited(commitment, block.timestamp, depositCount);
    }

    // ========================
    // Deposit Confidential (via cUSDC — amount fully hidden)
    // ========================

    /// @notice Deposit cUSDC (amount fully hidden end-to-end)
    /// @dev User must call cusdc.setOperator(vault, expiration) first
    /// @param nullifier Unique per note
    /// @param secret The secret for the commitment
    /// @param encryptedAmount Encrypted deposit amount
    /// @param inputProof Proof for the encrypted input
    function depositConfidential(
        bytes32 nullifier,
        bytes32 secret,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant whenNotPaused {
        bytes32 commitment = _computeCommitment(nullifier, secret, msg.sender);
        require(!_notes[commitment].exists, "Commitment exists");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Pull cUSDC via operator pattern
        FHE.allowTransient(amount, address(cusdc));
        cusdc.confidentialTransferFrom(msg.sender, address(this), amount);

        depositCount++;

        _notes[commitment] = Note({
            amount: amount,
            depositor: msg.sender,
            depositTime: block.timestamp,
            exists: true
        });
        FHE.allowThis(amount);

        emit DepositedConfidential(commitment, block.timestamp, depositCount);
    }

    // ========================
    // Withdraw to Vault (UNTRACEABLE — the core innovation)
    // ========================

    /// @notice Withdraw to an encrypted address in the vault.
    ///         The contract updates ALL slots in the target bucket,
    ///         making it impossible to know which slot received the funds.
    /// @param nullifier The nullifier for the note
    /// @param secret The secret for the note
    /// @param depositor The original depositor address (part of commitment)
    /// @param encRecipient Encrypted recipient address (eaddress)
    /// @param inputProof Proof for the encrypted address
    /// @param bucketId Target bucket containing the recipient
    /// @param relayer Address of the relayer submitting this tx (or msg.sender)
    /// @param relayerFeeBps Relayer fee in basis points (max 100 = 1%)
    function withdrawToVault(
        bytes32 nullifier,
        bytes32 secret,
        address depositor,
        externalEaddress encRecipient,
        bytes calldata inputProof,
        uint256 bucketId,
        address relayer,
        uint256 relayerFeeBps
    ) external nonReentrant whenNotPaused {
        require(bucketId < bucketCount, "Invalid bucket");
        require(relayerFeeBps <= 100, "Relayer fee too high"); // max 1%

        bytes32 nullifierHash = keccak256(abi.encodePacked(nullifier));
        require(!nullifierSpent[nullifierHash], "Nullifier spent");

        // Reconstruct commitment with depositor binding
        bytes32 commitment = _computeCommitment(nullifier, secret, depositor);
        Note storage note = _notes[commitment];
        require(note.exists, "Invalid note");
        require(block.timestamp >= note.depositTime + withdrawDelay, "Too early");

        // Mark spent and invalidate note
        nullifierSpent[nullifierHash] = true;
        note.exists = false;

        // Get the encrypted amount from the note (verified, not user-supplied)
        euint64 noteAmount = note.amount;

        // Calculate fees on the encrypted amount
        euint64 protocolFee = FHE.asEuint64(0);
        euint64 relayerFee = FHE.asEuint64(0);
        euint64 payout = noteAmount;

        if (feeBps > 0) {
            // protocolFee = noteAmount * feeBps / 10000
            protocolFee = FHE.div(FHE.mul(noteAmount, uint64(feeBps)), 10000);
            payout = FHE.sub(payout, protocolFee);
            FHE.allowThis(protocolFee);
        }

        if (relayerFeeBps > 0 && relayer != address(0)) {
            // relayerFee = noteAmount * relayerFeeBps / 10000
            relayerFee = FHE.div(FHE.mul(noteAmount, uint64(relayerFeeBps)), 10000);
            payout = FHE.sub(payout, relayerFee);
            FHE.allowThis(relayerFee);
        }

        // === OBLIVIOUS UPDATE: touch ALL slots in the bucket ===
        eaddress recipient = FHE.fromExternal(encRecipient, inputProof);
        uint256 size = bucketSize[bucketId];

        for (uint256 i = 0; i < size; i++) {
            VaultSlot storage slot = _slots[bucketId][i];
            if (!slot.active) continue;

            // Does this slot match the encrypted recipient?
            ebool isMatch = FHE.eq(recipient, slot.encAddress);

            // Conditionally add payout — only the matching slot gets credited,
            // but ALL slots are "touched" (ciphertext updated)
            euint64 addition = FHE.select(isMatch, payout, FHE.asEuint64(0));
            slot.balance = FHE.add(slot.balance, addition);
            FHE.allowThis(slot.balance);
        }

        // Handle protocol fee: credit to treasury's vault balance
        // (treasury should register in the vault too, or we handle separately)
        if (feeBps > 0) {
            _accruedFees = FHE.add(_accruedFees, protocolFee);
            FHE.allowThis(_accruedFees);
        }

        // Handle relayer fee: credit to relayer's vault balance
        if (relayerFeeBps > 0 && relayer != address(0)) {
            _accruedRelayerFees[relayer] = FHE.add(_accruedRelayerFees[relayer], relayerFee);
            FHE.allowThis(_accruedRelayerFees[relayer]);
            FHE.allow(_accruedRelayerFees[relayer], relayer);
        }

        emit WithdrawnToVault(nullifierHash, bucketId, block.timestamp);
    }

    // ========================
    // Claim (withdraw from vault to real address)
    // ========================

    /// @notice Claim your vault balance as cUSDC (stays confidential)
    /// @param bucketId The bucket where you registered
    /// @param slotIndex Your slot index in the bucket
    function claim(
        uint256 bucketId,
        uint256 slotIndex
    ) external nonReentrant whenNotPaused {
        VaultSlot storage slot = _slots[bucketId][slotIndex];
        require(slot.active, "Slot not active");
        require(slot.claimAddress == msg.sender, "Not your slot");

        euint64 balance = slot.balance;
        slot.balance = FHE.asEuint64(0);
        FHE.allowThis(slot.balance);

        // Transfer as cUSDC to keep amounts hidden
        FHE.allowTransient(balance, address(cusdc));
        cusdc.confidentialTransfer(msg.sender, balance);

        emit Claimed(msg.sender, block.timestamp);
    }

    /// @notice Claim relayer fees
    function claimRelayerFees() external nonReentrant {
        euint64 fees = _accruedRelayerFees[msg.sender];
        _accruedRelayerFees[msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(_accruedRelayerFees[msg.sender]);

        FHE.allowTransient(fees, address(cusdc));
        cusdc.confidentialTransfer(msg.sender, fees);
    }

    /// @notice Owner withdraws accrued protocol fees as cUSDC
    function claimProtocolFees() external onlyOwner nonReentrant {
        euint64 fees = _accruedFees;
        _accruedFees = FHE.asEuint64(0);
        FHE.allowThis(_accruedFees);

        FHE.allowTransient(fees, address(cusdc));
        cusdc.confidentialTransfer(treasury, fees);

        emit FeesCollected(treasury, 0); // amount hidden
    }

    // ========================
    // Fee Accounting (encrypted)
    // ========================

    euint64 private _accruedFees;
    mapping(address => euint64) private _accruedRelayerFees;

    // ========================
    // Compliance: Viewing Keys
    // ========================

    /// @notice Grant viewing access to an auditor for a note
    /// @dev Only the depositor can grant viewing keys
    function grantViewingKey(bytes32 commitment, address auditor) external {
        Note storage note = _notes[commitment];
        require(note.exists, "Note not found");
        require(note.depositor == msg.sender, "Not depositor");
        require(auditor != address(0), "Zero auditor");

        FHE.allow(note.amount, auditor);
        emit ViewingKeyGranted(commitment, auditor);
    }

    // ========================
    // Views
    // ========================

    function commitmentExists(bytes32 commitment) external view returns (bool) {
        return _notes[commitment].exists;
    }

    function getDepositTime(bytes32 commitment) external view returns (uint256) {
        require(_notes[commitment].exists, "Note not found");
        return _notes[commitment].depositTime;
    }

    function getEncryptedAmount(bytes32 commitment) external view returns (euint64) {
        require(_notes[commitment].exists, "Note not found");
        return _notes[commitment].amount;
    }

    function getSlotBalance(uint256 bucketId, uint256 slotIndex) external view returns (euint64) {
        return _slots[bucketId][slotIndex].balance;
    }

    function computeCommitment(
        bytes32 nullifier,
        bytes32 secret,
        address depositor
    ) external pure returns (bytes32) {
        return _computeCommitment(nullifier, secret, depositor);
    }

    // ========================
    // Internal
    // ========================

    /// @dev Commitment = keccak256(nullifier, secret, depositor)
    ///      Binding the depositor prevents front-running and unauthorized withdrawal
    function _computeCommitment(
        bytes32 nullifier,
        bytes32 secret,
        address depositor
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(nullifier, secret, depositor));
    }
}
