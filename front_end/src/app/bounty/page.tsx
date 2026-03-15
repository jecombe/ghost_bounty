"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
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
import { TransactionModal, type TxStep } from "@/components/TransactionModal";
import { useSfx } from "@/hooks/useSfx";

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
  pendingSince: number;
}

interface GitHubRepo {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  openIssues: number;
  stars: number;
  private: boolean;
  avatarUrl: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string; color: string }[];
  createdAt: string;
  user: { login: string; avatarUrl: string };
  comments: number;
}

interface IssueInfo {
  title: string;
  labels: { name: string; color: string }[];
  user?: { login: string; avatarUrl: string };
}

interface LinkedPR {
  number: number;
  title: string;
  url: string;
  state: string;
  merged: boolean;
  mergedAt: string | null;
  author: string;
  authorAvatar: string;
  createdAt: string;
  draft: boolean;
}

function RepoRow({ repo, onSelect }: { repo: GitHubRepo; onSelect: (r: GitHubRepo) => void }) {
  return (
    <button
      onClick={() => onSelect(repo)}
      className="w-full px-3 py-2.5 text-left hover:bg-white/[0.04] flex items-center gap-3 transition-colors"
    >
      <img src={repo.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-mono truncate">{repo.fullName}</span>
          {repo.private && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400/70 shrink-0">PRIV</span>}
        </div>
        {repo.description && <p className="text-blue-300/30 text-[11px] truncate">{repo.description}</p>}
      </div>
      <div className="text-right shrink-0 flex items-center gap-2">
        {repo.stars > 0 && <span className="text-[10px] text-amber-400/40">{repo.stars > 999 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}</span>}
        <span className="text-[10px] text-blue-300/20">{repo.openIssues} issues</span>
      </div>
    </button>
  );
}

const STATUS_LABELS = ["Active", "Verifying...", "Verified", "Claimed", "Cancelled"];
const STATUS_COLORS = ["text-green-400", "text-amber-400", "text-purple-400", "text-cyan-400", "text-red-400"];
const STATUS_BG = ["bg-green-500/10 border-green-500/20", "bg-amber-500/10 border-amber-500/20", "bg-purple-500/10 border-purple-500/20", "bg-cyan-500/10 border-cyan-500/20", "bg-red-500/10 border-red-500/20"];

export default function BountyPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { instance, status: fheStatus } = useFhevm();
  const fheLoading = fheStatus !== "ready";
  const { writeContractAsync } = useWriteContract();

  const { play: playSfx } = useSfx();

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
  const sawPendingTrueRef = useRef(false);

  // --- Create Bounty ---
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [issueNumber, setIssueNumber] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");

  // GitHub Repo/Issue pickers
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [showIssuePicker, setShowIssuePicker] = useState(false);
  const [useManualMode, setUseManualMode] = useState(false);
  const [searchResults, setSearchResults] = useState<GitHubRepo[]>([]);
  const [searchingRepos, setSearchingRepos] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

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
    // If pre-filled from URL, switch to manual mode
    if (qOwner || qRepo || qIssue) setUseManualMode(true);
  }, [searchParams]);

  const [createStep, setCreateStep] = useState<"idle" | "running" | "done">("idle");
  // Transaction modal state
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txModalTitle, setTxModalTitle] = useState("");
  const [txModalIcon, setTxModalIcon] = useState("");
  const [txSteps, setTxSteps] = useState<TxStep[]>([]);

  // --- Claim ---
  const [claimBountyId, setClaimBountyId] = useState("");
  const [claimPrNumber, setClaimPrNumber] = useState("");
  const [claimPending, setClaimPending] = useState(false);
  const [waitingClaimVerification, setWaitingClaimVerification] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(null);
  const claimBountyIdRef = useRef<string>("");

  // --- Auto-detect claimable bounties ---
  interface ClaimableBounty {
    bountyId: number;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    mergedAt: string;
    repoOwner: string;
    repoName: string;
    issueNumber: number;
  }
  const [claimableBounties, setClaimableBounties] = useState<ClaimableBounty[]>([]);
  const [loadingClaimable, setLoadingClaimable] = useState(false);
  const [showManualClaim, setShowManualClaim] = useState(false);

  // --- Browse ---
  const [bounties, setBounties] = useState<BountyInfo[]>([]);
  const [loadingBounties, setLoadingBounties] = useState(false);
  const [issueInfoCache, setIssueInfoCache] = useState<Record<string, IssueInfo>>({});
  const [githubNames, setGithubNames] = useState<Record<string, string>>({});
  const [linkedPRs, setLinkedPRs] = useState<Record<string, LinkedPR[]>>({});

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

  // --- Fetch issues when repo selected ---
  useEffect(() => {
    if (!selectedRepo) return;
    setLoadingIssues(true);
    setIssues([]);
    setSelectedIssue(null);
    fetch(`/api/github/issues?owner=${selectedRepo.owner}&repo=${selectedRepo.name}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setIssues(data))
      .catch(() => {})
      .finally(() => setLoadingIssues(false));
  }, [selectedRepo]);

  // --- Fetch issue info for Browse tab (enrichment) ---
  const fetchIssueInfo = useCallback(async (owner: string, repo: string, issue: number) => {
    const key = `${owner}/${repo}#${issue}`;
    if (issueInfoCache[key]) return;
    try {
      const res = await fetch(`/api/github/issue-info?owner=${owner}&repo=${repo}&issue=${issue}`);
      if (res.ok) {
        const data = await res.json();
        setIssueInfoCache((prev) => ({ ...prev, [key]: data }));
      }
    } catch {}
  }, [issueInfoCache]);

  useEffect(() => {
    bounties.forEach((b) => {
      if (b.repoOwner && b.repoName && b.issueNumber) {
        fetchIssueInfo(b.repoOwner, b.repoName, b.issueNumber);
      }
    });
  }, [bounties, fetchIssueInfo]);

  // Fetch linked PRs for each bounty
  useEffect(() => {
    if (bounties.length === 0) return;
    bounties.forEach((b) => {
      const key = `${b.repoOwner}/${b.repoName}#${b.issueNumber}`;
      if (linkedPRs[key]) return; // already fetched
      fetch(`/api/github/linked-prs?owner=${b.repoOwner}&repo=${b.repoName}&issue=${b.issueNumber}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((prs: LinkedPR[]) => {
          if (prs.length > 0) {
            setLinkedPRs((prev) => ({ ...prev, [key]: prs }));
          }
        })
        .catch(() => {});
    });
  }, [bounties, linkedPRs]);

  // Auto-detect claimable bounties when on claim tab
  useEffect(() => {
    if (tab !== "claim" || !session || !isRegisteredOnChain) return;
    const activeBounties = bounties.filter((b) => b.status === 0);
    if (activeBounties.length === 0) return;

    setLoadingClaimable(true);
    fetch("/api/github/claimable-prs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bounties: activeBounties.map((b) => ({
          id: b.id,
          repoOwner: b.repoOwner,
          repoName: b.repoName,
          issueNumber: b.issueNumber,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClaimableBounties(data))
      .catch(() => setClaimableBounties([]))
      .finally(() => setLoadingClaimable(false));
  }, [tab, session, isRegisteredOnChain, bounties]);

  // Poll for verification status while pending (Chainlink takes 1-2 min)
  useEffect(() => {
    if (!verificationPending && !waitingChainlink) return;
    const interval = setInterval(async () => {
      await Promise.all([refetchGithub(), refetchPending()]);
    }, 8_000);
    return () => clearInterval(interval);
  }, [verificationPending, waitingChainlink, refetchGithub, refetchPending]);

  useEffect(() => {
    if (waitingChainlink && verificationPending === true) {
      sawPendingTrueRef.current = true;
    }
  }, [waitingChainlink, verificationPending]);

  useEffect(() => {
    if (waitingChainlink) {
      sawPendingTrueRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingChainlink === true]);

  useEffect(() => {
    if (waitingChainlink) {
      if (isRegisteredOnChain) {
        setWaitingChainlink(false);
        setVerificationSuccess(true);
        setVerificationFailed(false);
        setTimeout(() => setVerificationSuccess(false), 10_000);
      } else if (sawPendingTrueRef.current && verificationPending === false && !isRegisteredOnChain) {
        setWaitingChainlink(false);
        setVerificationFailed(true);
      }
    }
  }, [isRegisteredOnChain, waitingChainlink, verificationPending, userGithubOnChain]);

  // Poll bounty status after claim tx
  const [executingClaim, setExecutingClaim] = useState(false);
  useEffect(() => {
    if (!waitingClaimVerification || !publicClient || !claimBountyIdRef.current) return;
    const bountyId = BigInt(claimBountyIdRef.current);

    const poll = async () => {
      try {
        const result = await publicClient.readContract({
          address: GHOST_BOUNTY_ADDRESS,
          abi: GHOST_BOUNTY_ABI,
          functionName: "getBounty",
          args: [bountyId],
        });
        const [, , , , status] = result as unknown as [string, string, string, bigint, number, string, bigint];

        if (status === 2 && !executingClaim) {
          setExecutingClaim(true);
          try {
            await writeContractAsync({
              chainId,
              address: GHOST_BOUNTY_ADDRESS,
              abi: GHOST_BOUNTY_ABI,
              functionName: "executeClaim",
              args: [bountyId],
            });
          } catch (e: any) {
            setWaitingClaimVerification(false);
            setExecutingClaim(false);
            setClaimResult({ success: false, message: "PR verified but payment execution failed. Try clicking 'Execute Payment' in the browse tab." });
          }
        } else if (status === 3) {
          setWaitingClaimVerification(false);
          setExecutingClaim(false);
          setClaimResult({ success: true, message: "Bounty claimed successfully! cUSDC has been transferred to your wallet." });
        } else if (status === 0) {
          setWaitingClaimVerification(false);
          setExecutingClaim(false);
          setClaimResult({ success: false, message: "Verification failed. Make sure your PR is merged and references the issue." });
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, [waitingClaimVerification, publicClient, executingClaim, writeContractAsync, chainId]);

  // Helpers
  const updateStep = useCallback((stepId: string, update: Partial<TxStep>) => {
    setTxSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, ...update } : s));
  }, []);

  const sendAndWait = useCallback(async (
    stepId: string,
    txCall: () => Promise<`0x${string}`>,
  ) => {
    if (!publicClient) throw new Error("No public client");
    updateStep(stepId, { status: "signing" });
    const hash = await txCall();
    updateStep(stepId, { status: "confirming", txHash: hash });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    updateStep(stepId, { status: "done" });
  }, [publicClient, updateStep]);

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
          const [creator, rOwner, rName, iNum, status, claimedBy, createdAt, pendingSince] = result as unknown as [string, string, string, bigint, number, string, bigint, bigint];
          loaded.push({ id: i, creator, repoOwner: rOwner, repoName: rName, issueNumber: Number(iNum), status, claimedBy, createdAt: Number(createdAt), pendingSince: Number(pendingSince) });
        } catch {}
      }
      setBounties(loaded.reverse());
    } finally {
      setLoadingBounties(false);
    }
  }, [publicClient, bountyCount]);

  useEffect(() => { loadBounties(); }, [loadBounties]);

  // Resolve GitHub usernames for bounty addresses
  useEffect(() => {
    if (!publicClient || bounties.length === 0) return;
    const zeroAddr = "0x0000000000000000000000000000000000000000";
    const addresses = new Set<string>();
    bounties.forEach((b) => {
      addresses.add(b.creator.toLowerCase());
      if (b.claimedBy && b.claimedBy !== zeroAddr) addresses.add(b.claimedBy.toLowerCase());
    });
    // Only resolve addresses we don't already have
    const toResolve = [...addresses].filter((a) => !githubNames[a]);
    if (toResolve.length === 0) return;
    (async () => {
      const resolved: Record<string, string> = {};
      for (const addr of toResolve) {
        try {
          const name = await publicClient.readContract({
            address: GHOST_BOUNTY_ADDRESS,
            abi: GHOST_BOUNTY_ABI,
            functionName: "devGithub",
            args: [addr as `0x${string}`],
          }) as string;
          if (name) resolved[addr] = name;
        } catch {}
      }
      if (Object.keys(resolved).length > 0) {
        setGithubNames((prev) => ({ ...prev, ...resolved }));
      }
    })();
  }, [publicClient, bounties, githubNames]);

  // --- Handlers ---

  const handleRegisterOnChain = async () => {
    if (!githubUser || !gistId.trim() || !publicClient) return;
    playSfx("verify");
    let cleanGistId = gistId.trim();
    if (cleanGistId.startsWith("gist:")) cleanGistId = cleanGistId.slice(5);
    const urlMatch = cleanGistId.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
    if (urlMatch) cleanGistId = urlMatch[1];

    const steps: TxStep[] = [
      { id: "register", label: "Register Developer", description: `Verify @${githubUser} via Chainlink Functions`, status: "pending" },
    ];
    setTxSteps(steps);
    setTxModalTitle("Verify Identity");
    setTxModalIcon("\u{1F50D}");
    setTxModalOpen(true);
    setRegisterPending(true);

    try {
      await sendAndWait("register", () =>
        writeContractAsync({
          chainId,
          gas: 5_000_000n,
          address: GHOST_BOUNTY_ADDRESS,
          abi: GHOST_BOUNTY_ABI,
          functionName: "registerDev",
          args: [githubUser, cleanGistId],
        })
      );
      setWaitingChainlink(true);
      setRegisterPending(false);
    } catch (e: any) {
      setTxSteps((prev) => prev.map((s) => s.status !== "done" ? { ...s, status: "error" as const, error: e?.shortMessage || e?.message || "Transaction rejected" } : s));
      setRegisterPending(false);
    }
  };

  const handleCreateBounty = async () => {
    if (!address || !instance || !repoOwner || !repoName || !issueNumber || !bountyAmount || !publicClient) return;
    playSfx("createBounty");
    const amountRaw = parseUnits(bountyAmount, 6);
    const amount64 = Number(amountRaw);

    const steps: TxStep[] = [
      { id: "approve", label: "Approve USDC", description: `Allow cUSDC contract to spend ${bountyAmount} USDC`, status: "pending" },
      { id: "shield", label: "Shield USDC", description: "Convert plain USDC into encrypted cUSDC", status: "pending" },
      { id: "operator", label: "Set Operator", description: "Authorize GhostBounty to handle your cUSDC", status: "pending" },
      { id: "encrypt", label: "Encrypt Amount", description: "FHE-encrypt the bounty amount client-side", status: "pending" },
      { id: "create", label: "Create Bounty", description: `Post bounty on ${repoOwner}/${repoName}#${issueNumber}`, status: "pending" },
    ];

    setTxSteps(steps);
    setTxModalTitle("Create Bounty");
    setTxModalIcon("\u{1F3AF}");
    setTxModalOpen(true);
    setCreateStep("running");

    try {
      await sendAndWait("approve", () =>
        writeContractAsync({ chainId, address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [CONFIDENTIAL_USDC_ADDRESS, amountRaw] })
      );

      await sendAndWait("shield", () =>
        writeContractAsync({ chainId, address: CONFIDENTIAL_USDC_ADDRESS, abi: CONFIDENTIAL_USDC_ABI, functionName: "shield", args: [amountRaw] })
      );

      const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
      await sendAndWait("operator", () =>
        writeContractAsync({ chainId, address: CONFIDENTIAL_USDC_ADDRESS, abi: CONFIDENTIAL_USDC_ABI, functionName: "setOperator", args: [GHOST_BOUNTY_ADDRESS, expiry] })
      );

      updateStep("encrypt", { status: "confirming" });
      const input = instance.createEncryptedInput(GHOST_BOUNTY_ADDRESS, address);
      input.add64(amount64);
      const encrypted = await input.encrypt();
      const encHandle = toHexString(encrypted.handles[0]);
      const inputProof = toHexString(encrypted.inputProof);
      updateStep("encrypt", { status: "done" });

      await sendAndWait("create", () =>
        writeContractAsync({ chainId, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "createBounty", args: [repoOwner.trim(), repoName.trim(), BigInt(issueNumber), encHandle, inputProof] })
      );

      setCreateStep("done");
      loadBounties();
    } catch (e: any) {
      setTxSteps((prev) => {
        const updated = [...prev];
        const failedIdx = updated.findIndex((s) => s.status !== "done");
        if (failedIdx !== -1) {
          const msg = e?.shortMessage || e?.message || "Transaction rejected";
          updated[failedIdx] = { ...updated[failedIdx], status: "error", error: msg };
        }
        return updated;
      });
      setCreateStep("idle");
    }
  };

  const handleClaim = async () => {
    await handleClaimWithValues(claimBountyId, claimPrNumber);
  };

  const handleExecuteClaim = async (bountyId: number) => {
    if (!publicClient) return;
    playSfx("execute");
    const steps: TxStep[] = [
      { id: "execute", label: "Execute Payment", description: `Transfer encrypted cUSDC for bounty #${bountyId}`, status: "pending" },
    ];
    setTxSteps(steps);
    setTxModalTitle("Execute Payment");
    setTxModalIcon("\u{1F4B8}");
    setTxModalOpen(true);

    try {
      await sendAndWait("execute", () =>
        writeContractAsync({ chainId, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "executeClaim", args: [BigInt(bountyId)] })
      );
      loadBounties();
    } catch (e: any) {
      setTxSteps((prev) => prev.map((s) => s.status !== "done" ? { ...s, status: "error" as const, error: e?.shortMessage || e?.message || "Transaction rejected" } : s));
    }
  };

  const handleCancel = async (bountyId: number) => {
    playSfx("cancel");
    if (!publicClient) return;
    const steps: TxStep[] = [
      { id: "cancel", label: "Cancel Bounty", description: `Cancel bounty #${bountyId} and return funds`, status: "pending" },
    ];
    setTxSteps(steps);
    setTxModalTitle("Cancel Bounty");
    setTxModalIcon("\u{274C}");
    setTxModalOpen(true);

    try {
      await sendAndWait("cancel", () =>
        writeContractAsync({ chainId, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "cancelBounty", args: [BigInt(bountyId)] })
      );
      loadBounties();
    } catch (e: any) {
      setTxSteps((prev) => prev.map((s) => s.status !== "done" ? { ...s, status: "error" as const, error: e?.shortMessage || e?.message || "Transaction rejected" } : s));
    }
  };

  // Handle selecting a repo from picker
  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setRepoOwner(repo.owner);
    setRepoName(repo.name);
    setShowRepoPicker(false);
    setRepoSearch("");
    // Reset issue
    setSelectedIssue(null);
    setIssueNumber("");
  };

  // Handle selecting an issue from picker
  const handleSelectIssue = (issue: GitHubIssue) => {
    setSelectedIssue(issue);
    setIssueNumber(String(issue.number));
    setShowIssuePicker(false);
    setIssueSearch("");
  };

  // One-click claim from auto-detected list
  const handleAutoClaimBounty = (cb: ClaimableBounty) => {
    setClaimBountyId(String(cb.bountyId));
    setClaimPrNumber(String(cb.prNumber));
    setClaimResult(null);
    // Trigger claim immediately
    setTimeout(() => {
      handleClaimWithValues(String(cb.bountyId), String(cb.prNumber));
    }, 0);
  };

  const handleClaimWithValues = async (bountyId: string, prNumber: string) => {
    if (!bountyId || !prNumber || !publicClient) return;
    playSfx("claim");
    setClaimPending(true);
    setClaimResult(null);

    const steps: TxStep[] = [
      { id: "claim", label: "Submit Claim", description: `Claim bounty #${bountyId} with PR #${prNumber}`, status: "pending" },
    ];
    setTxSteps(steps);
    setTxModalTitle("Claim Bounty");
    setTxModalIcon("\u{1F4E8}");
    setTxModalOpen(true);

    try {
      await sendAndWait("claim", () =>
        writeContractAsync({ chainId, gas: 5_000_000n, address: GHOST_BOUNTY_ADDRESS, abi: GHOST_BOUNTY_ABI, functionName: "claimBounty", args: [BigInt(bountyId), BigInt(prNumber)] })
      );
      claimBountyIdRef.current = bountyId;
      setWaitingClaimVerification(true);
      setClaimPending(false);
    } catch (e: any) {
      setTxSteps((prev) => prev.map((s) => s.status !== "done" ? { ...s, status: "error" as const, error: e?.shortMessage || e?.message || "Transaction rejected" } : s));
      setClaimResult({ success: false, message: "Transaction failed. Please check bounty ID and PR number." });
      setClaimPending(false);
    }
  };

  // Handle "Claim this bounty" from browse tab
  const handleClaimFromBrowse = (b: BountyInfo) => {
    setTab("claim");
    setClaimBountyId(String(b.id));
    setClaimPrNumber("");
    setClaimResult(null);
  };

  // Debounced search for public repos
  const handleRepoSearchChange = (val: string) => {
    setRepoSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length >= 2) {
      setSearchingRepos(true);
      searchTimeout.current = setTimeout(() => {
        fetch(`/api/github/search?q=${encodeURIComponent(val)}`)
          .then((r) => r.ok ? r.json() : [])
          .then((data) => setSearchResults(data))
          .catch(() => setSearchResults([]))
          .finally(() => setSearchingRepos(false));
      }, 400);
    } else {
      setSearchResults([]);
      setSearchingRepos(false);
    }
  };

  const filteredRepos = searchResults;

  const filteredIssues = issues.filter((i) =>
    i.title.toLowerCase().includes(issueSearch.toLowerCase()) ||
    String(i.number).includes(issueSearch)
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "browse", label: "Bounties", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
    { id: "create", label: "Create", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> },
    { id: "claim", label: "Claim", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
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
              <p className="text-blue-300/40 text-xs mt-0.5">Required to claim bounties and auto-fill repos/issues</p>
            </div>
            <button onClick={() => { playSfx("connect"); signIn("github"); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] text-white text-sm font-semibold transition-all">
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
                          <p className="text-red-400/60 text-[10px] mt-0.5">Chainlink could not verify your gist. Make sure the gist is <strong>public</strong>, contains your wallet address, and belongs to your account.</p>
                        </div>
                      </div>
                    )}
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <h3 className="text-xs font-semibold text-blue-300/50 mb-2">Verify your GitHub identity</h3>
                      <ol className="text-xs text-blue-300/30 space-y-1 list-decimal list-inside">
                        <li>Go to <a href="https://gist.github.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">gist.github.com</a> and create a <strong className="text-white">public</strong> gist</li>
                        <li>In the gist content, paste your wallet address: <code className="text-cyan-400/80">{address}</code></li>
                        <li>Copy the gist ID from the URL</li>
                        <li>Paste it below and click Verify</li>
                      </ol>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={gistId}
                        onChange={(e) => setGistId(e.target.value)}
                        placeholder="Gist ID or full URL"
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
          <button key={t.id} onClick={() => { playSfx("tab"); setTab(t.id); }} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${tab === t.id ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20" : "text-blue-300/40 hover:text-white hover:bg-white/5 border border-transparent"}`}>
            {t.icon}
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
                <button onClick={loadBounties} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Refresh
                </button>
              </div>
              {loadingBounties ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                  <p className="text-blue-300/40 text-sm">Loading bounties...</p>
                </div>
              ) : bounties.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-300/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </div>
                  <p className="text-blue-300/40 text-sm">No bounties yet</p>
                  <button onClick={() => setTab("create")} className="text-xs text-cyan-400 hover:text-cyan-300">Create the first one</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {bounties.map((b) => {
                    const infoKey = `${b.repoOwner}/${b.repoName}#${b.issueNumber}`;
                    const info = issueInfoCache[infoKey];
                    return (
                      <div key={b.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-all space-y-3">
                        {/* Top row: ID + Status badge */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-blue-300/30 font-mono text-xs">#{b.id}</span>
                              <a href={`https://github.com/${b.repoOwner}/${b.repoName}/issues/${b.issueNumber}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 text-xs font-medium font-mono">
                                {b.repoOwner}/{b.repoName}#{b.issueNumber}
                              </a>
                            </div>
                            {/* Issue title from GitHub */}
                            {info?.title && (
                              <p className="text-white text-sm font-medium leading-snug truncate">{info.title}</p>
                            )}
                          </div>
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_BG[b.status]} ${STATUS_COLORS[b.status]}`}>
                            {STATUS_LABELS[b.status]}
                          </span>
                        </div>

                        {/* Labels from GitHub */}
                        {info?.labels && info.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {info.labels.slice(0, 5).map((l) => (
                              <span key={l.name} className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{ borderColor: `#${l.color}40`, color: `#${l.color}`, backgroundColor: `#${l.color}15` }}>
                                {l.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Linked PRs */}
                        {linkedPRs[infoKey] && linkedPRs[infoKey].length > 0 && (
                          <div className="space-y-1.5">
                            {linkedPRs[infoKey].map((pr) => (
                              <a
                                key={pr.number}
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all hover:border-white/[0.15] ${
                                  pr.merged
                                    ? "bg-purple-500/[0.06] border-purple-500/20"
                                    : pr.state === "open"
                                    ? "bg-green-500/[0.06] border-green-500/20"
                                    : "bg-red-500/[0.06] border-red-500/20"
                                }`}
                              >
                                {/* PR icon */}
                                <svg className={`w-3.5 h-3.5 shrink-0 ${pr.merged ? "text-purple-400" : pr.state === "open" ? "text-green-400" : "text-red-400"}`} viewBox="0 0 16 16" fill="currentColor">
                                  {pr.merged ? (
                                    <path d="M5.45 5.154A4.25 4.25 0 004 8.5a4.25 4.25 0 001.886 3.526.75.75 0 11-.772 1.288A5.75 5.75 0 013 8.5c0-1.56.621-3.072 1.745-4.105a.75.75 0 11.96 1.152l-.255-.393zm5.1 0A4.25 4.25 0 0012 8.5a4.25 4.25 0 01-1.886 3.526.75.75 0 10.772 1.288A5.75 5.75 0 0013 8.5c0-1.56-.621-3.072-1.745-4.105a.75.75 0 10-.96 1.152l.255-.393zM8 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0-10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                                  ) : (
                                    <path d="M1.5 3.25a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zm5.677-.177L9.573.677A.25.25 0 0110 .854V2.5h1A2.5 2.5 0 0113.5 5v5.628a2.251 2.251 0 11-1.5 0V5a1 1 0 00-1-1h-1v1.646a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm0 9.5a.75.75 0 100 1.5.75.75 0 000-1.5zm8.25.75a.75.75 0 10-1.5 0 .75.75 0 001.5 0z" />
                                  )}
                                </svg>
                                <span className={`font-mono shrink-0 ${pr.merged ? "text-purple-400/70" : pr.state === "open" ? "text-green-400/70" : "text-red-400/70"}`}>
                                  #{pr.number}
                                </span>
                                <span className="text-white/70 truncate">{pr.title}</span>
                                <span className="ml-auto shrink-0 flex items-center gap-1.5">
                                  {pr.draft && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-blue-300/40 font-medium">DRAFT</span>
                                  )}
                                  {pr.authorAvatar && (
                                    <img src={pr.authorAvatar} alt={pr.author} className="w-4 h-4 rounded-full" />
                                  )}
                                  <span className="text-blue-300/30">{pr.author}</span>
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    pr.merged
                                      ? "bg-purple-500/20 text-purple-300"
                                      : pr.state === "open"
                                      ? "bg-green-500/20 text-green-300"
                                      : "bg-red-500/20 text-red-300"
                                  }`}>
                                    {pr.merged ? "Merged" : pr.state === "open" ? "Open" : "Closed"}
                                  </span>
                                </span>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Info rows */}
                        <div className="space-y-1.5 text-xs text-blue-300/30">
                          {/* Creator */}
                          <div className="flex items-center gap-2">
                            <svg className="w-3 h-3 shrink-0 text-blue-300/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            <span>Creator: </span>
                            {githubNames[b.creator.toLowerCase()] ? (
                              <a href={`https://github.com/${githubNames[b.creator.toLowerCase()]}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                                @{githubNames[b.creator.toLowerCase()]}
                              </a>
                            ) : (
                              <span className="font-mono">{b.creator.slice(0, 6)}...{b.creator.slice(-4)}</span>
                            )}
                          </div>
                          {/* Receiver (if claimed/verified/pending) */}
                          {b.claimedBy && b.claimedBy !== "0x0000000000000000000000000000000000000000" && (
                            <div className="flex items-center gap-2">
                              <svg className="w-3 h-3 shrink-0 text-blue-300/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span>{b.status === 3 ? "Paid to: " : "Claimed by: "}</span>
                              {githubNames[b.claimedBy.toLowerCase()] ? (
                                <a href={`https://github.com/${githubNames[b.claimedBy.toLowerCase()]}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
                                  @{githubNames[b.claimedBy.toLowerCase()]}
                                </a>
                              ) : (
                                <span className="font-mono">{b.claimedBy.slice(0, 6)}...{b.claimedBy.slice(-4)}</span>
                              )}
                            </div>
                          )}
                          {/* Dates row */}
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 shrink-0 text-blue-300/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <span>Created {new Date(b.createdAt * 1000).toLocaleDateString()}</span>
                            </div>
                            {b.pendingSince > 0 && (b.status === 1 || b.status === 2) && (
                              <div className="flex items-center gap-1.5">
                                <svg className="w-3 h-3 shrink-0 text-blue-300/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>Pending since {new Date(b.pendingSince * 1000).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                          {/* Encrypted amount */}
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 shrink-0 text-cyan-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            <span className="font-mono text-cyan-500/40">ENCRYPTED AMOUNT</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          {b.status === 0 && linkedPRs[infoKey]?.some((pr) => pr.merged) && (
                            <button onClick={() => handleClaimFromBrowse(b)} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all">
                              Claim this bounty
                            </button>
                          )}
                          {b.status === 0 && !linkedPRs[infoKey]?.some((pr) => pr.merged) && (
                            <span className="text-xs text-blue-300/20 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {linkedPRs[infoKey]?.length ? "Waiting for PR to be merged" : "No PR linked yet"}
                            </span>
                          )}
                          {b.status === 0 && b.creator.toLowerCase() === address?.toLowerCase() && (
                            <button onClick={() => handleCancel(b.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all">
                              Cancel
                            </button>
                          )}
                          {b.status === 2 && b.claimedBy.toLowerCase() === address?.toLowerCase() && (
                            <button onClick={() => handleExecuteClaim(b.id)} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border border-purple-500/20 transition-all animate-pulse">
                              Execute Payment
                            </button>
                          )}
                          {b.status === 3 && (
                            <span className="text-xs text-green-400/60 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>
                              Completed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* CREATE */}
          {tab === "create" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Create a Bounty</h2>
                {session && !useManualMode && (
                  <button onClick={() => setUseManualMode(true)} className="text-[10px] text-blue-300/30 hover:text-blue-300/50 transition-colors">
                    Enter manually
                  </button>
                )}
                {useManualMode && session && (
                  <button onClick={() => { setUseManualMode(false); setSelectedRepo(null); setSelectedIssue(null); }} className="text-[10px] text-blue-300/30 hover:text-blue-300/50 transition-colors">
                    Use picker
                  </button>
                )}
              </div>
              <p className="text-xs text-blue-300/40">Post a bounty on a GitHub issue. The reward amount is encrypted on-chain.</p>

              {/* GitHub Picker Mode */}
              {session && !useManualMode ? (
                <div className="space-y-3">
                  {/* Repo Picker */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-blue-300/50 mb-1">Repository</label>
                    <button
                      onClick={() => { setShowRepoPicker(!showRepoPicker); setShowIssuePicker(false); }}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-left flex items-center justify-between hover:border-cyan-500/30 transition-all"
                    >
                      {selectedRepo ? (
                        <div className="flex items-center gap-2.5">
                          <img src={selectedRepo.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                          <span className="text-white text-sm font-mono">{selectedRepo.fullName}</span>
                          {selectedRepo.private && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">PRIVATE</span>}
                        </div>
                      ) : (
                        <span className="text-blue-300/20 text-sm">Select a repository...</span>
                      )}
                      <svg className={`w-4 h-4 text-blue-300/30 transition-transform ${showRepoPicker ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {showRepoPicker && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-xl bg-[#0a1628] border border-white/[0.1] shadow-2xl shadow-black/50 max-h-72 overflow-hidden flex flex-col">
                        <div className="p-2 border-b border-white/[0.06]">
                          <input
                            type="text"
                            value={repoSearch}
                            onChange={(e) => handleRepoSearchChange(e.target.value)}
                            placeholder="Search your repos or any public repo..."
                            autoFocus
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/30 text-sm"
                          />
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {searchingRepos ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-blue-300/40 text-sm">
                              <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                              Searching GitHub...
                            </div>
                          ) : filteredRepos.length === 0 ? (
                            <p className="text-blue-300/30 text-xs text-center py-6">{repoSearch.length >= 2 ? "No repos found" : "Type to search repos..."}</p>
                          ) : (
                            filteredRepos.map((r) => (
                              <RepoRow key={r.id} repo={r} onSelect={handleSelectRepo} />
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Issue Picker */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-blue-300/50 mb-1">Issue</label>
                    <button
                      onClick={() => { if (selectedRepo) { setShowIssuePicker(!showIssuePicker); setShowRepoPicker(false); } }}
                      disabled={!selectedRepo}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-left flex items-center justify-between hover:border-cyan-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {selectedIssue ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-cyan-400/70 text-sm font-mono shrink-0">#{selectedIssue.number}</span>
                          <span className="text-white text-sm truncate">{selectedIssue.title}</span>
                        </div>
                      ) : (
                        <span className="text-blue-300/20 text-sm">{selectedRepo ? "Select an issue..." : "Select a repo first"}</span>
                      )}
                      <svg className={`w-4 h-4 text-blue-300/30 transition-transform shrink-0 ${showIssuePicker ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {showIssuePicker && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-xl bg-[#0a1628] border border-white/[0.1] shadow-2xl shadow-black/50 max-h-80 overflow-hidden flex flex-col">
                        <div className="p-2 border-b border-white/[0.06]">
                          <input
                            type="text"
                            value={issueSearch}
                            onChange={(e) => setIssueSearch(e.target.value)}
                            placeholder="Search issues by title or number..."
                            autoFocus
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/30 text-sm"
                          />
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {loadingIssues ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-blue-300/40 text-sm">
                              <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                              Loading issues...
                            </div>
                          ) : filteredIssues.length === 0 ? (
                            <p className="text-blue-300/30 text-xs text-center py-6">{issues.length === 0 ? "No open issues" : "No matching issues"}</p>
                          ) : (
                            filteredIssues.map((i) => (
                              <button
                                key={i.number}
                                onClick={() => handleSelectIssue(i)}
                                className="w-full px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
                              >
                                <div className="flex items-start gap-2.5">
                                  <span className="text-cyan-400/60 text-xs font-mono mt-0.5 shrink-0">#{i.number}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm leading-snug">{i.title}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {i.labels.slice(0, 3).map((l) => (
                                        <span key={l.name} className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium" style={{ borderColor: `#${l.color}40`, color: `#${l.color}`, backgroundColor: `#${l.color}10` }}>
                                          {l.name}
                                        </span>
                                      ))}
                                      <span className="text-[10px] text-blue-300/20">{i.comments} comments</span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-xs font-medium text-blue-300/50 mb-1">Reward (USDC)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={bountyAmount}
                        onChange={(e) => setBountyAmount(e.target.value)}
                        placeholder="100.00"
                        className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-blue-300/20 focus:outline-none focus:border-cyan-500/40 font-mono text-sm pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-300/30 font-semibold">USDC</span>
                    </div>
                  </div>

                  {/* Quick amounts */}
                  <div className="flex gap-2">
                    {["25", "50", "100", "250", "500"].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setBountyAmount(amt)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono transition-all border ${bountyAmount === amt ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" : "bg-white/[0.02] text-blue-300/30 border-white/[0.04] hover:text-white hover:border-white/[0.1]"}`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Manual Mode (or not signed in) */
                <div className="space-y-3">
                  {!session && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-cyan-400/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-xs text-blue-300/30">
                        <button onClick={() => signIn("github")} className="text-cyan-400 hover:text-cyan-300">Sign in with GitHub</button> to auto-fill repos and issues
                      </p>
                    </div>
                  )}
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
                </div>
              )}

              {/* Selected issue preview */}
              {selectedIssue && !useManualMode && (
                <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/15">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div className="min-w-0">
                      <p className="text-xs text-cyan-300 font-semibold">{selectedRepo?.fullName}#{selectedIssue.number}</p>
                      <p className="text-xs text-white/80 mt-0.5">{selectedIssue.title}</p>
                      {selectedIssue.labels.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {selectedIssue.labels.map((l) => (
                            <span key={l.name} className="text-[9px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: `#${l.color}40`, color: `#${l.color}`, backgroundColor: `#${l.color}10` }}>
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {createStep === "done" && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                  <p className="text-green-400 text-sm font-semibold">Bounty created successfully!</p>
                  <p className="text-xs text-blue-300/30 mt-1">The reward amount is fully encrypted on-chain</p>
                </div>
              )}
              <button onClick={handleCreateBounty} disabled={createStep === "running" || fheLoading || !repoOwner || !repoName || !issueNumber || !bountyAmount} className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 transition-all">
                {createStep === "done" ? "Create Another" : createStep === "running" ? "Processing..." : fheLoading ? "Loading FHE..." : "Create Bounty"}
              </button>
            </div>
          )}

          {/* CLAIM */}
          {tab === "claim" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Claim a Bounty</h2>

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

              {/* Auto-detected claimable bounties */}
              {session && isRegisteredOnChain && (
                <>
                  {loadingClaimable && (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                      <p className="text-blue-300/50 text-xs">Scanning your merged PRs for claimable bounties...</p>
                    </div>
                  )}

                  {!loadingClaimable && claimableBounties.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <label className="block text-xs font-semibold text-green-400">
                          {claimableBounties.length} bounty{claimableBounties.length > 1 ? "ies" : ""} ready to claim
                        </label>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {claimableBounties.map((cb) => {
                          const infoKey = `${cb.repoOwner}/${cb.repoName}#${cb.issueNumber}`;
                          const info = issueInfoCache[infoKey];
                          return (
                            <div
                              key={`${cb.bountyId}-${cb.prNumber}`}
                              className="p-3 rounded-xl bg-green-500/5 border border-green-500/15 space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-green-300">Bounty #{cb.bountyId}</span>
                                    <span className="text-[10px] text-blue-300/30">{cb.repoOwner}/{cb.repoName}#{cb.issueNumber}</span>
                                  </div>
                                  {info?.title && <p className="text-xs text-white/70 mt-0.5 truncate">{info.title}</p>}
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <svg className="w-3 h-3 text-purple-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                    <span className="text-[10px] text-purple-400/60 truncate">PR #{cb.prNumber}: {cb.prTitle}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleAutoClaimBounty(cb)}
                                  disabled={claimPending || waitingClaimVerification}
                                  className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-400 hover:to-emerald-500 disabled:opacity-40 transition-all"
                                >
                                  Claim
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!loadingClaimable && claimableBounties.length === 0 && (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                      <p className="text-blue-300/40 text-xs">No claimable bounties found.</p>
                      <p className="text-blue-300/25 text-[10px] mt-1">Merge a PR that references a bounty issue to see it here.</p>
                    </div>
                  )}
                </>
              )}

              {waitingClaimVerification && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                    <div>
                      <p className="text-amber-400 text-xs font-semibold">
                        {executingClaim ? "PR verified! Executing encrypted payment..." : "Chainlink is verifying your PR..."}
                      </p>
                      <p className="text-amber-400/50 text-[10px] mt-0.5">
                        {executingClaim ? "Sending FHE-encrypted payment to your wallet." : "Checking if PR is merged and references the issue. 1-2 minutes."}
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

              {/* Manual claim fallback */}
              <div className="pt-2 border-t border-white/[0.04]">
                <button
                  onClick={() => setShowManualClaim(!showManualClaim)}
                  className="flex items-center gap-2 text-[10px] text-blue-300/30 hover:text-blue-300/50 transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showManualClaim ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Manual claim (enter bounty ID & PR number)
                </button>

                {showManualClaim && (
                  <div className="mt-3 space-y-3">
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
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <h3 className="text-xs font-semibold text-blue-300/50 mb-2">How it works</h3>
                <ol className="text-xs text-blue-300/30 space-y-1 list-decimal list-inside">
                  <li>Merge a PR that references a bounty issue (e.g. &quot;fixes #12&quot;)</li>
                  <li>Your claimable bounties appear here automatically</li>
                  <li>Click &quot;Claim&quot; and Chainlink verifies your PR on-chain</li>
                  <li>cUSDC is transferred to your wallet. Go to <a href="/shield" className="text-cyan-400 hover:text-cyan-300 underline">Shield</a> to convert to USDC</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Transaction Modal */}
      <TransactionModal
        open={txModalOpen}
        onClose={() => {
          setTxModalOpen(false);
          if (createStep === "done") {
            setCreateStep("idle");
          }
        }}
        title={txModalTitle}
        steps={txSteps}
        icon={txModalIcon}
        chainId={chainId}
      />
    </div>
  );
}
