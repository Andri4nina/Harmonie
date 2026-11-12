//! Écrit le corpus d'évaluation : des morceaux dont la vérité est connue.
//!
//! ```text
//! cargo run -p harmonia-audio --example corpus -- workers/audio-analyzer/evaluation/corpus.json
//! ```
//!
//! Le corpus a deux parties. Les morceaux de **réglage** ont servi à ajuster
//! les paramètres de l'analyse. Les morceaux de **validation** (autres
//! tonalités, tempos et enchaînements) n'ont été rendus qu'une fois les
//! paramètres figés : leurs scores disent ce que vaut l'analyse sur des
//! morceaux qu'elle n'a jamais vus — mais du même type de son.
//!
//! Chaque morceau est décrit par ses accords (résolus par le moteur de
//! théorie), les notes MIDI à jouer et ses paramètres de rendu. Le script
//! `evaluation/synth.py` en fait un fichier audio : il ne contient aucune
//! règle musicale, il ne fait que jouer ces notes.

use std::{env, fs};

use harmonia_theory::{Chord, Key, Pitch, Progression};
use serde::Serialize;

enum Harmony {
    /// Degrés à résoudre dans la tonalité de la section.
    Roman(&'static str),
    /// Accords explicites, séparés par des espaces.
    Chords(&'static str),
}
use Harmony::{Chords, Roman};

struct Section {
    key: &'static str,
    harmony: Harmony,
    beats_per_chord: u32,
    repeats: u32,
}

struct Piece {
    /// `tuning` ou `validation`.
    set: &'static str,
    id: &'static str,
    title: &'static str,
    bpm: f64,
    beats_per_bar: u32,
    /// `piano` (attaque puis décroissance), `pad` (tenu), `bright` (riche en
    /// harmoniques).
    timbre: &'static str,
    /// `block` (accord plaqué à chaque temps) ou `arpeggio` (notes égrenées).
    pattern: &'static str,
    drums: bool,
    melody: bool,
    tuning_cents: f64,
    /// Rapport signal sur bruit en dB, si un bruit blanc est ajouté.
    noise_snr_db: Option<f64>,
    sections: Vec<Section>,
}

fn section(key: &'static str, harmony: Harmony, beats_per_chord: u32, repeats: u32) -> Section {
    Section { key, harmony, beats_per_chord, repeats }
}

fn piece(id: &'static str, title: &'static str, bpm: f64, beats_per_bar: u32, timbre: &'static str, sections: Vec<Section>) -> Piece {
    Piece { set: "tuning", id, title, bpm, beats_per_bar, timbre, pattern: "block", drums: true, melody: false, tuning_cents: 0.0, noise_snr_db: None, sections }
}

fn validation(id: &'static str, title: &'static str, bpm: f64, beats_per_bar: u32, timbre: &'static str, sections: Vec<Section>) -> Piece {
    Piece { set: "validation", ..piece(id, title, bpm, beats_per_bar, timbre, sections) }
}

fn corpus() -> Vec<Piece> {
    let mut pieces = tuning();
    pieces.extend(held_out());
    pieces
}

/// Morceaux jamais utilisés pour régler l'analyse.
fn held_out() -> Vec<Piece> {
    vec![
        validation("v-lent-a", "La majeur lent", 88.0, 4, "pad", vec![section("A", Roman("I-V-vi-iii-IV-I-IV-V"), 4, 2)]),
        validation("v-anatole-f", "Anatole en Fa majeur", 132.0, 4, "bright", vec![section("F", Roman("I-vi-ii-V"), 4, 4)]),
        validation("v-mineur-gm", "Sol mineur descendant", 116.0, 4, "piano", vec![section("G minor", Roman("i-VII-VI-V"), 4, 4)]),
        validation("v-jazz-bb", "Septièmes en Si bémol majeur", 96.0, 4, "pad", vec![section("Bb", Roman("Imaj7-vi7-ii7-V7"), 4, 4)]),
        validation("v-valse-am", "Valse en La mineur", 132.0, 3, "piano", vec![section("A minor", Roman("i-iv-V-i"), 3, 5)]),
        validation("v-rock-e", "Mi majeur avec accord emprunté", 144.0, 4, "bright", vec![section("E", Chords("E D A E"), 4, 5)]),
        validation(
            "v-modulation-c-a",
            "Modulation de Do majeur à La majeur",
            100.0,
            4,
            "piano",
            vec![section("C", Roman("I-vi-IV-V-I-IV-V-I"), 4, 2), section("A", Roman("I-vi-IV-V-I-IV-V-I"), 4, 2)],
        ),
        Piece { tuning_cents: -25.0, ..validation("v-desaccorde-g", "Sol majeur accordé 25 cents trop bas", 108.0, 4, "pad", vec![section("G", Roman("I-IV-vi-V"), 4, 4)]) },
        validation("v-renversements-f", "Renversements en Fa majeur", 84.0, 4, "piano", vec![section("F", Chords("F C/E Dm F/C Bb F/A Gm C"), 4, 2)]),
        Piece { pattern: "arpeggio", ..validation("v-arpege-dm", "Arpèges en Ré mineur avec batterie", 92.0, 4, "piano", vec![section("D minor", Roman("i-VI-iv-V"), 4, 4)]) },
        Piece { melody: true, ..validation("v-melodie-a", "La majeur avec mélodie", 120.0, 4, "piano", vec![section("A", Roman("I-IV-V-IV"), 4, 4)]) },
        Piece { noise_snr_db: Some(15.0), ..validation("v-bruit-fm", "Fa mineur dans le bruit", 110.0, 4, "bright", vec![section("F minor", Roman("i-iv-i-V"), 4, 4)]) },
        validation("v-lent-db", "Ré bémol majeur très lent", 66.0, 4, "pad", vec![section("Db", Roman("I-IV-ii-V"), 4, 2)]),
        validation("v-rapide-d", "Ré majeur rapide", 168.0, 4, "bright", vec![section("D", Roman("I-IV-V-IV"), 4, 6)]),
        validation("v-septiemes-g", "Septièmes en Sol majeur", 124.0, 4, "piano", vec![section("G", Chords("Gmaj7 Em7 Am7 D7"), 4, 4)]),
        Piece { drums: false, ..validation("v-sans-batterie-bm", "Si mineur au piano seul", 138.0, 4, "piano", vec![section("B minor", Roman("i-VI-VII-i"), 4, 4)]) },
    ]
}

/// Morceaux ayant servi à régler les paramètres.
fn tuning() -> Vec<Piece> {
    vec![
        piece("pop-c", "Pop en Do majeur", 120.0, 4, "piano", vec![section("C", Roman("I-V-vi-IV"), 4, 4)]),
        piece("fifties-g", "Anatole en Sol majeur", 96.0, 4, "pad", vec![section("G", Roman("I-vi-IV-V"), 4, 4)]),
        piece("andalouse-am", "Mineur en La", 140.0, 4, "bright", vec![section("A minor", Roman("i-VI-III-VII"), 4, 3), section("A minor", Roman("i-iv-V-i"), 4, 1)]),
        piece("jazz-eb", "Septièmes en Mi bémol majeur", 110.0, 4, "piano", vec![section("Eb", Roman("ii7-V7-Imaj7-vi7"), 4, 4)]),
        piece("valse-d", "Valse en Ré majeur", 150.0, 3, "piano", vec![section("D", Roman("I-IV-V-I"), 3, 5)]),
        Piece { drums: false, ..piece("lent-fsharpm", "Nappes en Fa dièse mineur, sans batterie", 80.0, 4, "pad", vec![section("F# minor", Roman("i-iv-V-i"), 4, 3)]) },
        piece("blues-a", "Blues en La", 100.0, 4, "bright", vec![section("A", Chords("A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7"), 4, 2)]),
        piece(
            "modulation-e-g",
            "Modulation de Mi majeur à Sol majeur",
            112.0,
            4,
            "piano",
            vec![section("E", Roman("I-IV-V-I-vi-ii-V-I"), 4, 2), section("G", Roman("I-IV-V-I-vi-ii-V-I"), 4, 2)],
        ),
        Piece { tuning_cents: 30.0, ..piece("desaccorde-c", "Do majeur accordé 30 cents trop haut", 120.0, 4, "piano", vec![section("C", Roman("I-IV-V-I"), 4, 4)]) },
        piece("renversements-dm", "Renversements en Ré mineur", 90.0, 4, "piano", vec![section("D minor", Chords("Dm A/C# Dm/F Gm Dm/A A Dm Dm"), 4, 2)]),
        piece("rapide-b", "Tempo rapide en Si majeur", 180.0, 4, "bright", vec![section("B", Roman("I-V-vi-IV"), 4, 6)]),
        piece("lent-ab", "Tempo lent en La bémol majeur", 60.0, 4, "pad", vec![section("Ab", Roman("I-vi-ii-V"), 4, 2)]),
        piece("valse-f", "Valse lente en Fa majeur", 90.0, 3, "pad", vec![section("F", Roman("I-vi-IV-V"), 3, 4)]),
        Piece { melody: true, ..piece("melodie-cm", "Do mineur avec mélodie", 104.0, 4, "piano", vec![section("C minor", Roman("i-iv-VII-III"), 4, 2), section("C minor", Roman("i-iv-V-i"), 4, 2)]) },
        piece("deux-par-mesure-g", "Deux accords par mesure en Sol majeur", 100.0, 4, "piano", vec![section("G", Roman("I-V-vi-iii-IV-I-IV-V"), 2, 4)]),
        piece("sus-dim-c", "Accords suspendus et diminués", 108.0, 4, "piano", vec![section("C", Chords("C Gsus4 G Bdim C F Gsus4 G"), 4, 2)]),
        Piece { noise_snr_db: Some(10.0), ..piece("bruit-c", "Pop en Do majeur dans le bruit", 120.0, 4, "piano", vec![section("C", Roman("I-V-vi-IV"), 4, 4)]) },
        Piece { pattern: "arpeggio", drums: false, ..piece("arpege-em", "Arpèges en Mi mineur, sans batterie", 100.0, 4, "piano", vec![section("E minor", Roman("i-VI-III-VII"), 4, 4)]) },
        Piece { melody: true, pattern: "arpeggio", ..piece("ballade-bb", "Ballade en Si bémol majeur avec mélodie", 76.0, 4, "piano", vec![section("Bb", Roman("I-iii-IV-V"), 4, 3), section("Bb", Roman("vi-ii-V-I"), 4, 1)]) },
        piece("mineur-relatif-em", "Mi mineur insistant sur sa relative", 126.0, 4, "bright", vec![section("E minor", Roman("i-III-VII-i"), 4, 2), section("E minor", Roman("i-iv-V-i"), 4, 2)]),
    ]
}

#[derive(Serialize)]
struct Corpus {
    /// Silence avant le premier temps, en secondes.
    lead_in_s: f64,
    pieces: Vec<PieceOut>,
}

#[derive(Serialize)]
struct PieceOut {
    set: &'static str,
    id: &'static str,
    title: &'static str,
    bpm: f64,
    beats_per_bar: u32,
    timbre: &'static str,
    pattern: &'static str,
    drums: bool,
    tuning_cents: f64,
    noise_snr_db: Option<f64>,
    keys: Vec<KeyOut>,
    chords: Vec<ChordOut>,
    melody: Vec<NoteOut>,
}

#[derive(Serialize)]
struct KeyOut {
    key: Key,
    start_beat: u32,
    beats: u32,
}

#[derive(Serialize)]
struct ChordOut {
    chord: Chord,
    start_beat: u32,
    beats: u32,
    /// Notes MIDI de l'accord, de la plus grave à la plus aiguë.
    notes: Vec<i32>,
    /// Note MIDI de la basse.
    bass: i32,
}

#[derive(Serialize)]
struct NoteOut {
    midi: i32,
    start_beat: f64,
    beats: f64,
}

fn build(piece: Piece) -> PieceOut {
    let mut keys = Vec::new();
    let mut chords = Vec::new();
    let mut melody = Vec::new();
    let mut beat = 0;
    for section in &piece.sections {
        let key: Key = section.key.parse().expect("tonalité du corpus");
        let resolved: Vec<Chord> = match section.harmony {
            Roman(text) => text.parse::<Progression>().expect("progression du corpus").resolve(&key),
            Chords(text) => text.split_whitespace().map(|c| c.parse().expect("accord du corpus")).collect(),
        };
        let start = beat;
        let scale = key.scale().notes();
        for _ in 0..section.repeats {
            for (index, chord) in resolved.iter().enumerate() {
                chords.push(ChordOut {
                    chord: *chord,
                    start_beat: beat,
                    beats: section.beats_per_chord,
                    notes: chord.voicing(3).iter().map(|p| p.midi()).collect(),
                    bass: Pitch::new(chord.bass_note(), 2).midi(),
                });
                if piece.melody {
                    // Une note de l'accord sur chaque temps, puis une note de
                    // passage de la gamme sur la seconde moitié du temps.
                    let tones = chord.notes();
                    for b in 0..section.beats_per_chord {
                        let tone = tones[(index + b as usize) % tones.len()];
                        melody.push(NoteOut { midi: Pitch::new(tone, 5).midi(), start_beat: (beat + b) as f64, beats: 0.5 });
                        let position = scale.iter().position(|n| n.letter == tone.letter).unwrap_or(0);
                        let passing = scale[(position + 1) % scale.len()];
                        melody.push(NoteOut { midi: Pitch::new(passing, 5).midi(), start_beat: (beat + b) as f64 + 0.5, beats: 0.5 });
                    }
                }
                beat += section.beats_per_chord;
            }
        }
        match keys.last_mut() {
            Some(KeyOut { key: previous, beats, .. }) if *previous == key => *beats += beat - start,
            _ => keys.push(KeyOut { key, start_beat: start, beats: beat - start }),
        }
    }
    PieceOut {
        set: piece.set,
        id: piece.id,
        title: piece.title,
        bpm: piece.bpm,
        beats_per_bar: piece.beats_per_bar,
        timbre: piece.timbre,
        pattern: piece.pattern,
        drums: piece.drums,
        tuning_cents: piece.tuning_cents,
        noise_snr_db: piece.noise_snr_db,
        keys,
        chords,
        melody,
    }
}

fn main() {
    let path = env::args().nth(1).expect("usage : corpus <fichier.json>");
    let corpus = Corpus { lead_in_s: 0.4, pieces: corpus().into_iter().map(build).collect() };
    fs::write(&path, serde_json::to_string_pretty(&corpus).expect("corpus sérialisable")).expect("écriture du corpus");
    println!("{} morceaux écrits dans {path}", corpus.pieces.len());
}
