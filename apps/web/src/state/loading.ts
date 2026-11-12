import { create } from "zustand";

interface Loading {
  /** Tâches réellement en cours (requêtes, chargements), par libellé. */
  pending: Record<number, string>;
}

export const useLoading = create<Loading>(() => ({ pending: {} }));

let next = 0;

/**
 * Suit une opération asynchrone réelle : la barre de progression du haut de
 * l'écran reste visible tant qu'au moins une opération est en cours. Rien
 * n'est simulé : sans opération, pas de barre.
 */
export async function track<T>(label: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  const id = next++;
  useLoading.setState((state) => ({ pending: { ...state.pending, [id]: label } }));
  try {
    return await (typeof work === "function" ? work() : work);
  } finally {
    useLoading.setState((state) => {
      const { [id]: _done, ...rest } = state.pending;
      return { pending: rest };
    });
  }
}

/** Libellé de l'opération la plus ancienne en cours, ou `null`. */
export function useCurrentTask(): string | null {
  return useLoading((state) => {
    const keys = Object.keys(state.pending);
    return keys.length ? (state.pending[Number(keys[0])] ?? null) : null;
  });
}
