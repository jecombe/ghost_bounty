import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import type { EventRepository, IndexerStateRepository } from "../../domain/repositories.js";
import type { IndexerEvent, IndexerState } from "../../domain/entities.js";
import { indexerState } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

export class DrizzleEventRepository implements EventRepository {
  constructor(private db: Db) {}

  async insert(event: Omit<IndexerEvent, "id" | "createdAt">) {
    await this.db
      .insert(events)
      .values({
        blockNumber: event.blockNumber,
        txHash: event.txHash,
        logIndex: event.logIndex,
        eventName: event.eventName,
        args: event.args,
      })
      .onConflictDoNothing();
  }

  async insertMany(items: Omit<IndexerEvent, "id" | "createdAt">[]) {
    if (items.length === 0) return;
    await this.db
      .insert(events)
      .values(
        items.map((e) => ({
          blockNumber: e.blockNumber,
          txHash: e.txHash,
          logIndex: e.logIndex,
          eventName: e.eventName,
          args: e.args,
        })),
      )
      .onConflictDoNothing();
  }
}

export class DrizzleIndexerStateRepository implements IndexerStateRepository {
  constructor(private db: Db) {}

  async get(): Promise<IndexerState> {
    const rows = await this.db.select().from(indexerState).where(eq(indexerState.id, 1)).limit(1);
    if (rows.length === 0) {
      await this.db.insert(indexerState).values({ id: 1, lastBlock: 0 }).onConflictDoNothing();
      return { lastBlock: 0, updatedAt: new Date() };
    }
    return { lastBlock: rows[0].lastBlock, updatedAt: rows[0].updatedAt ?? new Date() };
  }

  async setLastBlock(block: number) {
    await this.db
      .insert(indexerState)
      .values({ id: 1, lastBlock: block })
      .onConflictDoUpdate({
        target: indexerState.id,
        set: { lastBlock: block, updatedAt: sql`now()` },
      });
  }
}
