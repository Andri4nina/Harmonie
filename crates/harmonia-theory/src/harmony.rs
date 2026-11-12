//! Harmonie fonctionnelle : degrés, progressions, cadences.

use std::fmt;
use std::str::FromStr;

use crate::chord::{Chord, ChordQuality};
use crate::error::TheoryError;
use crate::key::Key;
use crate::pitch::Note;

const NUMERALS: [&str; 7] = ["I", "II", "III", "IV", "V", "VI", "VII"];

/// Accord désigné par son degré, indépendamment de la tonalité.
///
/// Convention : le degré se rapporte à la gamme de référence de la tonalité —
/// majeure en majeur, **mineure naturelle en mineur**. En La mineur, `III` est
/// donc Do, `VI` Fa et `VII` Sol, sans bémol. `accidental` altère la
/// fondamentale par rapport à ce degré (`bVII` en Do majeur = Si♭).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct RomanNumeral {
    /// 1 à 7.
    pub degree: u8,
    pub accidental: i8,
    pub quality: ChordQuality,
}

impl RomanNumeral {
    /// L'accord réel dans une tonalité donnée.
    pub fn resolve(&self, key: &Key) -> Chord {
        let scale_note = key.scale().notes()[(self.degree - 1) as usize];
        let root = Note::new(scale_note.letter, scale_note.accidental + self.accidental);
        Chord::new(root, self.quality)
    }

    /// Le degré d'un accord dans une tonalité. `None` si sa fondamentale est
    /// à plus d'un demi-ton chromatique du degré portant le même nom de note.
    /// La basse (renversement) n'est pas prise en compte.
    pub fn of(chord: &Chord, key: &Key) -> Option<RomanNumeral> {
        let notes = key.scale().notes();
        let index = notes.iter().position(|n| n.letter == chord.root.letter)?;
        let accidental = chord.root.accidental - notes[index].accidental;
        (-1..=1).contains(&accidental).then_some(RomanNumeral {
            degree: index as u8 + 1,
            accidental,
            quality: chord.quality,
        })
    }
}

impl FromStr for RomanNumeral {
    type Err = TheoryError;

    /// Lit `I`, `vi`, `V7`, `ii°`, `viiø7`, `bVII`, `IVmaj7`.
    /// La casse donne la tierce : majuscules = majeure, minuscules = mineure.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || TheoryError::InvalidRomanNumeral(s.to_string());
        let mut rest = s.trim();
        let mut accidental: i8 = 0;
        loop {
            if let Some(r) = rest.strip_prefix('b').or_else(|| rest.strip_prefix('♭')) {
                accidental -= 1;
                rest = r;
            } else if let Some(r) = rest.strip_prefix('#').or_else(|| rest.strip_prefix('♯')) {
                accidental += 1;
                rest = r;
            } else {
                break;
            }
            if accidental.abs() > 2 {
                return Err(err());
            }
        }
        let end = rest
            .find(|c: char| !matches!(c, 'I' | 'V' | 'i' | 'v'))
            .unwrap_or(rest.len());
        let (numeral, suffix) = rest.split_at(end);
        let is_upper = numeral.chars().all(|c| c.is_ascii_uppercase());
        let is_lower = numeral.chars().all(|c| c.is_ascii_lowercase());
        if numeral.is_empty() || !(is_upper || is_lower) {
            return Err(err());
        }
        let upper = numeral.to_ascii_uppercase();
        let degree = NUMERALS.iter().position(|&n| n == upper).ok_or_else(err)? as u8 + 1;
        let quality = if is_upper {
            ChordQuality::from_suffix(suffix)
        } else {
            match suffix {
                "°" | "o" | "dim" => Some(ChordQuality::Diminished),
                "°7" | "o7" | "dim7" => Some(ChordQuality::Diminished7),
                "ø" | "ø7" | "7b5" => Some(ChordQuality::HalfDiminished7),
                _ => ChordQuality::from_suffix(&format!("m{suffix}")),
            }
        }
        .ok_or_else(err)?;
        Ok(RomanNumeral {
            degree,
            accidental,
            quality,
        })
    }
}

impl fmt::Display for RomanNumeral {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let sign = if self.accidental >= 0 { '#' } else { 'b' };
        for _ in 0..self.accidental.unsigned_abs() {
            write!(f, "{sign}")?;
        }
        let numeral = NUMERALS[(self.degree - 1) as usize];
        let minor = self.quality.has_minor_third();
        if minor {
            write!(f, "{}", numeral.to_ascii_lowercase())?;
        } else {
            write!(f, "{numeral}")?;
        }
        let suffix = match self.quality {
            ChordQuality::Diminished => "°",
            ChordQuality::Diminished7 => "°7",
            ChordQuality::HalfDiminished7 => "ø7",
            quality if minor => {
                let suffix = quality.suffix();
                suffix.strip_prefix('m').unwrap_or(suffix)
            }
            quality => quality.suffix(),
        };
        write!(f, "{suffix}")
    }
}

/// Suite de degrés. Transposer une progression revient à la résoudre dans une
/// autre tonalité.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Progression {
    pub numerals: Vec<RomanNumeral>,
}

impl Progression {
    pub fn new(numerals: Vec<RomanNumeral>) -> Self {
        Self { numerals }
    }

    /// Les accords réels dans une tonalité.
    pub fn resolve(&self, key: &Key) -> Vec<Chord> {
        self.numerals.iter().map(|n| n.resolve(key)).collect()
    }

    /// Analyse une suite d'accords dans une tonalité. Un accord sans degré
    /// (fondamentale trop éloignée de la gamme) donne `None`.
    pub fn analyze(chords: &[Chord], key: &Key) -> Vec<Option<RomanNumeral>> {
        chords.iter().map(|c| RomanNumeral::of(c, key)).collect()
    }

    /// Cadence formée par les deux derniers accords, s'il y en a une.
    pub fn final_cadence(&self, key: &Key) -> Option<Cadence> {
        let chords = self.resolve(key);
        match chords.as_slice() {
            [.., from, to] => Cadence::detect(key, from, to),
            _ => None,
        }
    }
}

impl FromStr for Progression {
    type Err = TheoryError;

    /// Lit `I-V-vi-IV`, `ii7 V7 Imaj7`, `I | IV | V`…
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let numerals = s
            .split(|c: char| c.is_whitespace() || matches!(c, '-' | '–' | '—' | ',' | '|' | '→'))
            .filter(|part| !part.is_empty())
            .map(str::parse)
            .collect::<Result<Vec<RomanNumeral>, _>>()?;
        if numerals.is_empty() {
            return Err(TheoryError::InvalidRomanNumeral(s.to_string()));
        }
        Ok(Progression { numerals })
    }
}

impl fmt::Display for Progression {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, numeral) in self.numerals.iter().enumerate() {
            if i > 0 {
                write!(f, "-")?;
            }
            write!(f, "{numeral}")?;
        }
        Ok(())
    }
}

/// Cadences reconnues à partir des fondamentales de deux accords successifs.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Cadence {
    /// V → I : conclusion.
    Authentic,
    /// IV → I.
    Plagal,
    /// Arrêt sur V : suspension.
    Half,
    /// V → vi (VI en mineur) : résolution évitée.
    Deceptive,
}

impl Cadence {
    /// Détecte la cadence formée par `from` → `to`.
    ///
    /// Les cadences parfaite et rompue exigent une dominante à tierce majeure
    /// (la sensible) : en mineur, `Em → Am` n'est pas reconnu, `E → Am` l'est.
    /// L'analyse ne tient compte ni des renversements ni de la position
    /// métrique ; elle ne distingue donc pas cadence parfaite et imparfaite.
    pub fn detect(key: &Key, from: &Chord, to: &Chord) -> Option<Cadence> {
        let from_numeral = RomanNumeral::of(from, key)?;
        let to_numeral = RomanNumeral::of(to, key)?;
        if from_numeral.accidental != 0 || to_numeral.accidental != 0 {
            return None;
        }
        let dominant = from.quality.has_major_third();
        match (from_numeral.degree, to_numeral.degree) {
            (5, 1) if dominant => Some(Cadence::Authentic),
            (5, 6) if dominant => Some(Cadence::Deceptive),
            (4, 1) => Some(Cadence::Plagal),
            (degree, 5) if degree != 5 => Some(Cadence::Half),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(s: &str) -> Key {
        s.parse().unwrap()
    }
    fn chord(s: &str) -> Chord {
        s.parse().unwrap()
    }
    fn resolve(progression: &str, k: &str) -> String {
        progression
            .parse::<Progression>()
            .unwrap()
            .resolve(&key(k))
            .iter()
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn resolves_the_pop_progression() {
        assert_eq!(resolve("I-V-vi-IV", "C"), "C G Am F");
        assert_eq!(resolve("I-V-vi-IV", "G"), "G D Em C");
        assert_eq!(resolve("I-V-vi-IV", "Eb"), "Eb Bb Cm Ab");
        assert_eq!(resolve("I-V-vi-IV", "F#"), "F# C# D#m B");
    }

    #[test]
    fn resolves_common_progressions() {
        assert_eq!(resolve("ii7 V7 Imaj7", "C"), "Dm7 G7 Cmaj7");
        assert_eq!(resolve("ii7 V7 Imaj7", "Bb"), "Cm7 F7 Bbmaj7");
        assert_eq!(resolve("I-IV-V", "A"), "A D E");
        assert_eq!(resolve("I | vi | IV | V", "C"), "C Am F G");
        assert_eq!(resolve("I-bVII-IV", "C"), "C Bb F");
        assert_eq!(resolve("vii°", "C"), "Bdim");
        assert_eq!(resolve("viiø7", "C"), "Bm7b5");
    }

    #[test]
    fn minor_keys_use_the_natural_minor_degrees() {
        // Cadence andalouse.
        assert_eq!(resolve("i-VII-VI-V", "Am"), "Am G F E");
        assert_eq!(resolve("i-iv-v", "Am"), "Am Dm Em");
        assert_eq!(resolve("iiø7-V7-i", "Cm"), "Dm7b5 G7 Cm");
        assert_eq!(resolve("i-III-VII", "Em"), "Em G D");
    }

    #[test]
    fn numerals_round_trip() {
        for s in [
            "I", "ii", "iii", "IV", "V", "vi", "vii°", "V7", "Imaj7", "ii7", "viiø7", "vii°7",
            "bVII", "#iv°", "bIII", "Isus4", "V9", "ii9", "i6", "iMaj7", "III+", "IV6", "V7sus4",
            "V13", "iadd9",
        ] {
            let numeral: RomanNumeral = s.parse().unwrap();
            let shown = numeral.to_string();
            assert_eq!(shown.parse::<RomanNumeral>().unwrap(), numeral, "{s} → {shown}");
        }
        assert_eq!("III+".parse::<RomanNumeral>().unwrap().to_string(), "IIIaug");
        assert_eq!("iidim".parse::<RomanNumeral>().unwrap().to_string(), "ii°");
    }

    #[test]
    fn rejects_malformed_numerals() {
        for s in ["", "VIII", "Iv", "X", "IIII", "Vfoo", "b", "bbbV"] {
            assert!(s.parse::<RomanNumeral>().is_err(), "{s:?} devrait être refusé");
        }
        assert!("".parse::<Progression>().is_err());
        assert!("I-X-V".parse::<Progression>().is_err());
    }

    #[test]
    fn analyzes_chords_in_a_key() {
        let chords: Vec<Chord> = ["C", "G", "Am", "F", "Bb", "E7", "Bdim", "F#m7b5"]
            .iter()
            .map(|s| chord(s))
            .collect();
        let numerals: Vec<String> = Progression::analyze(&chords, &key("C"))
            .iter()
            .map(|n| n.unwrap().to_string())
            .collect();
        assert_eq!(numerals, ["I", "V", "vi", "IV", "bVII", "III7", "vii°", "#ivø7"]);
    }

    #[test]
    fn analysis_inverts_resolution_in_every_key() {
        let progression: Progression = "I-vi-ii7-V7-iii-IVmaj7-vii°-bVII".parse().unwrap();
        for major in Key::circle_of_fifths() {
            for k in [major, major.relative()] {
                let chords = progression.resolve(&k);
                let analyzed: Vec<RomanNumeral> = Progression::analyze(&chords, &k)
                    .into_iter()
                    .map(|n| n.unwrap())
                    .collect();
                assert_eq!(analyzed, progression.numerals, "{k}");
            }
        }
    }

    #[test]
    fn transposing_is_resolving_in_another_key() {
        let progression: Progression = "I-V-vi-IV".parse().unwrap();
        let interval = crate::Interval::MAJOR_SECOND;
        let in_c = progression.resolve(&key("C"));
        let transposed: Vec<Chord> = in_c.iter().map(|c| c.transposed_up(interval)).collect();
        assert_eq!(transposed, progression.resolve(&key("D")));
    }

    #[test]
    fn detects_cadences() {
        let c = key("C");
        assert_eq!(Cadence::detect(&c, &chord("G"), &chord("C")), Some(Cadence::Authentic));
        assert_eq!(Cadence::detect(&c, &chord("G7"), &chord("C")), Some(Cadence::Authentic));
        assert_eq!(Cadence::detect(&c, &chord("F"), &chord("C")), Some(Cadence::Plagal));
        assert_eq!(Cadence::detect(&c, &chord("Dm"), &chord("G")), Some(Cadence::Half));
        assert_eq!(Cadence::detect(&c, &chord("G"), &chord("Am")), Some(Cadence::Deceptive));
        assert_eq!(Cadence::detect(&c, &chord("C"), &chord("F")), None);
        assert_eq!(Cadence::detect(&c, &chord("Am"), &chord("Dm")), None);

        let a_minor = key("Am");
        assert_eq!(
            Cadence::detect(&a_minor, &chord("E7"), &chord("Am")),
            Some(Cadence::Authentic)
        );
        assert_eq!(
            Cadence::detect(&a_minor, &chord("E"), &chord("F")),
            Some(Cadence::Deceptive)
        );
        // Sans sensible, pas de cadence parfaite.
        assert_eq!(Cadence::detect(&a_minor, &chord("Em"), &chord("Am")), None);
    }

    #[test]
    fn final_cadence_of_a_progression() {
        let k = key("C");
        let cadence = |s: &str| s.parse::<Progression>().unwrap().final_cadence(&k);
        assert_eq!(cadence("ii-V-I"), Some(Cadence::Authentic));
        assert_eq!(cadence("I-IV-I"), Some(Cadence::Plagal));
        assert_eq!(cadence("I-vi-IV-V"), Some(Cadence::Half));
        assert_eq!(cadence("I-V-vi"), Some(Cadence::Deceptive));
        assert_eq!(cadence("I"), None);
    }
}
