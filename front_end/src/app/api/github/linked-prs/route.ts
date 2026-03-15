import { NextRequest, NextResponse } from "next/server";

// Fetch PRs linked to a specific issue (open + merged) — no auth required for public repos
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const issue = searchParams.get("issue");

  if (!owner || !repo || !issue) {
    return NextResponse.json({ error: "Missing owner, repo, or issue" }, { status: 400 });
  }

  const nameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!nameRegex.test(owner) || !nameRegex.test(repo)) {
    return NextResponse.json({ error: "Invalid owner or repo" }, { status: 400 });
  }

  const issueNum = Number(issue);
  if (!Number.isFinite(issueNum) || issueNum <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }

  try {
    // Search for PRs in the repo that mention this issue number
    const query = `repo:${owner}/${repo} type:pr ${issueNum}`;
    const res = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=20&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: 60 }, // cache 60s
      }
    );

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const data = await res.json();
    const items = data.items || [];

    // Filter to PRs that actually reference this issue
    const issueRef = `#${issueNum}`;
    const fullRef = `${owner}/${repo}#${issueNum}`;
    const closesPattern = new RegExp(
      `(closes|fixes|resolves|close|fix|resolve)\\s+${issueRef.replace("#", "#")}`,
      "i"
    );

    const prs = items
      .filter((pr: any) => {
        const title: string = pr.title || "";
        const body: string = pr.body || "";
        return (
          title.includes(issueRef) ||
          body.includes(issueRef) ||
          body.includes(fullRef) ||
          closesPattern.test(title) ||
          closesPattern.test(body)
        );
      })
      .map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.state, // "open" or "closed"
        merged: !!pr.pull_request?.merged_at,
        mergedAt: pr.pull_request?.merged_at || null,
        author: pr.user?.login || "",
        authorAvatar: pr.user?.avatar_url || "",
        createdAt: pr.created_at,
        draft: pr.draft || false,
      }));

    return NextResponse.json(prs);
  } catch {
    return NextResponse.json([]);
  }
}
