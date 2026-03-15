# Ghost Bounty — Frontend

Next.js 16 application for the Ghost Bounty protocol. Provides the user interface for creating, browsing, and claiming FHE-encrypted GitHub bounties.

---

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `src/app/page.tsx` | Landing page — hero, feature cards, flow diagram, CTAs |
| `/bounty` | `src/app/bounty/page.tsx` | Main bounty interface with 3 tabs: Create, Browse, Claim |
| `/shield` | `src/app/shield/page.tsx` | Shield/Unshield USDC ↔ encrypted cUSDC |
| `/docs` | `src/app/docs/page.tsx` | In-app documentation (6 sections) |
| `/install` | `src/app/install/page.tsx` | GitHub App installation (coming soon) |

---

## Bounty Workflow (UI)

### Create Tab (Project Owner)

1. Connect wallet + sign in with GitHub (OAuth)
2. Search and select a GitHub repository
3. Pick an open issue from the repo
4. Enter bounty amount (USDC)
5. Multi-step transaction:
   - **Approve** USDC spending
   - **Shield** USDC → cUSDC (FHE encryption)
   - **Set operator** on cUSDC for GhostBounty contract
   - **Create bounty** with FHE-encrypted amount

### Browse Tab

- Lists all on-chain bounties with status, repo, issue, creator
- Cancel active bounties (creator only)
- Emergency cancel stuck bounties (7-day timeout)

### Claim Tab (Developer)

1. Auto-detects claimable bounties via merged PRs that reference bounty issues
2. One-click claim → Chainlink verification → payment execution
3. Manual fallback: enter bounty ID + PR number directly

---

## FHE Integration

### Zama Relayer SDK

The FHEVM SDK is loaded from CDN (`@zama-fhe/relayer-sdk-js v0.4.1`) and managed via `useFhevm()` hook.

**Encryption** (bounty creation):
```typescript
const input = fhevmInstance.createEncryptedInput(contractAddress, userAddress);
input.add64(bountyAmountInUSDCUnits);
const { handles, inputProof } = await input.encrypt();
// Pass handles[0] + inputProof to createBounty()
```

**Decryption** (balance display):
```typescript
const keypair = fhevmInstance.generateKeypair();
const eip712 = fhevmInstance.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
const signature = await signer.signTypedData(eip712.domain, eip712.types, eip712.message);
const results = await fhevmInstance.userDecrypt(requests, privateKey, publicKey, signature, ...);
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/fhe/sdk.ts` | SDK loader, initialization, instance creation, reset |
| `src/hooks/useFhevm.ts` | React hook — manages SDK lifecycle, status, wallet-aware init |
| `src/hooks/useFheBalances.tsx` | Context provider — tracks encrypted cUSDC balance, decrypt flow |

### SDK Lifecycle

1. App mounts → SDK loaded from CDN
2. SDK initializes (wallet-independent, uses public RPC fallback)
3. User connects wallet → ethers signer created
4. Encrypt: `createEncryptedInput()` → `add64()` → `encrypt()`
5. Decrypt: `generateKeypair()` → EIP-712 sign → `userDecrypt()`
6. Wallet switch/disconnect → SDK reset (clears localStorage + IndexedDB)

---

## API Routes

Server-side Next.js API routes for GitHub integration.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler — GitHub OAuth (`read:user`, `public_repo` scopes) |
| `/api/github/search?q=<query>` | GET | Search GitHub repos by name. Returns top 15 by stars. |
| `/api/github/issues?owner=<o>&repo=<r>` | GET | List open issues for a repo (filters out PRs). Requires auth. |
| `/api/github/issue-info?owner=<o>&repo=<r>&issue=<n>` | GET | Fetch single issue details (title, labels, body preview). |
| `/api/github/claimable-prs` | POST | Auto-detect merged PRs by authenticated user that reference bounty issues. Matches via "Fixes #X", "Closes #X", or issue number in title/branch. Max 20 bounties per request. |
| `/api/webhooks/github` | POST | GitHub App webhook handler (signature-verified). |

All endpoints validate inputs (regex for repo names, numeric issue numbers) and require authentication where noted.

---

## Components

### Layout
| Component | Description |
|-----------|-------------|
| `AppShell.tsx` | Root wrapper — providers, ocean background, header, sidebar |
| `Header.tsx` | Sticky header — wallet button, cUSDC/USDC balances, FHE status indicator, settings |
| `Sidebar.tsx` | Left navigation — Home, Bounties, Shield, Install App, Docs |
| `Providers.tsx` | Provider tree — Session, Wagmi, QueryClient, RainbowKit, FheBalances, Ambience |

### Transaction
| Component | Description |
|-----------|-------------|
| `TransactionModal.tsx` | Multi-step progress modal with signing → confirming → done/error states, explorer links, animations |
| `WalletButton.tsx` | Custom RainbowKit connect button with chain selector and account display |

### Ambience
| Component | Description |
|-----------|-------------|
| `OceanBackground.tsx` | Animated CSS background with 7 time-of-day phases (night → dawn → day → sunset → dusk), sun movement, water effects, clouds, mountains |
| `OceanAmbience.tsx` | Web Audio API ambient music — jazz chords, vibraphone, bass, vinyl crackle (all synth-generated) |
| `AmbienceContext.tsx` | Sound/time settings context with localStorage persistence |
| `SettingsPanel.tsx` | Settings dropdown — sound toggle, volume sliders, time mode selector |

---

## Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useFhevm()` | `src/hooks/useFhevm.ts` | FHEVM SDK lifecycle — load, init, status, retry, wallet-aware reset |
| `useFheBalances()` | `src/hooks/useFheBalances.tsx` | Encrypted cUSDC balance tracking + user decrypt flow |
| `useSfx()` | `src/hooks/useSfx.ts` | 11 synthesized sound effects (click, success, error, createBounty, claim, shield, etc.) via Web Audio API |

---

## Wallet & Chain Config

**Stack**: RainbowKit v2 + Wagmi v2 + Viem

**Supported chains**: Sepolia, Hardhat (localhost:8545)

**Config**: `src/lib/wagmi.ts`
- Cookie-based storage (SSR-safe)
- WalletConnect project ID from env

---

## Contract Integration

**File**: `src/lib/contracts.ts`

Inline ABI definitions for:
- **USDC** (ERC20) — `balanceOf`, `approve`, `allowance`
- **ConfidentialUSDC** — `shield`, `unshield`, `setOperator`, `isOperator`, `encryptedBalanceOf`
- **GhostBounty** — 27 functions + 8 events covering the full bounty lifecycle

Contract addresses are configured via environment variables with fallback defaults.

---

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server (http://localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
```

---

## Environment Variables

```bash
# Contract addresses
NEXT_PUBLIC_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
NEXT_PUBLIC_CUSDC_ADDRESS=0x...
NEXT_PUBLIC_GHOST_BOUNTY_ADDRESS=0x...

# WalletConnect
NEXT_PUBLIC_WC_PROJECT_ID=your-project-id

# GitHub OAuth (NextAuth)
GITHUB_CLIENT_ID=your-github-app-id
GITHUB_CLIENT_SECRET=your-github-app-secret
NEXTAUTH_SECRET=random-secret-string

# GitHub App (optional — for bot interactions)
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

---

## File Structure

```
front_end/src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts     # NextAuth handler
│   │   ├── github/
│   │   │   ├── search/route.ts             # Repo search
│   │   │   ├── issues/route.ts             # List issues
│   │   │   ├── issue-info/route.ts         # Issue details
│   │   │   └── claimable-prs/route.ts      # Auto-detect claimable PRs
│   │   └── webhooks/github/route.ts        # GitHub App webhook
│   ├── bounty/page.tsx                     # Bounty management (Create/Browse/Claim)
│   ├── shield/page.tsx                     # Shield / Unshield USDC ↔ cUSDC
│   ├── docs/page.tsx                       # Documentation
│   ├── install/page.tsx                    # GitHub App install
│   ├── page.tsx                            # Landing page
│   ├── layout.tsx                          # Root layout
│   └── globals.css                         # Tailwind + custom CSS
├── components/
│   ├── AppShell.tsx                        # Root wrapper
│   ├── Header.tsx                          # Sticky header
│   ├── Sidebar.tsx                         # Left nav
│   ├── Providers.tsx                       # Provider tree
│   ├── TransactionModal.tsx                # TX progress modal
│   ├── WalletButton.tsx                    # Custom wallet button
│   ├── OceanBackground.tsx                 # Animated background
│   ├── OceanAmbience.tsx                   # Ambient music
│   ├── AmbienceContext.tsx                 # Sound/time state
│   └── SettingsPanel.tsx                   # Settings dropdown
├── hooks/
│   ├── useFhevm.ts                         # FHEVM SDK hook
│   ├── useFheBalances.tsx                  # Encrypted balance + decrypt
│   └── useSfx.ts                           # Sound effects
└── lib/
    ├── wagmi.ts                            # Wagmi + RainbowKit config
    ├── contracts.ts                        # ABIs + addresses
    ├── auth.ts                             # NextAuth config
    ├── github-app.ts                       # GitHub App helpers
    └── fhe/
        └── sdk.ts                          # Zama Relayer SDK wrapper
```
