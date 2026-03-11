"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { SessionProvider } from "next-auth/react";
import { config } from "@/lib/wagmi";
import { useState } from "react";
import { AmbienceProvider } from "./AmbienceContext";
import { OceanAmbience } from "./OceanAmbience";
import { FheBalancesProvider } from "@/hooks/useFheBalances";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: "#3b82f6",
              accentColorForeground: "white",
              borderRadius: "large",
              overlayBlur: "small",
            })}
          >
            <FheBalancesProvider>
              <AmbienceProvider>
                <OceanAmbience />
                {children}
              </AmbienceProvider>
            </FheBalancesProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}
