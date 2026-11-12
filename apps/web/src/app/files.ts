// Enregistrement d'un fichier produit par le site (exports MIDI, MusicXML).
// Dans l'application de bureau : boîte « Enregistrer sous » du système. Dans
// le navigateur : téléchargement ordinaire. Les modules de Tauri ne sont
// chargés que dans l'application de bureau.

/** Vrai dans l'application de bureau (Tauri). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface FileKind {
  /** Nom affiché dans la boîte de dialogue, ex. « Fichier MIDI ». */
  name: string;
  extension: string;
  mime: string;
}

/** Enregistre `data` ; renvoie `false` si l'utilisateur a annulé. */
export async function saveFile(fileName: string, data: Uint8Array | string, kind: FileKind): Promise<boolean> {
  if (isDesktop()) {
    const [{ save }, { writeFile, writeTextFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
    const path = await save({ defaultPath: fileName, filters: [{ name: kind.name, extensions: [kind.extension] }] });
    if (!path) return false;
    if (typeof data === "string") await writeTextFile(path, data);
    else await writeFile(path, data);
    return true;
  }
  const blob = new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type: kind.mime });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
