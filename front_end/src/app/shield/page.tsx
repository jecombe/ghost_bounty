"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import {
  USDC_ADDRESS,
  USDC_ABI,
  CONFIDENTIAL_USDC_ADDRESS,
  CONFIDENTIAL_USDC_ABI,
} from "@/lib/contracts";
import { useFheBalances } from "@/hooks/useFheBalances";

type Mode = "shield" | "unshield";

export default function ShieldPage() {
  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { cusdcFormatted, decrypt, decrypting, decryptMsg, decryptError, canDecrypt, invalidate } = useFheBalances();

  const [mode, setMode] = useState<Mode>("shield");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [step, setStep] = useState<"idle" | "approve" | "shield" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // USDC balance
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txConfirmed && step !== "idle") {
      setStep("done");
      refetchUsdc();
      invalidate();
    }
  }, [txConfirmed, step, refetchUsdc, invalidate]);

  const usdcFormatted = usdcBalance !== undefined
    ? parseFloat(formatUnits(usdcBalance as bigint, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

  const handleShield = async () => {
    if (!amount || !address) return;
    const amountRaw = parseUnits(amount, 6);
    setError(null);
    try {
      setStep("approve");
      await writeContractAsync({
        chainId,
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "approve",
        args: [CONFIDENTIAL_USDC_ADDRESS, amountRaw],
      });

      setStep("shield");
      const hash = await writeContractAsync({
        chainId,
        address: CONFIDENTIAL_USDC_ADDRESS,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "shield",
        args: [amountRaw],
      });
      setTxHash(hash);
    } catch (e: any) {
      console.error("Shield failed:", e);
      setError(e?.shortMessage || e?.message || "Shield failed");
      setStep("idle");
    }
  };

  const handleUnshield = async () => {
    if (!amount) return;
    const amount64 = parseUnits(amount, 6);
    setError(null);
    try {
      setStep("shield");
      const hash = await writeContractAsync({
        chainId,
        address: CONFIDENTIAL_USDC_ADDRESS,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "unshield",
        args: [amount64],
      });
      setTxHash(hash);
    } catch (e: any) {
      console.error("Unshield failed:", e);
      setError(e?.shortMessage || e?.message || "Unshield failed");
      setStep("idle");
    }
  };

  const handleSubmit = () => {
    setStep("idle");
    setTxHash(undefined);
    if (mode === "shield") handleShield();
    else handleUnshield();
  };

  const reset = () => {
    setStep("idle");
    setAmount("");
    setTxHash(undefined);
    setError(null);
  };

  const busy = step !== "idle" && step !== "done";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Shield<span className="text-cyan-400"> / Unshield</span>
        </h1>
        <p className="text-sm text-blue-300/50">
          Convert between plain USDC and encrypted cUSDC
        </p>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3">
        <div className="panel-military rounded-2xl p-4 border border-amber-900/20 text-center space-y-1">
          <p className="text-[10px] font-semibold text-blue-300/40 uppercase tracking-wider">USDC</p>
          <p className="text-xl font-bold text-white font-mono">{usdcFormatted}</p>
          <p className="text-[10px] text-blue-300/20">Plain (visible)</p>
        </div>
        <div className="panel-military rounded-2xl p-4 border border-amber-900/20 text-center space-y-1">
          <p className="text-[10px] font-semibold text-blue-300/40 uppercase tracking-wider">cUSDC</p>
          <p className="text-xl font-bold text-cyan-400 font-mono">{cusdcFormatted}</p>
          <div className="flex items-center justify-center gap-1">
            <p className="text-[10px] text-blue-300/20">Encrypted (FHE)</p>
            {canDecrypt && (
              <button
                onClick={decrypt}
                disabled={decrypting}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 underline disabled:opacity-40"
              >
                {decrypting ? "..." : "decrypt"}
              </button>
            )}
          </div>
          {decryptMsg && <p className="text-[9px] text-cyan-300/50">{decryptMsg}</p>}
          {decryptError && <p className="text-[9px] text-red-400">{decryptError}</p>}
        </div>
      </div>

      {!isConnected ? (
        <div className="panel-military rounded-2xl p-8 text-center border border-amber-900/20">
          <p className="text-blue-300/50">Connect your wallet to shield/unshield USDC</p>
        </div>
      ) : (
        <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-5">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            {(["shield", "unshield"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); reset(); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all capitalize ${
                  mode === m
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20"
                    : "text-blue-300/40 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Explanation */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            {mode === "shield" ? (
              <p className="text-xs text-blue-300/40">
                <strong className="text-white">Shield</strong> converts your plain USDC into encrypted cUSDC.
                Your balance becomes private — nobody can see how much you hold.
                Required before creating bounties.
              </p>
            ) : (
              <p className="text-xs text-blue-300/40">
                <strong className="text-white">Unshield</strong> converts encrypted cUSDC back to plain USDC.
                The amount becomes publicly visible on-chain again.
              </p>
            )}
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs font-medium text-blue-300/50 mb-1.5">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={busy}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-lg disabled:opacity-40"
              />
              {mode === "shield" && usdcBalance !== undefined && (
                <button
                  onClick={() => setAmount(formatUnits(usdcBalance as bigint, 6))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold uppercase"
                >
                  Max
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          {busy && (
            <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
              <div className="flex items-center gap-2 text-xs text-cyan-300">
                <div className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                {step === "approve" && "Approving USDC spend..."}
                {step === "shield" && (mode === "shield" ? "Shielding USDC → cUSDC..." : "Unshielding cUSDC → USDC...")}
              </div>
            </div>
          )}

          {/* Success */}
          {step === "done" && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <p className="text-green-400 text-sm font-semibold">
                {mode === "shield" ? "USDC shielded successfully!" : "cUSDC unshielded successfully!"}
              </p>
              <p className="text-xs text-blue-300/30 mt-1">Your balances have been updated</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={step === "done" ? reset : handleSubmit}
            disabled={busy || (!amount && step !== "done")}
            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 transition-all"
          >
            {step === "done"
              ? `${mode === "shield" ? "Shield" : "Unshield"} More`
              : mode === "shield"
                ? "Shield USDC → cUSDC"
                : "Unshield cUSDC → USDC"}
          </button>
        </div>
      )}

      {/* Info */}
      <div className="panel-military rounded-2xl p-4 border border-amber-900/20">
        <h3 className="text-xs font-semibold text-white mb-2">What is cUSDC?</h3>
        <p className="text-xs text-blue-300/30 leading-relaxed">
          cUSDC (Confidential USDC) is an FHE-encrypted wrapper around USDC, powered by Zama's fhEVM.
          When you shield USDC, your balance is encrypted using Fully Homomorphic Encryption — the blockchain
          can process transactions on encrypted data without ever revealing the amounts. Only you (with your
          private key) can decrypt and view your balance.
        </p>
      </div>
    </div>
  );
}
