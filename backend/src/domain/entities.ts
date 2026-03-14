// ========================
// Domain Entities
// ========================

export type BountyStatus = "Active" | "Pending" | "Verified" | "Claimed" | "Cancelled";

export interface Bounty {
  id: number;
  creator: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  status: BountyStatus;
  claimedBy: string | null;
  publicAmount: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DeveloperStatus = "pending" | "registered" | "failed";

export interface Developer {
  address: string;
  githubUsername: string;
  status: DeveloperStatus;
  requestId: string | null;
  updatedAt: Date;
}

export type ClaimStatus = "pending" | "verified" | "paid" | "failed";

export interface ClaimAttempt {
  id: number;
  bountyId: number;
  requestId: string;
  prNumber: number;
  claimer: string;
  status: ClaimStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IndexerEvent {
  id: number;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  eventName: string;
  args: Record<string, unknown>;
  createdAt: Date;
}

export interface IndexerState {
  lastBlock: number;
  updatedAt: Date;
}

export interface Stats {
  totalBounties: number;
  activeBounties: number;
  claimedBounties: number;
  cancelledBounties: number;
  totalDevelopers: number;
  registeredDevelopers: number;
  totalClaimAttempts: number;
}
