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
      {/* FHE SDK troubleshooting ticker */}
      <div className="md:pl-52 relative z-10 overflow-hidden border-b border-cyan-400/15 bg-black/60 backdrop-blur-sm">
        <div className="flex whitespace-nowrap" style={{ animation: "marquee-scroll 28s linear infinite" }}>
          {[0, 1].map((i) => (
            <span key={i} className="inline-flex items-center gap-6 px-6 py-1.5 text-[11px] text-cyan-100/80 shrink-0 font-medium tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              <span>FHE SDK not loading?</span>
              <span className="text-cyan-400/40">|</span>
              <span>Click the lock icon next to the URL bar &rarr; <strong className="text-white">Clear cookies and site data</strong> &rarr; reload the page</span>
              <span className="text-cyan-400/40">|</span>
              <span>Always check the <strong className="text-white">FHE status indicator</strong> in the header before using the app</span>
              <span className="text-cyan-400/40 ml-6">&#8226;</span>
            </span>
          ))}
        </div>
      </div>

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
