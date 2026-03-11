import { ethers } from "hardhat";

async function main() {
  const contract = await ethers.getContractAt(
    "GhostBounty",
    "0x75Ab188296Fc73001902D75107181FFE82B8A6d6"
  );

  console.log("Setting subscription ID to 6366...");
  const tx = await contract.setSubscriptionId(6366);
  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("Done! subscriptionId set to 6366");
}

main().catch(console.error);
