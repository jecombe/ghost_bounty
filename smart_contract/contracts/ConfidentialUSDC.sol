// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialUSDC (cUSDC) - ERC-7984 wrapper for USDC
/// @notice Wraps plain USDC into confidential cUSDC with encrypted balances.
///         Values are stored as euint64 in raw USDC units (6 decimals).
///
/// Usage:
///   - shield(amount): Lock plain USDC, gain encrypted cUSDC balance
///   - unshield(amount): Burn encrypted balance, unlock plain USDC
///   - confidentialTransfer(): Send cUSDC privately (amount hidden)
///   - confidentialTransferFrom(): Delegated private transfer (requires approval)
///
/// Casino Integration:
///   The casino can call creditEncrypted() to mint cUSDC payouts directly
///   to winners without revealing amounts.
contract ConfidentialUSDC is ReentrancyGuard, Pausable, Ownable, ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    /// @notice Total USDC locked in confidential mode
    uint256 public totalShielded;

    /// @dev Encrypted balances in raw USDC units (6 decimals)
    mapping(address => euint64) private _encBalances;
    /// @dev Encrypted allowances in raw USDC units
    mapping(address => mapping(address => euint64)) private _encAllowances;

    /// @notice Authorized minters (casino, pool) that can credit encrypted balances
    mapping(address => bool) public authorizedMinters;

    // --- ERC-7984 Operator System ---
    /// @dev owner => operator => expiration timestamp
    mapping(address => mapping(address => uint256)) private _operators;

    event Shield(address indexed account, uint256 amount);
    event Unshield(address indexed account, uint64 amount);
    event ConfidentialTransfer(address indexed from, address indexed to);
    event ConfidentialApproval(address indexed owner, address indexed spender);
    event MinterSet(address indexed minter, bool authorized);
    event OperatorSet(address indexed owner, address indexed operator, uint256 expiration);

    modifier onlyMinter() {
        require(authorizedMinters[msg.sender], "Not authorized minter");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Zero address");
        usdc = IERC20(_usdc);
    }

    // --- Admin ---

    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterSet(minter, authorized);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ========================
    // ERC-7984: Operator System
    // ========================

    /// @notice Set an operator that can move confidential tokens on your behalf.
    /// @param operator Address to authorize
    /// @param expiration Timestamp until which the operator is valid (0 to revoke)
    function setOperator(address operator, uint256 expiration) external {
        require(operator != address(0), "Zero address");
        _operators[msg.sender][operator] = expiration;
        emit OperatorSet(msg.sender, operator, expiration);
    }

    /// @notice Check if an address is a valid (non-expired) operator for an owner.
    function isOperator(address owner_, address operator) public view returns (bool) {
        return _operators[owner_][operator] > block.timestamp;
    }

    // ========================
    // Shield / Unshield
    // ========================

    /// @notice Shield USDC: lock plain USDC, gain encrypted cUSDC balance
    /// @param amount Amount in raw USDC units (6 decimals)
    function shield(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");
        require(amount <= type(uint64).max, "Amount too large");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        totalShielded += amount;

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _addBalance(msg.sender, encAmount);

        emit Shield(msg.sender, amount);
    }

    /// @notice Unshield cUSDC: subtract from encrypted balance, unlock plain USDC
    /// @param amount Amount in raw USDC units (6 decimals)
    function unshield(uint64 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");

        euint64 encAmount = FHE.asEuint64(amount);
        _encBalances[msg.sender] = FHE.sub(_encBalances[msg.sender], encAmount);
        FHE.allowThis(_encBalances[msg.sender]);
        FHE.allow(_encBalances[msg.sender], msg.sender);

        totalShielded -= uint256(amount);
        usdc.safeTransfer(msg.sender, uint256(amount));

        emit Unshield(msg.sender, amount);
    }

    // ========================
    // Confidential Transfers
    // ========================

    /// @notice Transfer cUSDC confidentially (amount encrypted)
    function confidentialTransfer(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external whenNotPaused {
        require(to != address(0), "Zero address");
        require(to != msg.sender, "Self transfer");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        _encBalances[msg.sender] = FHE.sub(_encBalances[msg.sender], amount);
        FHE.allowThis(_encBalances[msg.sender]);
        FHE.allow(_encBalances[msg.sender], msg.sender);

        _addBalance(to, amount);

        emit ConfidentialTransfer(msg.sender, to);
    }

    /// @notice Approve spender for confidential transfers
    function confidentialApprove(
        address spender,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external whenNotPaused {
        require(spender != address(0), "Zero address");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _encAllowances[msg.sender][spender] = amount;
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        FHE.allow(amount, spender);

        emit ConfidentialApproval(msg.sender, spender);
    }

    /// @notice Transfer cUSDC on behalf of another (requires confidential approval)
    function confidentialTransferFrom(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external whenNotPaused {
        require(to != address(0), "Zero address");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Subtract from allowance
        _encAllowances[from][msg.sender] = FHE.sub(_encAllowances[from][msg.sender], amount);
        FHE.allowThis(_encAllowances[from][msg.sender]);
        FHE.allow(_encAllowances[from][msg.sender], from);
        FHE.allow(_encAllowances[from][msg.sender], msg.sender);

        // Subtract from sender
        _encBalances[from] = FHE.sub(_encBalances[from], amount);
        FHE.allowThis(_encBalances[from]);
        FHE.allow(_encBalances[from], from);

        // Add to recipient
        _addBalance(to, amount);

        emit ConfidentialTransfer(from, to);
    }

    // ========================
    // ERC-7984: Contract-facing Transfers (euint64 directly)
    // ========================

    /// @notice Transfer confidential tokens from msg.sender to `to` using an existing euint64 handle.
    /// @dev Used by contracts (e.g. DarkSwap) that already hold encrypted balances.
    function confidentialTransfer(address to, euint64 amount) external whenNotPaused returns (euint64) {
        require(to != address(0), "Zero address");

        _encBalances[msg.sender] = FHE.sub(_encBalances[msg.sender], amount);
        FHE.allowThis(_encBalances[msg.sender]);
        FHE.allow(_encBalances[msg.sender], msg.sender);

        _addBalance(to, amount);

        emit ConfidentialTransfer(msg.sender, to);
        return amount;
    }

    /// @notice Transfer confidential tokens from `from` to `to` using operator approval.
    /// @dev Operator pattern per ERC-7984 — no allowance needed, just `setOperator`.
    function confidentialTransferFrom(address from, address to, euint64 amount) external whenNotPaused returns (euint64) {
        require(to != address(0), "Zero address");
        require(isOperator(from, msg.sender), "Not operator");

        _encBalances[from] = FHE.sub(_encBalances[from], amount);
        FHE.allowThis(_encBalances[from]);
        FHE.allow(_encBalances[from], from);

        _addBalance(to, amount);

        emit ConfidentialTransfer(from, to);
        return amount;
    }

    // ========================
    // Minter Functions (Casino/Pool)
    // ========================

    /// @notice Credit encrypted cUSDC to an address (used by casino for payouts)
    /// @dev Caller must also transfer USDC to back the minted cUSDC
    function creditEncrypted(address to, euint64 amount) external onlyMinter {
        _addBalance(to, amount);
    }

    /// @notice Debit encrypted cUSDC from an address (used by casino to take bets)
    function debitEncrypted(address from, euint64 amount) external onlyMinter {
        _encBalances[from] = FHE.sub(_encBalances[from], amount);
        FHE.allowThis(_encBalances[from]);
        FHE.allow(_encBalances[from], from);
    }

    /// @notice Debit player's encrypted balance and release backing USDC to a recipient.
    ///         Used by casino: debit cUSDC from player, send plain USDC to HousePool.
    /// @param from Player whose encrypted balance is debited
    /// @param amount Amount in raw USDC units (plaintext — needed for game mechanics)
    /// @param usdcTo Address receiving the plain USDC (typically HousePool)
    function debitAndRelease(address from, uint64 amount, address usdcTo) external onlyMinter {
        require(amount > 0, "Zero amount");
        euint64 encAmount = FHE.asEuint64(amount);
        _encBalances[from] = FHE.sub(_encBalances[from], encAmount);
        FHE.allowThis(_encBalances[from]);
        FHE.allow(_encBalances[from], from);

        totalShielded -= uint256(amount);
        usdc.safeTransfer(usdcTo, uint256(amount));
    }

    /// @notice Accept plain USDC from caller and credit encrypted balance to recipient.
    ///         Used by casino: take USDC payout from pool, shield it into player's cUSDC.
    /// @param to Address receiving the encrypted credit
    /// @param amount Amount in raw USDC units
    function creditFromUSDC(address to, uint64 amount) external onlyMinter {
        require(amount > 0, "Zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), uint256(amount));
        totalShielded += uint256(amount);

        euint64 encAmount = FHE.asEuint64(amount);
        _addBalance(to, encAmount);
    }

    // ========================
    // Views
    // ========================

    /// @notice Get encrypted balance handle for an address
    function encryptedBalanceOf(address account) external view returns (euint64) {
        return _encBalances[account];
    }

    /// @notice Get encrypted allowance handle
    function encryptedAllowance(address owner_, address spender) external view returns (euint64) {
        return _encAllowances[owner_][spender];
    }

    // ========================
    // Internal
    // ========================

    function _addBalance(address to, euint64 amount) internal {
        if (FHE.isInitialized(_encBalances[to])) {
            _encBalances[to] = FHE.add(_encBalances[to], amount);
        } else {
            _encBalances[to] = amount;
        }
        FHE.allowThis(_encBalances[to]);
        FHE.allow(_encBalances[to], to);
    }
}
