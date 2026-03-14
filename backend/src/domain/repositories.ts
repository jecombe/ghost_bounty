import type {
  Bounty,
  BountyStatus,
  ClaimAttempt,
  Developer,
  DeveloperStatus,
  IndexerEvent,
  IndexerState,
  Stats,
} from "./entities.js";

// ========================
// Repository Interfaces (Ports)
// ========================

export interface BountyRepository {
  findById(id: number): Promise<Bounty | null>;
  findAll(opts: { status?: BountyStatus; page: number; limit: number }): Promise<{ data: Bounty[]; total: number }>;
  upsert(bounty: Omit<Bounty, "updatedAt">): Promise<void>;
  updateStatus(id: number, status: BountyStatus, claimedBy?: string | null): Promise<void>;
  setPublicAmount(id: number, amount: string): Promise<void>;
}

export interface DeveloperRepository {
  findByAddress(address: string): Promise<Developer | null>;
  findAll(opts: { status?: DeveloperStatus; page: number; limit: number }): Promise<{ data: Developer[]; total: number }>;
  upsert(dev: Omit<Developer, "updatedAt">): Promise<void>;
  updateStatus(address: string, status: DeveloperStatus): Promise<void>;
}

export interface ClaimAttemptRepository {
  findByBountyId(bountyId: number): Promise<ClaimAttempt[]>;
  insert(attempt: Omit<ClaimAttempt, "id" | "createdAt" | "updatedAt">): Promise<void>;
  updateStatus(requestId: string, status: string, failureReason?: string | null): Promise<void>;
}

export interface EventRepository {
  insert(event: Omit<IndexerEvent, "id" | "createdAt">): Promise<void>;
  insertMany(events: Omit<IndexerEvent, "id" | "createdAt">[]): Promise<void>;
}

export interface IndexerStateRepository {
  get(): Promise<IndexerState>;
  setLastBlock(block: number): Promise<void>;
}

export interface StatsRepository {
  getStats(): Promise<Stats>;
}
