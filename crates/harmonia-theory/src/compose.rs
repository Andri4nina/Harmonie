//! Générateur : progressions d'accords et mélodies, à partir de la théorie.
//!
//! # Harmonie
//!
//! Une chaîne de Markov sur les fonctions tonales : tonique (T),
//! sous-dominante (S), dominante (D). Chaque mesure porte un accord ; la
//! première est la tonique ; les trois dernières forment la formule
//! cadentielle S – D – T (ii – V – I, IV – V – I…), la cadence finale étant
//! parfaite. Les accords de chaque fonction dépendent du style et du mode.
//!
//! | De \ vers | T | S | D |
//! |---|---|---|---|
//! | T | 0,20 | 0,60 | 0,20 |
//! | S | 0,20 | 0,20 | 0,60 |
//! | D | 0,85 | 0,00 | 0,15 |
//!
//! # Mélodie
//!
//! Le rythme de chaque mesure est tiré d'un petit répertoire de cellules
//! (noires, blanches, croches, noire pointée). Sur les temps forts (1 et 3),
//! la note est une note de l'accord, la plus proche de la précédente ; entre
//! deux, la mélodie avance par degrés conjoints. La dernière mesure tient la
//! tonique. Tout reste dans la gamme et entre la sixte sous la tonique et
//! la dixième au-dessus.

use crate::ear::Rng;
use crate::{Chord, Key, Mode, Note, Pitch, RomanNumeral};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Style {
    Pop,
    Classical,
    Jazz,
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Settings {
    pub key: Key,
    pub style: Style,
    /// Nombre de mesures (au moins 3).
    pub bars: usize,
    pub bpm: f64,
}

/// Un accord placé : il occupe toute sa mesure.
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct PlacedChord {
    pub chord: Chord,
    pub numeral: RomanNumeral,
    /// Début, en temps depuis le début du morceau.
    pub beat: f64,
    pub length: f64,
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct PlacedNote {
    pub pitch: Pitch,
    /// Hauteur MIDI de `pitch`, pour l'affichage (recalculée à la lecture).
    #[cfg_attr(feature = "serde", serde(default))]
    pub midi: i32,
    pub beat: f64,
    pub length: f64,
}

/// Un morceau généré : grille d'accords et mélodie, à 4/4.
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Piece {
    pub key: Key,
    pub style: Style,
    pub bpm: f64,
    pub beats_per_bar: u32,
    pub chords: Vec<PlacedChord>,
    pub melody: Vec<PlacedNote>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Function {
    Tonic,
    Subdominant,
    Dominant,
}

/// Accords de chaque fonction : le premier de la tonique ouvre et clôt.
fn palette(style: Style, mode: Mode, function: Function) -> &'static [&'static str] {
    use Function::*;
    match (mode, style, function) {
        (Mode::Major, Style::Pop, Tonic) => &["I", "vi"],
        (Mode::Major, Style::Pop, Subdominant) => &["IV", "ii"],
        (Mode::Major, Style::Pop, Dominant) => &["V"],
        (Mode::Major, Style::Classical, Tonic) => &["I", "vi", "iii"],
        (Mode::Major, Style::Classical, Subdominant) => &["IV", "ii"],
        (Mode::Major, Style::Classical, Dominant) => &["V", "vii°"],
        (Mode::Major, Style::Jazz, Tonic) => &["Imaj7", "vi7", "iii7"],
        (Mode::Major, Style::Jazz, Subdominant) => &["ii7", "IVmaj7"],
        (Mode::Major, Style::Jazz, Dominant) => &["V7"],
        (Mode::Minor, Style::Pop, Tonic) => &["i", "VI", "III"],
        (Mode::Minor, Style::Pop, Subdominant) => &["iv", "VII"],
        (Mode::Minor, Style::Pop, Dominant) => &["V"],
        (Mode::Minor, Style::Classical, Tonic) => &["i", "VI"],
        (Mode::Minor, Style::Classical, Subdominant) => &["iv", "ii°"],
        // En mineur, l'accord de septième diminuée est bâti sur la sensible (7e haussé).
        (Mode::Minor, Style::Classical, Dominant) => &["V", "#vii°7"],
        (Mode::Minor, Style::Jazz, Tonic) => &["i7", "VImaj7"],
        (Mode::Minor, Style::Jazz, Subdominant) => &["iiø7", "iv7"],
        (Mode::Minor, Style::Jazz, Dominant) => &["V7"],
    }
}

fn next_function(rng: &mut Rng, from: Function) -> Function {
    use Function::*;
    let weights: [(Function, f64); 3] = match from {
        Tonic => [(Tonic, 0.2), (Subdominant, 0.6), (Dominant, 0.2)],
        Subdominant => [(Tonic, 0.2), (Subdominant, 0.2), (Dominant, 0.6)],
        Dominant => [(Tonic, 0.85), (Subdominant, 0.0), (Dominant, 0.15)],
    };
    let mut target = rng.unit();
    for (function, weight) in weights {
        if target < weight {
            return function;
        }
        target -= weight;
    }
    Tonic
}

/// Cellules rythmiques d'une mesure à 4/4 : `(début, durée)` en temps.
const RHYTHMS: &[&[(f64, f64)]] = &[
    &[(0.0, 1.0), (1.0, 1.0), (2.0, 1.0), (3.0, 1.0)],
    &[(0.0, 2.0), (2.0, 1.0), (3.0, 1.0)],
    &[(0.0, 1.0), (1.0, 0.5), (1.5, 0.5), (2.0, 1.0), (3.0, 1.0)],
    &[(0.0, 1.5), (1.5, 0.5), (2.0, 2.0)],
    &[(0.0, 1.0), (1.0, 1.0), (2.0, 2.0)],
    &[(0.0, 0.5), (0.5, 0.5), (1.0, 1.0), (2.0, 1.5), (3.5, 0.5)],
];

/// Hauteur d'un degré « absolu » de la gamme (0 = tonique de référence,
/// 7 = octave au-dessus, -1 = sensible en dessous…), orthographiée.
fn scale_pitch(key: &Key, tonic_midi: i32, index: i32) -> Pitch {
    let scale = key.scale().notes();
    let degree = index.rem_euclid(7) as usize;
    let note: Note = scale[degree];
    let offset = (note.pitch_class().value() as i32 - key.tonic.pitch_class().value() as i32).rem_euclid(12);
    let midi = tonic_midi + offset + 12 * index.div_euclid(7);
    let octave = (midi - note.letter.semitones() - note.accidental as i32).div_euclid(12) - 1;
    Pitch::new(note, octave as i8)
}

/// Degrés (indices de gamme) des notes de l'accord, dans `low..=high`.
fn chord_indices(key: &Key, chord: &Chord, low: i32, high: i32) -> Vec<i32> {
    let scale = key.scale().notes();
    let classes: Vec<u8> = chord.notes().iter().map(|n| n.pitch_class().value()).collect();
    (low..=high).filter(|i| classes.contains(&scale[i.rem_euclid(7) as usize].pitch_class().value())).collect()
}

/// Compose un morceau. La même graine donne le même morceau.
pub fn compose(settings: &Settings, seed: u64) -> Piece {
    let mut rng = Rng::new(seed);
    let key = settings.key;
    let bars = settings.bars.max(3);
    let pick = |rng: &mut Rng, function: Function| {
        let options = palette(settings.style, key.mode, function);
        options[rng.below(options.len())]
    };

    // Fonctions mesure par mesure : T … D T.
    let mut functions = vec![Function::Tonic];
    while functions.len() < bars - 3 {
        let last = *functions.last().expect("au moins une fonction");
        functions.push(next_function(&mut rng, last));
    }
    // Formule cadentielle : sous-dominante, dominante, tonique.
    if bars > 3 {
        functions.push(Function::Subdominant);
    }
    functions.push(Function::Dominant);
    functions.push(Function::Tonic);

    let mut numerals: Vec<&str> = Vec::with_capacity(bars);
    for (index, function) in functions.iter().enumerate() {
        // Ouverture, dominante de la cadence et conclusion : l'accord principal de la fonction.
        let first_or_last = index == 0 || index >= bars - 2;
        let mut choice = if first_or_last { palette(settings.style, key.mode, *function)[0] } else { pick(&mut rng, *function) };
        // Pas deux fois le même accord de suite, sauf s'il est seul de sa fonction.
        for _ in 0..8 {
            if numerals.last() != Some(&choice) || first_or_last {
                break;
            }
            choice = pick(&mut rng, *function);
        }
        numerals.push(choice);
    }
    let beats = 4.0;
    let chords: Vec<PlacedChord> = numerals
        .iter()
        .enumerate()
        .map(|(bar, text)| {
            let numeral: RomanNumeral = text.parse().expect("palette valide");
            PlacedChord { chord: numeral.resolve(&key), numeral, beat: bar as f64 * beats, length: beats }
        })
        .collect();

    // Mélodie.
    let tonic_pc = key.tonic.pitch_class().value() as i32;
    let tonic_midi = if 60 + tonic_pc > 66 { 48 + tonic_pc } else { 60 + tonic_pc };
    let (low, high) = (-2, 9);
    let mut current: i32 = 4; // départ sur la quinte, au-dessus de la tonique
    let mut melody = Vec::new();
    for (bar, placed) in chords.iter().enumerate() {
        let start = bar as f64 * beats;
        let tones = chord_indices(&key, &placed.chord, low, high);
        if bar == bars - 1 {
            // Fin : la tonique la plus proche, tenue toute la mesure.
            let end = if (current - 7).abs() < current.abs() { 7 } else { 0 };
            let pitch = scale_pitch(&key, tonic_midi, end);
            melody.push(PlacedNote { pitch, midi: pitch.midi(), beat: start, length: beats });
            break;
        }
        let rhythm = RHYTHMS[rng.below(RHYTHMS.len())];
        for (offset, length) in rhythm {
            let strong = *offset == 0.0 || *offset == 2.0;
            current = if strong {
                // Note de l'accord la plus proche (au hasard parmi les deux meilleures).
                let mut sorted = tones.clone();
                sorted.sort_by_key(|i| ((i - current).abs(), *i));
                sorted[rng.below(sorted.len().min(2))]
            } else {
                let step = if rng.below(2) == 0 { 1 } else { -1 };
                let next = current + step;
                if (low..=high).contains(&next) { next } else { current - step }
            };
            let pitch = scale_pitch(&key, tonic_midi, current);
            melody.push(PlacedNote { pitch, midi: pitch.midi(), beat: start + offset, length: *length });
        }
    }

    Piece { key, style: settings.style, bpm: settings.bpm, beats_per_bar: 4, chords, melody }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(key: &str, style: Style, bars: usize) -> Settings {
        Settings { key: key.parse().unwrap(), style, bars, bpm: 96.0 }
    }

    #[test]
    fn every_palette_chord_is_readable() {
        for style in [Style::Pop, Style::Classical, Style::Jazz] {
            for mode in [Mode::Major, Mode::Minor] {
                for function in [Function::Tonic, Function::Subdominant, Function::Dominant] {
                    for text in palette(style, mode, function) {
                        assert!(text.parse::<RomanNumeral>().is_ok(), "{text}");
                    }
                }
            }
        }
    }

    #[test]
    fn minor_dominant_chords_use_the_leading_tone() {
        for seed in 0..80 {
            let piece = compose(&settings("A minor", Style::Classical, 16), seed);
            for placed in &piece.chords {
                if placed.numeral.degree == 7 {
                    assert_eq!(placed.chord.to_string(), "G#dim7", "{}", placed.numeral);
                }
                if placed.numeral.degree == 5 {
                    assert_eq!(placed.chord.to_string(), "E");
                }
            }
        }
    }

    #[test]
    fn the_same_seed_gives_the_same_piece() {
        let s = settings("C", Style::Pop, 8);
        assert_eq!(compose(&s, 11), compose(&s, 11));
        assert_ne!(compose(&s, 11), compose(&s, 12));
    }

    #[test]
    fn progressions_open_on_the_tonic_and_close_with_a_perfect_cadence() {
        for seed in 0..60 {
            for (key, style) in [("C", Style::Pop), ("Eb", Style::Classical), ("A minor", Style::Jazz), ("F# minor", Style::Pop)] {
                for bars in [4, 8, 16] {
                    let piece = compose(&settings(key, style, bars), seed);
                    assert_eq!(piece.chords.len(), bars);
                    let numerals: Vec<String> = piece.chords.iter().map(|c| c.numeral.to_string()).collect();
                    assert_eq!(piece.chords[0].numeral.degree, 1, "{numerals:?}");
                    assert_eq!(piece.chords[bars - 1].numeral.degree, 1, "{numerals:?}");
                    assert_eq!(piece.chords[bars - 2].numeral.degree, 5, "{numerals:?}");
                    let predominant = piece.chords[bars - 3].numeral.degree;
                    assert!([2, 4, 7].contains(&predominant), "pré-dominante avant la cadence : {numerals:?}");
                    assert!(numerals.windows(2).take(bars - 2).all(|w| w[0] != w[1] || w[0].starts_with('V')), "{numerals:?}");
                }
            }
        }
    }

    #[test]
    fn melodies_fill_each_bar_and_land_chord_tones_on_strong_beats() {
        for seed in 0..80 {
            for (key, style) in [("G", Style::Pop), ("Bb", Style::Jazz), ("D minor", Style::Classical), ("B", Style::Classical)] {
                let piece = compose(&settings(key, style, 8), seed);
                let scale: Vec<u8> = piece.key.scale().notes().iter().map(|n| n.pitch_class().value()).collect();
                for (bar, placed) in piece.chords.iter().enumerate() {
                    let notes: Vec<&PlacedNote> = piece.melody.iter().filter(|n| n.beat >= placed.beat && n.beat < placed.beat + 4.0).collect();
                    let total: f64 = notes.iter().map(|n| n.length).sum();
                    assert!((total - 4.0).abs() < 1e-9, "mesure {bar} : {total}");
                    let tones: Vec<u8> = placed.chord.notes().iter().map(|n| n.pitch_class().value()).collect();
                    for note in &notes {
                        assert!(scale.contains(&note.pitch.note.pitch_class().value()), "hors gamme : {}", note.pitch);
                        let offset = note.beat - placed.beat;
                        if offset == 0.0 || offset == 2.0 {
                            assert!(tones.contains(&note.pitch.note.pitch_class().value()), "{} sur {}", note.pitch, placed.chord);
                        }
                    }
                }
                let last = piece.melody.last().unwrap();
                assert_eq!(last.pitch.note.pitch_class(), piece.key.tonic.pitch_class());
                assert!(piece.melody.windows(2).all(|w| (w[1].pitch.midi() - w[0].pitch.midi()).abs() <= 12));
                assert!(piece.melody.iter().all(|n| (48..=90).contains(&n.pitch.midi())));
            }
        }
    }

    #[test]
    fn pitches_are_spelled_in_the_key() {
        let piece = compose(&settings("Eb", Style::Pop, 8), 3);
        assert!(piece.melody.iter().all(|n| n.pitch.note.accidental <= 0), "Mi bémol majeur s'écrit en bémols");
        let piece = compose(&settings("B", Style::Pop, 8), 3);
        assert!(piece.melody.iter().all(|n| n.pitch.note.accidental >= 0), "Si majeur s'écrit en dièses");
    }
}
