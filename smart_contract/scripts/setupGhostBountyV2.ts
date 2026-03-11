import { ethers } from "hardhat";

const CONTRACT = "0xE4Ed29F6cd79cf7aC1db5193608b45573aa7F341";
const SUBSCRIPTION_ID = 6366;

async function main() {
  const contract = await ethers.getContractAt("GhostBounty", CONTRACT);

  // 1. Set subscription ID
  console.log("Setting subscription ID to", SUBSCRIPTION_ID, "...");
  let tx = await contract.setSubscriptionId(SUBSCRIPTION_ID);
  await tx.wait();
  console.log("Done!");
}

main().catch(console.error);
