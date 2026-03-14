import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.js";
import type { Logger } from "pino";

export async function runMigrations(db: Db, log: Logger) {
  log.info("Running Drizzle migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  log.info("Migrations complete");
}
