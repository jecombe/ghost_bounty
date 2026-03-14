import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = (await getServerSession(authOptions)) as any;
  const token = session?.accessToken as string | undefined;

  const owner = req.nextUrl.searchParams.get("owner");
  const repo = req.nextUrl.searchParams.get("repo");
  const issue = req.nextUrl.searchParams.get("issue");

  if (!owner || !repo || !issue) {
    return NextResponse.json({ error: "owner, repo, and issue required" }, { status: 400 });
  }

  const nameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!nameRegex.test(owner) || !nameRegex.test(repo) || !/^\d+$/.test(issue)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issue}`,
    { headers }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Not found" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({
    number: data.number,
    title: data.title,
    state: data.state,
    labels: data.labels?.map((l: any) => ({ name: l.name, color: l.color })) || [],
    user: { login: data.user?.login, avatarUrl: data.user?.avatar_url },
    body: data.body?.slice(0, 300) || "",
  });
}
