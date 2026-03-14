import type { FastifyInstance } from "fastify";
import type { ApiDeps } from "../server.js";

export function registerStatsRoutes(app: FastifyInstance, deps: ApiDeps) {
  const { statsRepo } = deps;

  // GET /api/stats
  app.get("/api/stats", async () => {
    return statsRepo.getStats();
  });
}
