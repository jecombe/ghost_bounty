import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const USDC_ADDRESS =
    process.env.USDC_ADDRESS ||
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC
  const CUSDC_ADDRESS =
    process.env.CUSDC_ADDRESS ||
    "0x4f73E1F80De6E614FBB5F4B66B6C802CD087A5CC"; // ConfidentialUSDC
  const TREASURY =
    process.env.VAULT_TREASURY || deployer;
  const WITHDRAW_DELAY = parseInt(process.env.VAULT_WITHDRAW_DELAY || "3600"); // 1 hour default
  const FEE_BPS = parseInt(process.env.VAULT_FEE_BPS || "50"); // 0.5% default

  console.log("Deploying ConfidentialVault with deployer:", deployer);
  console.log("USDC:", USDC_ADDRESS);
  console.log("cUSDC:", CUSDC_ADDRESS);
  console.log("Treasury:", TREASURY);
  console.log("Withdraw delay:", WITHDRAW_DELAY, "seconds");
  console.log("Fee:", FEE_BPS / 100, "%");

  const vaultDeploy = await deploy("ConfidentialVault", {
    from: deployer,
    args: [
      USDC_ADDRESS,
      CUSDC_ADDRESS,
      TREASURY,
      WITHDRAW_DELAY,
      FEE_BPS,
    ],
    log: true,
  });

  console.log("\n--- ConfidentialVault Deployment Complete ---");
  console.log("ConfidentialVault:", vaultDeploy.address);
};

func.tags = ["ConfidentialVault"];
export default func;
