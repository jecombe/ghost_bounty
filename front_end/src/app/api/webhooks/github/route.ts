import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, getInstallationToken, postComment, addLabel } from "@/lib/github-app";

// GhostBounty App URL — used in bot comments
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ghostbounty.xyz";
const GHOST_BOUNTY_ADDRESS = process.env.NEXT_PUBLIC_GHOST_BOUNTY_ADDRESS || "0x0000000000000000000000000000000000000000";

// Validate GitHub identifiers to prevent API path injection
const SAFE_GITHUB_NAME = /^[a-zA-Z0-9._-]+$/;
function isValidGitHubName(name: string): boolean {
  return typeof name === "string" && name.length > 0 && name.length <= 100 && SAFE_GITHUB_NAME.test(name);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";
  const event = req.headers.get("x-github-event") || "";

  // Verify webhook signature
  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);
  const installationId = payload.installation?.id;

  if (!installationId) {
    return NextResponse.json({ ok: true, skipped: "no installation" });
  }

  try {
    switch (event) {
      case "issue_comment":
        await handleIssueComment(payload, installationId);
        break;
      case "pull_request":
        await handlePullRequest(payload, installationId);
        break;
      case "installation":
        await handleInstallation(payload);
        break;
      default:
        break;
    }
  } catch (err: any) {
    console.error(`Webhook error (${event}):`, err);
  }

  return NextResponse.json({ ok: true });
}

// ── /bounty command in issue comments ────────────────────

async function handleIssueComment(payload: any, installationId: number) {
  if (payload.action !== "created") return;

  const comment: string = payload.comment?.body || "";
  const issue = payload.issue;
  const repo = payload.repository;

  if (!issue || !repo) return;

  // Check for /bounty command
  const bountyMatch = comment.match(/^\/bounty\s+(\d+(?:\.\d+)?)\s*$/m);
  if (!bountyMatch) return;

  const amount = bountyMatch[1];
  const owner = repo.owner.login;
  const repoName = repo.name;
  const issueNumber = issue.number;

  if (!isValidGitHubName(owner) || !isValidGitHubName(repoName) || typeof issueNumber !== "number" || issueNumber <= 0) return;

  const token = await getInstallationToken(installationId);

  // Add bounty label
  await addLabel(token, owner, repoName, issueNumber, "ghostbounty");

  // Build pre-filled create link
  const createLink = `${APP_URL}/bounty?tab=create&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}&issue=${issueNumber}&amount=${amount}`;

  // Post confirmation comment
  const body = [
    `### :ghost: GhostBounty`,
    ``,
    `A bounty of **${amount} USDC** has been suggested for this issue.`,
    ``,
    `**To fund this bounty**, the project owner just needs to sign the transaction:`,
    ``,
    `> **[Create Bounty for ${owner}/${repoName}#${issueNumber}](${createLink})**`,
    ``,
    `The form is pre-filled — connect your wallet and sign to fund the bounty.`,
    `The reward will be encrypted — nobody can see the actual amount on-chain.`,
    ``,
    `**To claim this bounty** (developers):`,
    `1. Open a PR that references this issue (e.g., "Fixes #${issueNumber}")`,
    `2. Get the PR merged`,
    `3. Claim your reward at [GhostBounty](${APP_URL}/bounty) — Chainlink verifies the merge automatically`,
    ``,
    `> Contract: [\`${GHOST_BOUNTY_ADDRESS.slice(0, 10)}...\`](https://sepolia.etherscan.io/address/${GHOST_BOUNTY_ADDRESS}) | Payments are FHE-encrypted`,
  ].join("\n");

  await postComment(token, owner, repoName, issueNumber, body);
}

// ── PR merged → notify about claimable bounty ────────────

async function handlePullRequest(payload: any, installationId: number) {
  if (payload.action !== "closed") return;
  if (!payload.pull_request?.merged) return;

  const pr = payload.pull_request;
  const repo = payload.repository;
  const owner = repo.owner.login;
  const repoName = repo.name;
  const prNumber = pr.number;
  const prAuthor = pr.user.login;

  if (!isValidGitHubName(owner) || !isValidGitHubName(repoName)) return;

  // Extract issue references from PR title + body + branch
  const issueNumbers = extractIssueReferences(pr.title, pr.body, pr.head?.ref, owner, repoName);

  if (issueNumbers.length === 0) return;

  const token = await getInstallationToken(installationId);

  // Comment on the PR
  const issueList = issueNumbers.map((n) => `#${n}`).join(", ");
  const prBody = [
    `### :ghost: GhostBounty — PR Merged!`,
    ``,
    `This PR references ${issueList} which may have a bounty attached.`,
    ``,
    `**@${prAuthor}**, if a bounty exists for ${issueList}:`,
    `1. Make sure you're [registered on GhostBounty](${APP_URL}/bounty) (GitHub identity verified via gist)`,
    `2. Go to [Claim](${APP_URL}/bounty) and enter **Bounty ID** + **PR #${prNumber}**`,
    `3. Chainlink will verify this merge and payment happens automatically`,
    ``,
    `> Rewards are FHE-encrypted — the amount stays private`,
  ].join("\n");

  await postComment(token, owner, repoName, prNumber, prBody);

  // Also comment on each referenced issue
  for (const issueNum of issueNumbers) {
    const issueBody = [
      `### :ghost: GhostBounty — Issue resolved`,
      ``,
      `PR #${prNumber} by @${prAuthor} has been merged and references this issue.`,
      ``,
      `If a bounty was posted, the developer can now [claim the reward](${APP_URL}/bounty).`,
    ].join("\n");

    await postComment(token, owner, repoName, issueNum, issueBody);
  }
}

// ── Installation event (logging) ─────────────────────────

async function handleInstallation(payload: any) {
  const action = payload.action; // created, deleted, etc.
  const account = payload.installation?.account?.login;
  const repos = payload.repositories?.map((r: any) => r.full_name) || [];
  console.log(`[GhostBounty] App ${action} by @${account} on repos: ${repos.join(", ")}`);
}

// ── Helpers ──────────────────────────────────────────────

function extractIssueReferences(title: string, body: string, branch: string, _owner: string, _repo: string): number[] {
  const text = `${title || ""} ${body || ""} ${branch || ""}`;
  const issues = new Set<number>();

  // Patterns: "Fixes #42", "Closes #42", "Resolves #42", "#42", "owner/repo#42"
  const patterns = [
    /(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi,
    /(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+(?:[\w.-]+\/[\w.-]+)#(\d+)/gi,
    /#(\d+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 100000) issues.add(num);
    }
  }

  return Array.from(issues);
}
