"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { useFhevm, type FhevmStatus } from "./useFhevm";
import { CONFIDENTIAL_USDC_ADDRESS, CONFIDENTIAL_USDC_ABI } from "@/lib/contracts";

interface FheBalancesState {
  cusdcBalance: bigint | null;
  cusdcFormatted: string;
  canDecrypt: boolean;
  fhevmStatus: FhevmStatus;
  decrypting: boolean;
  decryptMsg: string | null;
  decryptError: string | null;
  decrypt: () => Promise<void>;
  invalidate: () => void;
  retryFhevm: () => void;
}

const FheBalancesContext = createContext<FheBalancesState | null>(null);

export function useFheBalances() {
  const ctx = useContext(FheBalancesContext);
  if (!ctx) throw new Error("useFheBalances must be used within FheBalancesProvider");
  return ctx;
}

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function FheBalancesProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const { instance: fhevm, status: fhevmStatus, ethersSigner, retry: retryFhevm } = useFhevm();

  const [cusdcBalance, setCusdcBalance] = useState<bigint | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptMsg, setDecryptMsg] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const { data: cusdcHandle, refetch: refetchCusdc } = useReadContract({
    address: CONFIDENTIAL_USDC_ADDRESS,
    abi: CONFIDENTIAL_USDC_ABI,
    functionName: "encryptedBalanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && CONFIDENTIAL_USDC_ADDRESS !== "0x0000000000000000000000000000000000000000" },
  });

  const canDecrypt = fhevmStatus === "ready" && !!ethersSigner && !!address;

  const decrypt = useCallback(async () => {
    if (!fhevm || !ethersSigner || !address) {
      setDecryptError("FHE SDK or wallet not ready");
      return;
    }

    const refetchResult = await refetchCusdc();
    const handle = (refetchResult.data ?? cusdcHandle) as string | undefined;

    if (!handle || handle === ZERO_HASH) {
      setCusdcBalance(0n);
      return;
    }

    setDecrypting(true);
    setDecryptError(null);
    setDecryptMsg("Generating keypair...");

    try {
      const { publicKey, privateKey } = fhevm.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 1;
      const contractAddresses = [CONFIDENTIAL_USDC_ADDRESS];

      setDecryptMsg("Please sign the decryption request...");
      const eip712 = fhevm.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);

      const signature = await ethersSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      setDecryptMsg("Decrypting via FHE relayer...");
      const requests = [{ handle: handle as string, contractAddress: CONFIDENTIAL_USDC_ADDRESS }];

      const results = await fhevm.userDecrypt(
        requests, privateKey, publicKey, signature,
        contractAddresses, address, startTimestamp, durationDays,
      );

      const value = results[handle as string];
      setCusdcBalance(value !== undefined ? BigInt(value as any) : 0n);
      setDecryptMsg(null);
    } catch (err: any) {
      console.error("Decrypt error:", err);
      setDecryptError(err?.message || "Decryption failed");
      setDecryptMsg(null);
    } finally {
      setDecrypting(false);
    }
  }, [fhevm, ethersSigner, address, cusdcHandle, refetchCusdc]);

  const invalidate = useCallback(() => {
    setCusdcBalance(null);
    refetchCusdc();
  }, [refetchCusdc]);

  const cusdcFormatted = cusdcBalance !== null
    ? parseFloat(formatUnits(cusdcBalance, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "***";

  return (
    <FheBalancesContext.Provider value={{
      cusdcBalance, cusdcFormatted, canDecrypt, fhevmStatus,
      decrypting, decryptMsg, decryptError, decrypt, invalidate, retryFhevm,
    }}>
      {children}
    </FheBalancesContext.Provider>
  );
}
