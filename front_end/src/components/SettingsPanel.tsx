"use client";

import { useState, useRef, useEffect } from "react";
import { useAmbience } from "./AmbienceContext";

const HOUR_LABELS = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
];

const PHASE_EMOJI: Record<string, string> = {
  night: "🌙", dawn: "🌅", morning: "☀️", day: "🌞",
  afternoon: "⛅", sunset: "🌇", dusk: "🌆",
};

function getPhaseLabel(hour: number): string {
  if (hour >= 22 || hour < 5) return "night";
  if (hour >= 5 && hour < 6) return "dawn";
  if (hour >= 6 && hour < 9) return "morning";
  if (hour >= 9 && hour < 15) return "day";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 20) return "sunset";
  return "dusk";
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { soundOn, toggleSound, musicVolume, sfxVolume, setMusicVolume, setSfxVolume, timeMode, manualHour, setTimeMode, setManualHour } = useAmbience();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentPhase = getPhaseLabel(timeMode === "auto" ? new Date().getHours() : manualHour);

  return (
    <div className="relative" ref={panelRef}>
      {/* Gear button */}
      <button
        onClick={() => setOpen(!open)}
        className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors group ${open ? "bg-white/5" : ""}`}
        title="Settings"
      >
        <svg
          className={`w-5 h-5 transition-all ${open ? "text-cyan-400 rotate-90" : "text-blue-300/40"} group-hover:text-cyan-300`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Panel dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 panel-military rounded-xl border border-cyan-900/20 shadow-2xl shadow-black/50 z-[100] overflow-hidden tx-modal-enter">
          <div className="px-4 py-3 border-b border-cyan-900/15">
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-300/50">Ambience</h3>
          </div>

          <div className="p-4 space-y-5">
            {/* Sound toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-300/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                  {soundOn && (
                    <>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728" />
                    </>
                  )}
                </svg>
                <span className="text-sm text-blue-100/80">Sound</span>
              </div>
              <button
                onClick={toggleSound}
                className={`relative w-10 h-5 rounded-full transition-colors ${soundOn ? "bg-cyan-600" : "bg-white/10"}`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${soundOn ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </div>

            {/* Volume sliders (only when sound is on) */}
            {soundOn && (
              <div className="space-y-3 pl-6">
                {/* Music volume */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-blue-300/50 font-medium">Music</span>
                    <span className="text-[10px] font-mono text-cyan-400/60">{musicVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/30"
                  />
                </div>
                {/* SFX volume */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-blue-300/50 font-medium">Effects</span>
                    <span className="text-[10px] font-mono text-cyan-400/60">{sfxVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={sfxVolume}
                    onChange={(e) => setSfxVolume(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/30"
                  />
                </div>
              </div>
            )}

            {/* Time mode */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-300/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M12 6v6l4 2" />
                  </svg>
                  <span className="text-sm text-blue-100/80">Time of Day</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-400/60 uppercase">
                  {PHASE_EMOJI[currentPhase]} {currentPhase}
                </span>
              </div>

              {/* Auto / Manual toggle */}
              <div className="flex rounded-lg overflow-hidden border border-cyan-900/20">
                <button
                  onClick={() => setTimeMode("auto")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    timeMode === "auto"
                      ? "bg-cyan-600/20 text-cyan-300 border-r border-cyan-900/20"
                      : "text-blue-300/40 hover:text-white hover:bg-white/5 border-r border-cyan-900/20"
                  }`}
                >
                  Auto
                </button>
                <button
                  onClick={() => setTimeMode("manual")}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    timeMode === "manual"
                      ? "bg-cyan-600/20 text-cyan-300"
                      : "text-blue-300/40 hover:text-white hover:bg-white/5"
                  }`}
                >
                  Manual
                </button>
              </div>

              {/* Hour slider (only in manual mode) */}
              {timeMode === "manual" && (
                <div className="space-y-2">
                  <input
                    type="range"
                    min={0}
                    max={23}
                    step={1}
                    value={manualHour}
                    onChange={(e) => setManualHour(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/30"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-blue-300/30">
                    <span>00:00</span>
                    <span className="text-cyan-400/70 font-bold">{HOUR_LABELS[manualHour]}</span>
                    <span>23:00</span>
                  </div>
                  {/* Quick time presets */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { h: 5, label: "Dawn", emoji: "🌅" },
                      { h: 7, label: "Morning", emoji: "☀️" },
                      { h: 12, label: "Noon", emoji: "🌞" },
                      { h: 18, label: "Sunset", emoji: "🌇" },
                      { h: 21, label: "Dusk", emoji: "🌆" },
                      { h: 0, label: "Night", emoji: "🌙" },
                    ].map((preset) => (
                      <button
                        key={preset.h}
                        onClick={() => setManualHour(preset.h)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors border ${
                          manualHour === preset.h
                            ? "bg-cyan-600/20 text-cyan-300 border-cyan-500/30"
                            : "text-blue-300/40 border-cyan-900/15 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {preset.emoji} {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
