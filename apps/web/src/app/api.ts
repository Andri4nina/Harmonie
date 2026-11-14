// Client de l'API Harmonie. Chaque appel passe par `track()` : la barre de
// chargement du haut de l'écran reste visible pendant la requête.

import { track } from "../state/loading";
import type { Card } from "../theory/ear";
import { API_URL, useSession } from "./session";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  duration_ms: number | null;
  created_at: string;
  job_id: string | null;
  status: JobStatus | null;
  stage: string | null;
  progress: number | null;
  error: string | null;
}

export type Certainty = "detected" | "estimated" | "uncertain" | "corrected";

export interface TimelineEvent {
  id: string;
  feature: "tempo" | "meter" | "key" | "key_segment" | "chord" | "cadence" | string;
  start_ms: number;
  end_ms: number;
  confidence: number | null;
  certainty: Certainty;
  payload: Record<string, unknown>;
}

export interface Analysis {
  track: Track;
  analysis: null | {
    job_id: string;
    finished_at: string;
    summary: {
      duration_ms: number;
      tuning: { a4_hz: number; cents: number };
      beats_ms: number[];
      downbeats_ms: number[];
    } | null;
    events: TimelineEvent[];
    corrections: number;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}, label = "Échange avec le serveur"): Promise<Response> {
  if (!API_URL) throw new ApiError(0, "L'analyse n'est pas disponible pour le moment.");
  const token = useSession.getState().token;
  if (!token) throw new ApiError(401, "Connectez-vous pour continuer.");
  return track(label, async () => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch {
      throw new ApiError(0, "Le serveur d'analyse ne répond pas. Il peut être en veille : réessayez dans une minute.");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new ApiError(response.status, body?.message ?? "Le serveur n'a pas pu répondre. Réessayez dans un instant.");
    }
    return response;
  });
}

export async function listTracks(): Promise<Track[]> {
  return (await request("/v1/tracks", {}, "Chargement de la bibliothèque")).json() as Promise<Track[]>;
}

export async function getAnalysis(id: string): Promise<Analysis> {
  return (await request(`/v1/tracks/${id}/analysis`, {}, "Chargement de l'analyse")).json() as Promise<Analysis>;
}

export async function getAudio(id: string): Promise<Blob> {
  return (await request(`/v1/tracks/${id}/audio`, {}, "Chargement du fichier audio")).blob();
}

/** Envoie un morceau ; `onProgress` reçoit la part envoyée, de 0 à 1. */
export function uploadTrack(file: File, title: string, onProgress?: (part: number) => void): Promise<Track> {
  const token = useSession.getState().token;
  if (!API_URL) return Promise.reject(new ApiError(0, "L'analyse n'est pas disponible pour le moment."));
  if (!token) return Promise.reject(new ApiError(401, "Connectez-vous pour continuer."));
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
  return track("Envoi du fichier", () =>
    new Promise<Track>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/v1/tracks`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onerror = () => reject(new ApiError(0, "Le serveur d'analyse ne répond pas. Il peut être en veille : réessayez dans une minute."));
      xhr.onload = () => {
        let body: { message?: string } | Track | null = null;
        try {
          body = JSON.parse(xhr.responseText) as Track;
        } catch {
          body = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body as Track);
        else reject(new ApiError(xhr.status, (body as { message?: string } | null)?.message ?? "L'envoi n'a pas abouti. Réessayez dans un instant."));
      };
      xhr.send(form);
    }),
  );
}

export async function correctEvent(trackId: string, body: Record<string, unknown>): Promise<void> {
  await request(
    `/v1/tracks/${trackId}/corrections`,
    { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    "Enregistrement de la correction",
  );
}

/** Formats acceptés par l'API (voir crates/harmonia-api/src/routes.rs). */
export const ACCEPTED = ".wav,.mp3,.flac,.ogg,.opus,.m4a,.aac,.webm";
export const MAX_UPLOAD_MB = 50;

export function formatDuration(ms: number | null): string {
  if (ms === null) return "durée inconnue";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ oreille


export async function getEarCards(): Promise<Card[]> {
  return (await request("/v1/ear/cards", {}, "Lecture de vos progrès")).json() as Promise<Card[]>;
}

export async function putEarCards(cards: Card[]): Promise<void> {
  await request(
    "/v1/ear/cards",
    { method: "PUT", body: JSON.stringify(cards), headers: { "Content-Type": "application/json" } },
    "Enregistrement de vos progrès",
  );
}
