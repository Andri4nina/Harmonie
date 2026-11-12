import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LessonState {
  /** Cours terminés, par adresse. */
  done: Record<string, boolean>;
  toggle: (slug: string) => void;
}

/** Cours terminés, sur cet appareil (relus après l'hydratation). */
export const useLessons = create<LessonState>()(
  persist(
    (set) => ({
      done: {},
      toggle: (slug) => set((state) => ({ done: { ...state.done, [slug]: !state.done[slug] } })),
    }),
    { name: "harmonia-lessons", version: 1, skipHydration: true, partialize: ({ done }) => ({ done }) },
  ),
);
