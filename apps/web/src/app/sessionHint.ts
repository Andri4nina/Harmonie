// Savoir si une session est enregistrée sur l'appareil, sans charger le
// client Supabase (la barre latérale et l'avatar sont sur toutes les pages).

import { useEffect, useState } from "react";

/** Clé de la session dans le stockage local. */
export const SESSION_KEY = "harmonie-session";

/** Événement émis à chaque connexion ou déconnexion dans cet onglet. */
export const SESSION_EVENT = "harmonie-session";

export interface StoredAccount {
  email: string;
  name: string | null;
  /** Photo du compte (Google), ou `null`. */
  avatar: string | null;
}

/** Compte de la session enregistrée, ou `null`. */
export function storedAccount(raw: string | null): StoredAccount | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as {
      refresh_token?: string;
      user?: { email?: string; user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string } };
    };
    if (!session.refresh_token) return null;
    const meta = session.user?.user_metadata ?? {};
    const avatar = meta.avatar_url ?? meta.picture ?? null;
    return {
      email: session.user?.email ?? "",
      name: meta.full_name ?? meta.name ?? null,
      avatar: avatar && /^https:\/\//.test(avatar) ? avatar : null,
    };
  } catch {
    return null;
  }
}

/** Initiales affichées quand il n'y a pas de photo. */
export function initials(account: StoredAccount): string {
  const source = account.name?.trim() || account.email.split("@")[0] || "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/** Compte connecté sur cet appareil ; suit connexions et déconnexions. */
export function useStoredAccount(): StoredAccount | null {
  const [account, setAccount] = useState<StoredAccount | null>(null);
  useEffect(() => {
    let last = "";
    const read = () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(SESSION_KEY);
      } catch {
        raw = null;
      }
      const next = storedAccount(raw);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setAccount(next);
      }
    };
    read();
    // Autre onglet : « storage » ; cet onglet : événement maison et relecture.
    window.addEventListener("storage", read);
    window.addEventListener(SESSION_EVENT, read);
    window.addEventListener("focus", read);
    const timer = setInterval(read, 5000);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(SESSION_EVENT, read);
      window.removeEventListener("focus", read);
      clearInterval(timer);
    };
  }, []);
  return account;
}
