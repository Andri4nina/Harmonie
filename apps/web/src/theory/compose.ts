// Façade typée du générateur et des exports (crates/harmonia-theory/src/compose.rs, export.rs).

import type { TimedEvent } from "../audio/synth";
import {
  compose as wasmCompose,
  pieceMidi as wasmMidi,
  pieceMusicXml as wasmMusicXml,
  piecePlayback as wasmPlayback,
  pieceProject as wasmProject,
  projectMidi as wasmProjectMidi,
} from "./pkg/harmonia_theory_wasm.js";

export type Style = "pop" | "classical" | "jazz";

export interface ComposeSettings {
  /** Tonalité, écrite comme le moteur la lit : « C », « F# minor »… */
  key: string;
  style: Style;
  bars: number;
  bpm: number;
}

export interface Piece {
  key: string;
  style: Style;
  bpm: number;
  beats_per_bar: number;
  chords: { chord: string; numeral: string; beat: number; length: number }[];
  melody: { pitch: string; midi: number; beat: number; length: number }[];
}

export function compose(settings: ComposeSettings, seed: number): Piece {
  return wasmCompose(settings, seed) as Piece;
}

export function playback(piece: Piece): TimedEvent[] {
  return wasmPlayback(piece) as TimedEvent[];
}

export function toMidi(piece: Piece): Uint8Array {
  return wasmMidi(piece);
}

export function toMusicXml(piece: Piece, title: string): string {
  return wasmMusicXml(piece, title);
}

export const STYLE_LABEL: Record<Style, { name: string; hint: string }> = {
  pop: { name: "Pop", hint: "Triades, enchaînements simples" },
  classical: { name: "Classique", hint: "Triades, sensible, accord diminué" },
  jazz: { name: "Jazz", hint: "Accords de septième, ii – V – I" },
};

/** Les 24 tonalités, majeures puis mineures, dans l'ordre du cercle des quintes. */
export const KEYS: string[] = [
  "C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F",
  "A minor", "E minor", "B minor", "F# minor", "C# minor", "G# minor", "Eb minor", "Bb minor", "F minor", "C minor", "G minor", "D minor",
];

// ------------------------------------------------------------ séquenceur
// (crates/harmonia-theory/src/project.rs)

/** Une note du rouleau de piano ; pour la batterie, `midi` est la pièce. */
export interface RollNote {
  midi: number;
  /** Début, en temps (noires). */
  beat: number;
  length: number;
  /** De 1 à 127. */
  velocity: number;
}

export interface Track {
  name: string;
  /** Identifiant d'instrument du moteur ; « drum-kit » pour la batterie. */
  sound: string;
  /** De 0 à 1. */
  volume: number;
  notes: RollNote[];
  /** Interface seulement : ignorés par le moteur. */
  muted?: boolean;
  solo?: boolean;
}

export interface Project {
  bpm: number;
  beats_per_bar: number;
  bars: number;
  tracks: Track[];
}

/** Nombre maximal de pistes (16 canaux MIDI). */
export const MAX_TRACKS = 16;

/** Le morceau généré, en pistes éditables. */
export function pieceToProject(piece: Piece): Project {
  return wasmProject(piece) as Project;
}

/** Le projet en fichier MIDI ; `key` donne l'armure (« C », « A minor »). */
export function projectToMidi(project: Project, key?: string): Uint8Array {
  return wasmProjectMidi(project, key ?? null);
}
