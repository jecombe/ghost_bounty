"use client";

import { useState } from "react";
import { WalletButton } from "./WalletButton";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { USDC_ADDRESS, USDC_ABI } from "@/lib/contracts";
import { useFheBalances } from "@/hooks/useFheBalances";
import { SettingsPanel } from "./SettingsPanel";
import { Sidebar } from "./Sidebar";

export function Header() {
  const { address } = useAccount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { cusdcFormatted, cusdcBalance, decrypt, canDecrypt, decrypting, fhevmStatus, decryptError, retryFhevm } = useFheBalances();

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return (
    <>
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <header className="sticky top-0 z-30 panel-military border-b border-amber-900/20 md:pl-52">
        <div className="px-4 h-14 flex items-center justify-between">
          <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-white/5 transition-colors mr-2">
            <svg className="w-5 h-5 text-blue-300/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2 ml-auto">
            {address && (
              cusdcBalance !== null ? (
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono bg-cyan-500/10 px-2.5 py-1.5 rounded-lg border border-cyan-500/15">
                  <span className="text-cyan-400 font-bold">{cusdcFormatted}</span>
                  <span className="text-cyan-400/40 text-[10px]">cUSDC</span>
                </div>
              ) : (
                <button onClick={() => decrypt()} disabled={!canDecrypt || decrypting} title="Click to decrypt cUSDC balance"
                  className="hidden sm:flex items-center gap-1.5 text-xs font-mono bg-cyan-500/10 px-2.5 py-1.5 rounded-lg border border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  <svg className="w-3 h-3 text-cyan-500/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-cyan-400/60 font-bold">{decrypting ? "..." : "***"}</span>
                  <span className="text-cyan-400/30 text-[10px]">cUSDC</span>
                </button>
              )
            )}
            {address && usdcBalance !== undefined && (
              <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/15">
                <span className="text-emerald-400 font-bold">{parseFloat(formatUnits(usdcBalance, 6)).toFixed(2)}</span>
                <span className="text-emerald-400/40 text-[10px]">USDC</span>
              </div>
            )}
            {/* FHE SDK status indicator */}
            {address && (
              <button
                onClick={fhevmStatus === "error" ? retryFhevm : undefined}
                className={`hidden sm:flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg border ${
                  fhevmStatus === "ready"
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : fhevmStatus === "loading"
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      : fhevmStatus === "error"
                        ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer"
                        : "bg-white/5 border-white/10 text-blue-300/40"
                }`} title={fhevmStatus === "error" ? `${decryptError || "Error"} — click to retry` : `FHE: ${fhevmStatus}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  fhevmStatus === "ready" ? "bg-green-400"
                  : fhevmStatus === "loading" ? "bg-amber-400 animate-pulse"
                  : fhevmStatus === "error" ? "bg-red-400"
                  : "bg-blue-300/30"
                }`} />
                FHE {fhevmStatus === "error" ? "error ↻" : fhevmStatus}
              </button>
            )}
            <SettingsPanel />
            <WalletButton />
          </div>
        </div>
      </header>
    </>
  );
}
