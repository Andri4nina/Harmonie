// Lecture d'un projet de séquenceur. Les notes sont planifiées un peu en
// avance sur l'horloge audio (fenêtre de 150 ms relue toutes les 25 ms) :
// le rythme reste exact même si l'interface est occupée, et une note ajoutée
// pendant la lecture est entendue au tour suivant de la boucle.

import { useEffect, useRef, useState } from "react";
import { useSettings } from "../state/store";
import { midiToFrequency } from "../theory/engine";
import type { Project } from "../theory/compose";
import { audio, click, stop as stopOthers } from "./synth";
import { type Voice, startVoice } from "./voices";

const LOOKAHEAD = 0.15;
const TICK_MS = 25;

interface Running {
  /** Temps audio et position (en temps) du dernier ancrage. */
  originTime: number;
  originBeat: number;
  bpm: number;
  /** Position jusqu'où les notes sont planifiées, en temps « déroulés ». */
  cursor: number;
  timer: ReturnType<typeof setInterval>;
  bus: GainNode;
  voices: Set<Voice>;
}

let running: Running | undefined;
let getProject: () => Project = () => ({ bpm: 120, beats_per_bar: 4, bars: 1, tracks: [] });
let options = { loop: true, metronome: false };
let onEnd: (() => void) | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function length(project: Project): number {
  return Math.max(1, project.bars) * project.beats_per_bar;
}

/** Position déroulée → position dans le morceau (la boucle revient au début). */
function wrap(beat: number, total: number): number {
  return options.loop ? ((beat % total) + total) % total : beat;
}

function audible(project: Project): boolean[] {
  const solo = project.tracks.some((track) => track.solo);
  return project.tracks.map((track) => !track.muted && (!solo || Boolean(track.solo)));
}

function schedule(): void {
  if (!running) return;
  const { ctx } = audio();
  const project = getProject();
  const total = length(project);
  // Changement de tempo pendant la lecture : on réancre sans saut.
  if (project.bpm !== running.bpm) {
    const now = linearBeat(ctx.currentTime);
    running.originTime = ctx.currentTime;
    running.originBeat = now;
    running.cursor = Math.max(running.cursor, now);
    running.bpm = project.bpm;
  }
  const until = linearBeat(ctx.currentTime + LOOKAHEAD);
  if (!options.loop && running.cursor >= total) {
    if (linearBeat(ctx.currentTime) >= total) {
      stopSequencer();
      onEnd?.();
    }
    return;
  }
  const seconds = 60 / running.bpm;
  const a4 = useSettings.getState().a4;
  const playable = audible(project);
  let from = running.cursor;
  while (from < until) {
    // Découpe la fenêtre aux limites de la boucle.
    const songFrom = wrap(from, total);
    const segment = Math.min(until - from, (options.loop ? total : Infinity) - songFrom);
    const songTo = songFrom + segment;
    const timeOf = (songBeat: number) => running!.originTime + (from + (songBeat - songFrom) - running!.originBeat) * seconds;
    project.tracks.forEach((track, index) => {
      if (!playable[index]) return;
      const gain = track.volume * 0.42;
      for (const note of track.notes) {
        if (note.beat < songFrom || note.beat >= songTo || note.beat >= total) continue;
        const start = timeOf(note.beat);
        const voice = startVoice(ctx, running!.bus, track.sound, note.midi, midiToFrequency(note.midi, a4), start, gain * (note.velocity / 127));
        voice.release(start + note.length * seconds * 0.96);
        running!.voices.add(voice);
      }
    });
    if (options.metronome) {
      for (let beat = Math.ceil(songFrom - 1e-9); beat < songTo; beat++) click(ctx, running.bus, timeOf(beat), beat % project.beats_per_bar === 0);
    }
    from += segment;
    if (!options.loop) break;
  }
  running.cursor = until;
  if (running.voices.size > 600) running.voices.clear();
}

function linearBeat(time: number): number {
  if (!running) return 0;
  return running.originBeat + ((time - running.originTime) * running.bpm) / 60;
}

/** Lance la lecture depuis `beat` ; `project` est relu à chaque planification. */
export async function startSequencer(project: () => Project, beat: number, ended?: () => void): Promise<void> {
  stopSequencer();
  stopOthers();
  getProject = project;
  onEnd = ended;
  const { ctx, out } = audio();
  // Horloge audio suspendue (avant le premier geste) : on attend qu'elle
  // tourne, sinon la tête de lecture resterait figée.
  if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
  const bus = ctx.createGain();
  bus.connect(out);
  const origin = ctx.currentTime + 0.05;
  running = { originTime: origin, originBeat: beat, bpm: project().bpm, cursor: beat, timer: setInterval(schedule, TICK_MS), bus, voices: new Set() };
  schedule();
  notify();
  startFrames();
}

export function stopSequencer(): void {
  if (!running) return;
  const { ctx } = audio();
  clearInterval(running.timer);
  const { bus } = running;
  bus.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
  setTimeout(() => bus.disconnect(), 250);
  running = undefined;
  notify();
  stopFrames();
}

export function setSequencerOptions(next: Partial<typeof options>): void {
  options = { ...options, ...next };
}

export function isSequencerPlaying(): boolean {
  return running !== undefined;
}

/** Position de lecture dans le morceau, en temps, ou `null` à l'arrêt. */
export function sequencerPosition(): number | null {
  if (!running) return null;
  const { ctx } = audio();
  // Ce qu'on entend sort des haut-parleurs un peu après l'horloge audio :
  // la tête de lecture suit le son entendu, pas le son calculé.
  const latency = ctx.outputLatency || ctx.baseLatency || 0;
  const beat = linearBeat(ctx.currentTime - latency);
  if (beat < running.originBeat) return running.originBeat;
  return wrap(beat, length(getProject()));
}

/** Vrai pendant la lecture ; suit les départs et arrêts. */
export function useSequencerPlaying(): boolean {
  const [playing, setPlaying] = useState(isSequencerPlaying);
  useEffect(() => {
    const listener = () => setPlaying(isSequencerPlaying());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return playing;
}

// ------------------------------------------------------------ tête de lecture

const frameListeners = new Set<(position: number | null) => void>();
let frame = 0;

function startFrames(): void {
  if (frame || frameListeners.size === 0) return;
  const tick = () => {
    const position = sequencerPosition();
    for (const listener of frameListeners) listener(position);
    frame = running ? requestAnimationFrame(tick) : 0;
  };
  frame = requestAnimationFrame(tick);
}

function stopFrames(): void {
  cancelAnimationFrame(frame);
  frame = 0;
  for (const listener of frameListeners) listener(null);
}

/**
 * Suit la tête de lecture à chaque image, sans rendu React : `listener`
 * déplace directement l'élément (trait, case, compteur). Renvoie l'arrêt.
 */
export function onPlayhead(listener: (position: number | null) => void): () => void {
  frameListeners.add(listener);
  listener(sequencerPosition());
  if (running) startFrames();
  return () => {
    frameListeners.delete(listener);
    if (frameListeners.size === 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** Comme `onPlayhead`, pour un composant ; `listener` peut changer à chaque rendu. */
export function usePlayhead(listener: (position: number | null) => void): void {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => onPlayhead((position) => latest.current(position)), []);
}

/** Position de lecture rafraîchie à chaque image, ou `null` à l'arrêt. */
export function useSequencerPosition(): number | null {
  const playing = useSequencerPlaying();
  const [position, setPosition] = useState<number | null>(null);
  useEffect(() => {
    if (!playing) {
      setPosition(null);
      return;
    }
    let frame = 0;
    const tick = () => {
      setPosition(sequencerPosition());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return position;
}
