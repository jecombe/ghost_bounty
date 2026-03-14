import { ethers } from "ethers";
import type { Logger } from "pino";
import type { Config } from "../../config.js";
import type {
  BountyRepository,
  DeveloperRepository,
  ClaimAttemptRepository,
  EventRepository,
  IndexerStateRepository,
} from "../../domain/repositories.js";
import { GHOST_BOUNTY_EVENTS } from "./abi.js";
import { handleEvent } from "./handlers.js";

interface IndexerDeps {
  config: Config;
  bountyRepo: BountyRepository;
  developerRepo: DeveloperRepository;
  claimRepo: ClaimAttemptRepository;
  eventRepo: EventRepository;
  stateRepo: IndexerStateRepository;
  log: Logger;
}

export async function startIndexer(deps: IndexerDeps) {
  const { config, bountyRepo, developerRepo, claimRepo, eventRepo, stateRepo, log } = deps;

  const httpProvider = new ethers.JsonRpcProvider(config.RPC_URL);
  const iface = new ethers.Interface(GHOST_BOUNTY_EVENTS);
  const contract = new ethers.Contract(config.CONTRACT_ADDRESS, GHOST_BOUNTY_EVENTS, httpProvider);

  const handlerDeps = { bountyRepo, developerRepo, claimRepo, provider: httpProvider, log };

  // ── Historical sync (batch getLogs via HTTP) ──────────
  const state = await stateRepo.get();
  let fromBlock = state.lastBlock > 0 ? state.lastBlock + 1 : config.DEPLOY_BLOCK;

  log.info({ fromBlock }, "Starting historical sync");
  const currentBlock = await httpProvider.getBlockNumber();

  while (fromBlock <= currentBlock) {
    const toBlock = Math.min(fromBlock + config.BATCH_SIZE - 1, currentBlock);
    log.info({ fromBlock, toBlock, remaining: currentBlock - toBlock }, "Fetching batch");

    try {
      const logs = await httpProvider.getLogs({
        address: config.CONTRACT_ADDRESS,
        fromBlock,
        toBlock,
      });

      for (const rawLog of logs) {
        await processLog(rawLog, iface, eventRepo, handlerDeps, log);
      }

      await stateRepo.setLastBlock(toBlock);
      fromBlock = toBlock + 1;
    } catch (err) {
      log.error({ err, fromBlock, toBlock }, "Batch fetch failed, retrying in 5s");
      await sleep(5000);
    }
  }

  log.info({ block: currentBlock }, "Historical sync complete");

  // ── Live: WebSocket event subscription ────────────────
  const wsUrl = config.WS_RPC_URL || config.RPC_URL.replace("https://", "wss://").replace("/v3/", "/ws/v3/");
  let wsProvider: ethers.WebSocketProvider;

  const connectWs = () => {
    wsProvider = new ethers.WebSocketProvider(wsUrl);
    const wsContract = new ethers.Contract(config.CONTRACT_ADDRESS, GHOST_BOUNTY_EVENTS, wsProvider);

    // Subscribe to all contract events
    wsContract.on("*", async (event: ethers.ContractEventPayload) => {
      try {
        const rawLog = event.log;
        log.info({ event: event.eventName, block: rawLog.blockNumber, tx: rawLog.transactionHash }, "Event received");

        await processLog(rawLog, iface, eventRepo, handlerDeps, log);
        await stateRepo.setLastBlock(rawLog.blockNumber);
      } catch (err) {
        log.error({ err }, "Failed to handle live event");
      }
    });

    // Reconnect on close/error
    wsProvider.on("error", (err) => {
      log.error({ err: (err as Error).message }, "WebSocket error, reconnecting in 3s...");
      wsProvider.destroy();
      setTimeout(connectWs, 3000);
    });

    log.info({ wsUrl: wsUrl.replace(/\/v3\/.*/, "/v3/***") }, "WebSocket subscription active");
  };

  connectWs();

  return () => {
    wsProvider?.destroy();
  };
}

// ── Shared log processing ─────────────────────────────
async function processLog(
  rawLog: ethers.Log,
  iface: ethers.Interface,
  eventRepo: EventRepository,
  handlerDeps: Parameters<typeof handleEvent>[1],
  log: Logger,
) {
  const parsed = iface.parseLog({ topics: rawLog.topics as string[], data: rawLog.data });
  if (!parsed) return;

  const args: Record<string, unknown> = {};
  for (const param of parsed.fragment.inputs) {
    const val = parsed.args[param.name];
    args[param.name] = typeof val === "bigint" ? val.toString() : val;
  }

  await eventRepo.insert({
    blockNumber: rawLog.blockNumber,
    txHash: rawLog.transactionHash,
    logIndex: rawLog.index,
    eventName: parsed.name,
    args,
  });

  await handleEvent(
    {
      name: parsed.name,
      args,
      blockNumber: rawLog.blockNumber,
      txHash: rawLog.transactionHash,
      logIndex: rawLog.index,
    },
    handlerDeps,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
