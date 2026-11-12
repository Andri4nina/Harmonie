//! Harmonisation d'une mélodie par les accords de la tonalité.

use crate::chord::{Chord, ChordQuality};
use crate::key::{Key, Mode};
use crate::pitch::Note;

/// Un accord utilisable dans la tonalité, son degré (0 = tonique) et son poids
/// fonctionnel.
#[derive(Clone, Copy, Debug)]
struct Candidate {
    chord: Chord,
    degree: usize,
    weight: f64,
}

// Poids fonctionnels par degré : tonique et dominante d'abord, sous-dominante
// ensuite, puis les accords de substitution. L'accord diminué est rare.
const MAJOR_WEIGHTS: [f64; 7] = [3.0, 2.0, 1.0, 2.5, 3.0, 2.0, 0.5];
const MINOR_WEIGHTS: [f64; 7] = [3.0, 0.5, 2.0, 2.5, 1.5, 2.0, 1.5];

/// Triades de la tonalité. En mineur, la dominante majeure (mineur harmonique)
/// s'ajoute aux accords du mineur naturel : c'est elle qui porte la sensible.
fn pool(key: &Key) -> Vec<Candidate> {
    let weights = match key.mode {
        Mode::Major => MAJOR_WEIGHTS,
        Mode::Minor => MINOR_WEIGHTS,
    };
    let triads = key.diatonic_triads();
    let mut pool: Vec<Candidate> = triads
        .iter()
        .enumerate()
        .map(|(degree, &chord)| Candidate {
            chord,
            degree,
            weight: weights[degree],
        })
        .collect();
    if key.mode == Mode::Minor {
        pool.push(Candidate {
            chord: Chord::new(triads[4].root, ChordQuality::Major),
            degree: 4,
            weight: 3.0,
        });
    }
    pool
}

fn candidates_for(pool: &[Candidate], note: Note) -> Vec<Candidate> {
    let mut found: Vec<Candidate> = pool
        .iter()
        .copied()
        .filter(|c| {
            c.chord
                .notes()
                .iter()
                .any(|n| n.pitch_class() == note.pitch_class())
        })
        .collect();
    found.sort_by(|a, b| b.weight.total_cmp(&a.weight));
    found
}

/// Accords de la tonalité contenant la note, du plus au moins structurant.
/// Vide si la note est étrangère à la tonalité.
pub fn chords_for_note(key: &Key, note: Note) -> Vec<Chord> {
    candidates_for(&pool(key), note)
        .into_iter()
        .map(|c| c.chord)
        .collect()
}

/// Valeur d'un enchaînement selon le mouvement des fondamentales.
fn transition(from: &Candidate, to: &Candidate) -> f64 {
    if from.chord == to.chord {
        return 0.5;
    }
    match (to.degree + 7 - from.degree) % 7 {
        3 => 2.0, // quarte ascendante (quinte descendante) : le mouvement le plus fort
        4 => 1.0, // quinte ascendante
        1 => 1.0, // seconde ascendante
        5 => 1.0, // tierce descendante
        6 => 0.5, // seconde descendante
        2 => 0.5, // tierce ascendante
        _ => 0.0,
    }
}

/// Propose un accord par note de la mélodie.
///
/// Méthode : programmation dynamique (Viterbi) sur les triades de la tonalité
/// contenant chaque note. Le score d'une suite additionne le poids fonctionnel
/// de chaque accord et la valeur de chaque enchaînement (mouvement des
/// fondamentales), avec une prime pour commencer et surtout finir sur la
/// tonique. À score égal, l'accord le plus structurant l'emporte.
///
/// C'est une proposition parmi d'autres, pas « la » bonne harmonisation :
/// [`chords_for_note`] donne les alternatives. Une note étrangère à la
/// tonalité reçoit `None` et coupe la phrase en deux.
pub fn harmonize_melody(key: &Key, melody: &[Note]) -> Vec<Option<Chord>> {
    let pool = pool(key);
    let options: Vec<Vec<Candidate>> = melody
        .iter()
        .map(|&note| candidates_for(&pool, note))
        .collect();
    let mut result: Vec<Option<Chord>> = vec![None; melody.len()];
    let last_index = melody.len().saturating_sub(1);

    let mut start = 0;
    while start < options.len() {
        if options[start].is_empty() {
            start += 1;
            continue;
        }
        let end = (start..options.len())
            .find(|&i| options[i].is_empty())
            .unwrap_or(options.len());

        // scores[i][c] : meilleur score d'une suite finissant par l'option c
        // à la position start + i ; back[i][c] : option précédente retenue.
        let mut scores: Vec<Vec<f64>> = Vec::with_capacity(end - start);
        let mut back: Vec<Vec<usize>> = Vec::with_capacity(end - start);
        for i in start..end {
            let mut row = Vec::with_capacity(options[i].len());
            let mut row_back = Vec::with_capacity(options[i].len());
            for candidate in &options[i] {
                let mut score = candidate.weight;
                if candidate.degree == 0 {
                    if i == 0 {
                        score += 1.0;
                    }
                    if i == last_index {
                        score += 3.0;
                    }
                }
                let mut best_previous = 0;
                if i > start {
                    let mut best = f64::NEG_INFINITY;
                    for (p, previous) in options[i - 1].iter().enumerate() {
                        let value = scores[i - 1 - start][p] + transition(previous, candidate);
                        if value > best {
                            best = value;
                            best_previous = p;
                        }
                    }
                    score += best;
                }
                row.push(score);
                row_back.push(best_previous);
            }
            scores.push(row);
            back.push(row_back);
        }

        let mut choice = 0;
        let final_row = &scores[end - start - 1];
        for (c, &score) in final_row.iter().enumerate() {
            if score > final_row[choice] {
                choice = c;
            }
        }
        for i in (start..end).rev() {
            result[i] = Some(options[i][choice].chord);
            choice = back[i - start][choice];
        }
        start = end;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(s: &str) -> Key {
        s.parse().unwrap()
    }
    fn notes(s: &str) -> Vec<Note> {
        s.split(' ').map(|n| n.parse().unwrap()).collect()
    }
    fn names(chords: &[Chord]) -> String {
        chords
            .iter()
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join(" ")
    }
    fn harmonize(k: &str, melody: &str) -> Vec<String> {
        harmonize_melody(&key(k), &notes(melody))
            .iter()
            .map(|c| c.map_or("-".to_string(), |c| c.to_string()))
            .collect()
    }

    #[test]
    fn candidates_are_the_diatonic_chords_containing_the_note() {
        let c = key("C");
        assert_eq!(names(&chords_for_note(&c, "C".parse().unwrap())), "C F Am");
        assert_eq!(names(&chords_for_note(&c, "D".parse().unwrap())), "G Dm Bdim");
        assert_eq!(names(&chords_for_note(&c, "B".parse().unwrap())), "G Em Bdim");
        assert!(chords_for_note(&c, "F#".parse().unwrap()).is_empty());
    }

    #[test]
    fn minor_keys_offer_the_major_dominant() {
        let a_minor = key("Am");
        // La sensible Sol# n'existe que dans la dominante majeure.
        assert_eq!(names(&chords_for_note(&a_minor, "G#".parse().unwrap())), "E");
        let for_e = names(&chords_for_note(&a_minor, "E".parse().unwrap()));
        assert_eq!(for_e, "Am E C Em");
    }

    #[test]
    fn a_descending_cadence_gets_tonic_dominant_tonic() {
        assert_eq!(harmonize("C", "E D C"), ["C", "G", "C"]);
        assert_eq!(harmonize("G", "B A G"), ["G", "D", "G"]);
        assert_eq!(harmonize("Am", "C B A"), ["Am", "E", "Am"]);
    }

    #[test]
    fn every_chosen_chord_contains_its_note() {
        let melodies = [
            ("C", "C C G G A A G F F E E D D C"),
            ("F", "F G A Bb C D E F"),
            ("Em", "E F# G A B C D E"),
            ("Bb", "D Eb F D Bb C A Bb"),
        ];
        for (k, melody) in melodies {
            let melody = notes(melody);
            let chords = harmonize_melody(&key(k), &melody);
            assert_eq!(chords.len(), melody.len());
            for (note, chord) in melody.iter().zip(&chords) {
                let chord = chord.unwrap();
                assert!(
                    chord.notes().iter().any(|n| n.pitch_class() == note.pitch_class()),
                    "{chord} ne contient pas {note} (tonalité {k})"
                );
            }
            // La mélodie finit sur la tonique : l'harmonie aussi.
            assert_eq!(chords.last().unwrap().unwrap().root, key(k).tonic);
        }
    }

    #[test]
    fn foreign_notes_are_left_unharmonized() {
        assert_eq!(harmonize("C", "E F# D C"), ["C", "-", "G", "C"]);
        assert_eq!(harmonize("C", "C# F#"), ["-", "-"]);
        assert!(harmonize_melody(&key("C"), &[]).is_empty());
    }

    #[test]
    fn the_result_is_deterministic() {
        let melody = notes("C C G G A A G F F E E D D C");
        let first = harmonize_melody(&key("C"), &melody);
        for _ in 0..5 {
            assert_eq!(harmonize_melody(&key("C"), &melody), first);
        }
    }
}
