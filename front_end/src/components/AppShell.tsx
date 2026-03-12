"use client";

import dynamic from "next/dynamic";
import { cookieToInitialState } from "wagmi";
import { config } from "@/lib/wagmi";
import { Header } from "./Header";
import { OceanBackground } from "./OceanBackground";

const Providers = dynamic(
  () => import("./Providers").then((m) => ({ default: m.Providers })),
  { ssr: false }
);

export function AppShell({ children, cookie }: { children: React.ReactNode; cookie?: string }) {
  const initialState = cookie ? cookieToInitialState(config, cookie) : undefined;
  return (
    <Providers initialState={initialState}>
      <OceanBackground />
      <Header />
      <main className="md:pl-52 relative z-10">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
          <div className="content-backdrop rounded-2xl px-4 sm:px-8 py-6">
            {children}
          </div>
        </div>
      </main>
    </Providers>
  );
}
