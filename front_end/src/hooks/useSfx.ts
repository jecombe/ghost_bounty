"use client";

import { useCallback, useRef } from "react";
import { useAmbience } from "@/components/AmbienceContext";

/**
 * Synthesized UI sound effects using Web Audio API.
 * Each action has a distinct sound character.
 */

type SfxType =
  | "click"          // generic button click
  | "tab"            // tab switch
  | "createBounty"   // create bounty action
  | "claim"          // claim bounty action
  | "verify"         // verify gist / identity
  | "cancel"         // cancel bounty
  | "shield"         // shield / unshield USDC
  | "execute"        // execute claim payment
  | "connect"        // connect wallet / sign in
  | "success"        // success feedback
  | "error";         // error feedback

function noteFreq(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function playSfx(ctx: AudioContext, dest: GainNode, type: SfxType) {
  const t = ctx.currentTime;

  switch (type) {
    case "click": {
      // Short crisp click - high pitched tick
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.1);
      break;
    }

    case "tab": {
      // Soft whoosh / slide
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.15);
      break;
    }

    case "createBounty": {
      // Ascending arpeggio - hopeful, creation feeling
      const notes = [60, 64, 67, 72]; // C major arpeggio
      notes.forEach((n, i) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(noteFreq(n), t + i * 0.08);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.08);
        g.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
        osc.connect(g).connect(dest);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.35);
      });
      break;
    }

    case "claim": {
      // Deep resonant coin grab - two tones descending with reverb
      [72, 67].forEach((n, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(noteFreq(n), t + i * 0.12);
        const osc2 = ctx.createOscillator();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(noteFreq(n) * 2, t + i * 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.15, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.06, t + i * 0.12);
        g2.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
        osc.connect(g).connect(dest);
        osc2.connect(g2).connect(dest);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.55);
        osc2.start(t + i * 0.12);
        osc2.stop(t + i * 0.12 + 0.45);
      });
      break;
    }

    case "verify": {
      // Digital verification beep sequence - 3 quick ascending pings
      [76, 79, 84].forEach((n, i) => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(noteFreq(n), t + i * 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, t + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.12);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2000;
        osc.connect(lp).connect(g).connect(dest);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.15);
      });
      break;
    }

    case "cancel": {
      // Descending two-tone - minor feel
      [69, 65].forEach((n, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(noteFreq(n), t + i * 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.07, t + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.15);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1500;
        osc.connect(lp).connect(g).connect(dest);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.2);
      });
      break;
    }

    case "shield": {
      // Wobbly encryption sound - FM synthesis sweep
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.setValueAtTime(300, t);
      carrier.frequency.exponentialRampToValueAtTime(800, t + 0.2);
      carrier.frequency.exponentialRampToValueAtTime(400, t + 0.4);
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(20, t);
      mod.frequency.linearRampToValueAtTime(80, t + 0.3);
      const modG = ctx.createGain();
      modG.gain.value = 150;
      mod.connect(modG).connect(carrier.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      carrier.connect(g).connect(dest);
      carrier.start(t);
      carrier.stop(t + 0.5);
      mod.start(t);
      mod.stop(t + 0.5);
      break;
    }

    case "execute": {
      // Powerful confirmation - chord hit + shimmer
      [60, 64, 67, 72].forEach((n) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(noteFreq(n), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(g).connect(dest);
        osc.start(t);
        osc.stop(t + 0.65);
      });
      // Shimmer
      const shimmer = ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(noteFreq(84), t + 0.1);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(0.06, t + 0.15);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      shimmer.connect(sg).connect(dest);
      shimmer.start(t);
      shimmer.stop(t + 0.85);
      break;
    }

    case "connect": {
      // Upward slide + ping - connection established
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(1000, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.3);
      // Ping
      const ping = ctx.createOscillator();
      ping.type = "sine";
      ping.frequency.setValueAtTime(noteFreq(79), t + 0.18);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.12, t + 0.18);
      pg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      ping.connect(pg).connect(dest);
      ping.start(t + 0.18);
      ping.stop(t + 0.55);
      break;
    }

    case "success": {
      // Happy major chord ascending
      [60, 64, 67, 72, 76].forEach((n, i) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(noteFreq(n), t + i * 0.06);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.1, t + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.4);
        osc.connect(g).connect(dest);
        osc.start(t + i * 0.06);
        osc.stop(t + i * 0.06 + 0.45);
      });
      break;
    }

    case "error": {
      // Buzzy low error tone
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.linearRampToValueAtTime(100, t + 0.2);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(lp).connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.35);
      break;
    }
  }
}

export function useSfx() {
  const { sfxVolume } = useAmbience();
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const play = useCallback((type: SfxType) => {
    if (sfxVolume <= 0) return;

    try {
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = new AudioContext();
        masterRef.current = ctxRef.current.createGain();
        masterRef.current.connect(ctxRef.current.destination);
      }

      const ctx = ctxRef.current;
      const master = masterRef.current!;
      master.gain.value = sfxVolume / 100;

      if (ctx.state === "suspended") {
        ctx.resume().then(() => playSfx(ctx, master, type));
      } else {
        playSfx(ctx, master, type);
      }
    } catch {}
  }, [sfxVolume]);

  return { play };
}
