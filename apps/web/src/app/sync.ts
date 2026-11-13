// Synchronisation « hors connexion d'abord ». L'appareil garde tout et
// fonctionne sans réseau ; dès qu'un compte est connecté et que le réseau est
// là, ses documents (réglages, cours, Composer) et ses progrès d'oreille sont
// rapprochés de ceux du compte : au démarrage, au retour du réseau ou de la
// fenêtre, chaque minute, et deux secondes après une modification.
// Conflits : la modification la plus récente l'emporte ; pour l'oreille, la
// fiche la plus avancée ; pour des cours jamais rapprochés, l'union.

import { useEar } from "../state/ear";
import type { Card } from "../theory/ear";
import { API_URL, startSession, useSession } from "./session";
import { DOCUMENTS, type DocumentKey, applyRemote, getMeta, setMeta, useSync } from "./syncMeta";

interface Remote {
  key: DocumentKey;
  value: Record<string, unknown>;
  modified_ms: number;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useSession.getState().token;
  if (!API_URL || !token) throw new Error("hors compte");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!response.ok) throw new Error(`réponse ${response.status}`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

function apply(key: DocumentKey, value: Record<string, unknown>): void {
  applyRemote(() => DOCUMENTS[key].store.setState(value));
}

async function send(key: DocumentKey, value: Record<string, unknown>, modified: number): Promise<void> {
  const kept = await call<Remote>(`/v1/sync/${key}`, { method: "PUT", body: JSON.stringify({ value, modified_ms: modified }) });
  if (kept.modified_ms > modified) apply(key, kept.value);
  setMeta(key, { modified: Math.max(modified, kept.modified_ms), synced: kept.modified_ms });
}

/** Cours finis des deux côtés (premier rapprochement d'un appareil). */
export function unionDone(a: unknown, b: unknown): Record<string, boolean> {
  const done: Record<string, boolean> = {};
  for (const source of [a, b]) {
    for (const [slug, value] of Object.entries((source as Record<string, boolean>) ?? {})) if (value) done[slug] = true;
  }
  return done;
}

async function syncDocuments(): Promise<void> {
  const remote = await call<Remote[]>("/v1/sync");
  const byKey = new Map(remote.map((doc) => [doc.key, doc]));
  for (const key of Object.keys(DOCUMENTS) as DocumentKey[]) {
    const { store, pick } = DOCUMENTS[key];
    const meta = getMeta(key);
    const there = byKey.get(key);
    const local = pick(store.getState());
    if (there && !meta && key === "lessons") {
      const value = { done: unionDone(there.value.done, local.done) };
      apply(key, value);
      await send(key, value, Date.now());
    } else if (there && (!meta || there.modified_ms > meta.modified)) {
      apply(key, there.value);
      setMeta(key, { modified: there.modified_ms, synced: there.modified_ms });
    } else if (!there || (meta && meta.modified > meta.synced)) {
      await send(key, local, meta?.modified || Date.now());
    }
  }
}

const sentCards = new Map<string, number>();

async function syncEar(): Promise<void> {
  await useEar.persist.rehydrate();
  const remote = await call<Card[]>("/v1/ear/cards");
  const merged = { ...useEar.getState().cards };
  let received = false;
  for (const card of remote) {
    const mine = merged[card.item];
    if (!mine || card.seen > mine.seen) {
      merged[card.item] = card;
      received = true;
    }
    sentCards.set(card.item, card.seen);
  }
  // Ne réécrire que si le compte apporte du nouveau (sinon boucle d'envois).
  if (received) useEar.setState({ cards: merged });
  const ahead = Object.values(merged).filter((card) => card.seen > (sentCards.get(card.item) ?? -1));
  if (ahead.length > 0) {
    await call("/v1/ear/cards", { method: "PUT", body: JSON.stringify(ahead) });
    for (const card of ahead) sentCards.set(card.item, card.seen);
  }
}

let running = false;
let again = false;

/** Rapproche maintenant l'appareil et le compte (sans effet hors ligne ou hors compte). */
export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  if (!useSession.getState().token) {
    useSync.setState({ status: "off" });
    return;
  }
  if (!navigator.onLine) {
    useSync.setState({ status: "offline" });
    return;
  }
  running = true;
  useSync.setState({ status: "syncing" });
  try {
    for (const { store } of Object.values(DOCUMENTS)) await store.persist.rehydrate();
    await syncDocuments();
    await syncEar();
    useSync.setState({ status: "synced", at: Date.now() });
  } catch {
    useSync.setState({ status: navigator.onLine ? "error" : "offline" });
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

let started = false;
/** Démarre la synchronisation en arrière-plan (une fois). */
export function startSync(): void {
  if (started || !API_URL) return;
  started = true;
  startSession();
  let timer: number | undefined;
  const soon = (delay = 2000) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncNow(), delay);
  };
  useSession.subscribe((state, previous) => {
    if (state.token && !previous.token) soon(0);
    if (!state.token) useSync.setState({ status: "off" });
  });
  if (useSession.getState().token) soon(0);
  useSync.subscribe((state, previous) => {
    if (state.changed !== previous.changed) soon();
  });
  useEar.subscribe((state, previous) => {
    if (state.cards !== previous.cards) soon();
  });
  window.addEventListener("online", () => soon(0));
  window.addEventListener("offline", () => useSync.setState({ status: "offline" }));
  window.addEventListener("focus", () => soon(500));
  window.setInterval(() => void syncNow(), 60_000);
}
