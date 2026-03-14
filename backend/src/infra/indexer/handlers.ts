import type { ethers } from "ethers";
import type { Logger } from "pino";
import type { BountyRepository, DeveloperRepository, ClaimAttemptRepository } from "../../domain/repositories.js";

interface Deps {
  bountyRepo: BountyRepository;
  developerRepo: DeveloperRepository;
  claimRepo: ClaimAttemptRepository;
  provider: ethers.JsonRpcProvider;
  log: Logger;
}

type ParsedEvent = {
  name: string;
  args: Record<string, unknown>;
  blockNumber: number;
  txHash: string;
  logIndex: number;
};

export async function handleEvent(event: ParsedEvent, deps: Deps) {
  const { bountyRepo, developerRepo, claimRepo, provider, log } = deps;

  switch (event.name) {
    case "BountyCreated": {
      const bountyId = Number(event.args.bountyId);
      const rawTs = Number(event.args.timestamp);
      const createdAt = Number.isFinite(rawTs) && rawTs > 0 ? new Date(rawTs * 1000) : new Date();
      // Get creator from tx.from
      let creator = "";
      try {
        const tx = await provider.getTransaction(event.txHash);
        creator = tx?.from?.toLowerCase() ?? "";
      } catch {
        log.warn({ txHash: event.txHash }, "Failed to fetch tx for creator");
      }
      await bountyRepo.upsert({
        id: bountyId,
        creator,
        repoOwner: event.args.repoOwner as string,
        repoName: event.args.repoName as string,
        issueNumber: Number(event.args.issueNumber),
        status: "Active",
        claimedBy: null,
        publicAmount: null,
        createdAt,
      });
      log.info({ bountyId }, "BountyCreated indexed");
      break;
    }

    case "BountyCancelled": {
      const bountyId = Number(event.args.bountyId);
      await bountyRepo.updateStatus(bountyId, "Cancelled");
      log.info({ bountyId }, "BountyCancelled indexed");
      break;
    }

    case "ClaimRequested": {
      const bountyId = Number(event.args.bountyId);
      const requestId = event.args.requestId as string;
      const prNumber = Number(event.args.prNumber);
      // Get claimer from tx
      let claimer = "";
      try {
        const tx = await provider.getTransaction(event.txHash);
        claimer = tx?.from?.toLowerCase() ?? "";
      } catch {
        log.warn({ txHash: event.txHash }, "Failed to fetch tx for claimer");
      }
      await bountyRepo.updateStatus(bountyId, "Pending");
      await claimRepo.insert({
        bountyId,
        requestId,
        prNumber,
        claimer,
        status: "pending",
        failureReason: null,
      });
      log.info({ bountyId, requestId }, "ClaimRequested indexed");
      break;
    }

    case "BountyVerified": {
      const bountyId = Number(event.args.bountyId);
      const developer = (event.args.developer as string).toLowerCase();
      await bountyRepo.updateStatus(bountyId, "Verified", developer);
      log.info({ bountyId, developer }, "BountyVerified indexed");
      break;
    }

    case "BountyPaid": {
      const bountyId = Number(event.args.bountyId);
      const developer = (event.args.developer as string).toLowerCase();
      await bountyRepo.updateStatus(bountyId, "Claimed", developer);
      // Update the corresponding claim attempt
      const claims = await claimRepo.findByBountyId(bountyId);
      const pendingClaim = claims.find((c) => c.status === "pending" || c.status === "verified");
      if (pendingClaim) {
        await claimRepo.updateStatus(pendingClaim.requestId, "paid");
      }
      log.info({ bountyId, developer }, "BountyPaid indexed");
      break;
    }

    case "ClaimFailed": {
      const bountyId = Number(event.args.bountyId);
      const requestId = event.args.requestId as string;
      const reason = event.args.reason as string;
      await bountyRepo.updateStatus(bountyId, "Active", null);
      await claimRepo.updateStatus(requestId, "failed", reason);
      log.info({ bountyId, requestId, reason }, "ClaimFailed indexed");
      break;
    }

    case "DevRegistrationRequested": {
      const dev = (event.args.dev as string).toLowerCase();
      const githubUsername = event.args.githubUsername as string;
      const requestId = event.args.requestId as string;
      await developerRepo.upsert({
        address: dev,
        githubUsername,
        status: "pending",
        requestId,
      });
      log.info({ dev, githubUsername }, "DevRegistrationRequested indexed");
      break;
    }

    case "DevRegistered": {
      const dev = (event.args.dev as string).toLowerCase();
      const githubUsername = event.args.githubUsername as string;
      await developerRepo.upsert({
        address: dev,
        githubUsername,
        status: "registered",
        requestId: null,
      });
      log.info({ dev, githubUsername }, "DevRegistered indexed");
      break;
    }

    case "DevRegistrationFailed": {
      const dev = (event.args.dev as string).toLowerCase();
      await developerRepo.updateStatus(dev, "failed");
      log.info({ dev }, "DevRegistrationFailed indexed");
      break;
    }

    default:
      // Config events — just stored in events table, no materialized view update
      log.debug({ event: event.name }, "Config event indexed (events table only)");
      break;
  }
}
