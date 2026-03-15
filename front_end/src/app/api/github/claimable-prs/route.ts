import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

interface BountyInput {
  id: number;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
}

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

export async function POST(req: NextRequest) {
  const session = (await getServerSession(authOptions)) as any;
  const token = session?.accessToken as string | undefined;
  const githubUser = session?.githubUsername as string | undefined;

  if (!token || !githubUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { bounties: BountyInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.bounties) || body.bounties.length === 0) {
    return NextResponse.json([]);
  }

  // Limit to 20 bounties to avoid rate limiting
  const bounties = body.bounties.slice(0, 20);
  const nameRegex = /^[a-zA-Z0-9._-]+$/;

  // Group bounties by repo to minimize API calls
  const byRepo = new Map<string, BountyInput[]>();
  for (const b of bounties) {
    if (!nameRegex.test(b.repoOwner) || !nameRegex.test(b.repoName)) continue;
    const key = `${b.repoOwner}/${b.repoName}`;
    if (!byRepo.has(key)) byRepo.set(key, []);
    byRepo.get(key)!.push(b);
  }

  const claimable: ClaimableBounty[] = [];

  // For each repo, search merged PRs by the user
  for (const [repoKey, repoBounties] of byRepo) {
    const [owner, repo] = repoKey.split("/");
    const issueNumbers = new Set(repoBounties.map((b) => b.issueNumber));

    try {
      // Search for merged PRs by the user in this repo
      const searchQuery = `repo:${encodeURIComponent(owner)}/${encodeURIComponent(repo)} type:pr is:merged author:${encodeURIComponent(githubUser)}`;
      const res = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=50&sort=updated`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!res.ok) continue;

      const data = await res.json();
      const prs = data.items || [];

      for (const pr of prs) {
        // Check if this PR references any of the bounty issues
        const prTitle: string = pr.title || "";
        const prBody: string = pr.body || "";
        const prBranch: string = pr.head?.ref || "";

        for (const issueNum of issueNumbers) {
          const issueRef = `#${issueNum}`;
          const fullRef = `${owner}/${repo}#${issueNum}`;
          const closesPattern = new RegExp(
            `(closes|fixes|resolves)\\s+${issueRef.replace("#", "#")}`,
            "i"
          );

          const titleMatch = prTitle.includes(issueRef);
          const bodyMatch =
            prBody.includes(issueRef) ||
            prBody.includes(fullRef) ||
            closesPattern.test(prBody);
          const branchMatch = prBranch.includes(String(issueNum));

          if (titleMatch || bodyMatch || branchMatch) {
            const bounty = repoBounties.find((b) => b.issueNumber === issueNum);
            if (bounty) {
              claimable.push({
                bountyId: bounty.id,
                prNumber: pr.number,
                prTitle: prTitle,
                prUrl: pr.html_url,
                mergedAt: pr.pull_request?.merged_at || pr.closed_at || "",
                repoOwner: owner,
                repoName: repo,
                issueNumber: issueNum,
              });
            }
          }
        }
      }
    } catch {
      // Skip repos that fail
    }
  }

  return NextResponse.json(claimable);
}
