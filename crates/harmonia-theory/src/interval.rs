//! Intervalles : distance diatonique et chromatique entre deux notes.

use std::fmt;
use std::str::FromStr;

use crate::error::TheoryError;
use crate::pitch::{Note, Pitch};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum IntervalQuality {
    Perfect,
    Major,
    Minor,
    /// Augmenté `n` fois (1 = augmenté, 2 = doublement augmenté).
    Augmented(u8),
    /// Diminué `n` fois.
    Diminished(u8),
}

/// Intervalle ascendant.
///
/// `steps` compte les degrés diatoniques (0 = unisson, 7 = octave) et
/// `semitones` la distance chromatique. Les deux sont nécessaires : une quarte
/// augmentée et une quinte diminuée font toutes deux 6 demi-tons.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Interval {
    steps: i32,
    semitones: i32,
}

const MAJOR_SCALE_SEMITONES: [i32; 7] = [0, 2, 4, 5, 7, 9, 11];

/// Demi-tons de l'intervalle majeur ou juste comptant `steps` degrés.
fn reference_semitones(steps: i32) -> i32 {
    12 * (steps / 7) + MAJOR_SCALE_SEMITONES[(steps % 7) as usize]
}

/// Unisson, quarte, quinte et leurs redoublements sont « justes ».
fn is_perfect_class(steps: i32) -> bool {
    matches!(steps % 7, 0 | 3 | 4)
}

impl Interval {
    pub const UNISON: Interval = Interval::raw(0, 0);
    pub const MINOR_SECOND: Interval = Interval::raw(1, 1);
    pub const MAJOR_SECOND: Interval = Interval::raw(1, 2);
    pub const MINOR_THIRD: Interval = Interval::raw(2, 3);
    pub const MAJOR_THIRD: Interval = Interval::raw(2, 4);
    pub const PERFECT_FOURTH: Interval = Interval::raw(3, 5);
    pub const AUGMENTED_FOURTH: Interval = Interval::raw(3, 6);
    pub const DIMINISHED_FIFTH: Interval = Interval::raw(4, 6);
    pub const PERFECT_FIFTH: Interval = Interval::raw(4, 7);
    pub const AUGMENTED_FIFTH: Interval = Interval::raw(4, 8);
    pub const MINOR_SIXTH: Interval = Interval::raw(5, 8);
    pub const MAJOR_SIXTH: Interval = Interval::raw(5, 9);
    pub const AUGMENTED_SIXTH: Interval = Interval::raw(5, 10);
    pub const DIMINISHED_SEVENTH: Interval = Interval::raw(6, 9);
    pub const MINOR_SEVENTH: Interval = Interval::raw(6, 10);
    pub const MAJOR_SEVENTH: Interval = Interval::raw(6, 11);
    pub const OCTAVE: Interval = Interval::raw(7, 12);
    pub const MINOR_NINTH: Interval = Interval::raw(8, 13);
    pub const MAJOR_NINTH: Interval = Interval::raw(8, 14);
    pub const PERFECT_ELEVENTH: Interval = Interval::raw(10, 17);
    pub const AUGMENTED_ELEVENTH: Interval = Interval::raw(10, 18);
    pub const MINOR_THIRTEENTH: Interval = Interval::raw(12, 20);
    pub const MAJOR_THIRTEENTH: Interval = Interval::raw(12, 21);

    pub(crate) const fn raw(steps: i32, semitones: i32) -> Interval {
        Interval { steps, semitones }
    }

    /// Construit un intervalle depuis sa qualité et son numéro (1 = unisson).
    /// Refuse les combinaisons impossibles (« quinte majeure », « tierce juste »).
    pub fn new(quality: IntervalQuality, number: u32) -> Result<Interval, TheoryError> {
        let err = || TheoryError::InvalidInterval(format!("{quality:?} {number}"));
        if number == 0 || number > 64 {
            return Err(err());
        }
        let steps = number as i32 - 1;
        let offset = match (is_perfect_class(steps), quality) {
            (true, IntervalQuality::Perfect) => 0,
            (false, IntervalQuality::Major) => 0,
            (false, IntervalQuality::Minor) => -1,
            (_, IntervalQuality::Augmented(n)) if n >= 1 => n as i32,
            (true, IntervalQuality::Diminished(n)) if n >= 1 => -(n as i32),
            (false, IntervalQuality::Diminished(n)) if n >= 1 => -(n as i32) - 1,
            _ => return Err(err()),
        };
        Ok(Interval::raw(steps, reference_semitones(steps) + offset))
    }

    /// Degrés diatoniques franchis (0 = unisson).
    pub const fn steps(self) -> i32 {
        self.steps
    }

    pub const fn semitones(self) -> i32 {
        self.semitones
    }

    /// Numéro usuel : 1 = unisson, 3 = tierce, 8 = octave.
    pub const fn number(self) -> i32 {
        self.steps + 1
    }

    pub fn quality(self) -> IntervalQuality {
        let diff = self.semitones - reference_semitones(self.steps);
        if is_perfect_class(self.steps) {
            match diff {
                0 => IntervalQuality::Perfect,
                d if d > 0 => IntervalQuality::Augmented(d as u8),
                d => IntervalQuality::Diminished((-d) as u8),
            }
        } else {
            match diff {
                0 => IntervalQuality::Major,
                -1 => IntervalQuality::Minor,
                d if d > 0 => IntervalQuality::Augmented(d as u8),
                d => IntervalQuality::Diminished((-d - 1) as u8),
            }
        }
    }

    pub const fn is_compound(self) -> bool {
        self.steps > 7
    }

    /// Réduit un intervalle redoublé à moins d'une octave (l'octave reste l'octave).
    pub fn simple(self) -> Interval {
        if self.steps <= 7 {
            self
        } else {
            Interval::raw(self.steps % 7, self.semitones - 12 * (self.steps / 7))
        }
    }

    /// Renversement : tierce majeure ↔ sixte mineure, quarte ↔ quinte.
    pub fn invert(self) -> Interval {
        let simple = self.simple();
        Interval::raw(7 - simple.steps, 12 - simple.semitones)
    }

    /// Intervalle ascendant de `from` à `to`, inférieur à l'octave.
    pub fn between(from: Note, to: Note) -> Interval {
        let steps = (to.letter.index() - from.letter.index()).rem_euclid(7);
        let wrap = if to.letter.index() < from.letter.index() {
            12
        } else {
            0
        };
        let semitones = to.letter.semitones() + to.accidental as i32
            - from.letter.semitones()
            - from.accidental as i32
            + wrap;
        Interval::raw(steps, semitones)
    }

    /// Intervalle entre deux hauteurs, de la plus grave à la plus aiguë.
    pub fn between_pitches(a: Pitch, b: Pitch) -> Interval {
        let position = |p: Pitch| p.octave as i32 * 7 + p.note.letter.index();
        let (low, high) = if (position(a), a.midi()) <= (position(b), b.midi()) {
            (a, b)
        } else {
            (b, a)
        };
        Interval::raw(position(high) - position(low), high.midi() - low.midi())
    }
}

impl fmt::Display for Interval {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.quality() {
            IntervalQuality::Perfect => write!(f, "P")?,
            IntervalQuality::Major => write!(f, "M")?,
            IntervalQuality::Minor => write!(f, "m")?,
            IntervalQuality::Augmented(n) => write!(f, "{}", "A".repeat(n as usize))?,
            IntervalQuality::Diminished(n) => write!(f, "{}", "d".repeat(n as usize))?,
        }
        write!(f, "{}", self.number())
    }
}

impl FromStr for Interval {
    type Err = TheoryError;

    /// Lit `P5`, `m3`, `M7`, `A4`, `d5`, `dd7`…
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || TheoryError::InvalidInterval(s.to_string());
        let s = s.trim();
        let split = s.find(|c: char| c.is_ascii_digit()).ok_or_else(err)?;
        let (quality, number) = s.split_at(split);
        let number: u32 = number.parse().map_err(|_| err())?;
        let quality = match quality {
            "P" => IntervalQuality::Perfect,
            "M" => IntervalQuality::Major,
            "m" => IntervalQuality::Minor,
            q if !q.is_empty() && q.chars().all(|c| c == 'A') => {
                IntervalQuality::Augmented(q.len() as u8)
            }
            q if !q.is_empty() && q.chars().all(|c| c == 'd') => {
                IntervalQuality::Diminished(q.len() as u8)
            }
            _ => return Err(err()),
        };
        Interval::new(quality, number).map_err(|_| err())
    }
}

/// Abréviations usuelles, réservées aux tables internes du moteur.
#[allow(non_upper_case_globals)]
pub(crate) mod short {
    use super::Interval;

    pub const P1: Interval = Interval::UNISON;
    pub const m2: Interval = Interval::MINOR_SECOND;
    pub const M2: Interval = Interval::MAJOR_SECOND;
    pub const m3: Interval = Interval::MINOR_THIRD;
    pub const M3: Interval = Interval::MAJOR_THIRD;
    pub const P4: Interval = Interval::PERFECT_FOURTH;
    pub const A4: Interval = Interval::AUGMENTED_FOURTH;
    pub const d5: Interval = Interval::DIMINISHED_FIFTH;
    pub const P5: Interval = Interval::PERFECT_FIFTH;
    pub const A5: Interval = Interval::AUGMENTED_FIFTH;
    pub const m6: Interval = Interval::MINOR_SIXTH;
    pub const M6: Interval = Interval::MAJOR_SIXTH;
    pub const A6: Interval = Interval::AUGMENTED_SIXTH;
    pub const d7: Interval = Interval::DIMINISHED_SEVENTH;
    pub const m7: Interval = Interval::MINOR_SEVENTH;
    pub const M7: Interval = Interval::MAJOR_SEVENTH;
    pub const M9: Interval = Interval::MAJOR_NINTH;
    pub const P11: Interval = Interval::PERFECT_ELEVENTH;
    pub const M13: Interval = Interval::MAJOR_THIRTEENTH;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(s: &str) -> Note {
        s.parse().unwrap()
    }
    fn i(s: &str) -> Interval {
        s.parse().unwrap()
    }

    #[test]
    fn names_round_trip() {
        for s in [
            "P1", "m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "A5", "m6", "M6", "d7", "m7",
            "M7", "P8", "m9", "M9", "P11", "A11", "M13", "dd7", "AA4",
        ] {
            assert_eq!(i(s).to_string(), s);
        }
    }

    #[test]
    fn rejects_impossible_intervals() {
        for s in ["M5", "P3", "m4", "M1", "P0", "X3", "5", "m"] {
            assert!(s.parse::<Interval>().is_err(), "{s} devrait être refusé");
        }
    }

    #[test]
    fn semitone_counts() {
        let expected = [
            ("P1", 0),
            ("m2", 1),
            ("M2", 2),
            ("m3", 3),
            ("M3", 4),
            ("P4", 5),
            ("A4", 6),
            ("d5", 6),
            ("P5", 7),
            ("m6", 8),
            ("M6", 9),
            ("m7", 10),
            ("M7", 11),
            ("P8", 12),
            ("M9", 14),
            ("P11", 17),
            ("M13", 21),
        ];
        for (name, semitones) in expected {
            assert_eq!(i(name).semitones(), semitones, "{name}");
        }
    }

    #[test]
    fn distinguishes_tritone_spellings() {
        assert_eq!(Interval::between(n("C"), n("F#")), i("A4"));
        assert_eq!(Interval::between(n("C"), n("Gb")), i("d5"));
        assert_eq!(Interval::between(n("B"), n("F")), i("d5"));
        assert_eq!(Interval::between(n("F"), n("B")), i("A4"));
    }

    #[test]
    fn between_notes() {
        assert_eq!(Interval::between(n("C"), n("G")), i("P5"));
        assert_eq!(Interval::between(n("G"), n("C")), i("P4"));
        assert_eq!(Interval::between(n("A"), n("C")), i("m3"));
        assert_eq!(Interval::between(n("B"), n("C")), i("m2"));
        assert_eq!(Interval::between(n("Eb"), n("G")), i("M3"));
        assert_eq!(Interval::between(n("C"), n("C")), i("P1"));
        assert_eq!(Interval::between(n("C"), n("C#")), i("A1"));
    }

    #[test]
    fn between_pitches_is_order_independent() {
        let c4: Pitch = "C4".parse().unwrap();
        let e5: Pitch = "E5".parse().unwrap();
        assert_eq!(Interval::between_pitches(c4, e5), i("M10"));
        assert_eq!(Interval::between_pitches(e5, c4), i("M10"));
        assert_eq!(Interval::between_pitches(c4, c4), i("P1"));
    }

    #[test]
    fn inversions_sum_to_an_octave() {
        let pairs = [
            ("m2", "M7"),
            ("M2", "m7"),
            ("m3", "M6"),
            ("M3", "m6"),
            ("P4", "P5"),
            ("A4", "d5"),
            ("P1", "P8"),
        ];
        for (a, b) in pairs {
            assert_eq!(i(a).invert(), i(b));
            assert_eq!(i(b).invert(), i(a));
        }
        assert_eq!(i("M9").invert(), i("m7"));
    }

    #[test]
    fn compound_intervals_reduce() {
        assert!(i("M9").is_compound());
        assert!(!i("P8").is_compound());
        assert_eq!(i("M9").simple(), i("M2"));
        assert_eq!(i("P11").simple(), i("P4"));
        assert_eq!(i("M13").simple(), i("M6"));
        assert_eq!(i("P8").simple(), i("P8"));
    }

    #[test]
    fn up_then_between_is_identity() {
        let notes = ["C", "F#", "Bb", "E", "Ab", "D#"];
        let intervals = ["m2", "M3", "P4", "A4", "d5", "P5", "m6", "M7"];
        for note in notes {
            for interval in intervals {
                let from = n(note);
                let to = from.up(i(interval));
                assert_eq!(Interval::between(from, to), i(interval), "{note} + {interval}");
                assert_eq!(to.down(i(interval)), from, "{note} + {interval} puis retour");
            }
        }
    }
}
