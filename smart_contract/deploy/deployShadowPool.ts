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
    "0x4f73E1F80De6E614FBB5F4B66B6C802CD087A5CC"; // ConfidentialUSDC (v2 with setOperator)
  const TREASURY =
    process.env.MIXER_TREASURY || deployer;
  const WITHDRAW_DELAY = parseInt(process.env.MIXER_WITHDRAW_DELAY || "0"); // No delay by default
  const FEE_BPS = parseInt(process.env.MIXER_FEE_BPS || "50"); // 0.5% default

  console.log("Deploying ShadowPool with deployer:", deployer);
  console.log("USDC:", USDC_ADDRESS);
  console.log("cUSDC:", CUSDC_ADDRESS);
  console.log("Treasury:", TREASURY);
  console.log("Withdraw delay:", WITHDRAW_DELAY, "seconds");
  console.log("Fee:", FEE_BPS / 100, "%");

  // 1. Deploy StealthAddressRegistry
  const registryDeploy = await deploy("StealthAddressRegistry", {
    from: deployer,
    log: true,
  });
  console.log("StealthAddressRegistry:", registryDeploy.address);

  // 2. Deploy ShadowPool
  const shadowPoolDeploy = await deploy("ShadowPool", {
    from: deployer,
    args: [
      USDC_ADDRESS,
      CUSDC_ADDRESS,
      registryDeploy.address,
      TREASURY,
      WITHDRAW_DELAY,
      FEE_BPS,
    ],
    log: true,
  });
  console.log("ShadowPool:", shadowPoolDeploy.address);

  console.log("\n--- ShadowPool Deployment Complete ---");
  console.log("Registry:", registryDeploy.address);
  console.log("ShadowPool:", shadowPoolDeploy.address);
};

func.tags = ["ShadowPool"];
export default func;
