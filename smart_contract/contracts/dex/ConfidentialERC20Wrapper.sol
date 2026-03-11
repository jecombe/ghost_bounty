// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialERC20Wrapper — Generic ERC-7984 wrapper for any ERC20
/// @notice Wraps any ERC20 into a confidential token with encrypted balances.
///         Same architecture as ConfidentialUSDC but parameterized.
contract ConfidentialERC20Wrapper is ReentrancyGuard, Pausable, Ownable, ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlying;
    string public name;
    string public symbol;

    uint256 public totalShielded;

    mapping(address => euint64) private _encBalances;
    mapping(address => mapping(address => euint64)) private _encAllowances;
    mapping(address => mapping(address => uint256)) private _operators;

    event Shield(address indexed account, uint256 amount);
    event Unshield(address indexed account, uint64 amount);
    event ConfidentialTransfer(address indexed from, address indexed to);
    event ConfidentialApproval(address indexed owner, address indexed spender);
    event OperatorSet(address indexed owner, address indexed operator, uint256 expiration);

    constructor(address _underlying, string memory _name, string memory _symbol) Ownable(msg.sender) {
        require(_underlying != address(0), "Zero address");
        underlying = IERC20(_underlying);
        name = _name;
        symbol = _symbol;
    }

    // ========================
    // ERC-7984: Operator System
    // ========================

    function setOperator(address operator, uint256 expiration) external {
        require(operator != address(0), "Zero address");
        _operators[msg.sender][operator] = expiration;
        emit OperatorSet(msg.sender, operator, expiration);
    }

    function isOperator(address owner_, address operator) public view returns (bool) {
        return _operators[owner_][operator] > block.timestamp;
    }

    // ========================
    // Shield / Unshield
    // ========================

    function shield(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");
        require(amount <= type(uint64).max, "Amount too large");

        underlying.safeTransferFrom(msg.sender, address(this), amount);
        totalShielded += amount;

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _addBalance(msg.sender, encAmount);

        emit Shield(msg.sender, amount);
    }

    function unshield(uint64 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Zero amount");

        euint64 encAmount = FHE.asEuint64(amount);
        _encBalances[msg.sender] = FHE.sub(_encBalances[msg.sender], encAmount);
        FHE.allowThis(_encBalances[msg.sender]);
        FHE.allow(_encBalances[msg.sender], msg.sender);

        totalShielded -= uint256(amount);
        underlying.safeTransfer(msg.sender, uint256(amount));

        emit Unshield(msg.sender, amount);
    }

    // ========================
    // Confidential Transfers (user-facing: externalEuint64)
    // ========================

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

    function confidentialTransferFrom(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external whenNotPaused {
        require(to != address(0), "Zero address");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        _encAllowances[from][msg.sender] = FHE.sub(_encAllowances[from][msg.sender], amount);
        FHE.allowThis(_encAllowances[from][msg.sender]);
        FHE.allow(_encAllowances[from][msg.sender], from);
        FHE.allow(_encAllowances[from][msg.sender], msg.sender);

        _encBalances[from] = FHE.sub(_encBalances[from], amount);
        FHE.allowThis(_encBalances[from]);
        FHE.allow(_encBalances[from], from);

        _addBalance(to, amount);

        emit ConfidentialTransfer(from, to);
    }

    // ========================
    // Contract-facing Transfers (euint64 directly, operator pattern)
    // ========================

    function confidentialTransfer(address to, euint64 amount) external whenNotPaused returns (euint64) {
        require(to != address(0), "Zero address");

        _encBalances[msg.sender] = FHE.sub(_encBalances[msg.sender], amount);
        FHE.allowThis(_encBalances[msg.sender]);
        FHE.allow(_encBalances[msg.sender], msg.sender);

        _addBalance(to, amount);

        emit ConfidentialTransfer(msg.sender, to);
        return amount;
    }

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
    // Views
    // ========================

    function encryptedBalanceOf(address account) external view returns (euint64) {
        return _encBalances[account];
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

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
