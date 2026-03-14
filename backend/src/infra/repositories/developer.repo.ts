import { eq, count } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { developers } from "../db/schema.js";
import type { DeveloperRepository } from "../../domain/repositories.js";
import type { Developer, DeveloperStatus } from "../../domain/entities.js";

export class DrizzleDeveloperRepository implements DeveloperRepository {
  constructor(private db: Db) {}

  async findByAddress(address: string): Promise<Developer | null> {
    const rows = await this.db
      .select()
      .from(developers)
      .where(eq(developers.address, address.toLowerCase()))
      .limit(1);
    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async findAll(opts: { status?: DeveloperStatus; page: number; limit: number }) {
    const offset = (opts.page - 1) * opts.limit;

    let query = this.db.select().from(developers);
    let countQuery = this.db.select({ count: count() }).from(developers);

    if (opts.status) {
      query = query.where(eq(developers.status, opts.status)) as typeof query;
      countQuery = countQuery.where(eq(developers.status, opts.status)) as typeof countQuery;
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

  async upsert(dev: Omit<Developer, "updatedAt">) {
    await this.db
      .insert(developers)
      .values({
        address: dev.address.toLowerCase(),
        githubUsername: dev.githubUsername,
        status: dev.status,
        requestId: dev.requestId,
      })
      .onConflictDoUpdate({
        target: developers.address,
        set: {
          githubUsername: dev.githubUsername,
          status: dev.status,
          requestId: dev.requestId,
          updatedAt: new Date(),
        },
      });
  }

  async updateStatus(address: string, status: DeveloperStatus) {
    await this.db
      .update(developers)
      .set({ status, updatedAt: new Date() })
      .where(eq(developers.address, address.toLowerCase()));
  }

  private toDomain(row: typeof developers.$inferSelect): Developer {
    return {
      address: row.address,
      githubUsername: row.githubUsername,
      status: row.status as DeveloperStatus,
      requestId: row.requestId,
      updatedAt: row.updatedAt ?? new Date(),
    };
  }
}
