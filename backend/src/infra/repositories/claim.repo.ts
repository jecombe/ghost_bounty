import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { claimAttempts } from "../db/schema.js";
import type { ClaimAttemptRepository } from "../../domain/repositories.js";
import type { ClaimAttempt, ClaimStatus } from "../../domain/entities.js";

export class DrizzleClaimAttemptRepository implements ClaimAttemptRepository {
  constructor(private db: Db) {}

  async findByBountyId(bountyId: number): Promise<ClaimAttempt[]> {
    const rows = await this.db
      .select()
      .from(claimAttempts)
      .where(eq(claimAttempts.bountyId, bountyId))
      .orderBy(claimAttempts.createdAt);
    return rows.map((r) => this.toDomain(r));
  }

  async insert(attempt: Omit<ClaimAttempt, "id" | "createdAt" | "updatedAt">) {
    await this.db.insert(claimAttempts).values({
      bountyId: attempt.bountyId,
      requestId: attempt.requestId,
      prNumber: attempt.prNumber,
      claimer: attempt.claimer.toLowerCase(),
      status: attempt.status,
      failureReason: attempt.failureReason,
    });
  }

  async updateStatus(requestId: string, status: string, failureReason?: string | null) {
    const set: Record<string, unknown> = { status, updatedAt: new Date() };
    if (failureReason !== undefined) set.failureReason = failureReason;
    await this.db
      .update(claimAttempts)
      .set(set)
      .where(eq(claimAttempts.requestId, requestId));
  }

  private toDomain(row: typeof claimAttempts.$inferSelect): ClaimAttempt {
    return {
      id: row.id,
      bountyId: row.bountyId,
      requestId: row.requestId,
      prNumber: row.prNumber,
      claimer: row.claimer,
      status: row.status as ClaimStatus,
      failureReason: row.failureReason,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    };
  }
}
