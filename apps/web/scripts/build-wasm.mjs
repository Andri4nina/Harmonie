// Compile le moteur de théorie en WebAssembly et génère ses bindings
// JavaScript dans src/theory/pkg (dossier non versionné).
//
// Prérequis : `rustup target add wasm32-unknown-unknown` et
// `cargo install wasm-bindgen-cli` à la version de wasm-bindgen du workspace.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

run("cargo", [
  "build",
  "--package", "harmonia-theory-wasm",
  "--target", "wasm32-unknown-unknown",
  "--release",
]);

run("wasm-bindgen", [
  "--target", "web",
  "--out-dir", "apps/web/src/theory/pkg",
  "target/wasm32-unknown-unknown/release/harmonia_theory_wasm.wasm",
]);
