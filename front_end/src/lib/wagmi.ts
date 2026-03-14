import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, cookieStorage, createStorage } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

// Only use cookieStorage on the client; on the server use a no-op storage
// to avoid "this.localStorage.getItem is not a function" errors during SSR.
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const storage = createStorage({
  storage: typeof window !== "undefined" ? cookieStorage : noopStorage,
});

export const config = getDefaultConfig({
  appName: "GhostBounty",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "shadowpool-dev",
  chains: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http(),
    [hardhat.id]: http("http://localhost:8545"),
  },
  ssr: true,
  storage,
});
