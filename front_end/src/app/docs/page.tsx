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
                  desc="When a developer's PR is verified as merged by Chainlink, the encrypted payment is transferred to their wallet via executeClaim. The 2% protocol fee is calculated entirely in FHE. No invoicing needed."
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
                <li>Sign the 5 transactions:
                  <ul className="mt-1 ml-4 space-y-1 list-disc">
                    <li><strong className="text-white">Approve</strong> — Allow cUSDC contract to spend your USDC</li>
                    <li><strong className="text-white">Shield</strong> — Convert USDC to encrypted cUSDC</li>
                    <li><strong className="text-white">Operator</strong> — Authorize GhostBounty to handle your cUSDC (1-hour expiry)</li>
                    <li><strong className="text-white">Encrypt</strong> — FHE-encrypt the bounty amount client-side</li>
                    <li><strong className="text-white">Create</strong> — Create the bounty with the encrypted amount on-chain</li>
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
              <p className="text-blue-300/40 text-xs leading-relaxed mb-2">
                You can cancel an <strong className="text-white">Active</strong> bounty at any time to get your escrowed cUSDC back.
                Simply click "Cancel" on your bounty in the Browse tab. The encrypted funds are returned to your wallet.
              </p>
              <p className="text-blue-300/40 text-xs leading-relaxed">
                If a bounty is stuck in <strong className="text-white">Pending</strong> or <strong className="text-white">Verified</strong> status
                (e.g. Chainlink callback failed), you can use the <strong className="text-white">emergency cancel</strong> after a 7-day timeout.
                This prevents funds from being permanently locked.
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
              <InfoBox type="info" text="The gist must be PUBLIC and contain your exact wallet address. Chainlink nodes will check both the gist owner and the content. Re-registration has a 7-day cooldown." />
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
                <li>The app <strong className="text-white">auto-detects</strong> your merged PRs that match active bounties — just click "Claim" on the one you want. You can also enter bounty ID and PR number manually.</li>
                <li>Chainlink Functions verifies via the GitHub API that your PR is merged and references the issue (~1-2 min)</li>
                <li>Once verified, the bounty moves to <strong className="text-white">Verified</strong> status and <strong className="text-white">executeClaim</strong> is called automatically to transfer the encrypted cUSDC payment to your wallet (minus the 2% protocol fee)</li>
              </ol>
              <InfoBox type="info" text="The claim process has cooldowns: 2 minutes between your claims, and 10 minutes between claims on the same bounty. This prevents spam." />
            </Card>

            <Card title="Receiving your payment">
              <p className="text-blue-300/40 text-xs leading-relaxed">
                Payment arrives as <strong className="text-white">cUSDC</strong> (Confidential USDC) — an FHE-encrypted token.
                You can unshield it back to regular USDC at any time via the <Link href="/shield" className="text-cyan-400 hover:text-cyan-300">Shield page</Link>.
                The amount you received is <strong className="text-white">only visible to you</strong> — you can decrypt your balance in the header bar.
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
                <FlowStep num="1" label="CREATE BOUNTY" detail="Project owner → approve USDC → shield to cUSDC → set operator → FHE encrypt amount client-side → createBounty() → cUSDC escrowed in GhostBounty contract" />
                <FlowStep num="2" label="DEV REGISTRATION" detail="Developer → GitHub OAuth → create public gist with ETH address → registerDev(username, gistId) → Chainlink verifies gist ownership → on-chain mapping (username ↔ address)" />
                <FlowStep num="3" label="CLAIM REQUEST" detail="Developer → claimBounty(bountyId, prNumber) → bounty status: Active → Pending → Chainlink Functions calls GitHub API → verifies PR merged + references issue + returns author" />
                <FlowStep num="4" label="VERIFICATION" detail="Chainlink callback → match PR author to registered address → bounty status: Pending → Verified → claimedBy set to developer address" />
                <FlowStep num="5" label="PAYMENT" detail="executeClaim(bountyId) → FHE fee calculation (2% of encrypted amount) → confidentialTransfer(amount - fee) to developer → bounty status: Verified → Claimed" />
              </div>
            </Card>

            <Card title="Smart contracts">
              <div className="space-y-2 text-xs text-blue-300/40">
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Bounty contract</span>
                  <code className="text-cyan-400/70 text-[11px]">GhostBounty.sol</code>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Token contract</span>
                  <code className="text-cyan-400/70 text-[11px]">ConfidentialUSDC.sol</code>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Network</span>
                  <span className="text-white">Sepolia Testnet</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Protocol fee</span>
                  <span className="text-white">2% (max 5%)</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Source timelock</span>
                  <span className="text-white">48 hours</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Admin timelock</span>
                  <span className="text-white">24 hours</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Registration cooldown</span>
                  <span className="text-white">7 days</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02]">
                  <span>Pending timeout</span>
                  <span className="text-white">7 days (emergency cancel)</span>
                </div>
              </div>
            </Card>

            <Card title="Bounty status lifecycle">
              <div className="space-y-3 text-xs text-blue-300/40">
                <p className="leading-relaxed">Bounties follow a strict state machine with 5 statuses:</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { status: "Active", color: "text-green-400 bg-green-500/10 border-green-500/20" },
                    { status: "Pending", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                    { status: "Verified", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
                    { status: "Claimed", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
                    { status: "Cancelled", color: "text-red-400 bg-red-500/10 border-red-500/20" },
                  ].map((s) => (
                    <div key={s.status} className={`text-center p-2 rounded-lg border text-[10px] font-bold ${s.color}`}>{s.status}</div>
                  ))}
                </div>
                <ul className="space-y-1.5 mt-2">
                  <li><span className="text-white">Active → Pending</span> — developer calls claimBounty, Chainlink request sent</li>
                  <li><span className="text-white">Pending → Verified</span> — Chainlink confirms PR is merged</li>
                  <li><span className="text-white">Verified → Claimed</span> — executeClaim transfers encrypted payment</li>
                  <li><span className="text-white">Pending → Active</span> — Chainlink verification fails, bounty reopens</li>
                  <li><span className="text-white">Active → Cancelled</span> — creator cancels, cUSDC returned</li>
                  <li><span className="text-white">Pending/Verified → Cancelled</span> — emergency cancel after 7-day timeout</li>
                </ul>
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
                <Feature title="Identity verification via Chainlink" desc="Developers must prove GitHub ownership through a public gist. Chainlink Functions verifies the gist belongs to the claimed username and contains the caller's ETH address. A 7-day cooldown prevents re-registration spam." />
                <Feature title="Bounty status machine" desc="Bounties have 5 states: Active, Pending, Verified, Claimed, Cancelled. Only one Chainlink verification can run at a time per bounty, preventing race conditions." />
                <Feature title="48-hour timelock on code changes" desc="The JavaScript source code executed by Chainlink nodes cannot be changed instantly. Any modification requires a 48-hour delay, giving users time to verify and exit." />
                <Feature title="24-hour timelock on fee changes" desc="Protocol fee (max 5%) and treasury address changes require 24 hours to take effect." />
                <Feature title="Input sanitization" desc="Repository names are validated on-chain: alphanumeric, dash, underscore, and dot only, max 100 characters. GitHub usernames are normalized to lowercase, max 39 characters." />
                <Feature title="Rate limiting" desc="Claim cooldowns prevent spam: 2-minute cooldown per developer, 10-minute cooldown per bounty between claim attempts." />
                <Feature title="Emergency cancel" desc="If a bounty is stuck in Pending or Verified for 7 days (e.g. Chainlink callback failure), the creator can emergency-cancel to recover escrowed funds." />
                <Feature title="FHE access control" desc="Encrypted bounty amounts are only accessible to the bounty creator and the developer who claimed it. Fee calculations happen entirely in FHE." />
                <Feature title="Reentrancy protection" desc="All state-changing functions use OpenZeppelin's ReentrancyGuard." />
                <Feature title="Emergency pause" desc="The contract can be paused by the owner in case of a discovered vulnerability." />
                <Feature title="Secrets expiration" desc="Chainlink DON-hosted secrets have an expiration timestamp. The contract blocks new claims and registrations when secrets are expired." />
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
                <FAQ q="Can I cancel a bounty?" a="Yes. You can cancel any Active bounty instantly. If a bounty is stuck in Pending or Verified status (e.g. Chainlink callback failed), you can use emergency cancel after 7 days. In both cases, the escrowed cUSDC is returned to your wallet." />
                <FAQ q="Can I have multiple bounties on the same issue?" a="No. One bounty per issue to avoid confusion. Cancel the existing one first if you want to change the amount." />
                <FAQ q="What happens if nobody claims my bounty?" a="Nothing — the funds stay in escrow. You can cancel and retrieve them at any time." />
                <FAQ q="What are the repo name restrictions?" a="Repository owner and name must be 1-100 characters, using only letters, numbers, dashes, underscores, and dots. They are normalized to lowercase on-chain." />
              </div>
            </Card>

            <Card title="For developers">
              <div className="space-y-4">
                <FAQ q="Why do I need to create a gist?" a="The gist proves you own the GitHub account. Without it, someone could register your GitHub username and steal your bounty payments. Chainlink verifies the gist belongs to you." />
                <FAQ q="How long does verification take?" a="Chainlink Functions typically responds within 1-2 minutes. Both identity verification (gist) and bounty claim verification follow this timeline." />
                <FAQ q="What if my PR is merged but the claim fails?" a="The bounty reverts to 'Active' status if verification fails. Common reasons: PR doesn't reference the issue, your GitHub username isn't registered, or Chainlink secrets expired. You can try again after the 10-minute bounty cooldown." />
                <FAQ q="Can I claim a bounty from any GitHub account?" a="You can only claim bounties where YOU authored the merged PR. Chainlink checks the PR author matches your registered GitHub username." />
                <FAQ q="Can I re-register with a different GitHub account?" a="Yes, but there is a 7-day cooldown between registrations. This prevents abuse of the identity system." />
                <FAQ q="What is the executeClaim step?" a="After Chainlink verifies your PR (status: Verified), a separate executeClaim transaction transfers the encrypted payment. The app calls this automatically, but anyone can call it — it's permissionless." />
                <FAQ q="Does the app auto-detect my claimable bounties?" a="Yes. The Claim tab automatically scans active bounties for merged PRs from your GitHub account, so you don't need to manually enter bounty IDs." />
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
