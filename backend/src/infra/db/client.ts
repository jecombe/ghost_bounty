import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import type { Config } from "../../config.js";

export function createDb(config: Config) {
  const sql = postgres(config.DATABASE_URL, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>["db"];
