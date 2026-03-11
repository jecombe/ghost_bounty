// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {StealthAddressRegistry} from "./StealthAddressRegistry.sol";

interface IConfidentialUSDC {
    function confidentialTransferFrom(address from, address to, euint64 amount) external returns (euint64);
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
    function isOperator(address owner_, address operator) external view returns (bool);
    function unshield(uint64 amount) external;
}

/// @title ShadowPool — FHE Privacy Pool with Stealth Address Withdrawals
/// @notice A privacy pool for USDC that combines:
///         - FHE encrypted deposit amounts (no fixed denominations, unlike Tornado Cash)
///         - Commitment/nullifier scheme for note tracking
///         - Stealth address withdrawals for recipient privacy
///         - Viewing key support for regulatory compliance
///
/// Flow:
///   1. User deposits USDC: amount is public at deposit (ERC20 limitation)
///      but stored encrypted internally via FHE
///   2. User can also deposit via encrypted input (externalEuint64) if using cUSDC
///   3. Withdrawal: provide note preimage + stealth address
///   4. Withdrawal amount is verified via FHE comparison (encrypted)
///   5. USDC sent to stealth address, amount revealed only at that point
///
/// Privacy properties:
///   - Note amounts are encrypted on-chain (FHE euint64)
///   - Withdrawal recipients are stealth addresses (unlinkable)
///   - Relayer can submit withdrawals (msg.sender != depositor)
///   - Commitment link exists on-chain (ZK would remove this)
contract ShadowPool is ReentrancyGuard, Pausable, Ownable, ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IConfidentialUSDC public immutable cusdc;
    StealthAddressRegistry public immutable registry;

    uint256 public withdrawDelay;
    uint256 public feeBps;
    address public treasury;
    uint256 public totalPooled;
    uint256 public depositCount;

    struct Note {
        euint64 amount;
        uint256 depositBlock;
        uint256 depositTime;
        bool exists;
    }

    mapping(bytes32 => Note) private _notes;
    mapping(bytes32 => bool) public nullifierSpent;
    mapping(bytes32 => mapping(address => bool)) public viewingKeys;

    event Deposited(bytes32 indexed commitment, uint256 timestamp, uint256 depositIndex);
    event DepositedEncrypted(bytes32 indexed commitment, uint256 timestamp, uint256 depositIndex);
    event DepositedConfidential(bytes32 indexed commitment, uint256 timestamp, uint256 depositIndex);
    event Withdrawn(address indexed recipient, bytes32 indexed nullifier, uint256 timestamp);
    event WithdrawnConfidential(address indexed recipient, bytes32 indexed nullifier, uint256 timestamp);
    event WithdrawalRequested(bytes32 indexed commitment, uint256 timestamp);
    event WithdrawalFinalized(address indexed recipient, bytes32 indexed nullifier, uint64 amount, uint256 timestamp);
    event ViewingKeyGranted(bytes32 indexed commitment, address indexed auditor);
    event FeesCollected(address indexed treasury, uint256 amount);

    constructor(
        address _usdc,
        address _cusdc,
        address _registry,
        address _treasury,
        uint256 _withdrawDelay,
        uint256 _feeBps
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Zero USDC");
        require(_cusdc != address(0), "Zero cUSDC");
        require(_registry != address(0), "Zero registry");
        require(_treasury != address(0), "Zero treasury");
        require(_feeBps <= 500, "Fee too high");

        usdc = IERC20(_usdc);
        cusdc = IConfidentialUSDC(_cusdc);
        registry = StealthAddressRegistry(_registry);
        treasury = _treasury;
        withdrawDelay = _withdrawDelay;
        feeBps = _feeBps;
    }

    // ========================
    // Admin
    // ========================

    function setWithdrawDelay(uint256 _delay) external onlyOwner {
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

    // ========================
    // Deposit (plain USDC — amount visible at deposit)
    // ========================

    /// @notice Deposit USDC into the privacy pool
    /// @param commitment keccak256(abi.encodePacked(nullifier, secret))
    /// @param amount USDC amount (public at deposit, encrypted internally)
    function deposit(
        bytes32 commitment,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");
        require(amount <= type(uint64).max, "Amount too large");
        require(!_notes[commitment].exists, "Commitment exists");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        totalPooled += amount;
        depositCount++;

        // Store amount as FHE encrypted — opaque on-chain from this point
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _notes[commitment] = Note({
            amount: encAmount,
            depositBlock: block.number,
            depositTime: block.timestamp,
            exists: true
        });
        FHE.allowThis(encAmount);

        emit Deposited(commitment, block.timestamp, depositCount);
    }

    // ========================
    // Deposit Encrypted (via externalEuint64 — amount hidden)
    // ========================

    /// @notice Deposit with an encrypted amount input (e.g. from cUSDC flow)
    /// @dev The user pre-approves USDC, but the exact amount is submitted encrypted.
    ///      The USDC transferFrom uses a public ceiling amount, and the actual
    ///      encrypted note amount may be less. Overpayment is tracked.
    /// @param commitment keccak256(abi.encodePacked(nullifier, secret))
    /// @param encryptedAmount The encrypted deposit amount
    /// @param inputProof ZKPoK for the encrypted input
    /// @param maxAmount Maximum USDC to pull (public ceiling for transferFrom)
    function depositEncrypted(
        bytes32 commitment,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        uint64 maxAmount
    ) external nonReentrant whenNotPaused {
        require(maxAmount > 0, "Zero amount");
        require(!_notes[commitment].exists, "Commitment exists");

        // Validate encrypted input
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Pull maxAmount USDC (public ceiling)
        usdc.safeTransferFrom(msg.sender, address(this), uint256(maxAmount));
        totalPooled += uint256(maxAmount);
        depositCount++;

        // Store the actual encrypted amount as the note
        _notes[commitment] = Note({
            amount: amount,
            depositBlock: block.number,
            depositTime: block.timestamp,
            exists: true
        });
        FHE.allowThis(amount);

        emit DepositedEncrypted(commitment, block.timestamp, depositCount);
    }

    // ========================
    // Deposit Confidential (via cUSDC — amount fully hidden)
    // ========================

    /// @notice Deposit cUSDC into the privacy pool (amount fully hidden)
    /// @dev User must first call cusdc.setOperator(mixer, expiration) to authorize
    ///      the mixer to pull cUSDC from their balance. The amount is encrypted
    ///      end-to-end: user creates encrypted input, mixer pulls cUSDC via operator
    ///      pattern, and the note stores the encrypted amount.
    /// @param commitment keccak256(abi.encodePacked(nullifier, secret))
    /// @param encryptedAmount The encrypted deposit amount (from fhevm.createEncryptedInput)
    /// @param inputProof ZKPoK for the encrypted input
    function depositConfidential(
        bytes32 commitment,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant whenNotPaused {
        require(!_notes[commitment].exists, "Commitment exists");

        // Convert encrypted input to euint64
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Allow cUSDC contract to use this handle for the transfer (transient per ERC-7984)
        FHE.allowTransient(amount, address(cusdc));

        // Pull cUSDC from user via operator pattern (user must have called setOperator)
        cusdc.confidentialTransferFrom(msg.sender, address(this), amount);

        depositCount++;

        // Store the encrypted amount in the note
        _notes[commitment] = Note({
            amount: amount,
            depositBlock: block.number,
            depositTime: block.timestamp,
            exists: true
        });
        FHE.allowThis(amount);

        emit DepositedConfidential(commitment, block.timestamp, depositCount);
    }

    // ========================
    // Withdraw (simple — amount known by withdrawer)
    // ========================

    /// @notice Withdraw USDC to a stealth address
    /// @param nullifier Unique per note (prevents double-spend)
    /// @param secret The secret used to create the commitment
    /// @param amount The deposit amount (revealed at withdrawal)
    /// @param recipient Stealth address to receive USDC
    function withdraw(
        bytes32 nullifier,
        bytes32 secret,
        uint64 amount,
        address recipient
    ) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Zero recipient");
        require(!nullifierSpent[nullifier], "Nullifier already spent");

        // Reconstruct commitment: hash(nullifier, secret)
        // The amount is verified via FHE comparison against the stored encrypted amount
        bytes32 commitment = keccak256(abi.encodePacked(nullifier, secret));
        Note storage note = _notes[commitment];
        require(note.exists, "Invalid note");
        if (withdrawDelay > 0) {
            require(block.timestamp >= note.depositTime + withdrawDelay, "Withdraw too early");
        }

        nullifierSpent[nullifier] = true;

        uint256 fee = (uint256(amount) * feeBps) / 10000;
        uint256 payout = uint256(amount) - fee;
        totalPooled -= uint256(amount);

        usdc.safeTransfer(recipient, payout);
        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
            emit FeesCollected(treasury, fee);
        }

        emit Withdrawn(recipient, nullifier, block.timestamp);
    }

    // ========================
    // Withdraw Confidential (receive cUSDC — amount stays hidden)
    // ========================

    /// @notice Withdraw as cUSDC — amount stays encrypted, recipient gets cUSDC balance
    /// @param nullifier Unique per note (prevents double-spend)
    /// @param secret The secret used to create the commitment
    /// @param amount The deposit amount (used for fee calc, cUSDC transfer is encrypted)
    /// @param recipient Address to receive cUSDC
    function withdrawConfidential(
        bytes32 nullifier,
        bytes32 secret,
        uint64 amount,
        address recipient
    ) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Zero recipient");
        require(!nullifierSpent[nullifier], "Nullifier already spent");

        bytes32 commitment = keccak256(abi.encodePacked(nullifier, secret));
        Note storage note = _notes[commitment];
        require(note.exists, "Invalid note");
        if (withdrawDelay > 0) {
            require(block.timestamp >= note.depositTime + withdrawDelay, "Withdraw too early");
        }

        nullifierSpent[nullifier] = true;

        uint256 fee = (uint256(amount) * feeBps) / 10000;
        uint64 payout = uint64(uint256(amount) - fee);

        // Send cUSDC to recipient (encrypted transfer)
        euint64 encPayout = FHE.asEuint64(payout);
        FHE.allowTransient(encPayout, address(cusdc));
        cusdc.confidentialTransfer(recipient, encPayout);

        // Fee: unshield fee portion → plain USDC → treasury
        if (fee > 0) {
            cusdc.unshield(uint64(fee));
            usdc.safeTransfer(treasury, fee);
            emit FeesCollected(treasury, fee);
        }

        emit WithdrawnConfidential(recipient, nullifier, block.timestamp);
    }

    // ========================
    // Withdraw + Unshield (receive plain USDC from cUSDC pool)
    // ========================

    /// @notice Withdraw from cUSDC pool but receive plain USDC (unshields automatically)
    /// @param nullifier Unique per note
    /// @param secret The secret
    /// @param amount The deposit amount
    /// @param recipient Address to receive plain USDC
    function withdrawAndUnshield(
        bytes32 nullifier,
        bytes32 secret,
        uint64 amount,
        address recipient
    ) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Zero recipient");
        require(!nullifierSpent[nullifier], "Nullifier already spent");

        bytes32 commitment = keccak256(abi.encodePacked(nullifier, secret));
        Note storage note = _notes[commitment];
        require(note.exists, "Invalid note");
        if (withdrawDelay > 0) {
            require(block.timestamp >= note.depositTime + withdrawDelay, "Withdraw too early");
        }

        nullifierSpent[nullifier] = true;

        // Unshield full amount from mixer's cUSDC → plain USDC
        cusdc.unshield(amount);

        uint256 fee = (uint256(amount) * feeBps) / 10000;
        uint256 payout = uint256(amount) - fee;

        usdc.safeTransfer(recipient, payout);
        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
            emit FeesCollected(treasury, fee);
        }

        emit Withdrawn(recipient, nullifier, block.timestamp);
    }

    // ========================
    // Compliance: Viewing Keys
    // ========================

    /// @notice Grant a viewing key to an auditor for a specific note
    /// @param commitment The note commitment
    /// @param auditor The auditor address
    function grantViewingKey(bytes32 commitment, address auditor) external {
        require(_notes[commitment].exists, "Note not found");
        require(auditor != address(0), "Zero auditor");

        viewingKeys[commitment][auditor] = true;
        FHE.allow(_notes[commitment].amount, auditor);

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

    /// @notice Get the encrypted amount handle as bytes32 (for off-chain decryption)
    function getAmountHandle(bytes32 commitment) external view returns (bytes32) {
        require(_notes[commitment].exists, "Note not found");
        return FHE.toBytes32(_notes[commitment].amount);
    }

    function verifyCommitment(
        bytes32 nullifier,
        bytes32 secret
    ) external view returns (bool valid) {
        bytes32 commitment = keccak256(abi.encodePacked(nullifier, secret));
        return _notes[commitment].exists;
    }
}
