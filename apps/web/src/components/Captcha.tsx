import { useEffect, useRef } from "react";
import { useTheme } from "../state/theme";

/**
 * Vérification anti-robots Cloudflare Turnstile, demandée par Supabase avant
 * une connexion ou une inscription par adresse. Sans clé de site
 * (`VITE_TURNSTILE_SITE_KEY`), rien n'est affiché ni chargé.
 */
export const CAPTCHA_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || undefined;

interface Turnstile {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let script: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    tag.async = true;
    tag.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile indisponible")));
    tag.onerror = () => {
      script = undefined;
      reject(new Error("Turnstile indisponible"));
    };
    document.head.appendChild(tag);
  });
  return script;
}

/**
 * Le widget Turnstile. `onToken` reçoit le jeton (à usage unique), ou `null`
 * quand il expire ; changer `resetKey` en redemande un après chaque essai.
 */
export function Captcha({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const latest = useRef(onToken);
  latest.current = onToken;
  const theme = useTheme();

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY || !box.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !box.current) return;
        widget.current = turnstile.render(box.current, {
          sitekey: CAPTCHA_SITE_KEY,
          theme: theme === "light" ? "light" : "dark",
          language: "fr",
          callback: (token: string) => latest.current(token),
          "expired-callback": () => latest.current(null),
          "error-callback": () => latest.current(null),
        });
      })
      .catch(() => latest.current(null));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [theme]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      latest.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  if (!CAPTCHA_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Vérification anti-robots" />;
}
