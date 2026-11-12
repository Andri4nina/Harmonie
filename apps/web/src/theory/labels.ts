// Textes français de l'interface. Aucune règle musicale ici : seulement la
// mise en mots de ce que le moteur renvoie.

import type { NodeKind } from "./engine";

export const KIND_LABEL: Record<NodeKind, string> = {
  note: "Note",
  scale: "Gamme",
  chord: "Accord",
  key: "Tonalité",
  progression: "Progression",
};

const SCALE_LABEL: Record<string, string> = {
  major: "majeure",
  dorian: "dorien",
  phrygian: "phrygien",
  lydian: "lydien",
  mixolydian: "mixolydien",
  natural_minor: "mineure naturelle",
  locrian: "locrien",
  harmonic_minor: "mineure harmonique",
  melodic_minor: "mineure mélodique",
  major_pentatonic: "pentatonique majeure",
  minor_pentatonic: "pentatonique mineure",
  blues: "blues",
  whole_tone: "par tons",
  diminished_whole_half: "diminuée ton / demi-ton",
  diminished_half_whole: "diminuée demi-ton / ton",
  chromatic: "chromatique",
};

const SCALE_SHORT: Record<string, string> = {
  major: "maj",
  dorian: "dor",
  phrygian: "phr",
  lydian: "lyd",
  mixolydian: "mix",
  natural_minor: "min",
  locrian: "loc",
  harmonic_minor: "harm",
  melodic_minor: "mél",
};

export const PROGRESSION_LABEL: Record<string, string> = {
  pop: "Progression pop",
  fifties: "Années 50",
  "three-chord": "Trois accords",
  "two-five-one": "ii – V – I",
  "six-four-one-five": "vi – IV – I – V",
  circle: "Cycle des quintes",
  canon: "Canon",
  "twelve-bar-blues": "Blues 12 mesures",
  andalusian: "Cadence andalouse",
  "minor-two-five-one": "ii – V – i mineur",
  aeolian: "Éolienne",
  "minor-pop": "Pop mineure",
  "minor-three-chord": "Trois accords mineurs",
};

const MODE_LABEL: Record<string, string> = { major: "majeur", minor: "mineur" };

/** Nom complet d'un nœud à partir de son identifiant. */
export function labelOf(id: string): string {
  const [kind, ...parts] = id.split(":");
  switch (kind) {
    case "scale":
      return `${parts[0]} ${SCALE_LABEL[parts[1] ?? ""] ?? parts[1]}`;
    case "key":
      return `${parts[0]} ${MODE_LABEL[parts[1] ?? ""] ?? parts[1]}`;
    case "progression":
      return `${PROGRESSION_LABEL[parts[0] ?? ""] ?? parts[0]} en ${parts[1]} ${MODE_LABEL[parts[2] ?? ""] ?? ""}`;
    default:
      return parts.join(":");
  }
}

/** Nom court, pour le graphe et les pastilles. */
export function shortLabelOf(id: string): string {
  const [kind, ...parts] = id.split(":");
  switch (kind) {
    case "scale":
      return `${parts[0]} ${SCALE_SHORT[parts[1] ?? ""] ?? parts[1]}`;
    case "key":
      return parts[1] === "minor" ? `${parts[0]}m` : `${parts[0]}`;
    case "progression":
      return PROGRESSION_LABEL[parts[0] ?? ""] ?? parts[0] ?? "";
    default:
      return parts.join(":");
  }
}

export const GROUP_LABEL: Record<string, string> = {
  enharmonic: "Enharmonie",
  neighbors: "Notes voisines",
  intervals: "Intervalles depuis cette note",
  keys: "Tonalités contenant cette note",
  modes: "Modes sur cette tonique",
  scales: "Autres gammes sur cette tonique",
  chords: "Accords contenant cette note",
  degrees: "Notes de la gamme",
  harmonized: "Accords de la gamme",
  relative_modes: "Modes relatifs",
  key: "Tonalité",
  chord_tones: "Notes de l'accord",
  inversions: "Renversements",
  root_position: "État fondamental",
  diatonic_in: "Tonalités où il apparaît",
  scale: "Gamme",
  diatonic_chords: "Accords de la tonalité",
  related_keys: "Tons voisins",
  progressions: "Progressions usuelles",
  steps: "Accords de la progression",
};

const INTERVAL_LABEL: Record<string, string> = {
  P1: "fondamentale",
  m2: "seconde mineure",
  M2: "seconde majeure",
  m3: "tierce mineure",
  M3: "tierce majeure",
  P4: "quarte juste",
  A4: "quarte augmentée",
  d5: "quinte diminuée",
  P5: "quinte juste",
  A5: "quinte augmentée",
  m6: "sixte mineure",
  M6: "sixte majeure",
  d7: "septième diminuée",
  m7: "septième mineure",
  M7: "septième majeure",
  P8: "octave",
  M9: "neuvième majeure",
  P11: "onzième",
  M13: "treizième",
};

export function intervalLabel(interval: string): string {
  return INTERVAL_LABEL[interval] ?? interval;
}

const RELATED_KEY_LABEL: Record<string, string> = {
  relative: "relatif",
  parallel: "homonyme",
  dominant: "dominante",
  subdominant: "sous-dominante",
};

/** Précision affichée à côté d'une cible, selon la rubrique. */
export function detailLabel(group: string, detail: string | null): string | null {
  if (detail === null) return null;
  switch (group) {
    case "intervals":
    case "chords":
    case "chord_tones":
      return INTERVAL_LABEL[detail] ?? detail;
    case "keys":
      return `degré ${detail}`;
    case "inversions":
      return detail === "1" ? "1er" : `${detail}e`;
    case "related_keys":
      return RELATED_KEY_LABEL[detail] ?? detail;
    default:
      return detail;
  }
}

export const FACT_LABEL: Record<string, string> = {
  pitch_class: "Classe de hauteur",
  midi: "Hauteur MIDI",
  frequency: "Fréquence (La = 440 Hz)",
  notes: "Notes",
  formula: "Formule",
  inversion: "Renversement",
  foreign_bass: "Basse étrangère",
  figured_bass: "Basse chiffrée",
  signature: "Armure",
  relative: "Relatif",
  numerals: "Degrés",
  chords: "Accords",
  cadence: "Cadence finale",
};

const CADENCE_LABEL: Record<string, string> = {
  authentic: "parfaite (V → I)",
  plagal: "plagale (IV → I)",
  half: "demi-cadence (arrêt sur V)",
  deceptive: "rompue (V → vi)",
};

export function factValue(key: string, value: string): string {
  switch (key) {
    case "relative":
      return labelOf(value);
    case "cadence":
      return CADENCE_LABEL[value] ?? value;
    case "inversion":
      return value === "0" ? "état fondamental" : value === "1" ? "1er" : `${value}e`;
    case "signature": {
      if (value === "0") return "aucune altération";
      const count = Number.parseInt(value, 10);
      const name = value.endsWith("#") ? "dièse" : "bémol";
      return `${count} ${name}${count > 1 ? "s" : ""}`;
    }
    default:
      return value;
  }
}

/**
 * Teinte d'une classe de hauteur. Les teintes suivent le cercle des quintes :
 * deux notes proches harmoniquement ont des couleurs proches.
 */
export function hueOf(pitchClass: number): number {
  return (((pitchClass * 7) % 12) * 30 + 40) % 360;
}

const INSTRUMENT_LABEL: Record<string, string> = {
  piano: "Piano",
  guitar: "Guitare",
  bass: "Basse",
  violin: "Violon",
  cello: "Violoncelle",
  flute: "Flûte",
  "alto-saxophone": "Saxophone alto",
  "tenor-saxophone": "Saxophone ténor",
  "drum-kit": "Batterie",
  synthesizer: "Synthétiseur",
};

/** Nom français d'un instrument du moteur (le moteur les nomme en anglais). */
export function instrumentLabel(id: string, fallback: string): string {
  return INSTRUMENT_LABEL[id] ?? fallback;
}
