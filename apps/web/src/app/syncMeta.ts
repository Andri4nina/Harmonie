// Suivi local des modifications à synchroniser. Toujours actif, même sans
// compte : chaque document sait quand il a été modifié sur cet appareil, et
// la synchronisation (app/sync.ts) compare ensuite avec le compte. Léger :
// aucun client réseau ici.

import { create } from "zustand";
import { useComposer } from "../state/composer";
import { useLessons } from "../state/lessons";
import { useSettings } from "../state/store";

export type DocumentKey = "settings" | "lessons" | "composer";

interface Store {
  getState: () => unknown;
  setState: (state: Record<string, unknown>) => void;
  subscribe: (listener: (state: unknown, previous: unknown) => void) => () => void;
  persist: { rehydrate: () => Promise<void> | void };
}

interface Document {
  store: Store;
  /** Ce qui part dans le compte (jamais l'état d'interface). */
  pick: (state: unknown) => Record<string, unknown>;
}

export const DOCUMENTS: Record<DocumentKey, Document> = {
  settings: {
    store: useSettings as unknown as Store,
    pick: (state) => {
      const { theme, lite, a4, instrumentId, sound, keyboardBase, history } = state as ReturnType<typeof useSettings.getState>;
      return { theme, lite, a4, instrumentId, sound, keyboardBase, history };
    },
  },
  lessons: {
    store: useLessons as unknown as Store,
    pick: (state) => ({ done: (state as ReturnType<typeof useLessons.getState>).done }),
  },
  composer: {
    store: useComposer as unknown as Store,
    pick: (state) => {
      const { generator, project, edited, track } = state as ReturnType<typeof useComposer.getState>;
      return { generator, project, edited, track };
    },
  },
};

const META_KEY = "harmonie-sync";

export interface Meta {
  /** Dernière modification sur cet appareil (ms). */
  modified: number;
  /** Version du compte avec laquelle l'appareil est aligné (ms). */
  synced: number;
}

function readMeta(): Partial<Record<DocumentKey, Meta>> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Partial<Record<DocumentKey, Meta>>;
  } catch {
    return {};
  }
}

export function getMeta(key: DocumentKey): Meta | undefined {
  return readMeta()[key];
}

export function setMeta(key: DocumentKey, meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), [key]: meta }));
  } catch {
    // Stockage indisponible (navigation privée) : rien à garder.
  }
}

/** État affiché de la synchronisation. */
export type SyncStatus = "off" | "syncing" | "synced" | "offline" | "error";

export const useSync = create<{ status: SyncStatus; at: number | null; changed: number }>(() => ({ status: "off", at: null, changed: 0 }));

/** Vrai pendant qu'on applique une version venue du compte (pas une modification locale). */
let applying = false;
export function applyRemote(run: () => void): void {
  applying = true;
  try {
    run();
  } finally {
    applying = false;
  }
}

let tracking = false;
/** Note l'instant de chaque modification locale ; à lancer une fois au démarrage. */
export function trackChanges(): void {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  for (const [key, { store, pick }] of Object.entries(DOCUMENTS) as [DocumentKey, Document][]) {
    store.subscribe((state, previous) => {
      if (applying) return;
      if (JSON.stringify(pick(state)) === JSON.stringify(pick(previous))) return;
      setMeta(key, { modified: Date.now(), synced: getMeta(key)?.synced ?? 0 });
      useSync.setState((s) => ({ changed: s.changed + 1 }));
    });
  }
}
