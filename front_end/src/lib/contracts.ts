// GhostBounty — Contract addresses and ABIs

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as `0x${string}`;
export const CONFIDENTIAL_USDC_ADDRESS = (process.env.NEXT_PUBLIC_CUSDC_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const USDC_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
] as const;

export const CONFIDENTIAL_USDC_ABI = [
  { type: "function", name: "shield", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unshield", inputs: [{ name: "amount", type: "uint64" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "setOperator", inputs: [{ name: "operator", type: "address" }, { name: "expiration", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "isOperator", inputs: [{ name: "owner_", type: "address" }, { name: "operator", type: "address" }], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "encryptedBalanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "bytes32" }], stateMutability: "view" },
] as const;

// GhostBounty (Chainlink Functions + FHE)
export const GHOST_BOUNTY_ADDRESS = (process.env.NEXT_PUBLIC_GHOST_BOUNTY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const GHOST_BOUNTY_ABI = [
  { type: "function", name: "registerDev", inputs: [{ name: "githubUsername", type: "string" }, { name: "gistId", type: "string" }], outputs: [{ name: "requestId", type: "bytes32" }], stateMutability: "nonpayable" },
  { type: "function", name: "createBounty", inputs: [{ name: "repoOwner", type: "string" }, { name: "repoName", type: "string" }, { name: "issueNumber", type: "uint64" }, { name: "encryptedAmount", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [{ name: "bountyId", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "cancelBounty", inputs: [{ name: "bountyId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claimBounty", inputs: [{ name: "bountyId", type: "uint256" }, { name: "prNumber", type: "uint64" }], outputs: [{ name: "requestId", type: "bytes32" }], stateMutability: "nonpayable" },
  { type: "function", name: "executeClaim", inputs: [{ name: "bountyId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getBounty", inputs: [{ name: "bountyId", type: "uint256" }], outputs: [{ name: "creator", type: "address" }, { name: "repoOwner", type: "string" }, { name: "repoName", type: "string" }, { name: "issueNumber", type: "uint64" }, { name: "status", type: "uint8" }, { name: "claimedBy", type: "address" }, { name: "createdAt", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "bountyCount", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "devRegistry", inputs: [{ name: "githubUsername", type: "string" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "devGithub", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "devVerificationPending", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "feeBps", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "secretsValid", inputs: [], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
  { type: "event", name: "BountyCreated", inputs: [{ name: "bountyId", type: "uint256", indexed: true }, { name: "repoOwner", type: "string", indexed: false }, { name: "repoName", type: "string", indexed: false }, { name: "issueNumber", type: "uint64", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "BountyCancelled", inputs: [{ name: "bountyId", type: "uint256", indexed: true }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "ClaimRequested", inputs: [{ name: "bountyId", type: "uint256", indexed: true }, { name: "requestId", type: "bytes32", indexed: true }, { name: "prNumber", type: "uint64", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "BountyVerified", inputs: [{ name: "bountyId", type: "uint256", indexed: true }, { name: "developer", type: "address", indexed: true }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "BountyPaid", inputs: [{ name: "bountyId", type: "uint256", indexed: true }, { name: "developer", type: "address", indexed: true }, { name: "timestamp", type: "uint256", indexed: false }] },
  { type: "event", name: "ClaimFailed", inputs: [{ name: "bountyId", type: "uint256", indexed: true }, { name: "requestId", type: "bytes32", indexed: true }, { name: "reason", type: "string", indexed: false }] },
  { type: "event", name: "DevRegistered", inputs: [{ name: "dev", type: "address", indexed: true }, { name: "githubUsername", type: "string", indexed: false }] },
  { type: "event", name: "DevRegistrationRequested", inputs: [{ name: "dev", type: "address", indexed: true }, { name: "githubUsername", type: "string", indexed: false }, { name: "requestId", type: "bytes32", indexed: true }] },
  { type: "event", name: "DevRegistrationFailed", inputs: [{ name: "dev", type: "address", indexed: true }, { name: "requestId", type: "bytes32", indexed: true }, { name: "reason", type: "string", indexed: false }] },
] as const;
