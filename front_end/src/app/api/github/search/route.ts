import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = (await getServerSession(authOptions)) as any;
  const token = session?.accessToken as string | undefined;

  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=15&sort=stars`,
    { headers }
  );

  if (!res.ok) {
    return NextResponse.json([]);
  }

  const data = await res.json();
  const simplified = (data.items || []).map((r: any) => ({
    id: r.id,
    fullName: r.full_name,
    owner: r.owner.login,
    name: r.name,
    description: r.description,
    openIssues: r.open_issues_count,
    stars: r.stargazers_count,
    private: r.private,
    avatarUrl: r.owner.avatar_url,
  }));

  return NextResponse.json(simplified);
}
