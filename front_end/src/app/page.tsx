"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 sm:space-y-12 py-6 sm:py-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-3">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/40">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
          Ghost<span className="text-cyan-400">Bounty</span>
        </h1>
        <p className="text-sm sm:text-lg text-blue-300/60 max-w-xl mx-auto px-2">
          Decentralized GitHub bounties with confidential payments.
          Post rewards on issues, pay developers automatically when their PR merges.
          Nobody sees the amounts.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="panel-military rounded-2xl p-5 border border-amber-900/20 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-sm">Confidential Amounts</h3>
          <p className="text-blue-300/40 text-xs leading-relaxed">
            Bounty rewards are encrypted with FHE (Fully Homomorphic Encryption).
            Nobody — not even other contributors — can see how much a developer earns.
          </p>
        </div>

        <div className="panel-military rounded-2xl p-5 border border-amber-900/20 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-sm">Chainlink Verified</h3>
          <p className="text-blue-300/40 text-xs leading-relaxed">
            Chainlink Functions verifies PR merges directly from the GitHub API.
            No custom server, no trust required — fully decentralized oracle verification.
          </p>
        </div>

        <div className="panel-military rounded-2xl p-5 border border-amber-900/20 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-sm">Automatic Payments</h3>
          <p className="text-blue-300/40 text-xs leading-relaxed">
            When a developer's PR is merged, payment happens automatically.
            No invoicing, no manual transfers, no delays.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4 sm:px-0">
        <Link
          href="/bounty"
          className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-900/30 text-center"
        >
          Launch App
        </Link>
        <Link
          href="/docs"
          className="px-6 py-3 rounded-xl font-bold text-sm bg-white/[0.06] text-blue-300/70 hover:text-white hover:bg-white/[0.1] border border-white/[0.08] transition-all text-center"
        >
          Read the Docs
        </Link>
      </div>

      {/* How it works */}
      <div className="panel-military rounded-2xl p-4 sm:p-6 border border-amber-900/20 space-y-5">
        <h2 className="text-lg font-bold text-white text-center">How it works</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            { step: "1", title: "Post a bounty", desc: "Project owner creates a bounty on a GitHub issue with an encrypted USDC reward." },
            { step: "2", title: "Dev works", desc: "A developer picks up the issue and opens a PR referencing it." },
            { step: "3", title: "PR merges", desc: "The PR is reviewed and merged into the main branch." },
            { step: "4", title: "Auto-pay", desc: "Chainlink verifies the merge. The dev is paid instantly in encrypted cUSDC." },
          ].map((item) => (
            <div key={item.step} className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center mx-auto">
                <span className="text-cyan-400 text-sm font-bold">{item.step}</span>
              </div>
              <h4 className="text-white text-xs font-semibold">{item.title}</h4>
              <p className="text-blue-300/30 text-xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-blue-300/15 font-mono">
        Powered by Zama FHE + Chainlink Functions
      </div>
    </div>
  );
}
