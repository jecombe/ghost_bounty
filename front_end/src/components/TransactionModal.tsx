"use client";

import { useEffect, useRef } from "react";

export interface TxStep {
  id: string;
  label: string;
  description: string;
  status: "pending" | "signing" | "confirming" | "done" | "error";
  txHash?: string;
  error?: string;
}

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: TxStep[];
  icon?: string;
  chainId?: number;
}

function getExplorerUrl(chainId: number | undefined, txHash: string) {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

function StepIcon({ status }: { status: TxStep["status"] }) {
  switch (status) {
    case "done":
      return (
        <div className="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center result-pop shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case "error":
      return (
        <div className="w-9 h-9 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)]">
          <svg className="w-4.5 h-4.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case "signing":
    case "confirming":
      return (
        <div className="w-9 h-9 rounded-full flex items-center justify-center relative">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <div className="absolute inset-1 rounded-full border border-cyan-400/10 border-b-cyan-400/40 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_12px_rgba(6,182,212,0.6)]" />
        </div>
      );
    default:
      return (
        <div className="w-9 h-9 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white/15" />
        </div>
      );
  }
}

function statusLabel(status: TxStep["status"]) {
  switch (status) {
    case "signing": return "Approve in wallet...";
    case "confirming": return "Waiting for block confirmation...";
    case "done": return "Confirmed";
    case "error": return "Failed";
    default: return "";
  }
}

export function TransactionModal({ open, onClose, title, steps, icon, chainId }: TransactionModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const allDone = steps.length > 0 && steps.every((s) => s.status === "done");
  const hasError = steps.some((s) => s.status === "error");
  const canClose = allDone || hasError;
  const doneCount = steps.filter((s) => s.status === "done").length;
  const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => { if (canClose && e.target === backdropRef.current) onClose(); }}
    >
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Ambient glow */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full transition-all duration-1000 ${
        allDone ? "bg-emerald-500/[0.07]" : hasError ? "bg-red-500/[0.05]" : "bg-cyan-500/[0.06]"
      } blur-3xl pointer-events-none`} />

      {/* Modal card */}
      <div className="relative w-full max-w-md tx-modal-enter">
        {/* Outer glow border */}
        <div className={`absolute -inset-px rounded-2xl transition-all duration-700 ${
          allDone
            ? "bg-gradient-to-b from-emerald-500/30 via-emerald-500/10 to-transparent shadow-[0_0_40px_rgba(16,185,129,0.15)]"
            : hasError
            ? "bg-gradient-to-b from-red-500/30 via-red-500/10 to-transparent"
            : "bg-gradient-to-b from-cyan-500/25 via-blue-500/10 to-transparent shadow-[0_0_30px_rgba(6,182,212,0.1)]"
        }`} />

        <div className="relative bg-[#0a1628]/95 border border-white/[0.08] rounded-2xl overflow-hidden">
          {/* Scan line effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div className="scan-line" />
          </div>

          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {icon && <span className="text-2xl">{icon}</span>}
                <div>
                  <h3 className="font-black text-white text-lg tracking-tight">{title}</h3>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300/50 mt-0.5 font-semibold">
                    {allDone ? "All transactions confirmed" : hasError ? "Transaction failed" : `Step ${Math.min(doneCount + 1, steps.length)} of ${steps.length}`}
                  </p>
                </div>
              </div>
              {allDone && (
                <div className="result-pop">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.2)]">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-4 w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                style={{
                  width: `${progress}%`,
                  background: hasError
                    ? "linear-gradient(90deg, #ef4444, #f87171)"
                    : allDone
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #06b6d4, #3b82f6)",
                }}
              >
                {/* Shimmer on active */}
                {!allDone && !hasError && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" style={{ backgroundSize: "200% 100%" }} />
                )}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="px-6 py-2 space-y-0">
            {steps.map((step, i) => {
              const isActive = step.status === "signing" || step.status === "confirming";

              return (
                <div key={step.id} className="flex gap-3.5">
                  {/* Vertical rail: icon + connector */}
                  <div className="flex flex-col items-center">
                    <StepIcon status={step.status} />
                    {i < steps.length - 1 && (
                      <div className="flex-1 w-px my-1.5 relative">
                        <div className="absolute inset-0 bg-white/[0.06]" />
                        <div
                          className={`absolute inset-x-0 top-0 transition-all duration-500 ${
                            step.status === "done" ? "h-full bg-emerald-400/40" : "h-0 bg-cyan-400/40"
                          }`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Step content */}
                  <div className={`flex-1 pb-5 transition-all duration-300 ${
                    isActive ? "pt-1.5" : "pt-1"
                  }`}>
                    {/* Active step highlight background */}
                    <div className={`-ml-2 px-3 py-2 rounded-xl transition-all duration-300 ${
                      isActive ? "bg-cyan-500/[0.05] border border-cyan-500/10" : "border border-transparent"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold transition-colors duration-300 ${
                          step.status === "done" ? "text-emerald-400" :
                          step.status === "error" ? "text-red-400" :
                          isActive ? "text-white" :
                          "text-white/25"
                        }`}>
                          {step.label}
                        </span>
                        {step.status === "done" && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">ok</span>
                        )}
                      </div>

                      <p className={`text-xs mt-0.5 transition-colors duration-300 ${
                        isActive ? "text-blue-300/60" :
                        step.status === "done" ? "text-blue-300/30" :
                        step.status === "error" ? "text-red-400/60" :
                        "text-white/15"
                      }`}>
                        {step.error || step.description}
                      </p>

                      {/* Active status indicator */}
                      {isActive && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-[10px] font-semibold text-cyan-400/70">
                            {statusLabel(step.status)}
                          </span>
                        </div>
                      )}

                      {/* Tx hash link */}
                      {step.txHash && (
                        <a
                          href={getExplorerUrl(chainId, step.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-cyan-400/40 hover:text-cyan-400/80 font-mono transition-colors"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          {step.txHash.slice(0, 10)}...{step.txHash.slice(-6)}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Success celebration */}
          {allDone && (
            <div className="px-6 pb-3 result-pop">
              <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/[0.05] to-transparent animate-[shimmer_2s_infinite]" style={{ backgroundSize: "200% 100%" }} />
                <p className="text-emerald-400 text-sm font-bold relative">All transactions confirmed!</p>
                <p className="text-emerald-400/40 text-xs mt-0.5 relative">Your operation completed successfully</p>
              </div>
            </div>
          )}

          {/* Error block */}
          {hasError && (
            <div className="px-6 pb-3">
              <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/20">
                <p className="text-red-400 text-xs font-semibold">Transaction failed</p>
                <p className="text-red-400/40 text-[10px] mt-0.5">
                  {steps.find((s) => s.status === "error")?.error || "Please try again."}
                </p>
              </div>
            </div>
          )}

          {/* Close button */}
          <div className="px-6 py-4 border-t border-white/[0.04]">
            <button
              onClick={onClose}
              disabled={!canClose}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                allDone
                  ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                  : hasError
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                  : "bg-white/[0.03] text-white/20 border border-white/[0.04] cursor-not-allowed"
              }`}
            >
              {allDone ? "Done" : hasError ? "Close" : "Processing..."}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
