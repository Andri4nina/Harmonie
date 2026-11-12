// Synchronisation des progrès de l'oreille avec le compte. Chargé à la
// demande par la page d'entraînement, seulement si une API est configurée :
// la page publique n'embarque ni ce module ni le client Supabase.

import { useEar } from "../state/ear";
import type { Card } from "../theory/ear";
import { getEarCards, putEarCards } from "./api";
import { startSession, useSession } from "./session";

export type SyncStatus = "signed-out" | "synced" | "error";

/** La fiche la plus avancée l'emporte (même règle que le serveur). */
function newer(a: Card | undefined, b: Card): boolean {
  return !a || b.seen > a.seen;
}

async function sessionReady(): Promise<string | null> {
  startSession();
  if (useSession.getState().ready) return useSession.getState().token;
  return new Promise((resolve) => {
    const unsubscribe = useSession.subscribe((state) => {
      if (state.ready) {
        unsubscribe();
        resolve(state.token);
      }
    });
  });
}

/**
 * Fusionne les fiches du compte et de l'appareil, puis envoie au fil de l'eau
 * celles qui changent. Renvoie l'état et une fonction d'arrêt.
 */
export async function connect(onStatus: (status: SyncStatus) => void): Promise<() => void> {
  const token = await sessionReady();
  if (!token) {
    onStatus("signed-out");
    return () => {};
  }
  const sent = new Map<string, number>();
  try {
    const remote = await getEarCards();
    const local = useEar.getState().cards;
    const merged = { ...local };
    for (const card of remote) {
      if (newer(merged[card.item], card)) merged[card.item] = card;
      sent.set(card.item, card.seen);
    }
    useEar.setState({ cards: merged });
    const ahead = Object.values(merged).filter((card) => card.seen > (sent.get(card.item) ?? -1));
    if (ahead.length > 0) {
      await putEarCards(ahead);
      for (const card of ahead) sent.set(card.item, card.seen);
    }
    onStatus("synced");
  } catch {
    onStatus("error");
  }

  let timer: number | undefined;
  const unsubscribe = useEar.subscribe((state) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const changed = Object.values(state.cards).filter((card) => card.seen > (sent.get(card.item) ?? -1));
      if (changed.length === 0) return;
      putEarCards(changed)
        .then(() => {
          for (const card of changed) sent.set(card.item, card.seen);
          onStatus("synced");
        })
        .catch(() => onStatus("error"));
    }, 2000);
  });
  return () => {
    window.clearTimeout(timer);
    unsubscribe();
  };
}
