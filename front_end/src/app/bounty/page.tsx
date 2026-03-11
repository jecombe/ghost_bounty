"use client";

import { useState, useEffect, useCallback } from "react";
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
  status: number; // 0=Active, 1=Pending, 2=Claimed, 3=Cancelled
  claimedBy: string;
  createdAt: number;
}

const STATUS_LABELS = ["Active", "Verifying...", "Claimed", "Cancelled"];
const STATUS_COLORS = ["text-green-400", "text-amber-400", "text-cyan-400", "text-red-400"];

export default function BountyPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { instance, status: fheStatus } = useFhevm();
  const fheLoading = fheStatus !== "ready";
  const { writeContractAsync } = useWriteContract();

  // GitHub OAuth session
  const { data: session, status: sessionStatus } = useSession();
  const githubUser = (session as any)?.githubUsername as string | undefined;
  const githubAvatar = session?.user?.image;
  const githubName = session?.user?.name;

  const [tab, setTab] = useState<Tab>("browse");

  // --- Register ---
  const [gistId, setGistId] = useState("");
  const [registerPending, setRegisterPending] = useState(false);

  // --- Create Bounty ---
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [issueNumber, setIssueNumber] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");
  const [createStep, setCreateStep] = useState<"idle" | "approve" | "shield" | "operator" | "create" | "done">("idle");
  const [createTxHash, setCreateTxHash] = useState<`0x${string}` | undefined>();

  // --- Claim ---
  const [claimBountyId, setClaimBountyId] = useState("");
  const [claimPrNumber, setClaimPrNumber] = useState("");
  const [claimPending, setClaimPending] = useState(false);

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
  });

  const { data: verificationPending } = useReadContract({
    address: GHOST_BOUNTY_ADDRESS,
    abi: GHOST_BOUNTY_ABI,
    functionName: "devVerificationPending",
    args: address ? [address] : undefined,
  });

  const isRegisteredOnChain = typeof userGithubOnChain === "string" && userGithubOnChain.length > 0;

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
    setRegisterPending(true);
    try {
      await writeContractAsync({
        address: GHOST_BOUNTY_ADDRESS,
        abi: GHOST_BOUNTY_ABI,
        functionName: "registerDev",
        args: [githubUser, gistId.trim()],
      });
      alert("Verification request sent! Chainlink is verifying your gist. This may take 1-2 minutes.");
      refetchGithub();
    } catch (e: any) {
      console.error("Register failed:", e);
      alert(e?.shortMessage || e?.message || "Registration failed");
    } finally {
      setRegisterPending(false);
    }
  };

  const handleCreateBounty = async () => {
    if (!address || !instance || !repoOwner || !repoName || !issueNumber || !bountyAmount) return;
    const amountRaw = parseUnits(bountyAmount, 6);
    const amount64 = Number(amountRaw);
    try {
      setCreateStep("approve");
      await writeContractAsync({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [CONFIDENTIAL_USDC_ADDRESS, amountRaw] });

      setCreateStep("shield");
      await writeContractAsync({ address: CONFIDENTIAL_USDC_ADDRESS, abi: CONFIDENTIAL_USDC_ABI, functionName: "shield", args: [amountRaw] });

      setCreateStep("operator");
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      await writeContractAsync({ address: CONFIDENTIAL_USDC_ADDRESS, abi: CONFIDENTIAL_USDC_ABI, functionName: "setOperator", args: [GHOST_BOUNTY_ADDRESS, expiry] });

      setCreateStep("create");
      const input = instance.createEncryptedInput(GHOST_BOUNTY_ADDRESS, address);
      input.add64(amount64);
      const encrypted = await input.encrypt();
      const encHandle = toHexString(encrypted.handles[0]);
      const inputProof = toHexString(encrypted.inputProof);
      const hash = await writeContractAsync({ address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "createBounty", args: [repoOwner.trim(), repoName.trim(), BigInt(issueNumber), encHandle, inputProof] });
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
    try {
      await writeContractAsync({ address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "claimBounty", args: [BigInt(claimBountyId), BigInt(claimPrNumber)] });
      alert("Claim request sent! Chainlink Functions will verify your PR. Payment is automatic if verified.");
    } catch (e: any) {
      console.error("Claim failed:", e);
      alert(e?.shortMessage || e?.message || "Claim failed");
    } finally {
      setClaimPending(false);
    }
  };

  const handleCancel = async (bountyId: number) => {
    try {
      await writeContractAsync({ address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "cancelBounty", args: [BigInt(bountyId)] });
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
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-green-400">Verified on-chain as @{userGithubOnChain}</span>
                  </div>
                ) : verificationPending ? (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                    <span className="text-amber-400">Chainlink is verifying your GitHub identity...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
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
                        {(b.status === 0 || b.status === 1) && b.creator.toLowerCase() === address?.toLowerCase() && (
                          <button onClick={() => handleCancel(b.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                            Cancel
                          </button>
                        )}
                        {b.status === 2 && (
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
              {session && !isRegisteredOnChain && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-400 text-xs">Verify your GitHub identity on-chain first (see above).</p>
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

              <button onClick={handleClaim} disabled={claimPending || !claimBountyId || !claimPrNumber || !isRegisteredOnChain} className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 transition-all">
                {claimPending ? "Sending verification request..." : "Claim Bounty"}
              </button>

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
