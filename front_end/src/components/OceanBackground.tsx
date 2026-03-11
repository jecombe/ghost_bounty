"use client";

import { useEffect, useState } from "react";
import { useAmbience } from "./AmbienceContext";

type TimePhase = "night" | "dawn" | "morning" | "day" | "afternoon" | "sunset" | "dusk";

function getTimePhase(hour: number): TimePhase {
  if (hour >= 22 || hour < 5) return "night";
  if (hour >= 5 && hour < 6) return "dawn";
  if (hour >= 6 && hour < 9) return "morning";
  if (hour >= 9 && hour < 15) return "day";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 20) return "sunset";
  return "dusk";
}

interface PhaseColors {
  v1: string; // primary violet/sky
  v2: string; // mid violet
  v3: string; // deep violet
  v4: string; // darkest
  s1: string; // salmon / highlight
  s2: string; // salmon bright
  cloud: string;
  waterTop: string;
  sunScale: number; // 0-1 visibility
}

const phaseConfig: Record<TimePhase, PhaseColors> = {
  night: {
    v1: "#0a0820",
    v2: "#0e0c30",
    v3: "#08062a",
    v4: "#040418",
    s1: "#1a1040",
    s2: "#120830",
    cloud: "#1a1040",
    waterTop: "#0e0c3022",
    sunScale: 0,
  },
  dawn: {
    v1: "#5a3060",
    v2: "#3a2868",
    v3: "#2a1858",
    v4: "#1a0e40",
    s1: "#e08878",
    s2: "#d06858",
    cloud: "#d08070",
    waterTop: "#e0887844",
    sunScale: 0.4,
  },
  morning: {
    v1: "#9868a0",
    v2: "#6848a0",
    v3: "#4028a0",
    v4: "#2a1878",
    s1: "#fea798",
    s2: "#ff846e",
    cloud: "#fea798",
    waterTop: "#fea79855",
    sunScale: 0.7,
  },
  day: {
    v1: "#be91c6",
    v2: "#8a65cc",
    v3: "#5e30d9",
    v4: "#3b1895",
    s1: "#fea798",
    s2: "#ff846e",
    cloud: "#fea798",
    waterTop: "#fea79855",
    sunScale: 1,
  },
  afternoon: {
    v1: "#a880b0",
    v2: "#7858b8",
    v3: "#5028c0",
    v4: "#321888",
    s1: "#f09888",
    s2: "#e87868",
    cloud: "#e89080",
    waterTop: "#f0988844",
    sunScale: 0.85,
  },
  sunset: {
    v1: "#804070",
    v2: "#583080",
    v3: "#3a1870",
    v4: "#200e50",
    s1: "#f06848",
    s2: "#e04838",
    cloud: "#e06050",
    waterTop: "#f0684844",
    sunScale: 0.3,
  },
  dusk: {
    v1: "#302050",
    v2: "#201848",
    v3: "#180e3a",
    v4: "#0e0828",
    s1: "#804058",
    s2: "#602840",
    cloud: "#6a3850",
    waterTop: "#80405833",
    sunScale: 0.1,
  },
};

export function OceanBackground() {
  const { getCurrentHour, timeMode, manualHour } = useAmbience();
  const [phase, setPhase] = useState<TimePhase>(() => getTimePhase(getCurrentHour()));

  useEffect(() => {
    const update = () => setPhase(getTimePhase(getCurrentHour()));
    update();
    if (timeMode === "auto") {
      const interval = setInterval(update, 60_000);
      return () => clearInterval(interval);
    }
  }, [getCurrentHour, timeMode, manualHour]);

  const c = phaseConfig[phase];

  return (
    <div
      className="ts-landscape"
      style={{
        "--v1": c.v1,
        "--v2": c.v2,
        "--v3": c.v3,
        "--v4": c.v4,
        "--s1": c.s1,
        "--s2": c.s2,
        "--cloud": c.cloud,
        "--water-top": c.waterTop,
        "--sun-scale": c.sunScale,
      } as React.CSSProperties}
    >
      {/* Mountains */}
      <div className="ts-mountain" />
      <div className="ts-mountain ts-mountain-2" />
      <div className="ts-mountain ts-mountain-3" />

      {/* Sun glow overlay */}
      <div className="ts-sun-container ts-sun-container-1" />

      {/* Sun in sky */}
      <div className="ts-sun-container">
        <div className="ts-sun" />
      </div>

      {/* Clouds */}
      <div className="ts-cloud" />
      <div className="ts-cloud ts-cloud-1" />

      {/* Sun reflection in water */}
      <div className="ts-sun-container ts-sun-container-reflection">
        <div className="ts-sun" />
      </div>

      {/* Light rays on water */}
      <div className="ts-light" />
      <div className="ts-light ts-light-1" />
      <div className="ts-light ts-light-2" />
      <div className="ts-light ts-light-3" />
      <div className="ts-light ts-light-4" />
      <div className="ts-light ts-light-5" />
      <div className="ts-light ts-light-6" />
      <div className="ts-light ts-light-7" />

      {/* Water surface */}
      <div className="ts-water" />

      {/* Water splashes */}
      <div className="ts-splash" />
      <div className="ts-splash ts-delay-1" />
      <div className="ts-splash ts-delay-2" />
      <div className="ts-splash ts-splash-4 ts-delay-2" />
      <div className="ts-splash ts-splash-4 ts-delay-3" />
      <div className="ts-splash ts-splash-4 ts-delay-4" />
      <div className="ts-splash ts-splash-stone ts-delay-3" />
      <div className="ts-splash ts-splash-stone ts-splash-4" />
      <div className="ts-splash ts-splash-stone ts-splash-5" />

      {/* Lotus flowers */}
      <div className="ts-lotus ts-lotus-1" />
      <div className="ts-lotus ts-lotus-2" />
      <div className="ts-lotus ts-lotus-3" />

      {/* Foreground: stone, grass, reeds */}
      <div className="ts-front">
        <div className="ts-stone" />
        <div className="ts-grass" />
        <div className="ts-grass ts-grass-1" />
        <div className="ts-grass ts-grass-2" />
        <div className="ts-reed" />
        <div className="ts-reed ts-reed-1" />
      </div>
    </div>
  );
}
