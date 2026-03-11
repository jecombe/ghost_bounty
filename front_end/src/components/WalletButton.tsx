"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none" as const,
                userSelect: "none" as const,
              },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                type="button"
                className="relative flex items-center gap-2 px-4 py-2 rounded-lg font-black text-[11px] uppercase tracking-[0.15em] bg-gradient-to-r from-amber-600 to-yellow-500 text-black shadow-lg shadow-amber-900/30 hover:shadow-amber-700/40 hover:scale-[1.03] active:scale-[0.97] transition-all border border-amber-400/20 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
                </svg>
                Connect
              </button>
            ) : chain.unsupported ? (
              <button
                onClick={openChainModal}
                type="button"
                className="flex items-center gap-2 px-3 py-2 rounded-lg font-black text-[11px] uppercase tracking-[0.12em] bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Wrong Network
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* Chain pill */}
                <button
                  onClick={openChainModal}
                  type="button"
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 hover:bg-white/10 transition-all group cursor-pointer"
                  title={chain.name}
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <img
                      src={chain.iconUrl}
                      alt={chain.name}
                      className="w-3.5 h-3.5 rounded-full"
                    />
                  )}
                  <svg className="w-2.5 h-2.5 text-blue-300/30 group-hover:text-blue-300/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Account button */}
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-cyan-900/20 hover:bg-white/10 hover:border-cyan-800/40 transition-all group cursor-pointer"
                >
                  {/* Avatar circle */}
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-[9px] font-black text-black shadow-sm shadow-amber-900/30 shrink-0">
                    {account.displayName.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Address */}
                  <span className="text-[11px] font-bold font-mono text-blue-200/70 group-hover:text-white transition-colors hidden sm:block">
                    {account.displayName}
                  </span>

                  {/* Chevron */}
                  <svg className="w-2.5 h-2.5 text-blue-300/30 group-hover:text-blue-300/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
