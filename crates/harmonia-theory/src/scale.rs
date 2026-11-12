//! Gammes et modes.

use std::fmt;

use crate::chord::{Chord, ChordQuality};
use crate::error::TheoryError;
use crate::interval::short::*;
use crate::interval::Interval;
use crate::pitch::{Note, Pitch};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ScaleType {
    /// Majeure (mode ionien).
    Major,
    Dorian,
    Phrygian,
    Lydian,
    Mixolydian,
    /// Mineure naturelle (mode éolien).
    NaturalMinor,
    Locrian,
    HarmonicMinor,
    /// Mineure mélodique ascendante.
    MelodicMinor,
    MajorPentatonic,
    MinorPentatonic,
    Blues,
    WholeTone,
    /// Diminuée ton / demi-ton.
    DiminishedWholeHalf,
    /// Diminuée demi-ton / ton.
    DiminishedHalfWhole,
    Chromatic,
}

impl ScaleType {
    pub const ALL: &'static [ScaleType] = &[
        ScaleType::Major,
        ScaleType::Dorian,
        ScaleType::Phrygian,
        ScaleType::Lydian,
        ScaleType::Mixolydian,
        ScaleType::NaturalMinor,
        ScaleType::Locrian,
        ScaleType::HarmonicMinor,
        ScaleType::MelodicMinor,
        ScaleType::MajorPentatonic,
        ScaleType::MinorPentatonic,
        ScaleType::Blues,
        ScaleType::WholeTone,
        ScaleType::DiminishedWholeHalf,
        ScaleType::DiminishedHalfWhole,
        ScaleType::Chromatic,
    ];

    /// Les sept modes de la gamme majeure, dans l'ordre de ses degrés.
    pub const DIATONIC_MODES: [ScaleType; 7] = [
        ScaleType::Major,
        ScaleType::Dorian,
        ScaleType::Phrygian,
        ScaleType::Lydian,
        ScaleType::Mixolydian,
        ScaleType::NaturalMinor,
        ScaleType::Locrian,
    ];

    /// Intervalles depuis la tonique, tonique comprise, octave exclue.
    pub fn intervals(self) -> &'static [Interval] {
        match self {
            ScaleType::Major => &[P1, M2, M3, P4, P5, M6, M7],
            ScaleType::Dorian => &[P1, M2, m3, P4, P5, M6, m7],
            ScaleType::Phrygian => &[P1, m2, m3, P4, P5, m6, m7],
            ScaleType::Lydian => &[P1, M2, M3, A4, P5, M6, M7],
            ScaleType::Mixolydian => &[P1, M2, M3, P4, P5, M6, m7],
            ScaleType::NaturalMinor => &[P1, M2, m3, P4, P5, m6, m7],
            ScaleType::Locrian => &[P1, m2, m3, P4, d5, m6, m7],
            ScaleType::HarmonicMinor => &[P1, M2, m3, P4, P5, m6, M7],
            ScaleType::MelodicMinor => &[P1, M2, m3, P4, P5, M6, M7],
            ScaleType::MajorPentatonic => &[P1, M2, M3, P5, M6],
            ScaleType::MinorPentatonic => &[P1, m3, P4, P5, m7],
            ScaleType::Blues => &[P1, m3, P4, d5, P5, m7],
            ScaleType::WholeTone => &[P1, M2, M3, A4, A5, A6],
            ScaleType::DiminishedWholeHalf => &[P1, M2, m3, P4, d5, m6, M6, M7],
            ScaleType::DiminishedHalfWhole => &[P1, m2, m3, M3, A4, P5, M6, m7],
            ScaleType::Chromatic => &[P1, m2, M2, m3, M3, P4, A4, P5, m6, M6, m7, M7],
        }
    }

    /// Identifiant stable (clé d'API et de traduction).
    pub fn id(self) -> &'static str {
        match self {
            ScaleType::Major => "major",
            ScaleType::Dorian => "dorian",
            ScaleType::Phrygian => "phrygian",
            ScaleType::Lydian => "lydian",
            ScaleType::Mixolydian => "mixolydian",
            ScaleType::NaturalMinor => "natural_minor",
            ScaleType::Locrian => "locrian",
            ScaleType::HarmonicMinor => "harmonic_minor",
            ScaleType::MelodicMinor => "melodic_minor",
            ScaleType::MajorPentatonic => "major_pentatonic",
            ScaleType::MinorPentatonic => "minor_pentatonic",
            ScaleType::Blues => "blues",
            ScaleType::WholeTone => "whole_tone",
            ScaleType::DiminishedWholeHalf => "diminished_whole_half",
            ScaleType::DiminishedHalfWhole => "diminished_half_whole",
            ScaleType::Chromatic => "chromatic",
        }
    }

    pub fn from_id(id: &str) -> Option<ScaleType> {
        Self::ALL.iter().copied().find(|kind| kind.id() == id)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Scale {
    pub tonic: Note,
    pub kind: ScaleType,
}

impl Scale {
    pub const fn new(tonic: Note, kind: ScaleType) -> Self {
        Self { tonic, kind }
    }

    /// Notes de la gamme depuis la tonique, orthographiées selon ses intervalles.
    pub fn notes(&self) -> Vec<Note> {
        self.kind
            .intervals()
            .iter()
            .map(|&interval| self.tonic.up(interval))
            .collect()
    }

    /// Hauteurs ascendantes sur une octave à partir de la tonique.
    pub fn pitches(&self, octave: i8) -> Vec<Pitch> {
        let tonic = Pitch::new(self.tonic, octave);
        self.kind
            .intervals()
            .iter()
            .map(|&interval| tonic.up(interval))
            .collect()
    }

    /// Vrai si la note appartient à la gamme, à l'enharmonie près.
    pub fn contains(&self, note: Note) -> bool {
        self.degree_of(note).is_some()
    }

    /// Degré de la note dans la gamme (1 = tonique), à l'enharmonie près.
    pub fn degree_of(&self, note: Note) -> Option<usize> {
        self.notes()
            .iter()
            .position(|n| n.pitch_class() == note.pitch_class())
            .map(|index| index + 1)
    }

    /// Les sept modes partageant les notes de cette gamme. Vide si la gamme
    /// n'est pas un mode de la gamme majeure.
    pub fn modes(&self) -> Vec<Scale> {
        let Some(position) = ScaleType::DIATONIC_MODES
            .iter()
            .position(|&kind| kind == self.kind)
        else {
            return Vec::new();
        };
        let notes = self.notes();
        ScaleType::DIATONIC_MODES
            .iter()
            .enumerate()
            .map(|(k, &kind)| Scale::new(notes[(7 - position + k) % 7], kind))
            .collect()
    }

    /// Accords construits par empilement de tierces sur chaque degré
    /// (triades, ou tétrades si `sevenths`). Exige une gamme de sept notes.
    pub fn harmonize(&self, sevenths: bool) -> Result<Vec<Chord>, TheoryError> {
        let notes = self.notes();
        if notes.len() != 7 {
            return Err(TheoryError::NotHeptatonic);
        }
        let size = if sevenths { 4 } else { 3 };
        (0..7)
            .map(|degree| {
                let root = notes[degree];
                let semitones: Vec<i32> = (0..size)
                    .map(|k| Interval::between(root, notes[(degree + 2 * k) % 7]).semitones())
                    .collect();
                ChordQuality::from_semitones(&semitones)
                    .map(|quality| Chord::new(root, quality))
                    .ok_or(TheoryError::UnknownChordQuality)
            })
            .collect()
    }
}

impl fmt::Display for Scale {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.tonic, self.kind.id())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scale(tonic: &str, kind: ScaleType) -> String {
        Scale::new(tonic.parse().unwrap(), kind)
            .notes()
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn chords(tonic: &str, kind: ScaleType, sevenths: bool) -> String {
        Scale::new(tonic.parse().unwrap(), kind)
            .harmonize(sevenths)
            .unwrap()
            .iter()
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn major_scales_are_spelled_correctly() {
        assert_eq!(scale("C", ScaleType::Major), "C D E F G A B");
        assert_eq!(scale("G", ScaleType::Major), "G A B C D E F#");
        assert_eq!(scale("F", ScaleType::Major), "F G A Bb C D E");
        assert_eq!(scale("Eb", ScaleType::Major), "Eb F G Ab Bb C D");
        assert_eq!(scale("F#", ScaleType::Major), "F# G# A# B C# D# E#");
        assert_eq!(scale("Gb", ScaleType::Major), "Gb Ab Bb Cb Db Eb F");
    }

    #[test]
    fn minor_scales() {
        assert_eq!(scale("A", ScaleType::NaturalMinor), "A B C D E F G");
        assert_eq!(scale("A", ScaleType::HarmonicMinor), "A B C D E F G#");
        assert_eq!(scale("A", ScaleType::MelodicMinor), "A B C D E F# G#");
        assert_eq!(scale("C", ScaleType::NaturalMinor), "C D Eb F G Ab Bb");
    }

    #[test]
    fn modes_of_c_major() {
        assert_eq!(scale("D", ScaleType::Dorian), "D E F G A B C");
        assert_eq!(scale("E", ScaleType::Phrygian), "E F G A B C D");
        assert_eq!(scale("F", ScaleType::Lydian), "F G A B C D E");
        assert_eq!(scale("G", ScaleType::Mixolydian), "G A B C D E F");
        assert_eq!(scale("B", ScaleType::Locrian), "B C D E F G A");
    }

    #[test]
    fn other_scales() {
        assert_eq!(scale("C", ScaleType::MajorPentatonic), "C D E G A");
        assert_eq!(scale("C", ScaleType::MinorPentatonic), "C Eb F G Bb");
        assert_eq!(scale("A", ScaleType::Blues), "A C D Eb E G");
        assert_eq!(scale("C", ScaleType::WholeTone), "C D E F# G# A#");
        assert_eq!(scale("C", ScaleType::Chromatic).split(' ').count(), 12);
    }

    #[test]
    fn every_scale_type_has_distinct_ascending_pitch_classes() {
        for &kind in ScaleType::ALL {
            let semitones: Vec<i32> = kind.intervals().iter().map(|i| i.semitones()).collect();
            assert_eq!(semitones[0], 0, "{kind:?}");
            assert!(semitones.windows(2).all(|w| w[0] < w[1]), "{kind:?}");
            assert!(*semitones.last().unwrap() < 12, "{kind:?}");
            assert_eq!(ScaleType::from_id(kind.id()), Some(kind));
        }
    }

    #[test]
    fn membership_and_degrees() {
        let c_major = Scale::new("C".parse().unwrap(), ScaleType::Major);
        assert_eq!(c_major.degree_of("G".parse().unwrap()), Some(5));
        assert!(c_major.contains("B".parse().unwrap()));
        assert!(!c_major.contains("F#".parse().unwrap()));
        // À l'enharmonie près : Cb sonne comme B.
        assert!(c_major.contains("Cb".parse().unwrap()));
    }

    #[test]
    fn relative_modes_share_the_same_notes() {
        let d_dorian = Scale::new("D".parse().unwrap(), ScaleType::Dorian);
        let modes: Vec<String> = d_dorian.modes().iter().map(|m| m.to_string()).collect();
        assert_eq!(
            modes,
            [
                "C major",
                "D dorian",
                "E phrygian",
                "F lydian",
                "G mixolydian",
                "A natural_minor",
                "B locrian"
            ]
        );
        let blues = Scale::new("A".parse().unwrap(), ScaleType::Blues);
        assert!(blues.modes().is_empty());
    }

    #[test]
    fn pitches_ascend_across_the_octave_break() {
        let a_minor = Scale::new("A".parse().unwrap(), ScaleType::NaturalMinor);
        let pitches: Vec<String> = a_minor.pitches(3).iter().map(|p| p.to_string()).collect();
        assert_eq!(pitches, ["A3", "B3", "C4", "D4", "E4", "F4", "G4"]);
    }

    #[test]
    fn harmonizes_the_major_scale() {
        assert_eq!(chords("C", ScaleType::Major, false), "C Dm Em F G Am Bdim");
        assert_eq!(
            chords("C", ScaleType::Major, true),
            "Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5"
        );
        assert_eq!(chords("G", ScaleType::Major, false), "G Am Bm C D Em F#dim");
    }

    #[test]
    fn harmonizes_minor_scales() {
        assert_eq!(
            chords("A", ScaleType::NaturalMinor, false),
            "Am Bdim C Dm Em F G"
        );
        assert_eq!(
            chords("A", ScaleType::HarmonicMinor, false),
            "Am Bdim Caug Dm E F G#dim"
        );
        assert_eq!(
            chords("A", ScaleType::HarmonicMinor, true),
            "AmMaj7 Bm7b5 Cmaj7#5 Dm7 E7 Fmaj7 G#dim7"
        );
    }

    #[test]
    fn every_heptatonic_scale_harmonizes() {
        for &kind in ScaleType::ALL {
            let scale = Scale::new("C".parse().unwrap(), kind);
            if kind.intervals().len() == 7 {
                assert!(scale.harmonize(false).is_ok(), "{kind:?}");
                assert!(scale.harmonize(true).is_ok(), "{kind:?}");
            } else {
                assert_eq!(scale.harmonize(false), Err(TheoryError::NotHeptatonic));
            }
        }
    }
}
