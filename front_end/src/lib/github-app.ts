// GhostBounty GitHub App — helpers for authenticating as the app and making API calls

import crypto from "crypto";

const APP_ID = process.env.GITHUB_APP_ID!;
const PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!;

// ── Webhook signature verification ──────────────────────

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── JWT for GitHub App authentication ───────────────────

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

function createAppJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 600, iss: APP_ID }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), PRIVATE_KEY);
  return `${header}.${payload}.${base64url(signature)}`;
}

// ── Get installation access token ───────────────────────

export async function getInstallationToken(installationId: number): Promise<string> {
  const jwt = createAppJWT();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`Failed to get installation token: ${res.status}`);
  const data = await res.json();
  return data.token;
}

// ── GitHub API helpers (authenticated as installation) ───

async function githubApi(token: string, method: string, url: string, body?: object) {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`GitHub API error ${res.status}: ${text}`);
  }
  return res;
}

export async function postComment(token: string, owner: string, repo: string, issueNumber: number, body: string) {
  return githubApi(token, "POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
}

export async function addLabel(token: string, owner: string, repo: string, issueNumber: number, label: string) {
  // Ensure label exists
  await githubApi(token, "POST", `/repos/${owner}/${repo}/labels`, { name: label, color: "0EA5E9", description: "GhostBounty reward" });
  // Add to issue
  return githubApi(token, "POST", `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { labels: [label] });
}
