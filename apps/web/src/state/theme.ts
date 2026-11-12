// Thème clair ou sombre. Le choix « system » suit le réglage de l'appareil
// et ses changements en direct. Un script en ligne d'index.html applique le
// même calcul avant le premier affichage, pour éviter tout flash.

import { useEffect, useState } from "react";
import { type ThemeChoice, useSettings } from "./store";

export type Theme = "light" | "dark";

const QUERY = "(prefers-color-scheme: light)";

export function resolveTheme(choice: ThemeChoice, systemPrefersLight: boolean): Theme {
  if (choice === "system") return systemPrefersLight ? "light" : "dark";
  return choice;
}

/** Couleur de la barre du navigateur mobile, pour chaque thème. */
export const THEME_COLOR: Record<Theme, string> = { dark: "#161a2e", light: "#eef0f6" };

/** Applique le thème choisi au document et le suit. Renvoie le thème effectif. */
export function useTheme(): Theme {
  const choice = useSettings((state) => state.theme);
  const [prefersLight, setPrefersLight] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    setPrefersLight(media.matches);
    const onChange = (event: MediaQueryListEvent) => setPrefersLight(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(choice, prefersLight);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  }, [theme]);
  return theme;
}
