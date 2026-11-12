import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Card, ExerciseId } from "../theory/ear";

interface EarState {
  /** Fiches de répétition, par élément. */
  cards: Record<string, Card>;
  exercise: ExerciseId;
  /** Niveau choisi pour chaque exercice. */
  levels: Record<ExerciseId, number>;
  setExercise: (exercise: ExerciseId) => void;
  setLevel: (exercise: ExerciseId, level: number) => void;
  save: (card: Card) => void;
}

/**
 * Progrès de l'entraînement, enregistrés sur cet appareil. Relus après
 * l'hydratation (page pré-rendue), comme les réglages.
 */
export const useEar = create<EarState>()(
  persist(
    (set) => ({
      cards: {},
      exercise: "intervals",
      levels: { intervals: 1, chords: 1, degrees: 1, progressions: 1, rhythm: 1, melody: 1 },
      setExercise: (exercise) => set({ exercise }),
      setLevel: (exercise, level) => set((state) => ({ levels: { ...state.levels, [exercise]: level } })),
      save: (card) => set((state) => ({ cards: { ...state.cards, [card.item]: card } })),
    }),
    {
      name: "harmonia-ear",
      version: 1,
      skipHydration: true,
      partialize: ({ cards, exercise, levels }) => ({ cards, exercise, levels }),
    },
  ),
);
