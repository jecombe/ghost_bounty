"use client";

import { createContext, useContext, useState, useCallback, type ReactNode, useEffect } from "react";

type TimeMode = "auto" | "manual";

interface AmbienceState {
  soundOn: boolean;
  toggleSound: () => void;
  musicVolume: number;
  sfxVolume: number;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  timeMode: TimeMode;
  manualHour: number;
  setTimeMode: (mode: TimeMode) => void;
  setManualHour: (hour: number) => void;
  getCurrentHour: () => number;
}

const STORAGE_KEY_MUSIC = "fortune-music-volume";
const STORAGE_KEY_SFX = "fortune-sfx-volume";

const AmbienceContext = createContext<AmbienceState | null>(null);

export function AmbienceProvider({ children }: { children: ReactNode }) {
  const [soundOn, setSoundOn] = useState(true);
  const [musicVolume, setMusicVolumeState] = useState(80);
  const [sfxVolume, setSfxVolumeState] = useState(80);
  const [timeMode, setTimeMode] = useState<TimeMode>("auto");
  const [manualHour, setManualHour] = useState(() => new Date().getHours());

  // Load saved volumes from localStorage
  useEffect(() => {
    try {
      const savedMusic = localStorage.getItem(STORAGE_KEY_MUSIC);
      const savedSfx = localStorage.getItem(STORAGE_KEY_SFX);
      if (savedMusic !== null) setMusicVolumeState(Number(savedMusic));
      if (savedSfx !== null) setSfxVolumeState(Number(savedSfx));
    } catch {}
  }, []);

  const setMusicVolume = useCallback((v: number) => {
    setMusicVolumeState(v);
    try { localStorage.setItem(STORAGE_KEY_MUSIC, String(v)); } catch {}
  }, []);

  const setSfxVolume = useCallback((v: number) => {
    setSfxVolumeState(v);
    try { localStorage.setItem(STORAGE_KEY_SFX, String(v)); } catch {}
  }, []);

  const toggleSound = useCallback(() => setSoundOn((p) => !p), []);

  const getCurrentHour = useCallback(() => {
    return timeMode === "auto" ? new Date().getHours() : manualHour;
  }, [timeMode, manualHour]);

  return (
    <AmbienceContext.Provider
      value={{ soundOn, toggleSound, musicVolume, sfxVolume, setMusicVolume, setSfxVolume, timeMode, manualHour, setTimeMode, setManualHour, getCurrentHour }}
    >
      {children}
    </AmbienceContext.Provider>
  );
}

export function useAmbience() {
  const ctx = useContext(AmbienceContext);
  if (!ctx) throw new Error("useAmbience must be used within AmbienceProvider");
  return ctx;
}
