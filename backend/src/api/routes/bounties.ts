import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ethers } from "ethers";
import type { ApiDeps } from "../server.js";
import type { BountyStatus } from "../../domain/entities.js";

const listSchema = z.object({
  status: z.enum(["Active", "Pending", "Verified", "Claimed", "Cancelled"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const publicAmountSchema = z.object({
  amount: z.string().min(1),
  signature: z.string().min(1),
});

export function registerBountyRoutes(app: FastifyInstance, deps: ApiDeps) {
  const { bountyRepo, claimRepo } = deps;

  // GET /api/bounties
  app.get("/api/bounties", async (req, reply) => {
    const query = listSchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.format() });
    }
    const { status, page, limit } = query.data;
    const result = await bountyRepo.findAll({ status: status as BountyStatus | undefined, page, limit });
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

  // GET /api/bounties/:id
  app.get<{ Params: { id: string } }>("/api/bounties/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid bounty ID" });

    const bounty = await bountyRepo.findById(id);
    if (!bounty) return reply.status(404).send({ error: "Bounty not found" });

    const claims = await claimRepo.findByBountyId(id);
    return { ...bounty, claimHistory: claims };
  });

  // POST /api/bounties/:id/public-amount
  app.post<{ Params: { id: string } }>("/api/bounties/:id/public-amount", async (req, reply) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid bounty ID" });

    const body = publicAmountSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.format() });

    const bounty = await bountyRepo.findById(id);
    if (!bounty) return reply.status(404).send({ error: "Bounty not found" });

    // Verify EIP-191 signature: creator signed the reveal message
    const { amount, signature } = body.data;
    const message = `GhostBounty: reveal amount ${amount} for bounty #${id}`;

    let signer: string;
    try {
      signer = ethers.verifyMessage(message, signature).toLowerCase();
    } catch {
      return reply.status(400).send({ error: "Invalid signature" });
    }

    if (signer !== bounty.creator.toLowerCase()) {
      return reply.status(403).send({ error: "Only the bounty creator can reveal the amount" });
    }

    await bountyRepo.setPublicAmount(id, amount);
    return { success: true, bountyId: id, publicAmount: amount };
  });
}
