//! Accords : qualités, renversements, voicings, identification.

use std::fmt;
use std::str::FromStr;

use crate::error::TheoryError;
use crate::interval::short::*;
use crate::interval::Interval;
use crate::pitch::{parse_note_prefix, Note, Pitch};

/// Qualité d'un accord, indépendante de sa fondamentale.
///
/// Conventions retenues pour les accords étendus :
/// - `11` contient l'empilement complet (1 3 5 ♭7 9 11) ;
/// - `13` omet la onzième (1 3 5 ♭7 9 13), comme dans la pratique.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ChordQuality {
    Major,
    Minor,
    Diminished,
    Augmented,
    Sus2,
    Sus4,
    Power,
    Major6,
    Minor6,
    Dominant7,
    Major7,
    Minor7,
    MinorMajor7,
    Diminished7,
    HalfDiminished7,
    Augmented7,
    AugmentedMajor7,
    Dominant7Sus4,
    Add9,
    MinorAdd9,
    Dominant9,
    Major9,
    Minor9,
    Dominant11,
    Minor11,
    Dominant13,
    Major13,
    Minor13,
}

struct Spec {
    suffix: &'static str,
    aliases: &'static [&'static str],
    intervals: &'static [Interval],
}

impl ChordQuality {
    /// Toutes les qualités, des plus simples aux plus riches. Cet ordre sert
    /// de départage lors de l'identification.
    pub const ALL: &'static [ChordQuality] = &[
        ChordQuality::Major,
        ChordQuality::Minor,
        ChordQuality::Diminished,
        ChordQuality::Augmented,
        ChordQuality::Sus2,
        ChordQuality::Sus4,
        ChordQuality::Power,
        ChordQuality::Major6,
        ChordQuality::Minor6,
        ChordQuality::Dominant7,
        ChordQuality::Major7,
        ChordQuality::Minor7,
        ChordQuality::MinorMajor7,
        ChordQuality::Diminished7,
        ChordQuality::HalfDiminished7,
        ChordQuality::Augmented7,
        ChordQuality::AugmentedMajor7,
        ChordQuality::Dominant7Sus4,
        ChordQuality::Add9,
        ChordQuality::MinorAdd9,
        ChordQuality::Dominant9,
        ChordQuality::Major9,
        ChordQuality::Minor9,
        ChordQuality::Dominant11,
        ChordQuality::Minor11,
        ChordQuality::Dominant13,
        ChordQuality::Major13,
        ChordQuality::Minor13,
    ];

    fn spec(self) -> Spec {
        let (suffix, aliases, intervals): (_, &'static [&'static str], &'static [Interval]) =
            match self {
                ChordQuality::Major => ("", &["maj", "M"], &[P1, M3, P5]),
                ChordQuality::Minor => ("m", &["min", "-"], &[P1, m3, P5]),
                ChordQuality::Diminished => ("dim", &["°", "o"], &[P1, m3, d5]),
                ChordQuality::Augmented => ("aug", &["+"], &[P1, M3, A5]),
                ChordQuality::Sus2 => ("sus2", &[], &[P1, M2, P5]),
                ChordQuality::Sus4 => ("sus4", &["sus"], &[P1, P4, P5]),
                ChordQuality::Power => ("5", &[], &[P1, P5]),
                ChordQuality::Major6 => ("6", &["maj6", "M6"], &[P1, M3, P5, M6]),
                ChordQuality::Minor6 => ("m6", &["min6", "-6"], &[P1, m3, P5, M6]),
                ChordQuality::Dominant7 => ("7", &["dom7"], &[P1, M3, P5, m7]),
                ChordQuality::Major7 => ("maj7", &["M7", "Δ", "Δ7", "ma7"], &[P1, M3, P5, M7]),
                ChordQuality::Minor7 => ("m7", &["min7", "-7"], &[P1, m3, P5, m7]),
                ChordQuality::MinorMajor7 => (
                    "mMaj7",
                    &["mmaj7", "mM7", "minMaj7", "m(maj7)"],
                    &[P1, m3, P5, M7],
                ),
                ChordQuality::Diminished7 => ("dim7", &["°7", "o7"], &[P1, m3, d5, d7]),
                ChordQuality::HalfDiminished7 => ("m7b5", &["ø", "ø7"], &[P1, m3, d5, m7]),
                ChordQuality::Augmented7 => ("7#5", &["aug7", "+7"], &[P1, M3, A5, m7]),
                ChordQuality::AugmentedMajor7 => {
                    ("maj7#5", &["augMaj7", "+maj7", "M7#5"], &[P1, M3, A5, M7])
                }
                ChordQuality::Dominant7Sus4 => ("7sus4", &["7sus"], &[P1, P4, P5, m7]),
                ChordQuality::Add9 => ("add9", &[], &[P1, M3, P5, M9]),
                ChordQuality::MinorAdd9 => ("madd9", &["m(add9)"], &[P1, m3, P5, M9]),
                ChordQuality::Dominant9 => ("9", &[], &[P1, M3, P5, m7, M9]),
                ChordQuality::Major9 => ("maj9", &["M9"], &[P1, M3, P5, M7, M9]),
                ChordQuality::Minor9 => ("m9", &["min9", "-9"], &[P1, m3, P5, m7, M9]),
                ChordQuality::Dominant11 => ("11", &[], &[P1, M3, P5, m7, M9, P11]),
                ChordQuality::Minor11 => ("m11", &["min11", "-11"], &[P1, m3, P5, m7, M9, P11]),
                ChordQuality::Dominant13 => ("13", &[], &[P1, M3, P5, m7, M9, M13]),
                ChordQuality::Major13 => ("maj13", &["M13"], &[P1, M3, P5, M7, M9, M13]),
                ChordQuality::Minor13 => ("m13", &["min13", "-13"], &[P1, m3, P5, m7, M9, M13]),
            };
        Spec {
            suffix,
            aliases,
            intervals,
        }
    }

    /// Suffixe canonique du symbole : `""` pour majeur, `"m7"`, `"dim"`…
    pub fn suffix(self) -> &'static str {
        self.spec().suffix
    }

    /// Intervalles depuis la fondamentale, fondamentale comprise.
    pub fn intervals(self) -> &'static [Interval] {
        self.spec().intervals
    }

    /// Qualité correspondant à un suffixe canonique ou à l'un de ses alias.
    pub fn from_suffix(suffix: &str) -> Option<ChordQuality> {
        Self::ALL.iter().copied().find(|quality| {
            let spec = quality.spec();
            spec.suffix == suffix || spec.aliases.contains(&suffix)
        })
    }

    /// Qualité dont les intervalles, en demi-tons depuis la fondamentale,
    /// sont exactement ceux fournis (dans l'ordre d'empilement).
    pub fn from_semitones(semitones: &[i32]) -> Option<ChordQuality> {
        Self::ALL.iter().copied().find(|quality| {
            let intervals = quality.intervals();
            intervals.len() == semitones.len()
                && intervals
                    .iter()
                    .zip(semitones)
                    .all(|(interval, &s)| interval.semitones() == s)
        })
    }

    pub fn has_minor_third(self) -> bool {
        self.intervals().contains(&m3)
    }

    pub fn has_major_third(self) -> bool {
        self.intervals().contains(&M3)
    }

    /// Classes de hauteur relatives à la fondamentale, triées, sans doublon.
    fn pitch_class_set(self) -> Vec<u8> {
        let mut set: Vec<u8> = self
            .intervals()
            .iter()
            .map(|interval| interval.semitones().rem_euclid(12) as u8)
            .collect();
        set.sort_unstable();
        set.dedup();
        set
    }
}

/// Accord : fondamentale, qualité et basse éventuelle (renversement ou
/// accord sur basse étrangère, noté `C/E` ou `C/D`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Chord {
    pub root: Note,
    pub quality: ChordQuality,
    pub bass: Option<Note>,
}

impl Chord {
    pub const fn new(root: Note, quality: ChordQuality) -> Self {
        Self {
            root,
            quality,
            bass: None,
        }
    }

    pub const fn with_bass(root: Note, quality: ChordQuality, bass: Note) -> Self {
        Self {
            root,
            quality,
            bass: Some(bass),
        }
    }

    /// Notes de l'accord en position fondamentale, dans l'ordre d'empilement.
    pub fn notes(&self) -> Vec<Note> {
        self.quality
            .intervals()
            .iter()
            .map(|&interval| self.root.up(interval))
            .collect()
    }

    /// Note la plus grave.
    pub fn bass_note(&self) -> Note {
        self.bass.unwrap_or(self.root)
    }

    /// Numéro du renversement : 0 = position fondamentale, 1 = tierce à la
    /// basse… `None` si la basse n'est pas une note de l'accord.
    pub fn inversion(&self) -> Option<usize> {
        let bass = self.bass_note().pitch_class();
        self.notes().iter().position(|n| n.pitch_class() == bass)
    }

    /// Le même accord dans son `n`-ième renversement.
    pub fn inverted(&self, n: usize) -> Option<Chord> {
        let notes = self.notes();
        let bass = *notes.get(n)?;
        Some(Chord {
            root: self.root,
            quality: self.quality,
            bass: (n != 0).then_some(bass),
        })
    }

    /// Notes de la plus grave à la plus aiguë, basse en premier.
    pub fn notes_from_bass(&self) -> Vec<Note> {
        let mut notes = self.notes();
        match self.inversion() {
            Some(n) => notes.rotate_left(n),
            None => notes.insert(0, self.bass_note()),
        }
        notes
    }

    /// Voicing serré : la basse à l'octave donnée, les autres notes empilées
    /// au-dessus. En position fondamentale, les extensions (9e, 11e, 13e)
    /// gardent leur octave réelle.
    pub fn voicing(&self, octave: i8) -> Vec<Pitch> {
        if self.inversion() == Some(0) {
            let root = Pitch::new(self.root, octave);
            return self
                .quality
                .intervals()
                .iter()
                .map(|&interval| root.up(interval))
                .collect();
        }
        let mut pitches: Vec<Pitch> = Vec::new();
        for note in self.notes_from_bass() {
            let mut pitch = Pitch::new(note, pitches.last().map_or(octave, |p| p.octave));
            if let Some(previous) = pitches.last() {
                while pitch.midi() <= previous.midi() {
                    pitch.octave += 1;
                }
            }
            pitches.push(pitch);
        }
        pitches
    }

    pub fn transposed_up(&self, interval: Interval) -> Chord {
        Chord {
            root: self.root.up(interval),
            quality: self.quality,
            bass: self.bass.map(|bass| bass.up(interval)),
        }
    }

    pub fn transposed_down(&self, interval: Interval) -> Chord {
        Chord {
            root: self.root.down(interval),
            quality: self.quality,
            bass: self.bass.map(|bass| bass.down(interval)),
        }
    }

    /// Accords dont les notes sont exactement celles fournies, à l'octave et
    /// à l'enharmonie près. La première note est la basse.
    ///
    /// Plusieurs réponses sont possibles (`A C E G` = `Am7` ou `C6/A`) : les
    /// accords en position fondamentale viennent d'abord, puis les qualités
    /// les plus simples.
    pub fn identify(notes: &[Note]) -> Vec<Chord> {
        let Some(&bass) = notes.first() else {
            return Vec::new();
        };
        let mut unique: Vec<Note> = Vec::new();
        for &note in notes {
            if !unique.iter().any(|u| u.pitch_class() == note.pitch_class()) {
                unique.push(note);
            }
        }
        let mut matches: Vec<Chord> = Vec::new();
        for &root in &unique {
            let root_pc = root.pitch_class().value() as i32;
            let mut relative: Vec<u8> = unique
                .iter()
                .map(|n| (n.pitch_class().value() as i32 - root_pc).rem_euclid(12) as u8)
                .collect();
            relative.sort_unstable();
            for &quality in ChordQuality::ALL {
                if quality.pitch_class_set() == relative {
                    let in_root_position = root.pitch_class() == bass.pitch_class();
                    matches.push(Chord {
                        root,
                        quality,
                        bass: (!in_root_position).then_some(bass),
                    });
                }
            }
        }
        matches.sort_by_key(|chord| chord.bass.is_some());
        matches
    }
}

impl FromStr for Chord {
    type Err = TheoryError;

    /// Lit `C`, `F#m7`, `Bbmaj7`, `Gsus4`, `Cmaj7/E`…
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || TheoryError::InvalidChord(s.to_string());
        let (root, rest) = parse_note_prefix(s.trim()).ok_or_else(err)?;
        let (suffix, bass) = match rest.rsplit_once('/') {
            Some((suffix, bass)) => (suffix, Some(bass.parse::<Note>().map_err(|_| err())?)),
            None => (rest, None),
        };
        let quality = ChordQuality::from_suffix(suffix).ok_or_else(err)?;
        let bass = bass.filter(|b| b.pitch_class() != root.pitch_class());
        Ok(Chord {
            root,
            quality,
            bass,
        })
    }
}

impl fmt::Display for Chord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}{}", self.root, self.quality.suffix())?;
        if let Some(bass) = self.bass {
            write!(f, "/{bass}")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notes_of(symbol: &str) -> String {
        symbol
            .parse::<Chord>()
            .unwrap()
            .notes()
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn voicing_of(symbol: &str, octave: i8) -> String {
        symbol
            .parse::<Chord>()
            .unwrap()
            .voicing(octave)
            .iter()
            .map(|p| p.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn identify(notes: &str) -> Vec<String> {
        let notes: Vec<Note> = notes.split(' ').map(|n| n.parse().unwrap()).collect();
        Chord::identify(&notes).iter().map(|c| c.to_string()).collect()
    }

    #[test]
    fn chords_from_the_ear_training_list() {
        assert_eq!(notes_of("C"), "C E G");
        assert_eq!(notes_of("Cm"), "C Eb G");
        assert_eq!(notes_of("Cdim"), "C Eb Gb");
        assert_eq!(notes_of("Caug"), "C E G#");
        assert_eq!(notes_of("Csus2"), "C D G");
        assert_eq!(notes_of("Csus4"), "C F G");
        assert_eq!(notes_of("Cmaj7"), "C E G B");
        assert_eq!(notes_of("C7"), "C E G Bb");
        assert_eq!(notes_of("Cm7"), "C Eb G Bb");
        assert_eq!(notes_of("Cadd9"), "C E G D");
        assert_eq!(notes_of("C9"), "C E G Bb D");
    }

    #[test]
    fn spelling_follows_the_chord_structure() {
        assert_eq!(notes_of("Cdim7"), "C Eb Gb Bbb");
        assert_eq!(notes_of("Bdim"), "B D F");
        assert_eq!(notes_of("F#m7b5"), "F# A C E");
        assert_eq!(notes_of("Ebmaj7"), "Eb G Bb D");
        assert_eq!(notes_of("E7"), "E G# B D");
        assert_eq!(notes_of("C13"), "C E G Bb D A");
        assert_eq!(notes_of("Dm11"), "D F A C E G");
    }

    #[test]
    fn symbols_round_trip_and_aliases_normalize() {
        for &quality in ChordQuality::ALL {
            let chord = Chord::new("Bb".parse().unwrap(), quality);
            assert_eq!(chord.to_string().parse::<Chord>().unwrap(), chord);
        }
        assert_eq!("Cmin7".parse::<Chord>().unwrap().to_string(), "Cm7");
        assert_eq!("CM7".parse::<Chord>().unwrap().to_string(), "Cmaj7");
        assert_eq!("C°".parse::<Chord>().unwrap().to_string(), "Cdim");
        assert_eq!("Cø".parse::<Chord>().unwrap().to_string(), "Cm7b5");
        assert_eq!("C+".parse::<Chord>().unwrap().to_string(), "Caug");
        assert_eq!("Csus".parse::<Chord>().unwrap().to_string(), "Csus4");
        assert_eq!("C/C".parse::<Chord>().unwrap().to_string(), "C");
        assert!("Cfoo".parse::<Chord>().is_err());
        assert!("X7".parse::<Chord>().is_err());
        assert!("C/".parse::<Chord>().is_err());
    }

    #[test]
    fn every_quality_has_unique_symbols() {
        let mut seen: Vec<&str> = Vec::new();
        for &quality in ChordQuality::ALL {
            let spec = quality.spec();
            for symbol in std::iter::once(spec.suffix).chain(spec.aliases.iter().copied()) {
                assert!(!seen.contains(&symbol), "symbole en double : {symbol:?}");
                seen.push(symbol);
            }
            assert_eq!(spec.intervals[0], P1);
        }
    }

    #[test]
    fn inversions() {
        let c: Chord = "C".parse().unwrap();
        assert_eq!(c.inversion(), Some(0));
        assert_eq!(c.inverted(1).unwrap().to_string(), "C/E");
        assert_eq!(c.inverted(2).unwrap().to_string(), "C/G");
        assert_eq!(c.inverted(0).unwrap(), c);
        assert!(c.inverted(3).is_none());

        assert_eq!("Cmaj7/B".parse::<Chord>().unwrap().inversion(), Some(3));
        // Basse étrangère à l'accord : ce n'est pas un renversement.
        assert_eq!("C/D".parse::<Chord>().unwrap().inversion(), None);
    }

    #[test]
    fn voicings_ascend_from_the_bass() {
        assert_eq!(voicing_of("C", 4), "C4 E4 G4");
        assert_eq!(voicing_of("C/E", 3), "E3 G3 C4");
        assert_eq!(voicing_of("C/G", 3), "G3 C4 E4");
        assert_eq!(voicing_of("C9", 4), "C4 E4 G4 Bb4 D5");
        assert_eq!(voicing_of("Am", 3), "A3 C4 E4");
        assert_eq!(voicing_of("C/D", 3), "D3 C4 E4 G4");
        for symbol in ["Fmaj7/A", "G7/F", "Bbm7b5/Ab", "D13", "Em11"] {
            let midi: Vec<i32> = symbol
                .parse::<Chord>()
                .unwrap()
                .voicing(3)
                .iter()
                .map(|p| p.midi())
                .collect();
            assert!(midi.windows(2).all(|w| w[0] < w[1]), "{symbol}: {midi:?}");
        }
    }

    #[test]
    fn identifies_chords_from_notes() {
        assert_eq!(identify("C E G"), ["C"]);
        assert_eq!(identify("E G C"), ["C/E"]);
        assert_eq!(identify("G C E"), ["C/G"]);
        assert_eq!(identify("C E G C E"), ["C"]);
        assert_eq!(identify("B D F"), ["Bdim"]);
        assert_eq!(identify("G B D F"), ["G7"]);
        // Ambiguïté réelle : mêmes notes, deux lectures.
        assert_eq!(identify("A C E G"), ["Am7", "C6/A"]);
        assert_eq!(identify("C D G"), ["Csus2", "Gsus4/C"]);
        assert!(identify("C C# D").is_empty());
        assert!(Chord::identify(&[]).is_empty());
    }

    #[test]
    fn identification_inverts_construction() {
        for &quality in ChordQuality::ALL {
            let chord = Chord::new("D".parse().unwrap(), quality);
            let found = Chord::identify(&chord.notes());
            assert!(found.contains(&chord), "{chord} non retrouvé dans {found:?}");
        }
    }

    #[test]
    fn transposition() {
        let chord: Chord = "Cmaj7/E".parse().unwrap();
        assert_eq!(chord.transposed_up(Interval::MAJOR_SECOND).to_string(), "Dmaj7/F#");
        assert_eq!(chord.transposed_down(Interval::MINOR_THIRD).to_string(), "Amaj7/C#");
        assert_eq!(
            chord.transposed_up(Interval::PERFECT_FOURTH).to_string(),
            "Fmaj7/A"
        );
    }
}
