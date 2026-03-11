"use client";

import { useEffect } from "react";

export interface TxStep {
  id: string;
  label: string;
  description: string;
  status: "pending" | "active" | "signing" | "confirming" | "done" | "error";
  txHash?: string;
  error?: string;
}

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: TxStep[];
  icon?: string;
}

function StepIcon({ status }: { status: TxStep["status"] }) {
  switch (status) {
    case "done":
      return (
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case "active":
    case "signing":
    case "confirming":
      return (
        <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center relative">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
        </div>
      );
    case "error":
      return (
        <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-slate-800/60 border border-slate-700/40 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-slate-600" />
        </div>
      );
  }
}

export function TransactionModal({ open, onClose, title, steps, icon }: TransactionModalProps) {
  function statusLabel(status: TxStep["status"]) {
    switch (status) {
      case "signing": return "Signing...";
      case "confirming": return "Confirming...";
      case "done": return "Confirmed";
      case "error": return "Error";
      case "active": return "Processing...";
      default: return "Waiting...";
    }
  }
  const allDone = steps.every((s) => s.status === "done");
  const hasError = steps.some((s) => s.status === "error");
  const canClose = allDone || hasError;

  // Auto-close after success
  useEffect(() => {
    if (allDone) {
      const t = setTimeout(onClose, 2000);
      return () => clearTimeout(t);
    }
  }, [allDone, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={canClose ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md tx-modal-enter">
        {/* Sonar ring decoration */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-cyan-500/20 via-blue-500/10 to-transparent" />

        <div className="relative bg-[#0b1a30] border border-blue-800/30 rounded-2xl overflow-hidden">
          {/* Scan line effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div className="scan-line" />
          </div>

          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-blue-900/30">
            <div className="flex items-center gap-3">
              {icon && <span className="text-2xl">{icon}</span>}
              <div>
                <h3 className="font-black text-white text-lg tracking-tight">{title}</h3>
                <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300/60 mt-0.5">
                  {allDone ? "Transaction Complete" : hasError ? "Transaction Failed" : "In Progress"}
                </p>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="px-6 py-5 space-y-1">
            {steps.map((step, i) => (
              <div key={step.id} className="flex gap-3">
                {/* Connector line + icon */}
                <div className="flex flex-col items-center">
                  <StepIcon status={step.status} />
                  {i < steps.length - 1 && (
                    <div className={`w-px flex-1 my-1 ${step.status === "done" ? "bg-emerald-500/30" : "bg-slate-700/40"}`} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${
                      step.status === "done" ? "text-emerald-400" :
                      step.status === "error" ? "text-red-400" :
                      step.status === "pending" ? "text-slate-500" :
                      "text-white"
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  <p className="text-xs text-blue-400/50 mt-0.5">{step.description}</p>

                  {/* Status */}
                  {step.status !== "pending" && step.status !== "done" && (
                    <div className={`mt-2 text-[11px] font-mono ${
                      step.status === "error" ? "text-red-400/80" : "text-cyan-400/60"
                    }`}>
                      {step.error || statusLabel(step.status)}
                    </div>
                  )}

                  {/* Tx hash */}
                  {step.txHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-300/60 hover:text-blue-300/60 font-mono transition-colors"
                    >
                      {step.txHash.slice(0, 10)}...{step.txHash.slice(-6)}
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {allDone && (
            <div className="px-6 pb-5">
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-emerald-400">Success!</span>
              </div>
            </div>
          )}

          {hasError && (
            <div className="px-6 pb-5">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
