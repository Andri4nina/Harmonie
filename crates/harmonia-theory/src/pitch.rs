//! Notes, classes de hauteur et hauteurs absolues.

use std::fmt;
use std::str::FromStr;

use crate::error::TheoryError;
use crate::interval::Interval;

/// Fréquence de référence du La4.
pub const A4_STANDARD_HZ: f64 = 440.0;

/// Nom de note sans altération.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Letter {
    C,
    D,
    E,
    F,
    G,
    A,
    B,
}

impl Letter {
    pub const ALL: [Letter; 7] = [
        Letter::C,
        Letter::D,
        Letter::E,
        Letter::F,
        Letter::G,
        Letter::A,
        Letter::B,
    ];

    /// Position diatonique, `C` = 0.
    pub const fn index(self) -> i32 {
        self as i32
    }

    /// Lettre à une position diatonique quelconque (modulo 7).
    pub fn from_index(index: i32) -> Letter {
        Self::ALL[index.rem_euclid(7) as usize]
    }

    /// Demi-tons au-dessus de `C`.
    pub const fn semitones(self) -> i32 {
        match self {
            Letter::C => 0,
            Letter::D => 2,
            Letter::E => 4,
            Letter::F => 5,
            Letter::G => 7,
            Letter::A => 9,
            Letter::B => 11,
        }
    }

    pub fn from_char(c: char) -> Option<Letter> {
        match c.to_ascii_uppercase() {
            'C' => Some(Letter::C),
            'D' => Some(Letter::D),
            'E' => Some(Letter::E),
            'F' => Some(Letter::F),
            'G' => Some(Letter::G),
            'A' => Some(Letter::A),
            'B' => Some(Letter::B),
            _ => None,
        }
    }

    pub const fn as_char(self) -> char {
        match self {
            Letter::C => 'C',
            Letter::D => 'D',
            Letter::E => 'E',
            Letter::F => 'F',
            Letter::G => 'G',
            Letter::A => 'A',
            Letter::B => 'B',
        }
    }
}

/// Classe de hauteur : 0 (`C`) à 11 (`B`), sans orthographe ni octave.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub struct PitchClass(u8);

impl PitchClass {
    pub fn new(semitones: i32) -> Self {
        Self(semitones.rem_euclid(12) as u8)
    }

    pub const fn value(self) -> u8 {
        self.0
    }
}

/// Préférence d'orthographe quand une classe de hauteur doit être nommée.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Spelling {
    Sharps,
    Flats,
}

/// Note orthographiée, sans octave : une lettre et une altération
/// (`-1` = bémol, `+1` = dièse, `±2` = doubles).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Note {
    pub letter: Letter,
    pub accidental: i8,
}

/// Déplace une lettre altérée de `steps` degrés et `semitones` demi-tons
/// (signés). Renvoie la lettre, l'altération et le nombre d'octaves franchies.
fn shift(letter: Letter, accidental: i8, steps: i32, semitones: i32) -> (Letter, i8, i32) {
    let target = letter.index() + steps;
    let octaves = target.div_euclid(7);
    let new_letter = Letter::from_index(target);
    let new_accidental =
        letter.semitones() + accidental as i32 + semitones - new_letter.semitones() - 12 * octaves;
    (new_letter, new_accidental as i8, octaves)
}

impl Note {
    pub const fn new(letter: Letter, accidental: i8) -> Self {
        Self { letter, accidental }
    }

    pub const fn natural(letter: Letter) -> Self {
        Self::new(letter, 0)
    }

    pub fn pitch_class(self) -> PitchClass {
        PitchClass::new(self.letter.semitones() + self.accidental as i32)
    }

    /// Vrai si les deux notes sonnent à la même hauteur (`F#` et `Gb`).
    pub fn is_enharmonic_with(self, other: Note) -> bool {
        self.pitch_class() == other.pitch_class()
    }

    /// Orthographe la plus simple d'une classe de hauteur (jamais `B#`, `Cb`,
    /// `E#`, `Fb` ni double altération).
    pub fn from_pitch_class(pc: PitchClass, spelling: Spelling) -> Note {
        use Letter::*;
        const SHARPS: [(Letter, i8); 12] = [
            (C, 0),
            (C, 1),
            (D, 0),
            (D, 1),
            (E, 0),
            (F, 0),
            (F, 1),
            (G, 0),
            (G, 1),
            (A, 0),
            (A, 1),
            (B, 0),
        ];
        const FLATS: [(Letter, i8); 12] = [
            (C, 0),
            (D, -1),
            (D, 0),
            (E, -1),
            (E, 0),
            (F, 0),
            (G, -1),
            (G, 0),
            (A, -1),
            (A, 0),
            (B, -1),
            (B, 0),
        ];
        let (letter, accidental) = match spelling {
            Spelling::Sharps => SHARPS[pc.value() as usize],
            Spelling::Flats => FLATS[pc.value() as usize],
        };
        Note::new(letter, accidental)
    }

    /// Position sur la ligne des quintes : `F` = -1, `C` = 0, `G` = 1 … `B` = 5,
    /// puis ±7 par altération. C'est aussi l'armure de la tonalité majeure
    /// portant ce nom.
    pub fn fifths(self) -> i32 {
        let base = match self.letter {
            Letter::F => -1,
            Letter::C => 0,
            Letter::G => 1,
            Letter::D => 2,
            Letter::A => 3,
            Letter::E => 4,
            Letter::B => 5,
        };
        base + 7 * self.accidental as i32
    }

    /// Inverse de [`Note::fifths`].
    pub fn from_fifths(position: i32) -> Note {
        const ORDER: [Letter; 7] = [
            Letter::F,
            Letter::C,
            Letter::G,
            Letter::D,
            Letter::A,
            Letter::E,
            Letter::B,
        ];
        let shifted = position + 1;
        Note::new(
            ORDER[shifted.rem_euclid(7) as usize],
            shifted.div_euclid(7) as i8,
        )
    }

    /// Note située un intervalle au-dessus, correctement orthographiée.
    pub fn up(self, interval: Interval) -> Note {
        let (letter, accidental, _) = shift(
            self.letter,
            self.accidental,
            interval.steps(),
            interval.semitones(),
        );
        Note::new(letter, accidental)
    }

    /// Note située un intervalle au-dessous, correctement orthographiée.
    pub fn down(self, interval: Interval) -> Note {
        let (letter, accidental, _) = shift(
            self.letter,
            self.accidental,
            -interval.steps(),
            -interval.semitones(),
        );
        Note::new(letter, accidental)
    }
}

/// Lit une note en tête de chaîne et renvoie le reste.
/// Altérations acceptées : `#`, `♯`, `b`, `♭`, `𝄪`, `𝄫`.
pub(crate) fn parse_note_prefix(s: &str) -> Option<(Note, &str)> {
    let mut chars = s.char_indices();
    let (_, first) = chars.next()?;
    let letter = Letter::from_char(first)?;
    let mut accidental: i8 = 0;
    let mut end = first.len_utf8();
    for (i, c) in chars {
        let delta = match c {
            '#' | '♯' => 1,
            'b' | '♭' => -1,
            '𝄪' => 2,
            '𝄫' => -2,
            _ => break,
        };
        accidental = accidental.checked_add(delta)?;
        end = i + c.len_utf8();
    }
    Some((Note::new(letter, accidental), &s[end..]))
}

impl FromStr for Note {
    type Err = TheoryError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match parse_note_prefix(s.trim()) {
            Some((note, "")) => Ok(note),
            _ => Err(TheoryError::InvalidNote(s.to_string())),
        }
    }
}

impl fmt::Display for Note {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.letter.as_char())?;
        let sign = if self.accidental >= 0 { '#' } else { 'b' };
        for _ in 0..self.accidental.unsigned_abs() {
            write!(f, "{sign}")?;
        }
        Ok(())
    }
}

/// Hauteur absolue : une note et son octave (notation scientifique).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Pitch {
    pub note: Note,
    pub octave: i8,
}

impl Pitch {
    pub const fn new(note: Note, octave: i8) -> Self {
        Self { note, octave }
    }

    /// Numéro MIDI (`C4` = 60, `A4` = 69). Peut sortir de 0..=127.
    pub fn midi(self) -> i32 {
        (self.octave as i32 + 1) * 12 + self.note.letter.semitones() + self.note.accidental as i32
    }

    pub fn from_midi(midi: i32, spelling: Spelling) -> Pitch {
        let note = Note::from_pitch_class(PitchClass::new(midi), spelling);
        Pitch::new(note, (midi.div_euclid(12) - 1) as i8)
    }

    /// Fréquence en tempérament égal pour un La4 donné.
    pub fn frequency(self, a4_hz: f64) -> f64 {
        a4_hz * 2f64.powf((self.midi() - 69) as f64 / 12.0)
    }

    pub fn up(self, interval: Interval) -> Pitch {
        let (letter, accidental, octaves) = shift(
            self.note.letter,
            self.note.accidental,
            interval.steps(),
            interval.semitones(),
        );
        Pitch::new(Note::new(letter, accidental), self.octave + octaves as i8)
    }

    pub fn down(self, interval: Interval) -> Pitch {
        let (letter, accidental, octaves) = shift(
            self.note.letter,
            self.note.accidental,
            -interval.steps(),
            -interval.semitones(),
        );
        Pitch::new(Note::new(letter, accidental), self.octave + octaves as i8)
    }
}

impl FromStr for Pitch {
    type Err = TheoryError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || TheoryError::InvalidPitch(s.to_string());
        let (note, rest) = parse_note_prefix(s.trim()).ok_or_else(err)?;
        let octave: i8 = rest.parse().map_err(|_| err())?;
        Ok(Pitch::new(note, octave))
    }
}

impl fmt::Display for Pitch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}{}", self.note, self.octave)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(s: &str) -> Note {
        s.parse().unwrap()
    }
    fn p(s: &str) -> Pitch {
        s.parse().unwrap()
    }

    #[test]
    fn parses_and_displays_notes() {
        for s in ["C", "F#", "Bb", "Ebb", "G##", "Cb", "E#"] {
            assert_eq!(n(s).to_string(), s);
        }
        assert_eq!(n("f♯"), n("F#"));
        assert_eq!(n("B♭"), n("Bb"));
        assert!("H".parse::<Note>().is_err());
        assert!("C4".parse::<Note>().is_err());
        assert!("".parse::<Note>().is_err());
    }

    #[test]
    fn enharmonic_notes_share_a_pitch_class() {
        assert!(n("F#").is_enharmonic_with(n("Gb")));
        assert!(n("B#").is_enharmonic_with(n("C")));
        assert!(n("Cb").is_enharmonic_with(n("B")));
        assert_ne!(n("F#"), n("Gb"));
        assert_eq!(n("Bbb").pitch_class().value(), 9);
    }

    #[test]
    fn midi_numbers_follow_scientific_notation() {
        assert_eq!(p("C4").midi(), 60);
        assert_eq!(p("A4").midi(), 69);
        assert_eq!(p("C-1").midi(), 0);
        assert_eq!(p("G9").midi(), 127);
        assert_eq!(p("Cb4").midi(), 59);
        assert_eq!(p("B#3").midi(), 60);
        assert_eq!(p("A0").midi(), 21);
        assert_eq!(p("C8").midi(), 108);
    }

    #[test]
    fn midi_round_trips() {
        for midi in 0..=127 {
            assert_eq!(Pitch::from_midi(midi, Spelling::Sharps).midi(), midi);
            assert_eq!(Pitch::from_midi(midi, Spelling::Flats).midi(), midi);
        }
        assert_eq!(Pitch::from_midi(61, Spelling::Sharps).to_string(), "C#4");
        assert_eq!(Pitch::from_midi(61, Spelling::Flats).to_string(), "Db4");
    }

    #[test]
    fn frequencies_use_equal_temperament() {
        assert!((p("A4").frequency(A4_STANDARD_HZ) - 440.0).abs() < 1e-9);
        assert!((p("A3").frequency(A4_STANDARD_HZ) - 220.0).abs() < 1e-9);
        assert!((p("C4").frequency(A4_STANDARD_HZ) - 261.6256).abs() < 1e-3);
        assert!((p("A4").frequency(432.0) - 432.0).abs() < 1e-9);
    }

    #[test]
    fn line_of_fifths_round_trips() {
        assert_eq!(n("C").fifths(), 0);
        assert_eq!(n("F#").fifths(), 6);
        assert_eq!(n("Bb").fifths(), -2);
        for i in -14..=14 {
            assert_eq!(Note::from_fifths(i).fifths(), i);
        }
    }

    #[test]
    fn transposition_keeps_correct_spelling() {
        assert_eq!(n("E").up(Interval::MAJOR_THIRD), n("G#"));
        assert_eq!(n("F").down(Interval::PERFECT_FIFTH), n("Bb"));
        assert_eq!(n("C").down(Interval::MINOR_SECOND), n("B"));
        assert_eq!(n("B").up(Interval::MAJOR_THIRD), n("D#"));
        assert_eq!(n("Gb").up(Interval::PERFECT_FOURTH), n("Cb"));
        assert_eq!(n("C").up(Interval::DIMINISHED_SEVENTH), n("Bbb"));
    }

    #[test]
    fn pitch_transposition_crosses_octaves() {
        assert_eq!(p("B3").up(Interval::MINOR_SECOND), p("C4"));
        assert_eq!(p("C4").down(Interval::MINOR_SECOND), p("B3"));
        assert_eq!(p("C4").up(Interval::MAJOR_NINTH), p("D5"));
        assert_eq!(p("A4").up(Interval::OCTAVE), p("A5"));
        assert_eq!(p("C4").down(Interval::MAJOR_SIXTH), p("Eb3"));
    }
}
