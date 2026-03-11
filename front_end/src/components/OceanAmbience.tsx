"use client";

import { useRef, useEffect } from "react";
import { useAmbience } from "./AmbienceContext";

/**
 * Chill lo-fi casino ambience using Web Audio API.
 * Smooth jazz chords, soft vinyl crackle, mellow vibraphone,
 * and gentle coin chimes. Easy on the ears.
 */
export function OceanAmbience() {
  const { soundOn, musicVolume } = useAmbience();
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!soundOn) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    stoppedRef.current = false;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    masterRef.current = master;

    // Global lowpass to keep everything mellow
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 2200;
    lpf.Q.value = 0.3;
    lpf.connect(master);

    const sources: AudioScheduledSourceNode[] = [];

    function noteFreq(note: number) {
      return 440 * Math.pow(2, (note - 69) / 12);
    }

    function makeNoise(len: number) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    // ── Layer 1: Warm jazz pad chords ──
    // Smooth maj7/min7 progression, very slow
    const chords = [
      [60, 64, 67, 71], // Cmaj7
      [65, 69, 72, 76], // Fmaj7
      [62, 65, 69, 72], // Dm7
      [67, 71, 74, 77], // G7
    ];
    const chordDur = 4.0; // seconds per chord
    const progLen = chords.length * chordDur;

    function schedulePad(startTime: number) {
      if (stoppedRef.current) return;

      chords.forEach((chord, ci) => {
        const t = startTime + ci * chordDur;
        chord.forEach((note) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(noteFreq(note), t);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(0.025, t + 0.8);
          env.gain.setValueAtTime(0.025, t + chordDur - 1.0);
          env.gain.linearRampToValueAtTime(0, t + chordDur);
          osc.connect(env);
          env.connect(lpf);
          osc.start(t);
          osc.stop(t + chordDur + 0.1);
          sources.push(osc);
        });
      });

      const next = startTime + progLen;
      const delay = (next - ctx.currentTime) * 1000 - 500;
      setTimeout(() => schedulePad(next), Math.max(delay, 100));
    }

    // ── Layer 2: Soft vibraphone melody ──
    // Gentle pentatonic, lots of space
    const melodyPattern = [
      67, -1, 72, -1, -1, 71, -1, -1,
      69, -1, -1, 67, -1, 64, -1, -1,
      65, -1, 69, -1, -1, 67, -1, -1,
      64, -1, -1, 60, -1, -1, -1, -1,
    ];
    const melBeat = 0.5;
    const melLen = melodyPattern.length * melBeat;

    function scheduleMelody(startTime: number) {
      if (stoppedRef.current) return;

      melodyPattern.forEach((note, i) => {
        if (note < 0) return;
        const t = startTime + i * melBeat;
        // Sine + slight vibrato for vibraphone feel
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(noteFreq(note), t);
        // Gentle vibrato
        const vib = ctx.createOscillator();
        vib.type = "sine";
        vib.frequency.value = 5;
        const vibG = ctx.createGain();
        vibG.gain.value = 1.5;
        vib.connect(vibG);
        vibG.connect(osc.frequency);
        vib.start(t);
        vib.stop(t + 2);
        sources.push(vib);

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.04, t + 0.03);
        env.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
        osc.connect(env);
        env.connect(lpf);
        osc.start(t);
        osc.stop(t + 2);
        sources.push(osc);
      });

      const next = startTime + melLen;
      const delay = (next - ctx.currentTime) * 1000 - 500;
      setTimeout(() => scheduleMelody(next), Math.max(delay, 100));
    }

    // ── Layer 3: Mellow bass (deep sine) ──
    const bassNotes = [48, -1, -1, -1, 53, -1, -1, -1, 50, -1, -1, -1, 55, -1, -1, -1];
    const bassBeat = 1.0;
    const bassLen = bassNotes.length * bassBeat;

    function scheduleBass(startTime: number) {
      if (stoppedRef.current) return;

      bassNotes.forEach((note, i) => {
        if (note < 0) return;
        const t = startTime + i * bassBeat;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(noteFreq(note), t);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.06, t + 0.05);
        env.gain.setValueAtTime(0.05, t + bassBeat * 0.6);
        env.gain.linearRampToValueAtTime(0, t + bassBeat * 0.95);
        osc.connect(env);
        env.connect(lpf);
        osc.start(t);
        osc.stop(t + bassBeat);
        sources.push(osc);
      });

      const next = startTime + bassLen;
      const delay = (next - ctx.currentTime) * 1000 - 500;
      setTimeout(() => scheduleBass(next), Math.max(delay, 100));
    }

    // ── Layer 4: Vinyl crackle ──
    const crackle = ctx.createBufferSource();
    crackle.buffer = makeNoise(4);
    crackle.loop = true;
    const crackleHP = ctx.createBiquadFilter();
    crackleHP.type = "highpass";
    crackleHP.frequency.value = 1000;
    const crackleLP = ctx.createBiquadFilter();
    crackleLP.type = "lowpass";
    crackleLP.frequency.value = 3000;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.008;
    crackle.connect(crackleHP);
    crackleHP.connect(crackleLP);
    crackleLP.connect(crackleGain);
    crackleGain.connect(master);
    crackle.start();
    sources.push(crackle);

    // ── Layer 5: Occasional soft coin chime ──
    function scheduleChime() {
      if (stoppedRef.current) return;
      const delay = 5000 + Math.random() * 10000; // every 5-15s
      setTimeout(() => {
        if (stoppedRef.current) return;
        const now = ctx.currentTime;
        // Soft bell-like tone
        const notes = [72, 76];
        notes.forEach((n, i) => {
          const t = now + i * 0.15;
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(noteFreq(n), t);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.02, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
          osc.connect(g);
          g.connect(lpf);
          osc.start(t);
          osc.stop(t + 1.3);
          sources.push(osc);
        });
        scheduleChime();
      }, delay);
    }

    // ── Start ──
    const t0 = ctx.currentTime + 0.1;
    schedulePad(t0);
    scheduleMelody(t0);
    scheduleBass(t0);
    scheduleChime();

    // Slow fade in — scale by musicVolume (0-100)
    const targetGain = 0.55 * (musicVolume / 100);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 3);

    return () => {
      stoppedRef.current = true;
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      setTimeout(() => {
        sources.forEach((n) => {
          try { n.stop(); } catch {}
        });
        ctx.close();
      }, 1200);
    };
  }, [soundOn]);

  // Live-update music volume without restarting audio
  useEffect(() => {
    if (masterRef.current && ctxRef.current && ctxRef.current.state !== "closed") {
      const targetGain = 0.55 * (musicVolume / 100);
      masterRef.current.gain.linearRampToValueAtTime(targetGain, ctxRef.current.currentTime + 0.3);
    }
  }, [musicVolume]);

  return null;
}
