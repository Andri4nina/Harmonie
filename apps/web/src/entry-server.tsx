// Point d'entrée du pré-rendu statique (exécuté par Node au build).

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App, hueForPath } from "./App";
import { catalog, loadEngineSync } from "./theory/engine";
import { type Head, headFor } from "./theory/head";

/** Adresse publique du site, normalisée (voir head.ts), pour le plan du site. */
export { SITE_URL } from "./theory/head";
import { LESSONS } from "./theory/lessons";
import { pathOf } from "./theory/routes";

export function setup(wasm: BufferSource): void {
  loadEngineSync(wasm);
}

/** Adresses à pré-rendre : l'accueil et chaque page du catalogue de référence. */
export function pages(): string[] {
  return ["/", "/tableau-de-bord", "/telecharger", "/oreille", "/composer", "/cours", ...LESSONS.map((lesson) => `/cours/${lesson.slug}`), ...catalog().map(pathOf)];
}

export function render(pathname: string): { html: string; head: Head; hue: number } {
  const html = renderToString(
    <StrictMode>
      <StaticRouter location={pathname}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  return { html, head: headFor(pathname), hue: hueForPath(pathname) };
}
