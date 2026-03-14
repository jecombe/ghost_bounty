import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createDb } from "./infra/db/client.js";
import { runMigrations } from "./infra/db/migrate.js";
import { DrizzleBountyRepository } from "./infra/repositories/bounty.repo.js";
import { DrizzleDeveloperRepository } from "./infra/repositories/developer.repo.js";
import { DrizzleClaimAttemptRepository } from "./infra/repositories/claim.repo.js";
import { DrizzleEventRepository, DrizzleIndexerStateRepository } from "./infra/repositories/event.repo.js";
import { DrizzleStatsRepository } from "./infra/repositories/stats.repo.js";
import { startIndexer } from "./infra/indexer/indexer.js";
import { createServer } from "./api/server.js";

async function main() {
  const config = loadConfig();
  const log = createLogger(config);

  log.info("Starting GhostBounty backend...");

  // Database
  const { db, sql } = createDb(config);

  // Run migrations
  await runMigrations(db, log);

  // Repositories
  const bountyRepo = new DrizzleBountyRepository(db);
  const developerRepo = new DrizzleDeveloperRepository(db);
  const claimRepo = new DrizzleClaimAttemptRepository(db);
  const eventRepo = new DrizzleEventRepository(db);
  const stateRepo = new DrizzleIndexerStateRepository(db);
  const statsRepo = new DrizzleStatsRepository(db);

  // Start indexer (non-blocking)
  startIndexer({
    config,
    bountyRepo,
    developerRepo,
    claimRepo,
    eventRepo,
    stateRepo,
    log: log.child({ module: "indexer" }),
  }).catch((err) => {
    log.error({ err }, "Indexer fatal error");
    process.exit(1);
  });

  // Start API server
  const server = await createServer({
    config,
    bountyRepo,
    developerRepo,
    claimRepo,
    statsRepo,
  });

  await server.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "API server listening");

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    await server.close();
    await sql.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
