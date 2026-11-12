//! Tonalités, armures, cercle des quintes et estimation de tonalité.

use std::fmt;
use std::str::FromStr;

use crate::chord::Chord;
use crate::error::TheoryError;
use crate::interval::Interval;
use crate::pitch::{parse_note_prefix, Note};
use crate::scale::{Scale, ScaleType};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Mode {
    Major,
    Minor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Key {
    pub tonic: Note,
    pub mode: Mode,
}

impl Key {
    pub const fn major(tonic: Note) -> Self {
        Self {
            tonic,
            mode: Mode::Major,
        }
    }

    pub const fn minor(tonic: Note) -> Self {
        Self {
            tonic,
            mode: Mode::Minor,
        }
    }

    /// Gamme de référence : majeure ou mineure naturelle.
    pub fn scale(&self) -> Scale {
        let kind = match self.mode {
            Mode::Major => ScaleType::Major,
            Mode::Minor => ScaleType::NaturalMinor,
        };
        Scale::new(self.tonic, kind)
    }

    /// Armure : nombre de dièses (positif) ou de bémols (négatif).
    pub fn signature(&self) -> i32 {
        match self.mode {
            Mode::Major => self.tonic.fifths(),
            Mode::Minor => self.tonic.fifths() - 3,
        }
    }

    /// Tonalité relative : même armure, mode opposé.
    pub fn relative(&self) -> Key {
        match self.mode {
            Mode::Major => Key::minor(self.tonic.down(Interval::MINOR_THIRD)),
            Mode::Minor => Key::major(self.tonic.up(Interval::MINOR_THIRD)),
        }
    }

    /// Tonalité homonyme : même tonique, mode opposé.
    pub fn parallel(&self) -> Key {
        match self.mode {
            Mode::Major => Key::minor(self.tonic),
            Mode::Minor => Key::major(self.tonic),
        }
    }

    /// Ton de la dominante : une quinte au-dessus, un dièse de plus.
    pub fn dominant(&self) -> Key {
        Key {
            tonic: self.tonic.up(Interval::PERFECT_FIFTH),
            mode: self.mode,
        }
    }

    /// Ton de la sous-dominante : une quinte au-dessous, un bémol de plus.
    pub fn subdominant(&self) -> Key {
        Key {
            tonic: self.tonic.down(Interval::PERFECT_FIFTH),
            mode: self.mode,
        }
    }

    /// Tons voisins : relatif, dominante, sous-dominante et leurs relatifs.
    pub fn neighbors(&self) -> Vec<Key> {
        let dominant = self.dominant();
        let subdominant = self.subdominant();
        vec![
            self.relative(),
            dominant,
            subdominant,
            dominant.relative(),
            subdominant.relative(),
        ]
    }

    /// Les douze tonalités majeures dans l'ordre du cercle des quintes, avec
    /// l'orthographe usuelle : `C G D A E B F# Db Ab Eb Bb F`.
    pub fn circle_of_fifths() -> Vec<Key> {
        (0..=6)
            .chain(-5..=-1)
            .map(|position| Key::major(Note::from_fifths(position)))
            .collect()
    }

    /// Triades diatoniques, du degré I au degré VII.
    pub fn diatonic_triads(&self) -> Vec<Chord> {
        self.scale()
            .harmonize(false)
            .expect("les gammes majeure et mineure naturelle ont sept notes")
    }

    /// Accords de septième diatoniques, du degré I au degré VII.
    pub fn diatonic_sevenths(&self) -> Vec<Chord> {
        self.scale()
            .harmonize(true)
            .expect("les gammes majeure et mineure naturelle ont sept notes")
    }

    pub fn transposed_up(&self, interval: Interval) -> Key {
        Key {
            tonic: self.tonic.up(interval),
            mode: self.mode,
        }
    }

    pub fn transposed_down(&self, interval: Interval) -> Key {
        Key {
            tonic: self.tonic.down(interval),
            mode: self.mode,
        }
    }
}

impl FromStr for Key {
    type Err = TheoryError;

    /// Lit `C`, `Am`, `F#m`, `Bb major`, `C minor`.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || TheoryError::InvalidKey(s.to_string());
        let (tonic, rest) = parse_note_prefix(s.trim()).ok_or_else(err)?;
        match rest.trim() {
            "" | "M" | "maj" | "major" => Ok(Key::major(tonic)),
            "m" | "min" | "minor" => Ok(Key::minor(tonic)),
            _ => Err(err()),
        }
    }
}

impl fmt::Display for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mode = match self.mode {
            Mode::Major => "major",
            Mode::Minor => "minor",
        };
        write!(f, "{} {}", self.tonic, mode)
    }
}

/// Une tonalité candidate et sa corrélation avec l'histogramme analysé.
#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub struct KeyEstimate {
    pub key: Key,
    /// Coefficient de Pearson, de -1 à 1.
    pub correlation: f64,
}

// Profils de Krumhansl et Kessler (1982) : stabilité perçue de chaque degré
// chromatique dans un contexte majeur ou mineur, tonique en première position.
const MAJOR_PROFILE: [f64; 12] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE: [f64; 12] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

// Toniques usuelles par classe de hauteur (armures les plus courtes).
const MAJOR_TONICS: [&str; 12] = [
    "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];
const MINOR_TONICS: [&str; 12] = [
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
];

fn pearson(a: &[f64; 12], b: &[f64; 12]) -> Option<f64> {
    let mean = |v: &[f64; 12]| v.iter().sum::<f64>() / 12.0;
    let (mean_a, mean_b) = (mean(a), mean(b));
    let mut covariance = 0.0;
    let mut variance_a = 0.0;
    let mut variance_b = 0.0;
    for i in 0..12 {
        let (da, db) = (a[i] - mean_a, b[i] - mean_b);
        covariance += da * db;
        variance_a += da * da;
        variance_b += db * db;
    }
    let denominator = (variance_a * variance_b).sqrt();
    (denominator > f64::EPSILON).then(|| covariance / denominator)
}

/// Estime la tonalité par l'algorithme de Krumhansl-Schmuckler.
///
/// `histogram[pc]` est le poids de chaque classe de hauteur (durée cumulée,
/// énergie de chroma…), `C` en position 0. L'histogramme est corrélé aux 24
/// profils transposés ; les candidats sont renvoyés du plus au moins probable.
///
/// Renvoie une liste vide si l'histogramme est plat ou contient des valeurs
/// non finies : il n'y a alors rien à estimer.
///
/// Limite connue : une tonalité et sa relative obtiennent souvent des scores
/// proches. L'écart entre les deux premiers candidats mesure la fiabilité.
pub fn estimate_key(histogram: &[f64; 12]) -> Vec<KeyEstimate> {
    if histogram.iter().any(|w| !w.is_finite()) {
        return Vec::new();
    }
    let mut estimates = Vec::with_capacity(24);
    for tonic in 0..12 {
        let candidates = [
            (Mode::Major, &MAJOR_PROFILE, &MAJOR_TONICS),
            (Mode::Minor, &MINOR_PROFILE, &MINOR_TONICS),
        ];
        for (mode, profile, tonics) in candidates {
            let mut rotated = [0.0; 12];
            for (pc, slot) in rotated.iter_mut().enumerate() {
                *slot = profile[(pc + 12 - tonic) % 12];
            }
            let Some(correlation) = pearson(histogram, &rotated) else {
                return Vec::new();
            };
            let note: Note = tonics[tonic].parse().expect("table de toniques valide");
            estimates.push(KeyEstimate {
                key: Key { tonic: note, mode },
                correlation,
            });
        }
    }
    estimates.sort_by(|a, b| b.correlation.total_cmp(&a.correlation));
    estimates
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(s: &str) -> Key {
        s.parse().unwrap()
    }

    fn names(chords: Vec<Chord>) -> String {
        chords
            .iter()
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn parses_and_displays() {
        assert_eq!(key("C").to_string(), "C major");
        assert_eq!(key("Am").to_string(), "A minor");
        assert_eq!(key("F#m").to_string(), "F# minor");
        assert_eq!(key("Bb major").to_string(), "Bb major");
        assert_eq!(key("C minor"), key("Cm"));
        assert!("C dorian".parse::<Key>().is_err());
        assert!("".parse::<Key>().is_err());
    }

    #[test]
    fn key_signatures() {
        let expected = [
            ("C", 0),
            ("G", 1),
            ("D", 2),
            ("A", 3),
            ("E", 4),
            ("B", 5),
            ("F#", 6),
            ("C#", 7),
            ("F", -1),
            ("Bb", -2),
            ("Eb", -3),
            ("Ab", -4),
            ("Db", -5),
            ("Gb", -6),
            ("Cb", -7),
            ("Am", 0),
            ("Em", 1),
            ("C#m", 4),
            ("Dm", -1),
            ("Cm", -3),
            ("Ebm", -6),
        ];
        for (name, signature) in expected {
            assert_eq!(key(name).signature(), signature, "{name}");
        }
    }

    #[test]
    fn signature_counts_the_accidentals_of_the_scale() {
        for position in -7..=7 {
            let k = Key::major(Note::from_fifths(position));
            let accidentals: i32 = k.scale().notes().iter().map(|n| n.accidental as i32).sum();
            assert_eq!(accidentals, k.signature(), "{k}");
        }
    }

    #[test]
    fn related_keys() {
        assert_eq!(key("C").relative(), key("Am"));
        assert_eq!(key("Am").relative(), key("C"));
        assert_eq!(key("Eb").relative(), key("Cm"));
        assert_eq!(key("F#m").relative(), key("A"));
        assert_eq!(key("C").parallel(), key("Cm"));
        assert_eq!(key("C").dominant(), key("G"));
        assert_eq!(key("C").subdominant(), key("F"));
        assert_eq!(key("F").subdominant(), key("Bb"));
        assert_eq!(key("Am").dominant(), key("Em"));
        let neighbors: Vec<String> = key("C").neighbors().iter().map(|k| k.to_string()).collect();
        assert_eq!(
            neighbors,
            ["A minor", "G major", "F major", "E minor", "D minor"]
        );
    }

    #[test]
    fn relative_keys_share_their_signature() {
        for k in Key::circle_of_fifths() {
            assert_eq!(k.relative().signature(), k.signature(), "{k}");
            assert_eq!(k.relative().relative(), k);
        }
    }

    #[test]
    fn circle_of_fifths_order() {
        let circle: Vec<String> = Key::circle_of_fifths()
            .iter()
            .map(|k| k.tonic.to_string())
            .collect();
        assert_eq!(
            circle,
            ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"]
        );
        let classes: std::collections::HashSet<u8> = Key::circle_of_fifths()
            .iter()
            .map(|k| k.tonic.pitch_class().value())
            .collect();
        assert_eq!(classes.len(), 12);
    }

    #[test]
    fn diatonic_chords() {
        assert_eq!(names(key("C").diatonic_triads()), "C Dm Em F G Am Bdim");
        assert_eq!(names(key("Am").diatonic_triads()), "Am Bdim C Dm Em F G");
        assert_eq!(
            names(key("D").diatonic_sevenths()),
            "Dmaj7 Em7 F#m7 Gmaj7 A7 Bm7 C#m7b5"
        );
        assert_eq!(names(key("Bb").diatonic_triads()), "Bb Cm Dm Eb F Gm Adim");
    }

    #[test]
    fn transposes() {
        assert_eq!(key("C").transposed_up(Interval::MAJOR_SECOND), key("D"));
        assert_eq!(key("Am").transposed_down(Interval::MINOR_THIRD), key("F#m"));
    }

    #[test]
    fn estimates_a_key_from_its_own_profile() {
        let best = estimate_key(&MAJOR_PROFILE)[0];
        assert_eq!(best.key, key("C"));
        assert!((best.correlation - 1.0).abs() < 1e-9);

        // Profil mineur décalé de 9 demi-tons : La mineur.
        let mut a_minor = [0.0; 12];
        for pc in 0..12 {
            a_minor[(pc + 9) % 12] = MINOR_PROFILE[pc];
        }
        let estimates = estimate_key(&a_minor);
        assert_eq!(estimates.len(), 24);
        assert_eq!(estimates[0].key, key("Am"));
        assert!(estimates
            .windows(2)
            .all(|w| w[0].correlation >= w[1].correlation));
    }

    #[test]
    fn estimates_a_key_from_note_durations() {
        // Mélodie en Sol majeur : G A B C D E F#, tonique et quinte appuyées.
        let mut histogram = [0.0; 12];
        for (pc, weight) in [(7, 6.0), (9, 2.0), (11, 3.5), (0, 2.5), (2, 5.0), (4, 2.5), (6, 2.0)] {
            histogram[pc] = weight;
        }
        assert_eq!(estimate_key(&histogram)[0].key, key("G"));
    }

    #[test]
    fn refuses_to_guess_without_information() {
        assert!(estimate_key(&[0.0; 12]).is_empty());
        assert!(estimate_key(&[1.0; 12]).is_empty());
        let mut invalid = MAJOR_PROFILE;
        invalid[3] = f64::NAN;
        assert!(estimate_key(&invalid).is_empty());
    }
}
