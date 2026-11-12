// Charge le moteur WebAssembly avant les tests (comme le fait le pré-rendu).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEngineSync } from "./theory/engine";

loadEngineSync(readFileSync(fileURLToPath(new URL("./theory/pkg/harmonia_theory_wasm_bg.wasm", import.meta.url))));
