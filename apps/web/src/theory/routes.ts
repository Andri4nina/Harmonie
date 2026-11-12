// Adresses lisibles des pages de référence, en français :
//   /notes/do-diese
//   /gammes/re-dorien
//   /accords/la-mineur-7-sur-sol
//   /tonalites/mi-bemol-majeur
//   /progressions/two-five-one-en-do-majeur
//
// Ce fichier ne fait que traduire un identifiant du moteur en adresse et
// inversement. La validité musicale est toujours vérifiée par le moteur.

const NOTE_SLUG: Record<string, string> = { C: "do", D: "re", E: "mi", F: "fa", G: "sol", A: "la", B: "si" };

const SCALE_SLUG: Record<string, string> = {
  major: "majeure",
  dorian: "dorien",
  phrygian: "phrygien",
  lydian: "lydien",
  mixolydian: "mixolydien",
  natural_minor: "mineure-naturelle",
  locrian: "locrien",
  harmonic_minor: "mineure-harmonique",
  melodic_minor: "mineure-melodique",
  major_pentatonic: "pentatonique-majeure",
  minor_pentatonic: "pentatonique-mineure",
  blues: "blues",
  whole_tone: "par-tons",
  diminished_whole_half: "diminuee-ton-demi-ton",
  diminished_half_whole: "diminuee-demi-ton-ton",
  chromatic: "chromatique",
};

/** Suffixe du symbole d'accord → fragment d'adresse. */
const CHORD_SLUG: Record<string, string> = {
  "": "majeur",
  m: "mineur",
  dim: "diminue",
  aug: "augmente",
  sus2: "sus2",
  sus4: "sus4",
  "5": "quinte",
  "6": "sixte",
  m6: "mineur-6",
  "7": "septieme",
  maj7: "majeur-7",
  m7: "mineur-7",
  mMaj7: "mineur-majeur-7",
  dim7: "diminue-7",
  m7b5: "demi-diminue",
  "7#5": "7-quinte-augmentee",
  "maj7#5": "majeur-7-quinte-augmentee",
  "7sus4": "7-sus4",
  add9: "add9",
  madd9: "mineur-add9",
  "9": "neuvieme",
  maj9: "majeur-9",
  m9: "mineur-9",
  "11": "onzieme",
  m11: "mineur-11",
  "13": "treizieme",
  maj13: "majeur-13",
  m13: "mineur-13",
};

const MODE_SLUG: Record<string, string> = { major: "majeur", minor: "mineur" };

function invert(table: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [value, key]));
}

const SLUG_NOTE = invert(NOTE_SLUG);
const SLUG_SCALE = invert(SCALE_SLUG);
const SLUG_CHORD = invert(CHORD_SLUG);
const SLUG_MODE = invert(MODE_SLUG);

function noteSlug(note: string): string {
  const parts = [NOTE_SLUG[note[0] ?? ""] ?? ""];
  for (const accidental of note.slice(1)) parts.push(accidental === "#" ? "diese" : "bemol");
  return parts.join("-");
}

/** Lit une note en tête d'une liste de fragments ; renvoie la note et le reste. */
function takeNote(tokens: string[]): [string, string[]] | null {
  const letter = SLUG_NOTE[tokens[0] ?? ""];
  if (!letter) return null;
  let index = 1;
  let accidentals = "";
  while (tokens[index] === "diese" || tokens[index] === "bemol") {
    accidentals += tokens[index] === "diese" ? "#" : "b";
    index++;
  }
  return [letter + accidentals, tokens.slice(index)];
}

const CHORD_PATTERN = /^([A-G][#b]*)([^/]*)(?:\/([A-G][#b]*))?$/;

/** Adresse de la page d'un nœud. */
export function pathOf(id: string): string {
  const separator = id.indexOf(":");
  const kind = id.slice(0, separator);
  const rest = id.slice(separator + 1);
  switch (kind) {
    case "note":
      return `/notes/${noteSlug(rest)}`;
    case "scale": {
      const [tonic = "", scale = ""] = rest.split(":");
      return `/gammes/${noteSlug(tonic)}-${SCALE_SLUG[scale] ?? scale}`;
    }
    case "key": {
      const [tonic = "", mode = ""] = rest.split(":");
      return `/tonalites/${noteSlug(tonic)}-${MODE_SLUG[mode] ?? mode}`;
    }
    case "chord": {
      const match = CHORD_PATTERN.exec(rest);
      if (!match) return "/";
      const [, root = "", suffix = "", bass] = match;
      const base = `/accords/${noteSlug(root)}-${CHORD_SLUG[suffix] ?? "inconnu"}`;
      return bass ? `${base}-sur-${noteSlug(bass)}` : base;
    }
    case "progression": {
      const [progression = "", tonic = "", mode = ""] = rest.split(":");
      return `/progressions/${progression}-en-${noteSlug(tonic)}-${MODE_SLUG[mode] ?? mode}`;
    }
    default:
      return "/";
  }
}

export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * Identifiant du nœud désigné par une adresse, ou `null` si l'adresse n'a pas
 * la forme d'une page de référence. L'identifiant renvoyé peut encore être
 * refusé par le moteur.
 */
export function idOf(pathname: string): string | null {
  const [section, slug, ...extra] = normalizePath(pathname).split("/").filter(Boolean);
  if (!section || !slug || extra.length > 0) return null;
  const tokens = slug.split("-");
  switch (section) {
    case "notes": {
      const note = takeNote(tokens);
      return note && note[1].length === 0 ? `note:${note[0]}` : null;
    }
    case "gammes": {
      const note = takeNote(tokens);
      const scale = note && SLUG_SCALE[note[1].join("-")];
      return note && scale ? `scale:${note[0]}:${scale}` : null;
    }
    case "tonalites": {
      const note = takeNote(tokens);
      const mode = note && SLUG_MODE[note[1].join("-")];
      return note && mode ? `key:${note[0]}:${mode}` : null;
    }
    case "accords": {
      const root = takeNote(tokens);
      if (!root) return null;
      let quality = root[1];
      let bass = "";
      const over = quality.lastIndexOf("sur");
      if (over >= 0) {
        const note = takeNote(quality.slice(over + 1));
        if (!note || note[1].length > 0) return null;
        bass = `/${note[0]}`;
        quality = quality.slice(0, over);
      }
      const suffix = SLUG_CHORD[quality.join("-")];
      return suffix === undefined ? null : `chord:${root[0]}${suffix}${bass}`;
    }
    case "progressions": {
      const cut = slug.lastIndexOf("-en-");
      if (cut < 0) return null;
      const note = takeNote(slug.slice(cut + 4).split("-"));
      const mode = note && SLUG_MODE[note[1].join("-")];
      return note && mode ? `progression:${slug.slice(0, cut)}:${note[0]}:${mode}` : null;
    }
    default:
      return null;
  }
}
