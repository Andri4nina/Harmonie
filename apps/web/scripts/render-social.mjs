// Rend l'image de partage (og-image.png) et l'icône d'application
// (icon-512.png) à partir des pages HTML de scripts/social, avec un
// navigateur Chromium sans interface (Chrome ou Edge).
//
//   CHROME_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node scripts/render-social.mjs
//
// Les PNG produits sont versionnés : ce script n'est à relancer que si leur
// source change.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = process.env.CHROME_PATH;
if (!browser) throw new Error("Définir CHROME_PATH (chemin de Chrome ou d'Edge).");

const shots = [
  { source: "scripts/social/og-image.html", output: "public/og-image.png", size: "1200,630" },
  { source: "scripts/social/icon.html", output: "public/icon-512.png", size: "512,512" },
  { source: "scripts/social/icon-1024.html", output: "../desktop/src-tauri/app-icon.png", size: "1024,1024", transparent: true },
];

for (const shot of shots) {
  execFileSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    ...(shot.transparent ? ["--default-background-color=00000000"] : []),
    `--window-size=${shot.size}`,
    `--screenshot=${resolve(web, shot.output)}`,
    pathToFileURL(resolve(web, shot.source)).href,
  ]);
  console.log(`${shot.output} écrit`);
}
