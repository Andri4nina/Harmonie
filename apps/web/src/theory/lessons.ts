// Les cours : données de content/lessons, lues au build (pages pré-rendues).
// Aucune règle musicale ici ; les notes et exercices viennent du moteur.

import type { ExerciseId } from "./ear";

export type Step =
  | { type: "text"; body: string }
  | { type: "piano"; node: string; caption: string }
  | { type: "listen"; node: string; label: string }
  | { type: "sequence"; nodes: string[]; label: string }
  | { type: "question"; prompt: string; choices: string[]; answer: string; explanation: string }
  | { type: "quiz"; exercise: ExerciseId; level: number; count: number; label: string }
  | { type: "explore"; node: string; label: string };

export interface Lesson {
  slug: string;
  order: number;
  level: string;
  title: string;
  summary: string;
  steps: Step[];
}

const files = import.meta.glob<Lesson>("../../../../content/lessons/*.json", { eager: true, import: "default" });

export const LESSONS: Lesson[] = Object.values(files).sort((a, b) => a.order - b.order);

export function lessonBySlug(slug: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.slug === slug);
}

/** Paragraphes d'un texte de cours, et ses passages en gras (`**…**`). */
export function paragraphs(body: string): { text: string; strong: boolean }[][] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => (part.startsWith("**") ? { text: part.slice(2, -2), strong: true } : { text: part, strong: false })));
}
