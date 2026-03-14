import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = (await getServerSession(authOptions)) as any;
  const token = session?.accessToken as string | undefined;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owner = req.nextUrl.searchParams.get("owner");
  const repo = req.nextUrl.searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo required" }, { status: 400 });
  }

  // Validate inputs
  const nameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!nameRegex.test(owner) || !nameRegex.test(repo)) {
    return NextResponse.json({ error: "Invalid owner or repo name" }, { status: 400 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=50&sort=updated`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: res.status });
  }

  const issues = await res.json();
  // Filter out pull requests (GitHub returns PRs as issues too)
  const simplified = issues
    .filter((i: any) => !i.pull_request)
    .map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: i.labels.map((l: any) => ({ name: l.name, color: l.color })),
      createdAt: i.created_at,
      user: { login: i.user.login, avatarUrl: i.user.avatar_url },
      comments: i.comments,
    }));

  return NextResponse.json(simplified);
}
