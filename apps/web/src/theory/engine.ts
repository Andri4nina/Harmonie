// Façade typée du moteur de théorie (Rust → WebAssembly).
// Toute la logique musicale vit dans crates/harmonia-theory : ce fichier ne
// fait que charger le module et typer ses réponses.

import init, {
  catalog as wasmCatalog,
  initSync,
  winds as wasmWinds,
  circleOfFifths as wasmCircleOfFifths,
  fretboard as wasmFretboard,
  instruments as wasmInstruments,
  tablature as wasmTablature,
  writtenChords as wasmWrittenChords,
  writtenNotes as wasmWrittenNotes,
  midiToFrequency as wasmMidiToFrequency,
  nodeView as wasmNodeView,
  resolveQuery as wasmResolveQuery,
} from "./pkg/harmonia_theory_wasm.js";

export type NodeKind = "note" | "scale" | "chord" | "key" | "progression";
export type PlayMode = "melodic" | "harmonic" | "sequence";

export interface Tone {
  note: string;
  pitchClass: number;
  /** Degré dans la gamme ("3") ou intervalle depuis la fondamentale ("m3"). */
  role: string;
  midi: number;
}

export interface Playback {
  mode: PlayMode;
  /** Chaque pas : une ou plusieurs notes MIDI simultanées. */
  steps: number[][];
}

export interface Fact {
  key: string;
  value: string;
}

export interface Item {
  id: string;
  kind: NodeKind;
  detail: string | null;
  pitchClass: number;
}

export interface Group {
  key: string;
  items: Item[];
}

export interface NodeView {
  id: string;
  kind: NodeKind;
  pitchClass: number;
  tones: Tone[];
  playback: Playback;
  facts: Fact[];
  groups: Group[];
}

export interface InstrumentView {
  id: string;
  name: string;
  layout: "keyboard" | "strings" | "wind" | "percussion";
  strings: { open: string; midi: number }[];
  span: number;
  fretted: boolean;
  range: [number, number] | null;
  /** Note entendue quand l'instrument lit un do (« Eb »), ou `null` en ut. */
  pitchedIn: string | null;
}

export interface TabPosition {
  /** 0 = corde la plus grave. */
  string: number;
  stop: number;
}

/** Doigté d'une mélodie (MIDI réels) ; `null` pour une note hors de l'instrument. */
export function tablatureFor(instrumentId: string, midis: number[]): (TabPosition | null)[] {
  return wasmTablature(instrumentId, Int32Array.from(midis)) as (TabPosition | null)[];
}

/** Notes à lire sur l'instrument pour faire entendre `midis` (« Eb4 »). */
export function writtenNotes(instrumentId: string, midis: number[], flats: boolean): string[] {
  return wasmWrittenNotes(instrumentId, Int32Array.from(midis), flats);
}

/** Symboles d'accords à lire sur l'instrument. */
export function writtenChords(instrumentId: string, symbols: string[]): string[] {
  return wasmWrittenChords(instrumentId, symbols);
}

/** Vrai si la tonalité (« Eb major », « F minor ») s'écrit en bémols. */
export function keyUsesFlats(key: string | null | undefined): boolean {
  if (!key) return false;
  const [tonic = "", mode = "major"] = key.split(" ");
  const sector = circleOfFifths().find((s) => (mode === "minor" ? s.minor === `${tonic}m` : s.major === tonic));
  return sector ? sector.signature < 0 : tonic.includes("b");
}

export interface FretMark {
  /** 0 = corde la plus grave. */
  string: number;
  stop: number;
  note: string;
  pitchClass: number;
  midi: number;
}

export interface CircleSector {
  major: string;
  majorId: string;
  minor: string;
  minorId: string;
  signature: number;
  pitchClass: number;
}

export interface WindView {
  id: string;
  name: string;
  /** Intervalle de transposition ("M6"), ou `null` pour un instrument en ut. */
  interval: string | null;
  sounds_below: boolean;
  tones: { sounding: string; written: string }[];
}

export async function loadEngine(): Promise<void> {
  await init();
}

/** Chargement synchrone à partir du fichier .wasm (pré-rendu, tests). */
export function loadEngineSync(wasm: BufferSource): void {
  initSync({ module: wasm });
}

/** Identifiants des pages de référence indexables. */
export function catalog(): string[] {
  return wasmCatalog();
}

/** Notes écrites pour chaque instrument à vent. */
export function winds(notes: string[]): WindView[] {
  return wasmWinds(notes) as WindView[];
}

const views = new Map<string, NodeView | null>();

/** Vue d'un nœud du graphe musical, ou `null` si l'identifiant est invalide. */
export function nodeView(id: string): NodeView | null {
  if (!views.has(id)) {
    let view: NodeView | null = null;
    try {
      view = wasmNodeView(id) as NodeView;
    } catch {
      view = null;
    }
    views.set(id, view);
  }
  return views.get(id) ?? null;
}

export function resolveQuery(text: string): string[] {
  return wasmResolveQuery(text);
}

let instrumentCache: InstrumentView[] | undefined;

export function instruments(): InstrumentView[] {
  instrumentCache ??= wasmInstruments() as InstrumentView[];
  return instrumentCache;
}

export function fretboard(instrumentId: string, notes: string[]): FretMark[] {
  return wasmFretboard(instrumentId, notes) as FretMark[];
}

let circleCache: CircleSector[] | undefined;

export function circleOfFifths(): CircleSector[] {
  circleCache ??= wasmCircleOfFifths() as CircleSector[];
  return circleCache;
}

export function midiToFrequency(midi: number, a4: number): number {
  return wasmMidiToFrequency(midi, a4);
}
