// Ce que l'interface doit savoir de son environnement, lu après le premier
// affichage (le HTML pré-rendu doit rester identique partout).

import { useEffect, useState } from "react";
import { isApp, isDesktop } from "./files";

/** Vrai dans l'application de bureau. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);
  return desktop;
}

/** Vrai dans une application (ordinateur ou Android). */
export function useIsApp(): boolean {
  const [app, setApp] = useState(false);
  useEffect(() => setApp(isApp()), []);
  return app;
}

/** Vrai tant que l'appareil a une connexion réseau. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
