import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const USDC_ADDRESS =
    process.env.USDC_ADDRESS ||
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC

  console.log("Deploying ConfidentialUSDC with deployer:", deployer);
  console.log("Underlying USDC:", USDC_ADDRESS);

  const cusdcDeploy = await deploy("ConfidentialUSDC", {
    from: deployer,
    args: [USDC_ADDRESS],
    log: true,
  });

  console.log("\n--- ConfidentialUSDC Deployed ---");
  console.log("Address:", cusdcDeploy.address);
};

func.tags = ["ConfidentialUSDC"];
export default func;
