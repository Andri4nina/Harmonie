// Façade typée de l'entraînement de l'oreille (crates/harmonia-theory/src/ear.rs).
// Les questions, les niveaux et la répétition espacée sont calculés par le
// moteur ; ce fichier ne fait que typer ses réponses et nommer en français.

import {
  earExercises as wasmExercises,
  earPick as wasmPick,
  earProgress as wasmProgress,
  earQuestion as wasmQuestion,
  earReview as wasmReview,
} from "./pkg/harmonia_theory_wasm.js";
import type { TimedEvent } from "../audio/synth";
import type { PlayMode } from "./engine";
import { PROGRESSION_LABEL, intervalLabel } from "./labels";

export type ExerciseId = "intervals" | "chords" | "degrees" | "progressions" | "rhythm" | "melody";

export interface ExerciseView {
  id: ExerciseId;
  levels: { level: number; items: string[] }[];
}

export interface Choice {
  answer: string;
  symbol: string;
}

export interface Question {
  exercise: ExerciseId;
  level: number;
  item: string;
  playing: PlayMode | "timed";
  steps: number[][];
  choices: Choice[];
  answer: string;
  key: string | null;
  reveal: string;
  /** Placement dans le temps, pour les exercices de rythme et de dictée. */
  timing: { bpm: number; events: TimedEvent[] } | null;
  /** Nombre de réponses à enchaîner (dictée : une par note). */
  answer_length: number;
}

export interface Card {
  item: string;
  ease: number;
  streak: number;
  seen: number;
  correct: number;
  interval_ms: number;
  due_ms: number;
}

export function exercises(): ExerciseView[] {
  return wasmExercises() as ExerciseView[];
}

/** Graine aléatoire représentable exactement en JavaScript (< 2^53). */
export function randomSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

export function question(exercise: ExerciseId, level: number, item: string | null, seed = randomSeed()): Question {
  return wasmQuestion(exercise, level, item ?? undefined, seed) as Question;
}

export function pick(items: string[], cards: Card[], now: number, last: string | null): string | null {
  return wasmPick(items, cards, now, last ?? undefined, randomSeed()) ?? null;
}

export function review(item: string, card: Card | undefined, correct: boolean, now: number): Card {
  return wasmReview(item, card ?? null, correct, now) as Card;
}

export function progress(exercise: ExerciseId, level: number, cards: Card[]): { mastered: number; total: number } {
  const [mastered = 0, total = 0] = wasmProgress(exercise, level, cards);
  return { mastered, total };
}

// ------------------------------------------------------------------ français

export const EXERCISE_LABEL: Record<ExerciseId, { name: string; hint: string; prompt: string }> = {
  intervals: { name: "Intervalles", hint: "Deux notes : quelle distance les sépare ?", prompt: "Quel intervalle ?" },
  chords: { name: "Accords", hint: "Un accord plaqué : quelle est sa couleur ?", prompt: "Quel accord ?" },
  degrees: { name: "Degrés", hint: "Une cadence installe la tonalité, puis une note : quel degré ?", prompt: "Quel degré ?" },
  progressions: { name: "Progressions", hint: "Une suite d'accords : laquelle ?", prompt: "Quelle progression ?" },
  rhythm: { name: "Rythme", hint: "Un décompte, puis une mesure : laquelle est écrite ?", prompt: "Quel rythme ?" },
  melody: { name: "Mélodie", hint: "L'accord de tonique, puis quelques notes : notez leurs degrés.", prompt: "Quels degrés ?" },
};

const CHORD_LABEL: Record<string, string> = {
  Major: "majeur",
  Minor: "mineur",
  Diminished: "diminué",
  Augmented: "augmenté",
  Dominant7: "septième de dominante",
  Major7: "septième majeure",
  Minor7: "mineur septième",
  HalfDiminished7: "demi-diminué",
  Diminished7: "septième diminuée",
  MinorMajor7: "mineur, septième majeure",
  Sus2: "suspendu 2",
  Sus4: "suspendu 4",
  Major6: "majeur sixte",
  Minor6: "mineur sixte",
  Add9: "neuvième ajoutée",
};

const DEGREE_LABEL: Record<string, string> = {
  "1": "tonique",
  "2": "sus-tonique",
  "3": "médiante",
  "4": "sous-dominante",
  "5": "dominante",
  "6": "sus-dominante",
  "7": "sensible",
};

const CELL_LABEL: Record<string, string> = {
  q: "noire",
  qr: "soupir",
  h: "blanche",
  ee: "deux croches",
  qde: "noire pointée et croche",
  ere: "demi-soupir et croche",
  ssss: "quatre doubles croches",
  trip: "triolet de croches",
};

/** Description d'un rythme en toutes lettres (« noire, deux croches, … »). */
export function rhythmLabel(pattern: string): string {
  return pattern
    .split(" ")
    .map((id) => CELL_LABEL[id] ?? id)
    .join(", ");
}

/** Nom d'une réponse : grand symbole et nom en toutes lettres. */
export function choiceLabel(exercise: ExerciseId, choice: Choice, minor = false): { symbol: string; name: string } {
  switch (exercise) {
    case "intervals":
      return { symbol: choice.symbol, name: intervalLabel(choice.answer) };
    case "chords":
      return { symbol: choice.symbol === "" ? "M" : choice.symbol, name: CHORD_LABEL[choice.answer] ?? choice.answer };
    case "degrees":
      return { symbol: choice.symbol, name: choice.answer === "7" && minor ? "sous-tonique" : (DEGREE_LABEL[choice.answer] ?? "") };
    case "progressions":
      return { symbol: choice.symbol.replaceAll("-", " – "), name: PROGRESSION_LABEL[choice.answer] ?? choice.answer };
    case "rhythm":
      return { symbol: choice.symbol, name: rhythmLabel(choice.answer) };
    case "melody":
      return {
        symbol: choice.answer === "8" ? "8" : choice.symbol,
        name: choice.answer === "8" ? "tonique aiguë" : choice.answer === "7" && minor ? "sous-tonique" : (DEGREE_LABEL[choice.answer] ?? ""),
      };
  }
}

/** Ce qu'un niveau demande, en une ligne. */
export function levelSummary(exercise: ExerciseId, items: string[]): string {
  const direction = items[0]?.split(":")[2];
  const extra = exercise === "intervals" ? (direction === "desc" ? ", descendants" : direction === "harm" ? ", simultanés" : "") : "";
  const minor = exercise === "degrees" && items[0]?.endsWith(":minor") ? ", en mineur" : "";
  if (exercise === "melody") {
    const level = Number(items[0]?.split(":")[1] ?? 1);
    const [length, range, mode] = [
      [3, "degrés 1 à 3", "majeur"],
      [4, "degrés 1 à 5", "majeur"],
      [5, "toute la gamme", "majeur"],
      [5, "toute la gamme", "mineur"],
    ][level - 1] ?? [5, "toute la gamme", "mineur"];
    return `${length} notes, ${range}, en ${mode}`;
  }
  if (exercise === "rhythm") return `${items.length} figures : ${items.map((i) => CELL_LABEL[i.split(":")[1] ?? ""]).join(", ")}`;
  return `${items.length} réponses possibles${extra}${minor}`;
}
