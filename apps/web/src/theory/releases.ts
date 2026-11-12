// Installateurs publiés : lus dans les « releases » GitHub du dépôt. Aucun
// lien n'est inventé : une plateforme sans fichier publié est signalée comme
// telle.

export const REPOSITORY = "Andri4nina/Harmonie";
export const RELEASES_PAGE = `https://github.com/${REPOSITORY}/releases`;

export type PlatformId = "windows" | "macos" | "linux" | "android";

export interface Platform {
  id: PlatformId;
  name: string;
  detail: string;
  /** Version de la feuille de route où l'installateur est prévu. */
  planned: string;
  /** Reconnaît le nom d'un fichier d'installation de cette plateforme. */
  matches: (file: string) => boolean;
  /** Formats préférés, du plus au moins conseillé (ex. `.exe` avant `.msi`). */
  preference?: RegExp[];
}

export const PLATFORMS: Platform[] = [
  {
    id: "windows",
    name: "Windows",
    detail: "Windows 10 et 11, 64 bits",
    planned: "v1.6",
    matches: (file) => /\.(msi|exe)$/i.test(file),
    preference: [/-setup\.exe$/i, /\.exe$/i, /\.msi$/i],
  },
  {
    id: "macos",
    name: "macOS",
    detail: "Apple Silicon et Intel",
    planned: "v1.6",
    matches: (file) => /\.dmg$/i.test(file),
  },
  {
    id: "linux",
    name: "Linux",
    detail: "AppImage ou paquet Debian",
    planned: "v1.6",
    matches: (file) => /\.(appimage|deb)$/i.test(file),
    preference: [/\.appimage$/i, /\.deb$/i],
  },
  {
    id: "android",
    name: "Android",
    detail: "Fichier APK, Android 8 ou plus récent",
    planned: "v1.7",
    matches: (file) => /\.apk$/i.test(file),
  },
];

/** `private` : le dépôt n'est pas public, ses fichiers ne sont pas téléchargeables. */
export class ReleasesError extends Error {
  constructor(
    readonly reason: "private" | "unavailable",
    message: string = reason,
  ) {
    super(message);
  }
}

export interface Asset {
  name: string;
  url: string;
  bytes: number;
  version: string;
  publishedAt: string;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/**
 * Pour chaque plateforme, le fichier de la publication la plus récente qui en
 * contient un. Les brouillons et préversions sont ignorés.
 */
export function pickAssets(releases: GitHubRelease[]): Partial<Record<PlatformId, Asset>> {
  const found: Partial<Record<PlatformId, Asset>> = {};
  const published = releases
    .filter((release) => !release.draft && !release.prerelease)
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  for (const platform of PLATFORMS) {
    for (const release of published) {
      const rank = (name: string) => {
        const index = platform.preference?.findIndex((pattern) => pattern.test(name)) ?? -1;
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      const asset = release.assets.filter((candidate) => platform.matches(candidate.name)).sort((a, b) => rank(a.name) - rank(b.name))[0];
      if (asset) {
        found[platform.id] = {
          name: asset.name,
          url: asset.browser_download_url,
          bytes: asset.size,
          version: release.tag_name,
          publishedAt: release.published_at,
        };
        break;
      }
    }
  }
  return found;
}

export async function fetchAssets(signal?: AbortSignal): Promise<Partial<Record<PlatformId, Asset>>> {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (response.status === 404) throw new ReleasesError("private");
  if (!response.ok) throw new ReleasesError("unavailable", `GitHub a répondu ${response.status}`);
  return pickAssets((await response.json()) as GitHubRelease[]);
}

/** Plateforme probable du visiteur, pour la mettre en avant. */
export function guessPlatform(userAgent: string): PlatformId | null {
  if (/android/i.test(userAgent)) return "android";
  if (/windows/i.test(userAgent)) return "windows";
  if (/mac os x|macintosh/i.test(userAgent) && !/iphone|ipad/i.test(userAgent)) return "macos";
  if (/linux/i.test(userAgent)) return "linux";
  return null;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace(".", ",")} Mo` : `${Math.round(bytes / 1e3)} Ko`;
}
