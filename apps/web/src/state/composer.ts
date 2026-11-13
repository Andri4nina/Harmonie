// Projet en cours dans la page Composer, enregistré sur l'appareil, avec
// annulation et rétablissement.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project, Style } from "../theory/compose";

const HISTORY = 80;

export interface Generator {
  key: string;
  style: Style;
  bars: number;
  bpm: number;
  seed: number;
}

interface ComposerState {
  generator: Generator;
  /** `null` tant que rien n'est enregistré : la page part du morceau généré. */
  project: Project | null;
  /** Vrai si le projet a été retouché depuis sa génération. */
  edited: boolean;
  past: Project[];
  future: Project[];
  track: number;
  setGenerator: (generator: Partial<Generator>) => void;
  /** Remplace le projet par un morceau généré (annulable). */
  load: (project: Project) => void;
  /** Modification enregistrée dans l'historique. */
  edit: (change: (project: Project) => Project) => void;
  /** Modification continue (glisser) : `begin` d'abord, puis `live`. */
  begin: () => void;
  live: (change: (project: Project) => Project) => void;
  /** Tempo : ne compte pas comme une retouche du morceau. */
  retime: (bpm: number) => void;
  undo: () => void;
  redo: () => void;
  selectTrack: (index: number) => void;
}

export const useComposer = create<ComposerState>()(
  persist(
    (set, get) => ({
      generator: { key: "C", style: "pop", bars: 8, bpm: 96, seed: 1 },
      project: null,
      edited: false,
      past: [],
      future: [],
      track: 0,
      setGenerator: (generator) => set({ generator: { ...get().generator, ...generator } }),
      load: (project) => {
        const { project: previous, past } = get();
        set({ project, edited: false, past: previous ? [...past, previous].slice(-HISTORY) : past, future: [], track: 0 });
      },
      edit: (change) => {
        const { project, past } = get();
        if (!project) return;
        set({ project: change(project), edited: true, past: [...past, project].slice(-HISTORY), future: [] });
      },
      begin: () => {
        const { project, past } = get();
        if (project) set({ past: [...past, project].slice(-HISTORY), future: [] });
      },
      live: (change) => {
        const { project } = get();
        if (project) set({ project: change(project), edited: true });
      },
      retime: (bpm) => {
        const { project } = get();
        if (project) set({ project: { ...project, bpm: Math.min(220, Math.max(40, Math.round(bpm))) } });
      },
      undo: () => {
        const { project, past, future } = get();
        const previous = past.at(-1);
        if (!previous || !project) return;
        set({ project: previous, past: past.slice(0, -1), future: [project, ...future].slice(0, HISTORY), edited: true });
      },
      redo: () => {
        const { project, past, future } = get();
        const next = future[0];
        if (!next || !project) return;
        set({ project: next, past: [...past, project].slice(-HISTORY), future: future.slice(1), edited: true });
      },
      selectTrack: (track) => set({ track }),
    }),
    {
      name: "harmonie-composer",
      version: 1,
      skipHydration: true,
      partialize: ({ generator, project, edited, track }) => ({ generator, project, edited, track }),
    },
  ),
);

/** Copie d'un projet avec une piste modifiée. */
export function withTrack(project: Project, index: number, change: (track: Project["tracks"][number]) => Project["tracks"][number]): Project {
  return { ...project, tracks: project.tracks.map((track, i) => (i === index ? change(track) : track)) };
}
