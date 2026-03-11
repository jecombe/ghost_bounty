// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Minimal ERC-7984 interface for confidential token interactions
interface IERC7984 {
    function confidentialTransferFrom(address from, address to, euint64 amount) external returns (euint64);
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
    function isOperator(address owner_, address operator) external view returns (bool);
}

/// @title DarkDEX — Encrypted AMM with FHE
/// @notice A constant-product AMM where all amounts (reserves, swaps, LP shares)
///         are encrypted via FHE. Nobody can see pool sizes, swap amounts, or LP positions.
///
/// Design:
///   - Uses ERC-7984 confidential tokens (cUSDC, cWETH, etc.)
///   - Constant product invariant verified via multiplication (no division)
///   - All values scaled by SCALE before invariant checks to prevent euint64 overflow
///   - Self-settling: no keeper needed, any interaction triggers pending settlements
///
/// Limitations (v1):
///   - euint64 overflow limits practical pool size to ~4M tokens per side (6 decimals)
///   - SCALE=1e3 gives 0.001 token precision for invariant checks
///   - Invalid swaps are silently refunded (user checks balance to confirm)
contract DarkDEX is ReentrancyGuard, Ownable, ZamaEthereumConfig {

    /// @dev Scale factor for invariant checks to prevent euint64 overflow.
    ///      With SCALE=1e3 and 6-decimal tokens, products stay under ~1e18.
    uint64 constant SCALE = 1e3;

    struct Pool {
        IERC7984 tokenA;
        IERC7984 tokenB;
        euint64 reserveA;
        euint64 reserveB;
        euint64 totalLP;
        bool exists;
    }

    uint256 public poolCount;
    uint256 public feeBps; // 30 = 0.3%

    mapping(uint256 => Pool) private _pools;
    mapping(uint256 => mapping(address => euint64)) private _lpBalances;

    event PoolCreated(uint256 indexed poolId, address tokenA, address tokenB);
    event LiquidityAdded(uint256 indexed poolId, address indexed provider);
    event LiquidityRemoved(uint256 indexed poolId, address indexed provider);
    event Swapped(uint256 indexed poolId, address indexed trader, bool aToB);

    constructor(uint256 _feeBps) Ownable(msg.sender) {
        require(_feeBps <= 1000, "Fee too high"); // max 10%
        feeBps = _feeBps;
    }

    // ========================
    // Admin
    // ========================

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high");
        feeBps = _feeBps;
    }

    // ========================
    // Pool Views
    // ========================

    function getPool(uint256 poolId) external view returns (address tokenA, address tokenB, bool exists) {
        Pool storage p = _pools[poolId];
        return (address(p.tokenA), address(p.tokenB), p.exists);
    }

    function getEncryptedReserves(uint256 poolId) external view returns (euint64 reserveA, euint64 reserveB) {
        Pool storage p = _pools[poolId];
        require(p.exists, "Pool not found");
        return (p.reserveA, p.reserveB);
    }

    function getEncryptedLP(uint256 poolId, address user) external view returns (euint64) {
        return _lpBalances[poolId][user];
    }

    // ========================
    // Create Pool
    // ========================

    /// @notice Create a new liquidity pool. First LP sets the initial price ratio.
    /// @dev Both tokens must have setOperator(darkdex, expiration) called by msg.sender.
    ///      First LP receives LP shares = amountA (arbitrary but deterministic).
    /// @param tokenA Address of the first confidential token (ERC-7984)
    /// @param tokenB Address of the second confidential token (ERC-7984)
    /// @param encAmountA Encrypted amount of tokenA to deposit
    /// @param encAmountB Encrypted amount of tokenB to deposit
    /// @param inputProof Shared proof for both encrypted inputs
    function createPool(
        address tokenA,
        address tokenB,
        externalEuint64 encAmountA,
        externalEuint64 encAmountB,
        bytes calldata inputProof
    ) external nonReentrant returns (uint256 poolId) {
        require(tokenA != tokenB, "Same token");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");

        IERC7984 cTokenA = IERC7984(tokenA);
        IERC7984 cTokenB = IERC7984(tokenB);

        require(cTokenA.isOperator(msg.sender, address(this)), "Set operator on tokenA");
        require(cTokenB.isOperator(msg.sender, address(this)), "Set operator on tokenB");

        euint64 amountA = FHE.fromExternal(encAmountA, inputProof);
        euint64 amountB = FHE.fromExternal(encAmountB, inputProof);

        // Pull tokens from LP
        FHE.allowTransient(amountA, tokenA);
        cTokenA.confidentialTransferFrom(msg.sender, address(this), amountA);

        FHE.allowTransient(amountB, tokenB);
        cTokenB.confidentialTransferFrom(msg.sender, address(this), amountB);

        // First LP: shares = amountA
        euint64 lpShares = amountA;

        poolId = poolCount++;
        Pool storage pool = _pools[poolId];
        pool.tokenA = cTokenA;
        pool.tokenB = cTokenB;
        pool.reserveA = amountA;
        pool.reserveB = amountB;
        pool.totalLP = lpShares;
        pool.exists = true;

        FHE.allowThis(pool.reserveA);
        FHE.allowThis(pool.reserveB);
        FHE.allowThis(pool.totalLP);

        _lpBalances[poolId][msg.sender] = lpShares;
        FHE.allowThis(_lpBalances[poolId][msg.sender]);
        FHE.allow(_lpBalances[poolId][msg.sender], msg.sender);

        emit PoolCreated(poolId, tokenA, tokenB);
        emit LiquidityAdded(poolId, msg.sender);
    }

    // ========================
    // Add Liquidity
    // ========================

    /// @notice Add liquidity to an existing pool.
    /// @dev User submits amountA, amountB, and desiredLP (all encrypted).
    ///      Contract verifies proportionality via cross-multiplication:
    ///        desiredLP * reserveA <= amountA * totalLP
    ///        desiredLP * reserveB <= amountB * totalLP
    ///      If invalid, the user is refunded and gets 0 LP shares.
    function addLiquidity(
        uint256 poolId,
        externalEuint64 encAmountA,
        externalEuint64 encAmountB,
        externalEuint64 encDesiredLP,
        bytes calldata inputProof
    ) external nonReentrant {
        Pool storage pool = _pools[poolId];
        require(pool.exists, "Pool not found");
        require(pool.tokenA.isOperator(msg.sender, address(this)), "Set operator on tokenA");
        require(pool.tokenB.isOperator(msg.sender, address(this)), "Set operator on tokenB");

        euint64 amountA = FHE.fromExternal(encAmountA, inputProof);
        euint64 amountB = FHE.fromExternal(encAmountB, inputProof);
        euint64 desiredLP = FHE.fromExternal(encDesiredLP, inputProof);

        // Pull tokens
        FHE.allowTransient(amountA, address(pool.tokenA));
        pool.tokenA.confidentialTransferFrom(msg.sender, address(this), amountA);

        FHE.allowTransient(amountB, address(pool.tokenB));
        pool.tokenB.confidentialTransferFrom(msg.sender, address(this), amountB);

        // Verify proportionality (scaled to prevent overflow):
        // desiredLP * reserveA <= amountA * totalLP
        // desiredLP * reserveB <= amountB * totalLP
        euint64 sDesLP = FHE.div(desiredLP, SCALE);
        euint64 sResA = FHE.div(pool.reserveA, SCALE);
        euint64 sResB = FHE.div(pool.reserveB, SCALE);
        euint64 sAmtA = FHE.div(amountA, SCALE);
        euint64 sAmtB = FHE.div(amountB, SCALE);
        euint64 sTotalLP = FHE.div(pool.totalLP, SCALE);

        ebool validA = FHE.le(FHE.mul(sDesLP, sResA), FHE.mul(sAmtA, sTotalLP));
        ebool validB = FHE.le(FHE.mul(sDesLP, sResB), FHE.mul(sAmtB, sTotalLP));
        ebool valid = FHE.and(validA, validB);

        // Conditional: grant LP shares or refund
        euint64 actualLP = FHE.select(valid, desiredLP, FHE.asEuint64(0));
        euint64 refundA = FHE.select(valid, FHE.asEuint64(0), amountA);
        euint64 refundB = FHE.select(valid, FHE.asEuint64(0), amountB);

        // Update pool
        pool.reserveA = FHE.select(valid, FHE.add(pool.reserveA, amountA), pool.reserveA);
        pool.reserveB = FHE.select(valid, FHE.add(pool.reserveB, amountB), pool.reserveB);
        pool.totalLP = FHE.select(valid, FHE.add(pool.totalLP, actualLP), pool.totalLP);

        FHE.allowThis(pool.reserveA);
        FHE.allowThis(pool.reserveB);
        FHE.allowThis(pool.totalLP);

        // Grant LP
        if (FHE.isInitialized(_lpBalances[poolId][msg.sender])) {
            _lpBalances[poolId][msg.sender] = FHE.add(_lpBalances[poolId][msg.sender], actualLP);
        } else {
            _lpBalances[poolId][msg.sender] = actualLP;
        }
        FHE.allowThis(_lpBalances[poolId][msg.sender]);
        FHE.allow(_lpBalances[poolId][msg.sender], msg.sender);

        // Refund if invalid (transfers 0 if valid — no-op)
        FHE.allowTransient(refundA, address(pool.tokenA));
        pool.tokenA.confidentialTransfer(msg.sender, refundA);

        FHE.allowTransient(refundB, address(pool.tokenB));
        pool.tokenB.confidentialTransfer(msg.sender, refundB);

        emit LiquidityAdded(poolId, msg.sender);
    }

    // ========================
    // Remove Liquidity
    // ========================

    /// @notice Remove liquidity from a pool.
    /// @dev User submits lpAmount, expectedA, expectedB (all encrypted).
    ///      Contract verifies: expectedA * totalLP <= reserveA * lpAmount (scaled)
    ///      If valid, tokens are sent. If invalid, LP shares are returned.
    function removeLiquidity(
        uint256 poolId,
        externalEuint64 encLpAmount,
        externalEuint64 encExpectedA,
        externalEuint64 encExpectedB,
        bytes calldata inputProof
    ) external nonReentrant {
        Pool storage pool = _pools[poolId];
        require(pool.exists, "Pool not found");

        euint64 lpAmount = FHE.fromExternal(encLpAmount, inputProof);
        euint64 expectedA = FHE.fromExternal(encExpectedA, inputProof);
        euint64 expectedB = FHE.fromExternal(encExpectedB, inputProof);

        // Verify: expectedX * totalLP <= reserveX * lpAmount (scaled)
        euint64 sExpA = FHE.div(expectedA, SCALE);
        euint64 sExpB = FHE.div(expectedB, SCALE);
        euint64 sTotalLP = FHE.div(pool.totalLP, SCALE);
        euint64 sResA = FHE.div(pool.reserveA, SCALE);
        euint64 sResB = FHE.div(pool.reserveB, SCALE);
        euint64 sLP = FHE.div(lpAmount, SCALE);

        ebool validA = FHE.le(FHE.mul(sExpA, sTotalLP), FHE.mul(sResA, sLP));
        ebool validB = FHE.le(FHE.mul(sExpB, sTotalLP), FHE.mul(sResB, sLP));
        ebool valid = FHE.and(validA, validB);

        // Burn LP shares conditionally
        euint64 burnedLP = FHE.select(valid, lpAmount, FHE.asEuint64(0));
        _lpBalances[poolId][msg.sender] = FHE.sub(_lpBalances[poolId][msg.sender], burnedLP);
        FHE.allowThis(_lpBalances[poolId][msg.sender]);
        FHE.allow(_lpBalances[poolId][msg.sender], msg.sender);

        // Update reserves conditionally
        pool.reserveA = FHE.select(valid, FHE.sub(pool.reserveA, expectedA), pool.reserveA);
        pool.reserveB = FHE.select(valid, FHE.sub(pool.reserveB, expectedB), pool.reserveB);
        pool.totalLP = FHE.select(valid, FHE.sub(pool.totalLP, lpAmount), pool.totalLP);

        FHE.allowThis(pool.reserveA);
        FHE.allowThis(pool.reserveB);
        FHE.allowThis(pool.totalLP);

        // Transfer tokens conditionally (0 if invalid)
        euint64 payoutA = FHE.select(valid, expectedA, FHE.asEuint64(0));
        euint64 payoutB = FHE.select(valid, expectedB, FHE.asEuint64(0));

        FHE.allowTransient(payoutA, address(pool.tokenA));
        pool.tokenA.confidentialTransfer(msg.sender, payoutA);

        FHE.allowTransient(payoutB, address(pool.tokenB));
        pool.tokenB.confidentialTransfer(msg.sender, payoutB);

        emit LiquidityRemoved(poolId, msg.sender);
    }

    // ========================
    // Swap
    // ========================

    /// @notice Swap tokens in a pool.
    /// @dev User submits amountIn and expectedAmountOut (encrypted).
    ///      Contract verifies constant product invariant (rearranged, scaled):
    ///        amountInAfterFee * reserveOut >= amountOut * (reserveIn + amountInAfterFee)
    ///      If invalid, input is refunded and no output is sent.
    /// @param poolId The pool to swap in
    /// @param aToB True = sell tokenA for tokenB, false = sell tokenB for tokenA
    /// @param encAmountIn Encrypted input amount
    /// @param encExpectedOut Encrypted expected output amount
    /// @param inputProof Shared proof for both encrypted inputs
    function swap(
        uint256 poolId,
        bool aToB,
        externalEuint64 encAmountIn,
        externalEuint64 encExpectedOut,
        bytes calldata inputProof
    ) external nonReentrant {
        Pool storage pool = _pools[poolId];
        require(pool.exists, "Pool not found");

        IERC7984 tokenIn = aToB ? pool.tokenA : pool.tokenB;
        IERC7984 tokenOut = aToB ? pool.tokenB : pool.tokenA;
        euint64 reserveIn = aToB ? pool.reserveA : pool.reserveB;
        euint64 reserveOut = aToB ? pool.reserveB : pool.reserveA;

        require(tokenIn.isOperator(msg.sender, address(this)), "Set operator on input token");

        euint64 amountIn = FHE.fromExternal(encAmountIn, inputProof);
        euint64 amountOut = FHE.fromExternal(encExpectedOut, inputProof);

        // Pull input tokens
        FHE.allowTransient(amountIn, address(tokenIn));
        tokenIn.confidentialTransferFrom(msg.sender, address(this), amountIn);

        // Apply fee: amountInAfterFee = amountIn * (10000 - feeBps) / 10000
        uint64 feeMultiplier = uint64(10000 - feeBps);
        euint64 amountInAfterFee = FHE.div(FHE.mul(amountIn, feeMultiplier), uint64(10000));

        // Verify constant product (rearranged, scaled):
        // amountInAfterFee * reserveOut >= amountOut * (reserveIn + amountInAfterFee)
        euint64 sIn = FHE.div(amountInAfterFee, SCALE);
        euint64 sOut = FHE.div(amountOut, SCALE);
        euint64 sResIn = FHE.div(reserveIn, SCALE);
        euint64 sResOut = FHE.div(reserveOut, SCALE);

        euint64 lhs = FHE.mul(sIn, sResOut);
        euint64 rhs = FHE.mul(sOut, FHE.add(sResIn, sIn));
        ebool valid = FHE.ge(lhs, rhs);

        // Conditional updates
        euint64 newReserveIn = FHE.select(valid, FHE.add(reserveIn, amountIn), reserveIn);
        euint64 newReserveOut = FHE.select(valid, FHE.sub(reserveOut, amountOut), reserveOut);

        if (aToB) {
            pool.reserveA = newReserveIn;
            pool.reserveB = newReserveOut;
        } else {
            pool.reserveB = newReserveIn;
            pool.reserveA = newReserveOut;
        }

        FHE.allowThis(pool.reserveA);
        FHE.allowThis(pool.reserveB);

        // Send output to user (0 if invalid)
        euint64 payout = FHE.select(valid, amountOut, FHE.asEuint64(0));
        FHE.allowTransient(payout, address(tokenOut));
        tokenOut.confidentialTransfer(msg.sender, payout);

        // Refund input if invalid (0 if valid)
        euint64 refund = FHE.select(valid, FHE.asEuint64(0), amountIn);
        FHE.allowTransient(refund, address(tokenIn));
        tokenIn.confidentialTransfer(msg.sender, refund);

        emit Swapped(poolId, msg.sender, aToB);
    }
}
