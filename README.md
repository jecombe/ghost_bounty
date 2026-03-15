# Ghost Bounty

**Decentralized GitHub Bounty Protocol with Fully Homomorphic Encryption**

Ghost Bounty lets project owners post encrypted bounties on GitHub issues. Developers solve issues, submit PRs, and claim rewards — all verified on-chain via Chainlink Functions. Bounty amounts are hidden using Zama's FHEVM, ensuring complete payment privacy.

[![Ghost Bounty Demo](https://img.youtube.com/vi/9dWZe93y9iM/maxresdefault.jpg)](https://youtu.be/9dWZe93y9iM)

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Project Owner │     │  Developer   │     │ Chainlink DON    │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                      │
       │ 1. createBounty()  │                      │
       │ (encrypted amount) │                      │
       │────────────────────┼──────────────────────│
       │                    │                      │
       │                    │ 2. registerDev()     │
       │                    │ (gist verification)──│──► verify gist
       │                    │◄─────────────────────│    contains ETH
       │                    │    DevRegistered     │    address
       │                    │                      │
       │                    │ 3. claimBounty()     │
       │                    │ (PR number)──────────│──► verify PR is
       │                    │◄─────────────────────│    merged & refs
       │                    │    BountyVerified    │    the issue
       │                    │                      │
       │                    │ 4. executeClaim()    │
       │                    │ (FHE payment)        │
       │                    │                      │
```

### Flow

1. **Project owner** creates a bounty for a GitHub issue with an FHE-encrypted cUSDC amount — nobody can see how much the bounty is worth.
2. **Developer** registers their GitHub identity on-chain via a public gist containing their ETH address, verified by Chainlink Functions.
3. **Developer** solves the issue, merges a PR, then calls `claimBounty()`. Chainlink Functions verifies the PR is merged and references the correct issue.
4. Once verified, anyone can call `executeClaim()` to trigger the FHE payment. The developer receives cUSDC minus a protocol fee.

### Why FHE?

- Bounty amounts are stored as `euint64` — encrypted on-chain, invisible to everyone.
- Prevents gaming: developers can't cherry-pick high-value bounties.
- The creator and the claiming developer can decrypt the amount using Zama's user decrypt flow.

---

## Architecture

```
ghost_bounty/
├── smart_contract/     # Solidity contracts (Hardhat + FHEVM)
│   ├── contracts/
│   │   ├── bounty/GhostBounty.sol       # Core protocol
│   │   ├── ConfidentialUSDC.sol          # ERC-7984 cUSDC wrapper
│   │   └── mocks/                       # Test mocks
│   ├── deploy/                          # Hardhat deploy scripts
│   ├── test/                            # 77 tests (Mocha + Chai)
│   └── scripts/                         # Chainlink setup scripts
│
└── front_end/          # Next.js 16 application
    └── src/
        ├── app/                         # Pages & API routes
        ├── components/                  # UI components
        ├── hooks/                       # FHE, balance, SFX hooks
        └── lib/                         # Wagmi, contracts, auth
```

See detailed documentation:
- [`smart_contract/README.md`](./smart_contract/README.md) — Contracts, deployment, testing
- [`front_end/README.md`](./front_end/README.md) — Frontend, API routes, FHE integration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Encryption | [Zama FHEVM](https://docs.zama.ai/fhevm) — Fully Homomorphic Encryption on EVM |
| Smart Contracts | Solidity 0.8.27, Hardhat, OpenZeppelin |
| Oracle | [Chainlink Functions](https://docs.chain.link/chainlink-functions) — GitHub API verification |
| Token Standard | ERC-7984 (Confidential ERC20 with operator pattern) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Wallet | RainbowKit v2, Wagmi v2, Viem |
| Auth | NextAuth (GitHub OAuth) |
| Network | Ethereum Sepolia testnet |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- A GitHub OAuth App (for frontend auth)
- A Chainlink Functions subscription on Sepolia

### Smart Contracts

```bash
cd smart_contract
npm install
npm run compile
npm test                # 77 tests, ~2s
npm run deploy:sepolia  # Deploy to Sepolia
```

### Frontend

```bash
cd front_end
npm install
cp .env.example .env.local  # Configure env vars
npm run dev                  # http://localhost:3000
```

### Environment Variables

**Smart Contracts** (Hardhat vars):
```
MNEMONIC                      # Wallet mnemonic
DEPLOYER_PRIVATE_KEY          # Alternative: private key for Sepolia
SEPOLIA_RPC_URL               # Sepolia RPC endpoint
CHAINLINK_SUBSCRIPTION_ID    # Chainlink Functions subscription
ETHERSCAN_API_KEY             # For contract verification
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_CUSDC_ADDRESS           # Deployed ConfidentialUSDC address
NEXT_PUBLIC_GHOST_BOUNTY_ADDRESS    # Deployed GhostBounty address
NEXT_PUBLIC_USDC_ADDRESS            # USDC address on Sepolia
NEXT_PUBLIC_WC_PROJECT_ID           # WalletConnect project ID
GITHUB_CLIENT_ID                    # GitHub OAuth app ID
GITHUB_CLIENT_SECRET                # GitHub OAuth app secret
NEXTAUTH_SECRET                     # NextAuth encryption key
```

---

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| GhostBounty | `0x15eF2AF4A8553f49c19C397788c4d5a7e2220a59` |
| ConfidentialUSDC | Configured via `NEXT_PUBLIC_CUSDC_ADDRESS` |
| USDC (Sepolia) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

---

## Security Model

- **Timelock on source changes**: 48h delay before Chainlink JS source code can be updated — prevents malicious instant changes.
- **Timelock on admin changes**: 24h delay for fee and treasury modifications.
- **Fee cap**: Protocol fee capped at 5% (`MAX_FEE_BPS = 500`).
- **Emergency cancel**: Bounties stuck in Pending/Verified for 7+ days can be emergency-cancelled by the creator.
- **Reentrancy protection**: All state-changing functions use OpenZeppelin's `ReentrancyGuard`.
- **Pausable**: Owner can pause the protocol in case of emergency.
- **Ownable2Step**: Two-step ownership transfer prevents accidental loss. `renounceOwnership` is disabled.
- **Input validation**: Repo names, usernames, and gist IDs are sanitized and length-checked.
- **Cooldowns**: Per-address (2 min) and per-bounty (10 min) claim cooldowns prevent Chainlink LINK drain.

---

## License

BSD-3-Clause-Clear (smart contracts), MIT (frontend)
