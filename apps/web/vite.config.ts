import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

// Les cours vivent à la racine du dépôt (content/lessons), partagés avec les
// futures applications : le serveur de développement doit pouvoir les lire.
const content = fileURLToPath(new URL("../../content", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Version affichée et comparée aux publications (mises à jour des applications).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), content] } },
  build: { target: "es2023" },
  test: { setupFiles: ["src/test-setup.ts"] },
});
