"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseUnits } from "viem";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  GHOST_BOUNTY_ADDRESS,
  GHOST_BOUNTY_ABI,
  CONFIDENTIAL_USDC_ADDRESS,
  CONFIDENTIAL_USDC_ABI,
  USDC_ADDRESS,
  USDC_ABI,
} from "@/lib/contracts";
import { useFhevm } from "@/hooks/useFhevm";
import { toHexString } from "@/lib/fhe/sdk";

type Tab = "create" | "browse" | "claim";

interface BountyInfo {
  id: number;
  creator: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  status: number; // 0=Active, 1=Pending, 2=Verified, 3=Claimed, 4=Cancelled
  claimedBy: string;
  createdAt: number;
}

const STATUS_LABELS = ["Active", "Verifying...", "Verified", "Claimed", "Cancelled"];
const STATUS_COLORS = ["text-green-400", "text-amber-400", "text-purple-400", "text-cyan-400", "text-red-400"];

export default function BountyPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { instance, status: fheStatus } = useFhevm();
  const fheLoading = fheStatus !== "ready";
  const { writeContractAsync } = useWriteContract();

  // GitHub OAuth session
  const { data: session, status: sessionStatus } = useSession();
  const githubUser = (session as any)?.githubUsername as string | undefined;
  const githubAvatar = session?.user?.image;
  const githubName = session?.user?.name;

  // Read query params for pre-filled bounty creation (from GitHub bot link)
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("browse");

  // --- Register ---
  const [gistId, setGistId] = useState("");
  const [registerPending, setRegisterPending] = useState(false);
  const [waitingChainlink, setWaitingChainlink] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const sawPendingTrueRef = useRef(false); // track that we saw verificationPending=true at least once

  // --- Create Bounty ---
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [issueNumber, setIssueNumber] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");

  // Pre-fill from query params (?tab=create&owner=x&repo=y&issue=1&amount=100)
  useEffect(() => {
    const qTab = searchParams.get("tab");
    const qOwner = searchParams.get("owner");
    const qRepo = searchParams.get("repo");
    const qIssue = searchParams.get("issue");
    const qAmount = searchParams.get("amount");
    if (qTab === "create") setTab("create");
    if (qOwner) setRepoOwner(qOwner);
    if (qRepo) setRepoName(qRepo);
    if (qIssue) setIssueNumber(qIssue);
    if (qAmount) setBountyAmount(qAmount);
  }, [searchParams]);
  const [createStep, setCreateStep] = useState<"idle" | "approve" | "shield" | "operator" | "create" | "done">("idle");
  const [createTxHash, setCreateTxHash] = useState<`0x${string}` | undefined>();

  // --- Claim ---
  const [claimBountyId, setClaimBountyId] = useState("");
  const [claimPrNumber, setClaimPrNumber] = useState("");
  const [claimPending, setClaimPending] = useState(false);
  const [waitingClaimVerification, setWaitingClaimVerification] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(null);
  const claimBountyIdRef = useRef<string>("");

  // --- Browse ---
  const [bounties, setBounties] = useState<BountyInfo[]>([]);
  const [loadingBounties, setLoadingBounties] = useState(false);

  // Reads
  const { data: bountyCount } = useReadContract({
    address: GHOST_BOUNTY_ADDRESS,
    abi: GHOST_BOUNTY_ABI,
    functionName: "bountyCount",
  });

  const { data: userGithubOnChain, refetch: refetchGithub } = useReadContract({
    address: GHOST_BOUNTY_ADDRESS,
    abi: GHOST_BOUNTY_ABI,
    functionName: "devGithub",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: verificationPending, refetch: refetchPending } = useReadContract({
    address: GHOST_BOUNTY_ADDRESS,
    abi: GHOST_BOUNTY_ABI,
    functionName: "devVerificationPending",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const isRegisteredOnChain = typeof userGithubOnChain === "string" && userGithubOnChain.length > 0;

  // Poll for verification status while pending (Chainlink takes 1-2 min)
  useEffect(() => {
    if (!verificationPending && !waitingChainlink) return;
    console.log("[GhostBounty] Polling started — verificationPending:", verificationPending, "waitingChainlink:", waitingChainlink);
    const interval = setInterval(async () => {
      const [ghResult, pendingResult] = await Promise.all([refetchGithub(), refetchPending()]);
      console.log("[GhostBounty] Poll result — devGithub:", JSON.stringify(ghResult.data), "verificationPending:", JSON.stringify(pendingResult.data));
    }, 8_000); // every 8s
    return () => clearInterval(interval);
  }, [verificationPending, waitingChainlink, refetchGithub, refetchPending]);

  // Track when we see verificationPending=true on-chain (proves tx was mined)
  useEffect(() => {
    if (waitingChainlink && verificationPending === true) {
      console.log("[GhostBounty] On-chain verificationPending=true confirmed");
      sawPendingTrueRef.current = true;
    }
  }, [waitingChainlink, verificationPending]);

  // Reset sawPendingTrue when we start a new registration
  useEffect(() => {
    if (waitingChainlink) {
      sawPendingTrueRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingChainlink === true]); // only on transition to true

  // Detect verification success or failure
  useEffect(() => {
    if (waitingChainlink) {
      if (isRegisteredOnChain) {
        console.log("[GhostBounty] ✓ Verification SUCCESS — devGithub:", userGithubOnChain);
        setWaitingChainlink(false);
        setVerificationSuccess(true);
        setVerificationFailed(false);
        setTimeout(() => setVerificationSuccess(false), 10_000);
      } else if (sawPendingTrueRef.current && verificationPending === false && !isRegisteredOnChain) {
        // Only declare failure AFTER we saw pending=true then it went back to false
        console.warn("[GhostBounty] ✗ Verification FAILED — Chainlink responded but devGithub is empty. Check gist content/visibility.");
        setWaitingChainlink(false);
        setVerificationFailed(true);
      }
    }
  }, [isRegisteredOnChain, waitingChainlink, verificationPending, userGithubOnChain]);

  // Poll bounty status after claim tx (Chainlink takes 1-2 min)
  // Flow: Pending(1) → Verified(2) → executeClaim tx → Claimed(3)
  const [executingClaim, setExecutingClaim] = useState(false);
  useEffect(() => {
    if (!waitingClaimVerification || !publicClient || !claimBountyIdRef.current) return;
    const bountyId = BigInt(claimBountyIdRef.current);
    console.log("[GhostBounty] Claim polling started for bountyId:", claimBountyIdRef.current);

    const poll = async () => {
      try {
        const result = await publicClient.readContract({
          address: GHOST_BOUNTY_ADDRESS,
          abi: GHOST_BOUNTY_ABI,
          functionName: "getBounty",
          args: [bountyId],
        });
        const [, , , , status] = result as [string, string, string, bigint, number, string, bigint];
        console.log("[GhostBounty] Claim poll — bounty status:", status, "(0=Active, 1=Pending, 2=Verified, 3=Claimed, 4=Cancelled)");

        if (status === 2 && !executingClaim) {
          // Verified — Chainlink confirmed, now execute FHE payment
          console.log("[GhostBounty] ✓ PR Verified! Executing FHE payment...");
          setExecutingClaim(true);
          try {
            const txHash = await writeContractAsync({
              chainId,
              address: GHOST_BOUNTY_ADDRESS,
              abi: GHOST_BOUNTY_ABI,
              functionName: "executeClaim",
              args: [bountyId],
            });
            console.log("[GhostBounty] executeClaim tx sent:", txHash);
            // Keep polling — will detect status 3 (Claimed) next
          } catch (e: any) {
            console.error("[GhostBounty] executeClaim failed:", e);
            setWaitingClaimVerification(false);
            setExecutingClaim(false);
            setClaimResult({ success: false, message: "PR verified but payment failed: " + (e?.shortMessage || e?.message || "Unknown error") });
          }
        } else if (status === 3) {
          // Claimed — success!
          console.log("[GhostBounty] ✓ Claim SUCCESS — bounty paid!");
          setWaitingClaimVerification(false);
          setExecutingClaim(false);
          setClaimResult({ success: true, message: "Bounty claimed successfully! cUSDC has been transferred to your wallet." });
        } else if (status === 0) {
          // Back to Active — Chainlink verification failed
          console.warn("[GhostBounty] ✗ Claim FAILED — bounty reverted to Active. PR may not be merged or doesn't reference the issue.");
          setWaitingClaimVerification(false);
          setExecutingClaim(false);
          setClaimResult({ success: false, message: "Verification failed. Make sure your PR is merged and references the issue (e.g., \"Fixes #42\" in the PR body)." });
        }
        // status === 1 (Pending) → still waiting for Chainlink, keep polling
      } catch (e) {
        console.error("[GhostBounty] Claim poll error:", e);
      }
    };

    poll(); // check immediately
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, [waitingClaimVerification, publicClient, executingClaim, writeContractAsync, chainId]);

  // Wait for create tx
  const { isSuccess: createConfirmed } = useWaitForTransactionReceipt({ hash: createTxHash });

  useEffect(() => {
    if (createConfirmed && createStep === "create") setCreateStep("done");
  }, [createConfirmed, createStep]);

  // Load bounties
  const loadBounties = useCallback(async () => {
    if (!publicClient || !bountyCount) return;
    setLoadingBounties(true);
    try {
      const count = Number(bountyCount);
      const loaded: BountyInfo[] = [];
      for (let i = 0; i < Math.min(count, 50); i++) {
        try {
          const result = await publicClient.readContract({
            address: GHOST_BOUNTY_ADDRESS,
            abi: GHOST_BOUNTY_ABI,
            functionName: "getBounty",
            args: [BigInt(i)],
          });
          const [creator, rOwner, rName, iNum, status, claimedBy, createdAt] = result as [string, string, string, bigint, number, string, bigint];
          loaded.push({ id: i, creator, repoOwner: rOwner, repoName: rName, issueNumber: Number(iNum), status, claimedBy, createdAt: Number(createdAt) });
        } catch { /* skip */ }
      }
      setBounties(loaded.reverse());
    } finally {
      setLoadingBounties(false);
    }
  }, [publicClient, bountyCount]);

  useEffect(() => { loadBounties(); }, [loadBounties]);

  // --- Handlers ---

  const handleRegisterOnChain = async () => {
    if (!githubUser || !gistId.trim()) return;
    // Strip common prefixes: "gist:" or full URL like "https://gist.github.com/user/abc123"
    let cleanGistId = gistId.trim();
    if (cleanGistId.startsWith("gist:")) cleanGistId = cleanGistId.slice(5);
    const urlMatch = cleanGistId.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
    if (urlMatch) cleanGistId = urlMatch[1];
    console.log("[GhostBounty] Starting registration for @" + githubUser, "gistId:", cleanGistId);
    setRegisterPending(true);
    try {
      console.log("[GhostBounty] Sending registerDev tx...");
      const txHash = await writeContractAsync({
        chainId,
        gas: 5_000_000n,
        address: GHOST_BOUNTY_ADDRESS,
        abi: GHOST_BOUNTY_ABI,
        functionName: "registerDev",
        args: [githubUser, cleanGistId],
      });
      console.log("[GhostBounty] registerDev tx sent:", txHash);
      console.log("[GhostBounty] Waiting for Chainlink verification...");
      setWaitingChainlink(true);
      setRegisterPending(false);
    } catch (e: any) {
      console.error("[GhostBounty] Register failed:", e);
      alert(e?.shortMessage || e?.message || "Registration failed");
      setRegisterPending(false);
    }
  };

  const handleCreateBounty = async () => {
    if (!address || !instance || !repoOwner || !repoName || !issueNumber || !bountyAmount) return;
    const amountRaw = parseUnits(bountyAmount, 6);
    const amount64 = Number(amountRaw);
    try {
      setCreateStep("approve");
      await writeContractAsync({ chainId, address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [CONFIDENTIAL_USDC_ADDRESS, amountRaw] });

      setCreateStep("shield");
      await writeContractAsync({ chainId, address: CONFIDENTIAL_USDC_ADDRESS, abi: CONFIDENTIAL_USDC_ABI, functionName: "shield", args: [amountRaw] });

      setCreateStep("operator");
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      await writeContractAsync({ chainId, address: CONFIDENTIAL_USDC_ADDRESS, abi: CONFIDENTIAL_USDC_ABI, functionName: "setOperator", args: [GHOST_BOUNTY_ADDRESS, expiry] });

      setCreateStep("create");
      const input = instance.createEncryptedInput(GHOST_BOUNTY_ADDRESS, address);
      input.add64(amount64);
      const encrypted = await input.encrypt();
      const encHandle = toHexString(encrypted.handles[0]);
      const inputProof = toHexString(encrypted.inputProof);
      const hash = await writeContractAsync({ chainId, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "createBounty", args: [repoOwner.trim(), repoName.trim(), BigInt(issueNumber), encHandle, inputProof] });
      setCreateTxHash(hash);
    } catch (e: any) {
      console.error("Create bounty failed:", e);
      alert(e?.shortMessage || e?.message || "Failed");
      setCreateStep("idle");
    }
  };

  const handleClaim = async () => {
    if (!claimBountyId || !claimPrNumber) return;
    setClaimPending(true);
    setClaimResult(null);
    try {
      console.log("[GhostBounty] Sending claimBounty tx — bountyId:", claimBountyId, "prNumber:", claimPrNumber);
      await writeContractAsync({ chainId, gas: 5_000_000n, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "claimBounty", args: [BigInt(claimBountyId), BigInt(claimPrNumber)] });
      console.log("[GhostBounty] claimBounty tx sent, waiting for Chainlink...");
      claimBountyIdRef.current = claimBountyId;
      setWaitingClaimVerification(true);
      setClaimPending(false);
    } catch (e: any) {
      console.error("[GhostBounty] Claim tx failed:", e);
      setClaimResult({ success: false, message: e?.shortMessage || e?.message || "Transaction failed" });
      setClaimPending(false);
    }
  };

  const handleExecuteClaim = async (bountyId: number) => {
    try {
      console.log("[GhostBounty] Manually executing claim for bounty", bountyId);
      await writeContractAsync({ chainId, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "executeClaim", args: [BigInt(bountyId)] });
      console.log("[GhostBounty] executeClaim tx sent!");
      loadBounties(); // refresh after tx
    } catch (e: any) {
      console.error("[GhostBounty] executeClaim failed:", e);
      alert(e?.shortMessage || e?.message || "Execute claim failed");
    }
  };

  const handleCancel = async (bountyId: number) => {
    try {
      await writeContractAsync({ chainId, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "cancelBounty", args: [BigInt(bountyId)] });
    } catch (e: any) {
      alert(e?.shortMessage || e?.message || "Cancel failed");
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "browse", label: "Bounties" },
    { id: "create", label: "Create" },
    { id: "claim", label: "Claim" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Ghost<span className="text-cyan-400">Bounty</span>
        </h1>
        <p className="text-sm text-blue-300/50">Decentralized GitHub bounties with confidential payments</p>
      </div>

      {/* GitHub Connection + Registration Card */}
      <div className="panel-military rounded-2xl p-4 border border-amber-900/20">
        {sessionStatus === "loading" ? (
          <div className="flex items-center justify-center gap-2 text-blue-300/40 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            Loading GitHub session...
          </div>
        ) : !session ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-semibold">Connect your GitHub</p>
              <p className="text-blue-300/40 text-xs mt-0.5">Required to claim bounties and verify PR authorship</p>
            </div>
            <button onClick={() => signIn("github")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] text-white text-sm font-semibold transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
              Sign in with GitHub
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {githubAvatar && <img src={githubAvatar} alt="" className="w-10 h-10 rounded-full border-2 border-cyan-500/30" />}
                <div>
                  <p className="text-white text-sm font-semibold">{githubName}</p>
                  <p className="text-cyan-400 text-xs font-mono">@{githubUser}</p>
                </div>
              </div>
              <button onClick={() => signOut()} className="text-xs text-blue-300/30 hover:text-red-400 transition-colors">Disconnect</button>
            </div>

            {isConnected && (
              <div className="border-t border-white/[0.05] pt-3">
                {isRegisteredOnChain ? (
                  <div className="space-y-2">
                    {verificationSuccess && (
                      <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-green-400 text-xs font-semibold">Verification successful! Your GitHub identity is now linked on-chain.</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-green-400">Verified on-chain as @{userGithubOnChain}</span>
                    </div>
                  </div>
                ) : verificationPending || waitingChainlink ? (
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                      <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                        <div>
                          <p className="text-amber-400 text-xs font-semibold">Chainlink is verifying your GitHub identity...</p>
                          <p className="text-amber-400/50 text-[10px] mt-0.5">This usually takes 1-2 minutes. The page will update automatically.</p>
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-amber-500/10 rounded-full h-1 overflow-hidden">
                      <div className="bg-amber-400/40 h-1 rounded-full animate-pulse" style={{ width: "60%" }} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {verificationFailed && (
                      <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                        <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <div>
                          <p className="text-red-400 text-xs font-semibold">Verification failed</p>
                          <p className="text-red-400/60 text-[10px] mt-0.5">Chainlink could not verify your gist. Make sure the gist is <strong>public</strong> (not secret), contains your wallet address, and belongs to your GitHub account. Then try again.</p>
                        </div>
                      </div>
                    )}
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <h3 className="text-xs font-semibold text-blue-300/50 mb-2">Verify your GitHub identity</h3>
                      <ol className="text-xs text-blue-300/30 space-y-1 list-decimal list-inside">
                        <li>Go to <a href="https://gist.github.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">gist.github.com</a> and create a <strong className="text-white">public</strong> gist</li>
                        <li>In the gist content, paste your wallet address: <code className="text-cyan-400/80">{address}</code></li>
                        <li>Copy the gist ID from the URL (the hex string after your username)</li>
                        <li>Paste it below and click Verify</li>
                      </ol>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={gistId}
                        onChange={(e) => setGistId(e.target.value)}
                        placeholder="Gist ID (e.g., abc123def456...)"
                        className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm"
                      />
                      <button
                        onClick={handleRegisterOnChain}
                        disabled={registerPending || !githubUser || !gistId.trim()}
                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20 disabled:opacity-40 transition-all"
                      >
                        {registerPending ? "Sending..." : "Verify"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.04]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${tab === t.id ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20" : "text-blue-300/40 hover:text-white hover:bg-white/5 border border-transparent"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!isConnected ? (
        <div className="panel-military rounded-2xl p-8 text-center border border-amber-900/20">
          <p className="text-blue-300/50">Connect your wallet to use GhostBounty</p>
        </div>
      ) : (
        <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-5">

          {/* BROWSE */}
          {tab === "browse" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Bounties</h2>
                <button onClick={loadBounties} className="text-xs text-cyan-400 hover:text-cyan-300">Refresh</button>
              </div>
              {loadingBounties ? (
                <p className="text-blue-300/40 text-sm text-center py-8">Loading bounties...</p>
              ) : bounties.length === 0 ? (
                <p className="text-blue-300/40 text-sm text-center py-8">No bounties yet. Create the first one!</p>
              ) : (
                <div className="space-y-3">
                  {bounties.map((b) => (
                    <div key={b.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono text-sm">#{b.id}</span>
                          <a href={`https://github.com/${b.repoOwner}/${b.repoName}/issues/${b.issueNumber}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
                            {b.repoOwner}/{b.repoName}#{b.issueNumber}
                          </a>
                        </div>
                        <span className={`text-xs font-semibold ${STATUS_COLORS[b.status]}`}>{STATUS_LABELS[b.status]}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-blue-300/40">
                        <span>by {b.creator.slice(0, 6)}...{b.creator.slice(-4)}</span>
                        <span className="font-mono text-cyan-500/60">Amount: ENCRYPTED</span>
                      </div>
                      <div className="flex gap-2">
                        {b.status === 0 && (
                          <button onClick={() => { setTab("claim"); setClaimBountyId(String(b.id)); }} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20">
                            Claim this bounty
                          </button>
                        )}
                        {b.status === 0 && b.creator.toLowerCase() === address?.toLowerCase() && (
                          <button onClick={() => handleCancel(b.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                            Cancel
                          </button>
                        )}
                        {b.status === 2 && (
                          <button onClick={() => handleExecuteClaim(b.id)} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border border-purple-500/20">
                            Execute Payment
                          </button>
                        )}
                        {b.status === 3 && (
                          <span className="text-xs text-blue-300/30">Paid to {b.claimedBy.slice(0, 6)}...{b.claimedBy.slice(-4)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CREATE */}
          {tab === "create" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Create a Bounty</h2>
              <p className="text-xs text-blue-300/40">Post a bounty on a GitHub issue. The reward amount is encrypted — nobody can see how much you're offering.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-blue-300/50 mb-1">Repo Owner</label>
                  <input type="text" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} placeholder="ethereum" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-300/50 mb-1">Repo Name</label>
                  <input type="text" value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="go-ethereum" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-blue-300/50 mb-1">Issue #</label>
                  <input type="number" value={issueNumber} onChange={(e) => setIssueNumber(e.target.value)} placeholder="42" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-300/50 mb-1">Reward (USDC)</label>
                  <input type="number" step="0.01" value={bountyAmount} onChange={(e) => setBountyAmount(e.target.value)} placeholder="100.00" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm" />
                </div>
              </div>
              {createStep !== "idle" && createStep !== "done" && (
                <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                  <div className="flex items-center gap-2 text-xs text-cyan-300">
                    <div className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                    {createStep === "approve" && "Approving USDC..."}
                    {createStep === "shield" && "Shielding USDC → cUSDC..."}
                    {createStep === "operator" && "Setting operator permission..."}
                    {createStep === "create" && "Creating bounty with encrypted amount..."}
                  </div>
                </div>
              )}
              {createStep === "done" && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                  <p className="text-green-400 text-sm font-semibold">Bounty created successfully!</p>
                  <p className="text-xs text-blue-300/30 mt-1">The reward amount is fully encrypted on-chain</p>
                </div>
              )}
              <button onClick={handleCreateBounty} disabled={(createStep !== "idle" && createStep !== "done") || fheLoading || !repoOwner || !repoName || !issueNumber || !bountyAmount} className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 transition-all">
                {createStep === "done" ? "Create Another" : "Create Bounty"}
              </button>
            </div>
          )}

          {/* CLAIM */}
          {tab === "claim" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Claim a Bounty</h2>
              <p className="text-xs text-blue-300/40">Enter the bounty ID and your merged PR number. Chainlink Functions verifies your PR via the GitHub API. Payment is automatic.</p>

              {!session && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400 text-xs">Connect your GitHub account first to claim bounties.</p>
                </div>
              )}
              {session && !isRegisteredOnChain && !waitingChainlink && !verificationPending && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400 text-xs">Verify your GitHub identity on-chain first (see above).</p>
                </div>
              )}
              {session && (waitingChainlink || verificationPending) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                  <p className="text-amber-400 text-xs">Verification in progress... You'll be able to claim once verified.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-blue-300/50 mb-1">Bounty ID</label>
                  <input type="number" value={claimBountyId} onChange={(e) => setClaimBountyId(e.target.value)} placeholder="0" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-300/50 mb-1">PR Number</label>
                  <input type="number" value={claimPrNumber} onChange={(e) => setClaimPrNumber(e.target.value)} placeholder="123" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm" />
                </div>
              </div>

              <button onClick={handleClaim} disabled={claimPending || waitingClaimVerification || !claimBountyId || !claimPrNumber || !isRegisteredOnChain} className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 transition-all">
                {claimPending ? "Sending..." : waitingClaimVerification ? "Chainlink verifying PR..." : "Claim Bounty"}
              </button>

              {waitingClaimVerification && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                    <div>
                      <p className="text-amber-400 text-xs font-semibold">
                        {executingClaim ? "PR verified! Executing encrypted payment..." : "Chainlink is verifying your PR..."}
                      </p>
                      <p className="text-amber-400/50 text-[10px] mt-0.5">
                        {executingClaim ? "Sending FHE-encrypted payment to your wallet." : "Checking if PR is merged and references the issue. This takes 1-2 minutes."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 w-full bg-amber-500/10 rounded-full h-1 overflow-hidden">
                    <div className="bg-amber-400/40 h-1 rounded-full animate-pulse" style={{ width: executingClaim ? "85%" : "60%" }} />
                  </div>
                </div>
              )}

              {claimResult && (
                <div className={`p-2.5 rounded-xl flex items-start gap-2 ${claimResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                  <svg className={`w-4 h-4 shrink-0 mt-0.5 ${claimResult.success ? "text-green-400" : "text-red-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {claimResult.success ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    )}
                  </svg>
                  <div>
                    <p className={`text-xs font-semibold ${claimResult.success ? "text-green-400" : "text-red-400"}`}>
                      {claimResult.success ? "Claim successful!" : "Claim failed"}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${claimResult.success ? "text-green-400/60" : "text-red-400/60"}`}>
                      {claimResult.message}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="text-xs font-semibold text-blue-300/50 mb-2">How it works</h3>
                <ol className="text-xs text-blue-300/30 space-y-1 list-decimal list-inside">
                  <li>Sign in with GitHub and verify your identity via gist</li>
                  <li>Your PR must reference the bounty's issue (e.g., "Fixes #42")</li>
                  <li>Chainlink Functions calls the GitHub API to verify the PR is merged</li>
                  <li>If verified, cUSDC is automatically transferred to your wallet</li>
                  <li>Nobody sees the payment amount — FHE-encrypted end-to-end</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
