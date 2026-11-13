// Mises à jour des applications. Le site, les installateurs et l'APK sont
// publiés ensemble à chaque version (étiquette vX.Y.Z) :
// - ordinateur : le greffon de mise à jour de Tauri lit latest.json dans la
//   dernière publication, vérifie sa signature, installe puis redémarre ;
// - Android : l'APK s'installe à la main ; l'application signale la
//   nouvelle version et propose de la télécharger.

import { REPOSITORY } from "../theory/releases";
import { isAndroidApp, isDesktop } from "./files";

export const APP_VERSION: string = __APP_VERSION__;

export interface Available {
  version: string;
  /** Ordinateur : installe et redémarre. */
  install?: () => Promise<void>;
  /** Android : adresse de l'APK à télécharger. */
  url?: string;
}

/** Compare deux versions « 1.6.0 » ; positif si `a` est plus récente. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Cherche une version plus récente que celle de l'application. */
export async function findUpdate(): Promise<Available | null> {
  if (isDesktop()) {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      install: async () => {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  }
  if (isAndroidApp()) {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) return null;
    const release = (await response.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith(".apk"));
    if (!apk || compareVersions(release.tag_name, APP_VERSION) <= 0) return null;
    return { version: release.tag_name.replace(/^v/, ""), url: apk.browser_download_url };
  }
  return null;
}
