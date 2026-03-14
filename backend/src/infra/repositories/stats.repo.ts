import { eq, count, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { bounties, developers, claimAttempts } from "../db/schema.js";
import type { StatsRepository } from "../../domain/repositories.js";
import type { Stats } from "../../domain/entities.js";

export class DrizzleStatsRepository implements StatsRepository {
  constructor(private db: Db) {}

  async getStats(): Promise<Stats> {
    const [bountyStats, devStats, claimStats] = await Promise.all([
      this.db
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${bounties.status} = 'Active')`,
          claimed: sql<number>`count(*) filter (where ${bounties.status} = 'Claimed')`,
          cancelled: sql<number>`count(*) filter (where ${bounties.status} = 'Cancelled')`,
        })
        .from(bounties),
      this.db
        .select({
          total: count(),
          registered: sql<number>`count(*) filter (where ${developers.status} = 'registered')`,
        })
        .from(developers),
      this.db.select({ total: count() }).from(claimAttempts),
    ]);

    return {
      totalBounties: bountyStats[0]?.total ?? 0,
      activeBounties: bountyStats[0]?.active ?? 0,
      claimedBounties: bountyStats[0]?.claimed ?? 0,
      cancelledBounties: bountyStats[0]?.cancelled ?? 0,
      totalDevelopers: devStats[0]?.total ?? 0,
      registeredDevelopers: devStats[0]?.registered ?? 0,
      totalClaimAttempts: claimStats[0]?.total ?? 0,
    };
  }
}
