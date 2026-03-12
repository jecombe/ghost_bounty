"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { ethers } from "ethers";
import { createFhevmInstance, resetFhevm, type FhevmInstance } from "@/lib/fhe/sdk";

export type FhevmStatus = "idle" | "loading" | "ready" | "error";

// Public Sepolia RPC used when MetaMask is not connected.
// The FHEVM SDK only needs it to fetch FHE public keys from the relayer.
const FALLBACK_RPC = "https://rpc.sepolia.org";

/**
 * Hook to initialize the Zama FHEVM Relayer SDK.
 *
 * The SDK initializes as soon as the page loads — no wallet connection required.
 * wallet is only needed for:
 *   - ethersSigner  → sign EIP-712 for userDecrypt
 *   - address       → passed to createEncryptedInput(contract, userAddress)
 *
 * This way the SDK is already "ready" when the user connects their wallet,
 * with no loading delay before they can encrypt/decrypt.
 */
export function useFhevm() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [instance, setInstance] = useState<FhevmInstance | undefined>();
  const [status, setStatus] = useState<FhevmStatus>("idle");
  const [error, setError] = useState<Error | undefined>();
  const initRef = useRef(false);
  const prevAddressRef = useRef<string | undefined>(undefined);
  const forceReinitRef = useRef(false);

  // Prefer window.ethereum (MetaMask) but fall back to a public JSON-RPC provider.
  // Either way the SDK can load — wallet connection is NOT required for init.
  const provider = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const metamask = (window as any).ethereum as ethers.Eip1193Provider | undefined;
    if (metamask) return metamask;
    // MetaMask not installed: use a plain JSON-RPC provider as fallback
    return new ethers.JsonRpcProvider(FALLBACK_RPC);
  }, []);

  // ethers signer from walletClient — only available when wallet is connected
  const ethersSigner = useMemo(() => {
    if (!walletClient || !address) return undefined;
    const eip1193 = {
      request: async (args: any) => walletClient.request(args),
      on: () => {},
      removeListener: () => {},
    } as ethers.Eip1193Provider;
    const p = new ethers.BrowserProvider(eip1193);
    return new ethers.JsonRpcSigner(p, address);
  }, [walletClient, address]);

  const ethersProvider = useMemo(() => {
    if (!walletClient) return undefined;
    const eip1193 = {
      request: async (args: any) => walletClient.request(args),
      on: () => {},
      removeListener: () => {},
    } as ethers.Eip1193Provider;
    return new ethers.BrowserProvider(eip1193);
  }, [walletClient]);

  // Reset SDK when wallet disconnects or switches account (stale session fix)
  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = address;

    if (prev !== undefined && prev !== address) {
      initRef.current = false;
      forceReinitRef.current = true;
      setInstance(undefined);
      setStatus("idle");
      setError(undefined);
      resetFhevm();
    }
  }, [address]);

  // Initialize as soon as provider is available — no wallet required
  useEffect(() => {
    if (!provider) return;
    if (initRef.current) return;
    initRef.current = true;

    const shouldForce = forceReinitRef.current;
    forceReinitRef.current = false;

    setStatus("loading");
    setError(undefined);

    console.log("[FHE] Starting init, forceReinit:", shouldForce);

    // Timeout after 15s
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("FHE SDK init timed out after 15s")), 15_000)
    );

    Promise.race([createFhevmInstance(provider, shouldForce), timeout])
      .then((inst) => {
        console.log("[FHE] Ready");
        setInstance(inst);
        setStatus("ready");
        setError(undefined);
      })
      .catch((err) => {
        console.error("[FHE] Init error:", err);
        setError(err);
        setStatus("error");
        initRef.current = false;
      });
  }, [provider]);

  const retry = useCallback(() => {
    resetFhevm();
    initRef.current = false;
    forceReinitRef.current = true;
    setInstance(undefined);
    setStatus("idle");
    setError(undefined);
  }, []);

  return {
    instance,
    status,
    error,
    ethersSigner,
    ethersProvider,
    retry,
  };
}
