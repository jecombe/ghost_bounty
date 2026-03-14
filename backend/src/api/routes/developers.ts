import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../server.js";
import type { DeveloperStatus } from "../../domain/entities.js";

const listSchema = z.object({
  status: z.enum(["pending", "registered", "failed"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export function registerDeveloperRoutes(app: FastifyInstance, deps: ApiDeps) {
  const { developerRepo } = deps;

  // GET /api/developers
  app.get("/api/developers", async (req, reply) => {
    const query = listSchema.safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: query.error.format() });

    const { status, page, limit } = query.data;
    const result = await developerRepo.findAll({ status: status as DeveloperStatus | undefined, page, limit });
    return {
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  });
}
