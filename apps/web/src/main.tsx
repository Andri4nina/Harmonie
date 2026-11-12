import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { loadEngine } from "./theory/engine";

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");

// Le moteur de théorie (WebAssembly) doit être prêt avant le premier rendu :
// toutes les vues en dépendent.
await loadEngine();

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
