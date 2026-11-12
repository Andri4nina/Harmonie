import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Settings {
  /** Mode léger : pas de flou, relief figé. */
  lite: boolean;
  /** Fréquence du La4 en hertz. */
  a4: number;
  /** Instrument à cordes affiché dans l'explorateur. */
  instrumentId: string;
  /** Derniers nœuds visités, du plus récent au plus ancien. */
  history: string[];
  setLite: (lite: boolean) => void;
  setA4: (a4: number) => void;
  setInstrument: (id: string) => void;
  visit: (id: string) => void;
}

export const A4_MIN = 415;
export const A4_MAX = 466;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      lite: false,
      a4: 440,
      instrumentId: "guitar",
      history: [],
      setLite: (lite) => set({ lite }),
      setA4: (a4) => set({ a4: Math.min(A4_MAX, Math.max(A4_MIN, a4)) }),
      setInstrument: (instrumentId) => set({ instrumentId }),
      visit: (id) =>
        set((state) => ({
          history: [id, ...state.history.filter((other) => other !== id)].slice(0, 12),
        })),
    }),
    { name: "harmonia-settings", version: 1 },
  ),
);

interface Player {
  /** Notes MIDI en train de sonner. */
  active: number[];
  /** Pas en cours dans la lecture, ou `null`. */
  step: number | null;
  /** Identifiant de ce qui est joué, ou `null`. */
  playingId: string | null;
}

export const usePlayer = create<Player>(() => ({ active: [], step: null, playingId: null }));
