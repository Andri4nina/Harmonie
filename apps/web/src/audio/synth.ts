// Synthèse sonore en Web Audio : aucune ressource à télécharger, fonctionne
// hors ligne. Toute la planification se fait sur l'horloge audio
// (AudioContext.currentTime) ; l'affichage la suit, jamais l'inverse.

import { usePlayer, useSettings } from "../state/store";
import { type PlayMode, midiToFrequency } from "../theory/engine";

let context: AudioContext | undefined;
let master: GainNode | undefined;
let analyser: AnalyserNode | undefined;

/** Analyseur branché sur la sortie, disponible après le premier son joué. */
export function getAnalyser(): AnalyserNode | undefined {
  return analyser;
}

function audio(): { ctx: AudioContext; out: GainNode } {
  if (!context || !master) {
    context = new AudioContext();
    const compressor = context.createDynamicsCompressor();
    master = context.createGain();
    master.gain.value = 0.9;
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    master.connect(compressor).connect(analyser).connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return { ctx: context, out: master };
}

/** Une note : deux oscillateurs, un filtre passe-bas, une enveloppe. */
function voice(
  ctx: AudioContext,
  out: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  level: number,
): void {
  const envelope = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(6000, frequency * 6), start);
  filter.frequency.exponentialRampToValueAtTime(Math.min(3000, frequency * 3), start + duration);
  filter.Q.value = 0.7;

  const attack = 0.008;
  const release = 0.28;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(level, start + attack);
  envelope.gain.exponentialRampToValueAtTime(level * 0.55, start + Math.min(0.25, duration));
  envelope.gain.setValueAtTime(level * 0.55, start + duration);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);

  const partials: [OscillatorType, number, number][] = [
    ["triangle", 1, 1],
    ["sine", 2, 0.18],
  ];
  for (const [type, ratio, gain] of partials) {
    const oscillator = ctx.createOscillator();
    const partial = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency * ratio;
    partial.gain.value = gain;
    oscillator.connect(partial).connect(filter);
    oscillator.start(start);
    oscillator.stop(start + duration + release + 0.05);
  }
  filter.connect(envelope).connect(out);
}

const TIMING: Record<PlayMode, { step: number; hold: number }> = {
  melodic: { step: 0.36, hold: 0.5 },
  harmonic: { step: 2.0, hold: 1.8 },
  sequence: { step: 1.1, hold: 1.0 },
};

let current: { bus: GainNode; frame: number } | undefined;

export function stop(): void {
  if (current && context) {
    cancelAnimationFrame(current.frame);
    const { bus } = current;
    bus.gain.cancelScheduledValues(context.currentTime);
    bus.gain.setTargetAtTime(0, context.currentTime, 0.02);
    setTimeout(() => bus.disconnect(), 200);
    current = undefined;
  }
  usePlayer.setState({ active: [], step: null, playingId: null });
}

/**
 * Joue une suite de pas. `id` identifie ce qui est joué pour que l'interface
 * sache quel bouton est actif.
 */
export function play(steps: number[][], mode: PlayMode, id: string): void {
  stop();
  if (steps.length === 0) return;
  const { ctx, out } = audio();
  const a4 = useSettings.getState().a4;
  const timing = TIMING[mode];
  const bus = ctx.createGain();
  bus.connect(out);
  const origin = ctx.currentTime + 0.06;

  steps.forEach((notes, index) => {
    const level = 0.32 / Math.sqrt(notes.length);
    notes.forEach((midi, position) => {
      // Léger égrené des accords, du grave vers l'aigu.
      const strum = notes.length > 1 ? position * 0.014 : 0;
      voice(ctx, bus, midiToFrequency(midi, a4), origin + index * timing.step + strum, timing.hold, level);
    });
  });

  const total = (steps.length - 1) * timing.step + timing.hold + 0.3;
  const follow = () => {
    const elapsed = ctx.currentTime - origin;
    if (elapsed >= total) {
      stop();
      return;
    }
    const index = Math.min(steps.length - 1, Math.max(0, Math.floor(elapsed / timing.step)));
    const sounding = elapsed >= 0 && elapsed - index * timing.step <= timing.hold;
    const state = usePlayer.getState();
    const step = sounding ? index : null;
    if (state.step !== step || state.playingId !== id) {
      usePlayer.setState({ active: sounding ? (steps[index] ?? []) : [], step, playingId: id });
    }
    if (current) current.frame = requestAnimationFrame(follow);
  };
  current = { bus, frame: requestAnimationFrame(follow) };
}

export function playNote(midi: number): void {
  play([[midi]], "melodic", `midi:${midi}`);
}
