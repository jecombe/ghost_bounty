"use client";

import Link from "next/link";

const GITHUB_APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "ghostbounty-bot";
const INSTALL_URL = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;

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
          Add the GhostBounty bot to your GitHub repositories to enable automated bounty management.
        </p>
      </div>

      {/* What the app does */}
      <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-4">
        <h2 className="text-lg font-bold text-white">What the bot does</h2>
        <div className="space-y-3">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              ),
              title: "/bounty command",
              desc: "Anyone can type /bounty 100 in an issue comment to suggest a bounty. The bot labels the issue and posts instructions.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "PR merge detection",
              desc: "When a PR referencing a bounty issue is merged, the bot notifies the developer to claim their reward.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              ),
              title: "Auto-labeling",
              desc: 'Issues with bounties get a "ghostbounty" label so contributors can easily find paid work.',
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

      {/* Permissions */}
      <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-4">
        <h2 className="text-lg font-bold text-white">Permissions requested</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { perm: "Issues", level: "Read & Write", why: "Comment + label on issues" },
            { perm: "Pull Requests", level: "Read", why: "Detect merged PRs" },
            { perm: "Metadata", level: "Read", why: "Basic repo info" },
          ].map((p) => (
            <div key={p.perm} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="text-white text-xs font-semibold">{p.perm}</span>
                <span className="text-cyan-400 text-[10px] font-mono">{p.level}</span>
              </div>
              <p className="text-blue-300/30 text-[10px] mt-0.5">{p.why}</p>
            </div>
          ))}
        </div>
        <p className="text-blue-300/20 text-[10px]">
          The app never accesses your code. It only reads PR metadata and writes comments/labels on issues.
        </p>
      </div>

      {/* Install CTA */}
      <div className="space-y-4">
        <a
          href={INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-4 rounded-xl font-bold text-center bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-900/30"
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Install GhostBounty on GitHub
          </span>
        </a>

        <div className="text-center">
          <Link href="/bounty" className="text-sm text-blue-300/40 hover:text-cyan-300 transition-colors">
            ← Back to Bounties
          </Link>
        </div>
      </div>

      {/* Quick start after install */}
      <div className="panel-military rounded-2xl p-6 border border-amber-900/20 space-y-4">
        <h2 className="text-lg font-bold text-white">Quick start after installation</h2>
        <ol className="space-y-3">
          {[
            { step: "1", title: "Install the app", desc: "Click the button above and select which repos to enable." },
            { step: "2", title: "Create a bounty", desc: "Go to the Bounties page and create a bounty for a GitHub issue with an encrypted USDC reward." },
            { step: "3", title: "Use /bounty in issues", desc: "Type /bounty 100 in any issue comment to signal a bounty to contributors." },
            { step: "4", title: "Automatic notifications", desc: "When a PR is merged, the bot notifies the developer with a link to claim their reward." },
          ].map((item) => (
            <li key={item.step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <span className="text-cyan-400 text-xs font-bold">{item.step}</span>
              </div>
              <div>
                <h4 className="text-white text-sm font-semibold">{item.title}</h4>
                <p className="text-blue-300/30 text-xs">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
