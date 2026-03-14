import { eq, sql, count } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { bounties } from "../db/schema.js";
import type { BountyRepository } from "../../domain/repositories.js";
import type { Bounty, BountyStatus } from "../../domain/entities.js";

export class DrizzleBountyRepository implements BountyRepository {
  constructor(private db: Db) {}

  async findById(id: number): Promise<Bounty | null> {
    const rows = await this.db.select().from(bounties).where(eq(bounties.id, id)).limit(1);
    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async findAll(opts: { status?: BountyStatus; page: number; limit: number }) {
    const offset = (opts.page - 1) * opts.limit;

    let query = this.db.select().from(bounties).orderBy(sql`${bounties.id} DESC`);
    let countQuery = this.db.select({ count: count() }).from(bounties);

    if (opts.status) {
      query = query.where(eq(bounties.status, opts.status)) as typeof query;
      countQuery = countQuery.where(eq(bounties.status, opts.status)) as typeof countQuery;
    }

    const [data, totalResult] = await Promise.all([
      query.limit(opts.limit).offset(offset),
      countQuery,
    ]);

    return {
      data: data.map((r) => this.toDomain(r)),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async upsert(bounty: Omit<Bounty, "updatedAt">) {
    await this.db
      .insert(bounties)
      .values({
        id: bounty.id,
        creator: bounty.creator,
        repoOwner: bounty.repoOwner,
        repoName: bounty.repoName,
        issueNumber: bounty.issueNumber,
        status: bounty.status,
        claimedBy: bounty.claimedBy,
        publicAmount: bounty.publicAmount,
        createdAt: bounty.createdAt,
      })
      .onConflictDoUpdate({
        target: bounties.id,
        set: {
          status: bounty.status,
          claimedBy: bounty.claimedBy,
          updatedAt: new Date(),
        },
      });
  }

  async updateStatus(id: number, status: BountyStatus, claimedBy?: string | null) {
    const set: Record<string, unknown> = { status, updatedAt: new Date() };
    if (claimedBy !== undefined) set.claimedBy = claimedBy;
    await this.db.update(bounties).set(set).where(eq(bounties.id, id));
  }

  async setPublicAmount(id: number, amount: string) {
    await this.db.update(bounties).set({ publicAmount: amount, updatedAt: new Date() }).where(eq(bounties.id, id));
  }

  private toDomain(row: typeof bounties.$inferSelect): Bounty {
    return {
      id: row.id,
      creator: row.creator,
      repoOwner: row.repoOwner,
      repoName: row.repoName,
      issueNumber: row.issueNumber,
      status: row.status as BountyStatus,
      claimedBy: row.claimedBy,
      publicAmount: row.publicAmount,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    };
  }
}
