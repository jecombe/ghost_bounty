# Ghost Bounty — Smart Contracts

Solidity smart contracts for the Ghost Bounty protocol, built on [Zama FHEVM](https://docs.zama.ai/fhevm) with [Chainlink Functions](https://docs.chain.link/chainlink-functions) for trustless GitHub verification.

---

## Contracts

### `GhostBounty.sol`

**Path**: `contracts/bounty/GhostBounty.sol`

The core protocol contract. Manages the full bounty lifecycle with FHE-encrypted payment amounts and Chainlink-verified GitHub identity/PR checks.

**Inheritance**: `FunctionsClient` (Chainlink v1.3), `ReentrancyGuard`, `Pausable`, `Ownable2Step`, `ZamaEthereumConfig`

#### Bounty Status Machine

```
Active ──► Pending ──► Verified ──► Claimed
  │            │            │
  │            │            │
  ▼            ▼            ▼
Cancelled  Cancelled*   Cancelled*
           (* emergency only, after 7-day timeout)
```

#### Key Functions

| Function | Access | Description |
|----------|--------|-------------|
| `createBounty(repoOwner, repoName, issueNumber, encryptedAmount, inputProof)` | Anyone | Create a bounty with an FHE-encrypted cUSDC reward. Pulls cUSDC via operator pattern. |
| `cancelBounty(bountyId)` | Creator | Cancel an `Active` bounty and recover escrowed cUSDC. |
| `emergencyCancelBounty(bountyId)` | Creator | Cancel a `Pending`/`Verified` bounty stuck for 7+ days. |
| `registerDev(githubUsername, gistId)` | Anyone | Register GitHub identity. Chainlink verifies a public gist contains the caller's ETH address. |
| `claimBounty(bountyId, prNumber)` | Registered dev | Initiate a claim. Chainlink verifies the PR is merged and references the bounty's issue. |
| `executeClaim(bountyId)` | Anyone | Execute FHE payment for a `Verified` bounty. Developer receives cUSDC minus protocol fee. |
| `claimProtocolFees()` | Owner | Transfer accrued FHE-encrypted fees to treasury. |

#### FHE Usage

All bounty amounts are stored as `euint64` (Zama encrypted uint64):

```solidity
// Encrypt user input
euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

// Transfer cUSDC (amount hidden)
FHE.allowTransient(amount, address(cToken));
cToken.confidentialTransferFrom(msg.sender, address(this), amount);

// Compute fee (all encrypted arithmetic)
euint64 fee = FHE.mul(FHE.div(amount, 10000), uint64(feeBps));
euint64 payout = FHE.sub(amount, fee);
```

- `FHE.fromExternal()` — decrypt user-submitted encrypted input
- `FHE.asEuint64()` — encrypt a known plaintext value
- `FHE.allowThis()` / `FHE.allow()` / `FHE.allowTransient()` — manage FHE access permissions
- `FHE.add()`, `FHE.sub()`, `FHE.mul()`, `FHE.div()` — encrypted arithmetic

#### Chainlink Integration

Two JavaScript sources are executed by the Chainlink DON:

1. **`chainlink-source.js`** — Verifies a PR is merged and references the bounty's GitHub issue. Returns the PR author's username.
2. **`chainlink-verify-gist.js`** — Verifies a public gist contains the caller's ETH address. Returns `"OK"` on success.

Both sources support DON-hosted secrets for authenticated GitHub API access (higher rate limits).

#### Security Features

| Feature | Detail |
|---------|--------|
| Source timelock | 48h delay before Chainlink JS source changes take effect |
| Admin timelock | 24h delay for fee/treasury changes |
| Fee cap | `MAX_FEE_BPS = 500` (5% max) |
| Claim cooldowns | 2 min per address, 10 min per bounty |
| Registration cooldown | 7 days between re-registrations |
| Emergency cancel | 7-day timeout for stuck bounties |
| Reentrancy guard | On all state-changing functions |
| Pausable | Owner can freeze the protocol |
| Ownable2Step | Two-step ownership transfer, `renounceOwnership` disabled |
| Input sanitization | Repo strings: alphanumeric + `-_.` only, max 100 chars. Usernames: max 39 chars (GitHub limit). |

---

### `ConfidentialUSDC.sol`

**Path**: `contracts/ConfidentialUSDC.sol`

ERC-7984 wrapper that converts plain USDC into encrypted cUSDC with FHE-encrypted balances.

| Function | Description |
|----------|-------------|
| `shield(amount)` | Lock plain USDC, gain encrypted cUSDC balance |
| `unshield(amount)` | Burn encrypted cUSDC, unlock plain USDC |
| `confidentialTransfer(to, amount)` | Transfer cUSDC (amount hidden) — both user-facing and contract-facing overloads |
| `confidentialTransferFrom(from, to, amount)` | Operator-based transfer (used by GhostBounty to pull escrowed cUSDC) |
| `setOperator(operator, expiration)` | Authorize an operator to move cUSDC on your behalf |

---

### Mocks

| Contract | Purpose |
|----------|---------|
| `MockUSDC.sol` | 6-decimal ERC20 test token with public `mint()` |
| `MockFunctionsRouter.sol` | Simulates Chainlink Functions Router for tests. Supports `fulfillRequest()` and `fulfillRequestWithError()` callbacks. |

---

## Commands

```bash
npm install              # Install dependencies
npm run compile          # Compile contracts (+ typechain)
npm test                 # Run all 77 tests
npm run deploy:sepolia   # Deploy to Sepolia
npm run deploy:localhost # Deploy to local Hardhat node
npm run chain            # Start local Hardhat node
npm run lint             # Solhint + ESLint + Prettier check
npm run prettier:write   # Auto-format
```

---

## Test Suite

**77 tests** covering the full contract surface:

```
GhostBounty
  Constructor (4 tests)
    ✔ immutable values, zero address reverts, fee cap
  Admin: Chainlink Config (7 tests)
    ✔ donId, subscriptionId, callbackGasLimit, secrets, access control
  Timelocked Source Changes (6 tests)
    ✔ instant first-time set, 48h timelock, cancel
  Timelocked Fee & Treasury (6 tests)
    ✔ 24h timelock for fee/treasury, cap enforcement
  Pause / Unpause (2 tests)
    ✔ pause blocks actions, renounceOwnership disabled
  Create Bounty (9 tests)
    ✔ FHE encrypted amount, duplicate protection, input validation, lowercase normalization, decrypt amount
  Cancel Bounty (4 tests)
    ✔ cancel + refund, duplicate protection reset, access control
  Developer Registration (11 tests)
    ✔ Chainlink callback OK/fail/non-OK, cooldown, re-registration, old entry cleanup
  Claim Bounty (9 tests)
    ✔ claim flow, cooldowns (address + bounty), callback scenarios (verified, error, wrong author, unregistered)
  Execute Claim (4 tests)
    ✔ FHE payment, fee deduction verification (decrypt payout = amount - 2%)
  Emergency Cancel (5 tests)
    ✔ 7-day timeout, access control, duplicate protection reset
  Protocol Fees (2 tests)
    ✔ claim fees, access control
  Views (4 tests)
    ✔ getBounty, secretsValid, getBountyAmount access control
  Secrets Expiration (2 tests)
    ✔ blocks registerDev and claimBounty when secrets expire
  Full E2E Flow (1 test)
    ✔ create → register → claim → verify → execute → decrypt payout → fees
```

Tests use the FHEVM mock environment (automatic on Hardhat network) with the Zama Relayer SDK patterns:
- `fhevm.createEncryptedInput(contract, user).add64(value).encrypt()` — create encrypted inputs
- `fhevm.userDecryptEuint(FhevmType.euint64, handle, contract, signer)` — decrypt FHE values in tests

---

## Deployment

### Sepolia

1. Set Hardhat variables:
```bash
npx hardhat vars set MNEMONIC "your twelve word mnemonic..."
npx hardhat vars set ETHERSCAN_API_KEY "..."
```

2. Set environment:
```bash
export DEPLOYER_PRIVATE_KEY="0x..."
export SEPOLIA_RPC_URL="https://..."
export CHAINLINK_SUBSCRIPTION_ID="123"
export NEXT_PUBLIC_CUSDC_ADDRESS="0x..."  # Deploy cUSDC first
```

3. Deploy:
```bash
npm run deploy:sepolia
```

4. Post-deploy — set Chainlink secrets:
```bash
npx ts-node scripts/uploadSecrets.ts
npx ts-node scripts/setSubscriptionId.ts
```

### Deploy Order

1. `MockUSDC` (or use Sepolia USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`)
2. `ConfidentialUSDC` (takes USDC address)
3. `GhostBounty` (takes Chainlink router, cUSDC address, treasury, fee, DON ID, subscription ID)

The deploy script automatically sets the Chainlink verification sources on first deploy (instant, no timelock).

---

## File Structure

```
smart_contract/
├── contracts/
│   ├── bounty/
│   │   ├── GhostBounty.sol              # Core bounty protocol
│   │   ├── chainlink-source.js          # PR merge verification (Chainlink)
│   │   └── chainlink-verify-gist.js     # Gist identity verification (Chainlink)
│   ├── ConfidentialUSDC.sol             # ERC-7984 cUSDC wrapper
│   └── mocks/
│       ├── MockUSDC.sol                 # Test ERC20
│       └── MockFunctionsRouter.sol      # Test Chainlink router
├── deploy/
│   ├── deployCUSDC.ts                   # Deploy ConfidentialUSDC
│   └── deployGhostBounty.ts            # Deploy GhostBounty + set sources
├── test/
│   └── GhostBounty.ts                  # 77 tests
├── scripts/
│   ├── setupGhostBountyV2.ts           # Post-deploy configuration
│   ├── uploadSecrets.ts                # Upload Chainlink DON secrets
│   ├── uploadSecrets.mjs               # ESM variant
│   ├── setSubscriptionId.ts            # Set Chainlink subscription
│   └── testClaim.mjs                   # Manual claim test
├── hardhat.config.ts                    # Solidity 0.8.27, viaIR, FHEVM plugin
└── package.json
```
