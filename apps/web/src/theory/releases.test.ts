import { describe, expect, it } from "vitest";
import { formatBytes, guessPlatform, pickAssets } from "./releases";

const release = (tag: string, date: string, files: string[], extra: Partial<{ draft: boolean; prerelease: boolean }> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: date,
  assets: files.map((name) => ({ name, browser_download_url: `https://example.org/${tag}/${name}`, size: 12_500_000 })),
  ...extra,
});

describe("pickAssets", () => {
  it("prend, pour chaque plateforme, la publication la plus récente qui la contient", () => {
    const assets = pickAssets([
      release("v1.6.0", "2027-01-01T00:00:00Z", ["Harmonie_1.6.0_x64-setup.exe", "Harmonie_1.6.0_amd64.AppImage"]),
      release("v1.7.0", "2027-03-01T00:00:00Z", ["harmonie-1.7.0.apk"]),
    ]);
    expect(assets.windows?.version).toBe("v1.6.0");
    expect(assets.linux?.name).toBe("Harmonie_1.6.0_amd64.AppImage");
    expect(assets.android?.version).toBe("v1.7.0");
    expect(assets.macos).toBeUndefined();
  });

  it("conseille l'installateur .exe avant le .msi, et le paquet .deb sous Linux", () => {
    const assets = pickAssets([
      release("v1.6.0", "2027-01-01T00:00:00Z", [
        "Harmonie_1.6.0_x64_en-US.msi",
        "Harmonie_1.6.0_x64-setup.exe",
        "Harmonie_1.6.0_amd64.AppImage",
        "Harmonie_1.6.0_amd64.deb",
        "Harmonie-1.6.0-1.x86_64.rpm",
      ]),
    ]);
    expect(assets.windows?.name).toBe("Harmonie_1.6.0_x64-setup.exe");
    expect(assets.linux?.name).toBe("Harmonie_1.6.0_amd64.deb");
    // Les trois formats Linux restent proposés en ligne de commande.
    expect(assets.linux?.variants.map((variant) => variant.name).sort()).toEqual([
      "Harmonie-1.6.0-1.x86_64.rpm",
      "Harmonie_1.6.0_amd64.AppImage",
      "Harmonie_1.6.0_amd64.deb",
    ]);
  });

  it("ignore les brouillons et les préversions", () => {
    const assets = pickAssets([
      release("v2.0.0-rc1", "2027-05-01T00:00:00Z", ["a.apk"], { prerelease: true }),
      release("v2.0.0", "2027-06-01T00:00:00Z", ["b.apk"], { draft: true }),
    ]);
    expect(assets.android).toBeUndefined();
  });

  it("ne propose rien quand aucune publication n'existe", () => {
    expect(pickAssets([])).toEqual({});
  });
});

describe("guessPlatform", () => {
  it("reconnaît les systèmes courants", () => {
    expect(guessPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(guessPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(guessPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("macos");
    expect(guessPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBeNull();
  });
});

it("formate les tailles en français", () => {
  expect(formatBytes(12_500_000)).toBe("12,5 Mo");
  expect(formatBytes(840_000)).toBe("840 Ko");
});
