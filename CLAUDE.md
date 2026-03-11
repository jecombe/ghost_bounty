# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShadowPool is a privacy pool for USDC built on Zama's FHEVM (Fully Homomorphic Encryption Virtual Machine). It combines FHE-encrypted deposit amounts, commitment/nullifier note tracking, stealth address withdrawals, and viewing key compliance. The project is a monorepo with two directories: `smart_contract/` (Hardhat + Solidity) and `front_end/` (Next.js).

## Commands

### Smart Contracts (`smart_contract/`)
```bash
npm run compile          # Compile Solidity contracts (runs typechain after)
npm test                 # Run Hardhat tests (mocha)
npm run lint             # Solhint + ESLint + Prettier check
npm run lint:sol         # Solhint only
npm run prettier:write   # Auto-format all files
npm run deploy:localhost # Deploy to local Hardhat node
npm run deploy:sepolia   # Deploy to Sepolia testnet
npm run chain            # Start local Hardhat node (no deploy)
```
Hardhat vars: `MNEMONIC`, `INFURA_API_KEY`, `ETHERSCAN_API_KEY` (set via `npx hardhat vars set`). Sepolia also reads `DEPLOYER_PRIVATE_KEY` and `SEPOLIA_RPC_URL` from env.

### Frontend (`front_end/`)
```bash
npm run dev    # Next.js dev server
npm run build  # Production build
npm run lint   # ESLint
```
Contract addresses configured via env vars in `.env.local`: `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_CUSDC_ADDRESS`, `NEXT_PUBLIC_SHADOW_POOL_ADDRESS`, `NEXT_PUBLIC_STEALTH_REGISTRY_ADDRESS`.

## Architecture

### Smart Contracts (Solidity 0.8.27, FHEVM)

- **`ConfidentialUSDC`** (`contracts/ConfidentialUSDC.sol`) — ERC-7984 wrapper that converts plain USDC into encrypted cUSDC. Key operations: `shield`/`unshield`, `confidentialTransfer`/`confidentialTransferFrom` (both user-facing with `externalEuint64` + inputProof, and contract-facing with `euint64`), operator system (`setOperator`/`isOperator`), and minter functions (`creditEncrypted`, `debitEncrypted`, `debitAndRelease`, `creditFromUSDC`).

- **`ShadowPool`** (`contracts/shadow/ShadowPool.sol`) — The privacy pool. Deposits create FHE-encrypted notes keyed by `commitment = keccak256(nullifier, secret)`. Three deposit modes: plain USDC (`deposit`), encrypted amount (`depositEncrypted`), fully confidential via cUSDC (`depositConfidential`). Three withdrawal modes: plain USDC (`withdraw`), cUSDC (`withdrawConfidential`), unshield cUSDC to USDC (`withdrawAndUnshield`). Has fee system (feeBps, max 500), withdraw delay, and viewing key grants for compliance.

- **`StealthAddressRegistry`** (`contracts/shadow/StealthAddressRegistry.sol`) — ERC-5564 style registry for stealth meta-addresses (spending + viewing public keys) and announcement events.

- **`MockUSDC`** (`contracts/mocks/MockUSDC.sol`) — Test token.

Deploy scripts are in `smart_contract/deploy/`. Typechain outputs to `smart_contract/types/`.

### Frontend (Next.js 16, React 19, TypeScript)

- **Wallet**: RainbowKit + wagmi + viem. Config in `src/lib/wagmi.ts`. Chains: Sepolia + Hardhat.
- **FHE SDK**: Zama Relayer SDK loaded via CDN script tag (`src/lib/fhe/sdk.ts`). Provides encrypted input creation and user/public decrypt. Hook: `src/hooks/useFhevm.ts`.
- **Contract ABIs**: Inline ABI definitions in `src/lib/contracts.ts` (not generated from typechain).
- **Main page** (`src/app/page.tsx`): Deposit/withdraw UI with multi-step transaction state machine (approve → shield → set operator → depositConfidential). Notes stored in localStorage.
- **Routes**: `/` (main pool UI), `/shield` (shield page).
- **Styling**: Tailwind CSS v4 with a dark military/ocean theme (`panel-military` class pattern).

### Key FHE Patterns
- `FHE.asEuint64(plainValue)` — encrypt a known value
- `FHE.fromExternal(externalEuint64, inputProof)` — decrypt user-submitted encrypted input
- `FHE.allowThis(handle)` — allow the contract itself to use a ciphertext
- `FHE.allow(handle, address)` — allow an external address to use a ciphertext
- `FHE.allowTransient(handle, address)` — allow within the same transaction (for cross-contract calls)
- Config base contract: `ZamaEthereumConfig`
