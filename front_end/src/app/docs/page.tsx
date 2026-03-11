"use client";

import { useState } from "react";
import Link from "next/link";

type Section = "overview" | "project-owners" | "developers" | "architecture" | "security" | "faq";

const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "project-owners", label: "For Project Owners" },
  { id: "developers", label: "For Developers" },
  { id: "architecture", label: "Architecture" },
  { id: "security", label: "Security" },
  { id: "faq", label: "FAQ" },
];

export default function DocsPage() {
  const [active, setActive] = useState<Section>("overview");

  return (
    <div className="max-w-4xl mx-auto flex gap-6">
      {/* Sidebar nav */}
      <nav className="hidden md:block w-48 shrink-0 sticky top-6 self-start space-y-1">
        <h2 className="text-xs font-bold text-blue-300/30 uppercase tracking-wider mb-3 px-3">Documentation</h2>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
              active === s.id
                ? "bg-cyan-500/10 text-cyan-300 font-semibold"
                : "text-blue-300/40 hover:text-white hover:bg-white/5"
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="pt-4 px-3">
          <Link href="/bounty" className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold">
            Launch App &rarr;
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Mobile section selector */}
        <div className="md:hidden">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value as Section)}
            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* ===== OVERVIEW ===== */}
        {active === "overview" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-black text-white mb-2">
                Ghost<span className="text-cyan-400">Bounty</span> Documentation
              </h1>
              <p className="text-blue-300/50 text-sm leading-relaxed">
                GhostBounty is a decentralized protocol for posting and paying GitHub bounties with confidential amounts.
                It combines Fully Homomorphic Encryption (FHE) from Zama with Chainlink Functions for trustless PR merge verification.
              </p>
            </div>

            <Card title="What makes GhostBounty unique?">
              <ul className="space-y-3">
                <Feature
                  title="Confidential payments"
                  desc="Bounty amounts are encrypted using FHE. Nobody — not contributors, not competitors, not even blockchain analysts — can see how much a developer was paid."
                />
                <Feature
                  title="Decentralized verification"
                  desc="Chainlink Functions (a decentralized oracle network) verifies PR merges directly from the GitHub API. No custom backend, no single point of failure."
                />
                <Feature
                  title="Automatic payouts"
                  desc="When a developer's PR is verified as merged, the encrypted payment is automatically transferred to their wallet. No invoicing needed."
                />
                <Feature
                  title="Identity verification"
                  desc="Developers prove they own their GitHub account via a public gist, verified on-chain by Chainlink. No impersonation possible."
                />
              </ul>
            </Card>

            <Card title="Quick start">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2">
                  <h4 className="text-white text-sm font-semibold">I want to post bounties</h4>
                  <p className="text-blue-300/30 text-xs">You're a project owner who wants to reward contributors.</p>
                  <button onClick={() => setActive("project-owners")} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold">
                    Read the guide &rarr;
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2">
                  <h4 className="text-white text-sm font-semibold">I want to earn bounties</h4>
                  <p className="text-blue-300/30 text-xs">You're a developer who wants to get paid for open-source work.</p>
                  <button onClick={() => setActive("developers")} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold">
                    Read the guide &rarr;
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ===== PROJECT OWNERS ===== */}
        {active === "project-owners" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-black text-white">For Project Owners</h1>
            <p className="text-blue-300/50 text-sm">How to post bounties and reward your contributors.</p>

            <Card title="Step 1 — Connect your wallet">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                Go to the <Link href="/bounty" className="text-cyan-400 hover:text-cyan-300">Bounties page</Link> and
                connect your wallet (MetaMask, WalletConnect, etc.). You need USDC on Sepolia testnet.
              </p>
            </Card>

            <Card title="Step 2 — Create a bounty">
              <ol className="space-y-3 text-xs text-blue-300/40 leading-relaxed list-decimal list-inside">
                <li>Click the <strong className="text-white">"Create"</strong> tab</li>
                <li>Enter the <strong className="text-white">repository owner</strong> (e.g., <code className="text-cyan-400/70">ethereum</code>)</li>
                <li>Enter the <strong className="text-white">repository name</strong> (e.g., <code className="text-cyan-400/70">go-ethereum</code>)</li>
                <li>Enter the <strong className="text-white">issue number</strong> you want to put a bounty on</li>
                <li>Enter the <strong className="text-white">reward amount</strong> in USDC — this will be encrypted</li>
                <li>Sign the 4 transactions:
                  <ul className="mt-1 ml-4 space-y-1 list-disc">
                    <li><strong className="text-white">Approve</strong> — Allow cUSDC contract to use your USDC</li>
                    <li><strong className="text-white">Shield</strong> — Convert USDC to encrypted cUSDC</li>
                    <li><strong className="text-white">Operator</strong> — Allow GhostBounty to use your cUSDC</li>
                    <li><strong className="text-white">Create</strong> — Create the bounty with encrypted amount</li>
                  </ul>
                </li>
              </ol>
            </Card>

            <Card title="Step 3 — Wait for a developer">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                Your bounty is now live. Developers can see the issue and repo on the Bounties tab, but <strong className="text-white">nobody can see the reward amount</strong>.
                When a developer opens a PR that references your issue (e.g., "Fixes #42") and it gets merged, they can claim the bounty.
              </p>
            </Card>

            <Card title="Cancellation">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                You can cancel an unclaimed bounty at any time to get your escrowed cUSDC back.
                Simply click "Cancel" on your bounty in the Browse tab. The encrypted funds are returned to your wallet.
              </p>
            </Card>

            <InfoBox type="tip" text="Only one bounty can exist per issue. If you want to change the amount, cancel the existing bounty first, then create a new one." />
          </div>
        )}

        {/* ===== DEVELOPERS ===== */}
        {active === "developers" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-black text-white">For Developers</h1>
            <p className="text-blue-300/50 text-sm">How to discover bounties and get paid for your work.</p>

            <Card title="Step 1 — Sign in with GitHub">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                Click <strong className="text-white">"Sign in with GitHub"</strong> on the Bounties page.
                This connects your GitHub account via OAuth — we only read your public profile to get your username.
              </p>
            </Card>

            <Card title="Step 2 — Verify your identity on-chain">
              <p className="text-blue-300/40 text-xs leading-relaxed mb-3">
                This is a one-time step to prove you own your GitHub account. It prevents someone from registering your username and stealing your bounty payments.
              </p>
              <ol className="space-y-2 text-xs text-blue-300/40 leading-relaxed list-decimal list-inside">
                <li>Go to <a href="https://gist.github.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">gist.github.com</a></li>
                <li>Create a <strong className="text-white">public</strong> gist</li>
                <li>In the content, paste your <strong className="text-white">wallet address</strong> (e.g., <code className="text-cyan-400/70">0x1234...abcd</code>)</li>
                <li>Copy the <strong className="text-white">gist ID</strong> from the URL — it's the long hex string after your username</li>
                <li>Paste it in the "Gist ID" field and click <strong className="text-white">Verify</strong></li>
                <li>Chainlink Functions will verify your gist belongs to your GitHub account (takes ~1-2 min)</li>
              </ol>
              <InfoBox type="info" text="The gist must be PUBLIC and contain your exact wallet address. Chainlink nodes will check both the gist owner and the content." />
            </Card>

            <Card title="Step 3 — Find and work on a bounty">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                Browse available bounties in the <strong className="text-white">"Bounties"</strong> tab.
                Each bounty links to a GitHub issue. Pick one, work on it, and open a PR.
              </p>
              <InfoBox type="important" text='Your PR must reference the bounty issue. Use keywords like "Fixes #42", "Closes #42", or include "#42" in the PR title or body.' />
            </Card>

            <Card title="Step 4 — Claim your bounty">
              <ol className="space-y-2 text-xs text-blue-300/40 leading-relaxed list-decimal list-inside">
                <li>Wait for your PR to be <strong className="text-white">merged</strong></li>
                <li>Go to the <strong className="text-white">"Claim"</strong> tab</li>
                <li>Enter the <strong className="text-white">bounty ID</strong> and your <strong className="text-white">PR number</strong></li>
                <li>Click <strong className="text-white">"Claim Bounty"</strong></li>
                <li>Chainlink Functions verifies via the GitHub API that your PR is merged and references the issue</li>
                <li>If verified, <strong className="text-white">cUSDC is automatically transferred</strong> to your wallet</li>
              </ol>
            </Card>

            <Card title="Receiving your payment">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                Payment arrives as <strong className="text-white">cUSDC</strong> (Confidential USDC) — an FHE-encrypted token.
                You can "unshield" it back to regular USDC at any time via the cUSDC contract.
                The amount you received is <strong className="text-white">only visible to you</strong>.
              </p>
            </Card>
          </div>
        )}

        {/* ===== ARCHITECTURE ===== */}
        {active === "architecture" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-black text-white">Architecture</h1>
            <p className="text-blue-300/50 text-sm">How GhostBounty works under the hood.</p>

            <Card title="Technology stack">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "Zama fhEVM", desc: "Fully Homomorphic Encryption on EVM — encrypts bounty amounts on-chain" },
                  { name: "Chainlink Functions", desc: "Decentralized oracle network that calls GitHub API to verify PR merges" },
                  { name: "Confidential USDC", desc: "ERC-7984 wrapper that converts USDC to encrypted cUSDC tokens" },
                  { name: "Next.js + wagmi", desc: "Frontend with wallet connection, GitHub OAuth, and encrypted input creation" },
                ].map((t) => (
                  <div key={t.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <h4 className="text-white text-xs font-semibold">{t.name}</h4>
                    <p className="text-blue-300/30 text-[11px] mt-1 leading-relaxed">{t.desc}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Flow diagram">
              <div className="space-y-4 text-xs font-mono">
                <FlowStep num="1" label="CREATE BOUNTY" detail="Project owner → USDC → shield → cUSDC → FHE encrypt amount → GhostBounty contract (escrow)" />
                <FlowStep num="2" label="DEV REGISTRATION" detail="Developer → GitHub OAuth → create public gist with ETH address → Chainlink verifies gist ownership → on-chain mapping" />
                <FlowStep num="3" label="CLAIM BOUNTY" detail="Developer → claimBounty(bountyId, prNumber) → Chainlink Functions → GitHub API → verify PR merged + references issue → return author username" />
                <FlowStep num="4" label="AUTO-PAYMENT" detail="Chainlink callback → match username to registered address → FHE fee calculation → confidentialTransfer(cUSDC) to developer" />
              </div>
            </Card>

            <Card title="Smart contract">
              <div className="space-y-2 text-xs text-blue-300/40">
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Contract</span>
                  <code className="text-cyan-400/70 text-[11px]">GhostBounty.sol</code>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Network</span>
                  <span className="text-white">Sepolia Testnet</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Address</span>
                  <code className="text-cyan-400/70 text-[11px]">0xE4Ed29F6cd79cf7aC1db5193608b45573aa7F341</code>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Protocol fee</span>
                  <span className="text-white">2%</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Source timelock</span>
                  <span className="text-white">48 hours</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Admin timelock</span>
                  <span className="text-white">24 hours</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ===== SECURITY ===== */}
        {active === "security" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-black text-white">Security</h1>
            <p className="text-blue-300/50 text-sm">Security measures and trust assumptions.</p>

            <Card title="Security features">
              <ul className="space-y-3">
                <Feature title="Identity verification via Chainlink" desc="Developers must prove GitHub ownership through a public gist. Chainlink Functions verifies the gist belongs to the claimed username and contains the caller's ETH address." />
                <Feature title="Bounty status machine" desc="Bounties have 4 states: Active, Pending, Claimed, Cancelled. Only one Chainlink verification can run at a time per bounty, preventing race conditions." />
                <Feature title="48-hour timelock on code changes" desc="The JavaScript source code executed by Chainlink nodes cannot be changed instantly. Any modification requires a 48-hour delay, giving users time to verify and exit." />
                <Feature title="24-hour timelock on fee changes" desc="Protocol fee and treasury address changes require 24 hours to take effect." />
                <Feature title="Input sanitization" desc="Repository names and usernames are validated on-chain (safe characters only, length limits). GitHub usernames are normalized to lowercase." />
                <Feature title="FHE access control" desc="Encrypted bounty amounts are only accessible to the bounty creator and the developer who claimed it." />
                <Feature title="Reentrancy protection" desc="All state-changing functions use OpenZeppelin's ReentrancyGuard." />
                <Feature title="Emergency pause" desc="The contract can be paused by the owner in case of a discovered vulnerability." />
              </ul>
            </Card>

            <Card title="Trust assumptions">
              <ul className="space-y-3">
                <Feature title="Chainlink DON" desc="We trust the Chainlink decentralized oracle network to faithfully execute the JavaScript source code and return correct results. The source code is public and timelocked." />
                <Feature title="Zama FHE coprocessor" desc="We trust Zama's FHE coprocessor to correctly perform encrypted computations and not leak plaintext values." />
                <Feature title="GitHub API" desc="We rely on the GitHub API to return accurate information about PR merge status and authorship." />
                <Feature title="Contract owner" desc="The owner (ideally a multisig) can pause the contract and propose code/fee changes with a timelock. They cannot directly access escrowed funds." />
              </ul>
            </Card>

            <InfoBox type="warning" text="This protocol has not been audited by a third-party security firm. Use at your own risk. Currently deployed on Sepolia testnet only." />
          </div>
        )}

        {/* ===== FAQ ===== */}
        {active === "faq" && (
          <div className="space-y-6">
            <h1 className="text-2xl font-black text-white">FAQ</h1>

            <Card title="General">
              <div className="space-y-4">
                <FAQ q="Can anyone see how much a bounty is worth?" a="No. The bounty amount is encrypted using Fully Homomorphic Encryption (FHE). Not even other blockchain users or analytics tools can see the amount. Only the creator and the developer who claims it can view the decrypted value." />
                <FAQ q="What tokens are used for payment?" a="Bounties are paid in cUSDC (Confidential USDC), which is an FHE-encrypted wrapper around USDC. Developers can 'unshield' cUSDC back to regular USDC at any time." />
                <FAQ q="Is there a fee?" a="Yes, 2% protocol fee deducted from the bounty amount at claim time. The fee is also encrypted — nobody can see the fee amount." />
                <FAQ q="What network is this on?" a="Currently deployed on Ethereum Sepolia testnet. Mainnet deployment is planned after a security audit." />
              </div>
            </Card>

            <Card title="For project owners">
              <div className="space-y-4">
                <FAQ q="Can I cancel a bounty?" a="Yes. You can cancel any Active or Pending bounty. The escrowed cUSDC is returned to your wallet." />
                <FAQ q="Can I have multiple bounties on the same issue?" a="No. One bounty per issue to avoid confusion. Cancel the existing one first if you want to change the amount." />
                <FAQ q="What happens if nobody claims my bounty?" a="Nothing — the funds stay in escrow. You can cancel and retrieve them at any time." />
              </div>
            </Card>

            <Card title="For developers">
              <div className="space-y-4">
                <FAQ q="Why do I need to create a gist?" a="The gist proves you own the GitHub account. Without it, someone could register your GitHub username and steal your bounty payments. Chainlink verifies the gist belongs to you." />
                <FAQ q="How long does verification take?" a="Chainlink Functions typically responds within 1-2 minutes. Both identity verification (gist) and bounty claim verification follow this timeline." />
                <FAQ q="What if my PR is merged but the claim fails?" a="The bounty reverts to 'Active' status if verification fails. Common reasons: PR doesn't reference the issue, your GitHub username isn't registered, or Chainlink secrets expired. You can try again." />
                <FAQ q="Can I claim a bounty from any GitHub account?" a="You can only claim bounties where YOU authored the merged PR. Chainlink checks the PR author matches your registered GitHub username." />
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Components =====

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-military rounded-2xl p-5 border border-amber-900/20 space-y-4">
      <h3 className="text-white font-bold text-sm">{title}</h3>
      {children}
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
      <div>
        <span className="text-white text-xs font-semibold">{title}</span>
        <span className="text-blue-300/40 text-xs"> — {desc}</span>
      </div>
    </li>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="space-y-1">
      <h4 className="text-white text-xs font-semibold">{q}</h4>
      <p className="text-blue-300/40 text-xs leading-relaxed">{a}</p>
    </div>
  );
}

function FlowStep({ num, label, detail }: { num: string; label: string; detail: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center shrink-0">
        <span className="text-cyan-400 text-[10px] font-bold">{num}</span>
      </div>
      <div>
        <div className="text-cyan-300 text-xs font-bold">{label}</div>
        <div className="text-blue-300/30 text-[11px] mt-0.5 leading-relaxed font-sans">{detail}</div>
      </div>
    </div>
  );
}

function InfoBox({ type, text }: { type: "tip" | "info" | "important" | "warning"; text: string }) {
  const colors = {
    tip: "bg-green-500/5 border-green-500/15 text-green-400",
    info: "bg-cyan-500/5 border-cyan-500/15 text-cyan-400",
    important: "bg-amber-500/5 border-amber-500/15 text-amber-400",
    warning: "bg-red-500/5 border-red-500/15 text-red-400",
  };
  const labels = { tip: "Tip", info: "Info", important: "Important", warning: "Warning" };

  return (
    <div className={`p-3 rounded-xl border ${colors[type]}`}>
      <span className="text-xs font-bold">{labels[type]}: </span>
      <span className="text-xs opacity-80">{text}</span>
    </div>
  );
}
