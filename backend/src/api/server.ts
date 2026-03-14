import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Config } from "../config.js";
import type {
  BountyRepository,
  DeveloperRepository,
  ClaimAttemptRepository,
  StatsRepository,
} from "../domain/repositories.js";
import { registerBountyRoutes } from "./routes/bounties.js";
import { registerDeveloperRoutes } from "./routes/developers.js";
import { registerStatsRoutes } from "./routes/stats.js";

export interface ApiDeps {
  config: Config;
  bountyRepo: BountyRepository;
  developerRepo: DeveloperRepository;
  claimRepo: ClaimAttemptRepository;
  statsRepo: StatsRepository;
}

export async function createServer(deps: ApiDeps) {
  const app = Fastify({
    logger: {
      level: deps.config.LOG_LEVEL,
      ...(deps.config.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
  });

  await app.register(cors, { origin: deps.config.CORS_ORIGIN });

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Register route modules
  registerBountyRoutes(app, deps);
  registerDeveloperRoutes(app, deps);
  registerStatsRoutes(app, deps);

  return app;
}
