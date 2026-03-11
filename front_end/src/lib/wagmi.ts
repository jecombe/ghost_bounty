import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "ShadowPool",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "shadowpool-dev",
  chains: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http(),
    [hardhat.id]: http("http://localhost:8545"),
  },
  ssr: true,
});
