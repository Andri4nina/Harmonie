// Savoir si une session est enregistrée sur l'appareil, sans charger le
// client Supabase (la barre latérale est présente sur toutes les pages).

import { useEffect, useState } from "react";

/** Clé de la session dans le stockage local. */
export const SESSION_KEY = "harmonie-session";

/** Adresse du compte enregistré, ou `null`. */
export function storedAccount(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { user?: { email?: string }; refresh_token?: string };
    return session.refresh_token ? (session.user?.email ?? "") : null;
  } catch {
    return null;
  }
}

/** Adresse du compte connecté sur cet appareil ; suit connexions et déconnexions. */
export function useStoredAccount(): string | null {
  const [account, setAccount] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setAccount(storedAccount(localStorage.getItem(SESSION_KEY)));
      } catch {
        setAccount(null);
      }
    };
    read();
    // Autre onglet : événement « storage » ; cet onglet : relecture au retour.
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    const timer = setInterval(read, 4000);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
      clearInterval(timer);
    };
  }, []);
  return account;
}
