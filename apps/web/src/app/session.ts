// Session de l'utilisateur : comptes Supabase Auth. Ce module n'est chargé
// que par les pages d'application (analyse, bibliothèque) ; les pages
// publiques pré-rendues n'embarquent pas le client Supabase.

import { type Session, type SupabaseClient, createClient } from "@supabase/supabase-js";
import { create } from "zustand";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "");

/**
 * Jeton fourni à la main, en développement uniquement, pour essayer l'écran
 * d'analyse contre une API locale sans projet Supabase. Ignoré en production.
 */
const DEV_TOKEN = import.meta.env.DEV ? (import.meta.env.VITE_DEV_ACCESS_TOKEN as string | undefined) : undefined;

/** Ce qui manque pour que l'analyse fonctionne sur ce site, ou une liste vide. */
export function missingConfiguration(): string[] {
  const missing: string[] = [];
  if (!API_URL) missing.push("VITE_API_URL");
  if (!DEV_TOKEN && !SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!DEV_TOKEN && !SUPABASE_KEY) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  return missing;
}

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

interface SessionState {
  /** `false` tant que la session enregistrée n'a pas été relue. */
  ready: boolean;
  email: string | null;
  token: string | null;
}

export const useSession = create<SessionState>(() => ({ ready: false, email: null, token: null }));

function apply(session: Session | null): void {
  useSession.setState({ ready: true, email: session?.user.email ?? null, token: session?.access_token ?? null });
}

let started = false;
/** Relit la session enregistrée et suit ses changements (renouvellement du jeton). */
export function startSession(): void {
  if (started) return;
  started = true;
  if (DEV_TOKEN) {
    useSession.setState({ ready: true, email: "développement local", token: DEV_TOKEN });
    return;
  }
  const auth = supabase()?.auth;
  if (!auth) {
    useSession.setState({ ready: true });
    return;
  }
  void auth.getSession().then(({ data }) => apply(data.session));
  auth.onAuthStateChange((_event, session) => apply(session));
}

function authOrThrow() {
  const auth = supabase()?.auth;
  if (!auth) throw new Error("La connexion n'est pas configurée sur ce site.");
  return auth;
}

/** Messages de Supabase Auth, en français. */
function explain(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Adresse ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Adresse pas encore confirmée : ouvrez le lien reçu par courriel.";
  if (/already registered/i.test(message)) return "Un compte existe déjà avec cette adresse : connectez-vous.";
  if (/password should be at least/i.test(message)) return "Le mot de passe doit compter au moins 6 caractères.";
  if (/rate limit/i.test(message)) return "Trop de tentatives : réessayez dans quelques minutes.";
  return message;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await authOrThrow().signInWithPassword({ email, password });
  if (error) throw new Error(explain(error.message));
}

/** Crée un compte. Renvoie `true` si une confirmation par courriel est attendue. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await authOrThrow().signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/analyser` } });
  if (error) throw new Error(explain(error.message));
  return data.session === null;
}

export async function signOut(): Promise<void> {
  if (DEV_TOKEN) return;
  await authOrThrow().signOut();
}
