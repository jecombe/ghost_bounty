import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Chainlink Functions Router on Sepolia
  const CHAINLINK_ROUTER = "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
  // DON ID for Sepolia: "fun-ethereum-sepolia-1"
  const DON_ID = hre.ethers.encodeBytes32String("fun-ethereum-sepolia-1");
  // Chainlink Functions subscription ID
  const SUBSCRIPTION_ID = process.env.CHAINLINK_SUBSCRIPTION_ID
    ? BigInt(process.env.CHAINLINK_SUBSCRIPTION_ID)
    : 0n;

  // cUSDC address from env
  const cTokenAddress =
    process.env.NEXT_PUBLIC_CUSDC_ADDRESS || "0x4f73E1F80De6E614FBB5F4B66B6C802CD087A5CC";

  const treasury = deployer;
  const feeBps = 200; // 2% protocol fee

  const result = await deploy("GhostBounty", {
    from: deployer,
    args: [CHAINLINK_ROUTER, cTokenAddress, treasury, feeBps, DON_ID, SUBSCRIPTION_ID],
    log: true,
  });

  console.log(`GhostBounty deployed at: ${result.address}`);

  const contract = await hre.ethers.getContractAt("GhostBounty", result.address);

  // Set claim verification source (first-time = instant, bypasses timelock)
  const fs = await import("fs");
  const path = await import("path");

  const claimSourcePath = path.join(__dirname, "../contracts/bounty/chainlink-source.js");
  if (fs.existsSync(claimSourcePath)) {
    const source = fs.readFileSync(claimSourcePath, "utf-8");
    const tx = await contract.proposeClaimSource(source);
    await tx.wait();
    console.log("Claim verification source set on contract (first-time instant).");
  }

  // Set gist verification source (first-time = instant)
  const gistSourcePath = path.join(__dirname, "../contracts/bounty/chainlink-verify-gist.js");
  if (fs.existsSync(gistSourcePath)) {
    const source = fs.readFileSync(gistSourcePath, "utf-8");
    const tx = await contract.proposeGistSource(source);
    await tx.wait();
    console.log("Gist verification source set on contract (first-time instant).");
  }

  if (SUBSCRIPTION_ID === 0n) {
    console.log(
      "\nCHAINLINK_SUBSCRIPTION_ID not set. After creating a subscription at https://functions.chain.link, run:\n" +
        `  npx hardhat vars set CHAINLINK_SUBSCRIPTION_ID <your_sub_id>\n` +
        `  Then call setSubscriptionId() on the contract.\n`
    );
  }
};

func.tags = ["GhostBounty"];
export default func;
