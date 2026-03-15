"use client";

import Link from "next/link";

// const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "ghostbounty-bot";
// const INSTALL_URL = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;

export default function InstallPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-900/40">
          <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white">
          Install Ghost<span className="text-cyan-400">Bounty</span>
        </h1>
        <p className="text-blue-300/50 max-w-md mx-auto">
          The GhostBounty GitHub App automates bounty management directly inside your repositories.
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="panel-military rounded-2xl p-6 border border-amber-500/30 bg-amber-500/[0.03] text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-amber-400 text-sm font-bold tracking-wide uppercase">Coming soon</span>
        </div>
        <p className="text-blue-300/50 text-sm max-w-md mx-auto">
          The GitHub App is currently in development. Stay tuned for the official release.
        </p>
      </div>

      {/* What is GhostBounty */}
      <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-4">
        <h2 className="text-lg font-bold text-white">What is GhostBounty?</h2>
        <p className="text-blue-300/40 text-sm leading-relaxed">
          GhostBounty is a decentralized bounty platform for open-source projects.
          It lets anyone post encrypted USDC rewards on GitHub issues, and automatically
          pays developers when their pull request is merged &mdash; all verified on-chain
          by Chainlink Functions, with amounts hidden via Fully Homomorphic Encryption (FHE).
        </p>
      </div>

      {/* What the bot will do */}
      <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-4">
        <h2 className="text-lg font-bold text-white">What the bot will do</h2>
        <div className="space-y-3">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              ),
              title: "/bounty command",
              desc: "Type /bounty 100 in an issue comment to suggest a bounty. The bot labels the issue and posts creation instructions.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "PR merge detection",
              desc: "When a PR referencing a bounty issue is merged, the bot notifies the developer with a link to claim their encrypted reward.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              ),
              title: "Auto-labeling",
              desc: 'Issues with bounties get a "ghostbounty" label so contributors can easily discover paid work.',
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0 text-cyan-400">
                {item.icon}
              </div>
              <div>
                <h3 className="text-white text-sm font-semibold">{item.title}</h3>
                <p className="text-blue-300/40 text-xs mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Back link */}
      <div className="text-center">
        <Link href="/bounty" className="text-sm text-blue-300/40 hover:text-cyan-300 transition-colors">
          &larr; Back to Bounties
        </Link>
      </div>
    </div>
  );
}
