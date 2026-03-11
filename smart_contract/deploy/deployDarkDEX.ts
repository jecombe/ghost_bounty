import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const FEE_BPS = parseInt(process.env.DEX_FEE_BPS || "30"); // 0.3% default

  // 1. Deploy MockWETH (or use existing)
  const WETH_ADDRESS = process.env.WETH_ADDRESS;
  let wethAddress: string;

  if (WETH_ADDRESS) {
    wethAddress = WETH_ADDRESS;
    console.log("Using existing WETH:", wethAddress);
  } else {
    const wethDeploy = await deploy("MockWETH", {
      from: deployer,
      log: true,
    });
    wethAddress = wethDeploy.address;
    console.log("MockWETH deployed:", wethAddress);
  }

  // 2. Deploy ConfidentialERC20Wrapper for WETH → cWETH
  const cwethDeploy = await deploy("ConfidentialERC20Wrapper", {
    from: deployer,
    args: [wethAddress, "Confidential WETH", "cWETH"],
    log: true,
  });
  console.log("cWETH (ConfidentialERC20Wrapper):", cwethDeploy.address);

  // 3. Deploy DarkDEX
  const dexDeploy = await deploy("DarkDEX", {
    from: deployer,
    args: [FEE_BPS],
    log: true,
  });
  console.log("DarkDEX:", dexDeploy.address);

  console.log("\n--- DarkDEX Deployment Complete ---");
  console.log("MockWETH:", wethAddress);
  console.log("cWETH:", cwethDeploy.address);
  console.log("DarkDEX:", dexDeploy.address);
  console.log("Fee:", FEE_BPS / 100, "%");
};

func.tags = ["DarkDEX"];
export default func;
