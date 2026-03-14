import {
  pgTable,
  serial,
  integer,
  bigint,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ========================
// Drizzle Schema
// ========================

export const indexerState = pgTable("indexer_state", {
  id: integer("id").primaryKey().default(1),
  lastBlock: bigint("last_block", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    eventName: text("event_name").notNull(),
    args: jsonb("args").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_events_unique").on(t.txHash, t.logIndex),
    index("idx_events_block").on(t.blockNumber),
    index("idx_events_name").on(t.eventName),
  ],
);

export const bounties = pgTable(
  "bounties",
  {
    id: integer("id").primaryKey(),
    creator: text("creator").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    status: text("status").notNull().default("Active"),
    claimedBy: text("claimed_by"),
    publicAmount: text("public_amount"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_bounties_status").on(t.status),
    index("idx_bounties_creator").on(t.creator),
  ],
);

export const developers = pgTable(
  "developers",
  {
    address: text("address").primaryKey(),
    githubUsername: text("github_username").notNull(),
    status: text("status").notNull().default("pending"),
    requestId: text("request_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_developers_username").on(t.githubUsername),
    index("idx_developers_status").on(t.status),
  ],
);

export const claimAttempts = pgTable(
  "claim_attempts",
  {
    id: serial("id").primaryKey(),
    bountyId: integer("bounty_id")
      .notNull()
      .references(() => bounties.id),
    requestId: text("request_id").notNull(),
    prNumber: integer("pr_number").notNull(),
    claimer: text("claimer").notNull(),
    status: text("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_claims_bounty").on(t.bountyId),
    index("idx_claims_status").on(t.status),
  ],
);
