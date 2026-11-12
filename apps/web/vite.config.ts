import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";

// Les cours vivent à la racine du dépôt (content/lessons), partagés avec les
// futures applications : le serveur de développement doit pouvoir les lire.
const content = fileURLToPath(new URL("../../content", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), content] } },
  build: { target: "es2023" },
  test: { setupFiles: ["src/test-setup.ts"] },
});
