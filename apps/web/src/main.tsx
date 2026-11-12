import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { loadEngine } from "./theory/engine";
import { normalizePath } from "./theory/routes";

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");

// Le moteur de théorie (WebAssembly) doit être prêt avant le rendu : toutes
// les vues en dépendent. Sur une page pré-rendue, le HTML est déjà lisible
// pendant ce chargement.
await loadEngine();

const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// N'hydrater que si le HTML reçu est bien celui de cette adresse : un
// hébergeur peut servir la coquille générique pour une adresse non pré-rendue.
if (root.dataset.prerendered === normalizePath(window.location.pathname)) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
