//! Note les analyses du corpus d'évaluation contre la vérité de terrain.
//!
//! ```text
//! score corpus.json dossier_des_analyses rapport.json
//! ```
//!
//! Mesures, par morceau puis en moyenne :
//!
//! - **tempo** : juste à 4 % près ; une erreur d'octave (moitié, double) est
//!   comptée à part ;
//! - **mesure** : temps par mesure ;
//! - **tonalité** : exacte, ou erreur proche (relative, homonyme, quinte) ;
//! - **accords**, en part de la durée du morceau : fondamentale juste,
//!   fondamentale + caractère majeur/mineur, accord exact, accord exact avec
//!   sa basse ;
//! - **certitude** : justesse des accords pour chaque niveau annoncé ;
//! - **mélodie** : sur les morceaux qui en ont une, précision et rappel des
//!   notes (attaque à 100 ms près, même hauteur ; à l'octave près à part) ;
//!   sur les autres, notes trouvées à tort par minute.

use std::collections::BTreeMap;
use std::{env, fs};

use harmonia_audio::Analysis;
use harmonia_theory::{Chord, Key};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Corpus {
    lead_in_s: f64,
    pieces: Vec<Piece>,
}

#[derive(Deserialize)]
struct Piece {
    set: String,
    id: String,
    title: String,
    bpm: f64,
    beats_per_bar: usize,
    tuning_cents: f64,
    keys: Vec<KeyTruth>,
    chords: Vec<ChordTruth>,
    melody: Vec<MelodyTruth>,
}

#[derive(Deserialize)]
struct MelodyTruth {
    midi: i32,
    start_beat: f64,
}

#[derive(Deserialize)]
struct KeyTruth {
    key: Key,
    start_beat: u32,
    beats: u32,
}

#[derive(Deserialize)]
struct ChordTruth {
    chord: Chord,
    start_beat: u32,
    beats: u32,
}

#[derive(Serialize)]
struct PieceScore {
    set: String,
    id: String,
    title: String,
    tempo_true: f64,
    tempo_found: Option<f64>,
    /// `exact`, `octave`, `wrong` ou `none`.
    tempo: &'static str,
    meter_true: usize,
    meter_found: Option<usize>,
    key_true: String,
    key_found: Option<String>,
    /// `exact`, `relative`, `parallel`, `fifth`, `wrong` ou `none`.
    key: &'static str,
    /// Part de la durée où la tonalité locale est juste.
    key_time: f64,
    chord_root: f64,
    chord_majmin: f64,
    chord_exact: f64,
    chord_with_bass: f64,
    tuning_error_cents: f64,
    /// Part des temps réels retrouvés à 70 ms près.
    beats_found: f64,
    /// Part des premiers temps réels retrouvés à 70 ms près.
    downbeats_found: f64,
    /// Mélodie : précision, rappel, rappel à l'octave près (morceaux avec mélodie).
    melody_precision: Option<f64>,
    melody_recall: Option<f64>,
    melody_recall_octave: Option<f64>,
    /// Notes trouvées par minute sur un morceau sans mélodie.
    melody_false_per_minute: Option<f64>,
}

#[derive(Serialize, Default)]
struct Bucket {
    seconds: f64,
    exact: f64,
}

#[derive(Serialize)]
struct Report {
    pieces: Vec<PieceScore>,
    /// Moyennes par partie du corpus (`tuning`, `validation`).
    summary: BTreeMap<String, BTreeMap<&'static str, f64>>,
    /// Durée et justesse (accord exact) par partie et niveau de certitude.
    certainty: BTreeMap<String, Bucket>,
}

fn summarize(pieces: &[&PieceScore]) -> BTreeMap<&'static str, f64> {
    let n = pieces.len() as f64;
    let share = |test: &dyn Fn(&PieceScore) -> bool| pieces.iter().filter(|p| test(p)).count() as f64 / n;
    let mean = |value: &dyn Fn(&PieceScore) -> f64| pieces.iter().map(|p| value(p)).sum::<f64>() / n;
    BTreeMap::from([
        ("pieces", n),
        ("tempo_exact", share(&|p| p.tempo == "exact")),
        ("tempo_octave", share(&|p| p.tempo == "octave")),
        ("meter_exact", share(&|p| p.meter_found == Some(p.meter_true))),
        ("meter_none", share(&|p| p.meter_found.is_none())),
        ("key_exact", share(&|p| p.key == "exact")),
        ("key_time", mean(&|p| p.key_time)),
        ("chord_root", mean(&|p| p.chord_root)),
        ("chord_majmin", mean(&|p| p.chord_majmin)),
        ("chord_exact", mean(&|p| p.chord_exact)),
        ("chord_with_bass", mean(&|p| p.chord_with_bass)),
        ("tuning_error_cents", mean(&|p| p.tuning_error_cents)),
        ("beats_found", mean(&|p| p.beats_found)),
        ("downbeats_found", mean(&|p| p.downbeats_found)),
        ("melody_precision", mean_of(pieces, |p| p.melody_precision)),
        ("melody_recall", mean_of(pieces, |p| p.melody_recall)),
        ("melody_recall_octave", mean_of(pieces, |p| p.melody_recall_octave)),
        ("melody_false_per_minute", mean_of(pieces, |p| p.melody_false_per_minute)),
    ])
}

/// Moyenne d'une mesure facultative, sur les morceaux où elle existe (-1 si aucun).
fn mean_of(pieces: &[&PieceScore], value: impl Fn(&PieceScore) -> Option<f64>) -> f64 {
    let values: Vec<f64> = pieces.iter().filter_map(|p| value(p)).collect();
    if values.is_empty() { -1.0 } else { values.iter().sum::<f64>() / values.len() as f64 }
}

fn same_key(a: &Key, b: &Key) -> bool {
    a.mode == b.mode && a.tonic.pitch_class() == b.tonic.pitch_class()
}

fn key_relation(truth: &Key, found: &Key) -> &'static str {
    if same_key(truth, found) {
        "exact"
    } else if same_key(&truth.relative(), found) {
        "relative"
    } else if same_key(&truth.parallel(), found) {
        "parallel"
    } else if same_key(&truth.dominant(), found) || same_key(&truth.subdominant(), found) {
        "fifth"
    } else {
        "wrong"
    }
}

fn matched(truth: &[f64], found: &[f64]) -> f64 {
    if truth.is_empty() {
        return 0.0;
    }
    truth.iter().filter(|t| found.iter().any(|f| (f - **t).abs() <= 0.07)).count() as f64 / truth.len() as f64
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let [_, corpus_path, directory, report_path] = args.as_slice() else {
        panic!("usage : score corpus.json dossier rapport.json");
    };
    let corpus: Corpus = serde_json::from_str(&fs::read_to_string(corpus_path).expect("corpus lisible")).expect("corpus valide");
    let mut pieces = Vec::new();
    let mut certainty: BTreeMap<String, Bucket> = BTreeMap::new();

    for piece in &corpus.pieces {
        let text = fs::read_to_string(format!("{directory}/{}.analysis.json", piece.id)).expect("analyse lisible");
        let analysis: Analysis = serde_json::from_str(&text).expect("analyse valide");
        let beat_s = 60.0 / piece.bpm;
        let at = |beat: u32| corpus.lead_in_s + beat as f64 * beat_s;

        let tempo = match analysis.tempo.as_ref().map(|t| t.bpm / piece.bpm) {
            None => "none",
            Some(ratio) if (ratio - 1.0).abs() <= 0.04 => "exact",
            Some(ratio) if (ratio - 0.5).abs() <= 0.02 || (ratio - 2.0).abs() <= 0.08 => "octave",
            Some(_) => "wrong",
        };

        // La tonalité de référence est celle qui dure le plus longtemps ; à
        // durées égales, chacune est une réponse juste.
        let longest = piece.keys.iter().map(|k| k.beats).max().expect("au moins une tonalité");
        let mains: Vec<Key> = piece.keys.iter().filter(|k| k.beats == longest).map(|k| k.key).collect();
        let main_key = *analysis.key.as_ref().and_then(|found| mains.iter().find(|m| same_key(m, &found.key))).unwrap_or(&mains[0]);
        let key = analysis.key.as_ref().map_or("none", |k| key_relation(&main_key, &k.key));

        // Parcours du morceau par pas de 10 ms.
        let end = piece.chords.iter().map(|c| at(c.start_beat + c.beats)).fold(0.0, f64::max);
        let (mut total, mut root, mut majmin, mut exact, mut with_bass, mut key_ok) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut t = corpus.lead_in_s + 0.005;
        while t < end {
            let ms = (t * 1000.0) as u64;
            let truth = piece.chords.iter().find(|c| t >= at(c.start_beat) && t < at(c.start_beat + c.beats)).expect("accord de référence");
            let span = analysis.chords.iter().find(|c| ms >= c.start_ms && ms < c.end_ms);
            let found = span.and_then(|s| s.chord);
            let mut is_exact = false;
            if let Some(found) = found
                && found.root.pitch_class() == truth.chord.root.pitch_class()
            {
                root += 1.0;
                let third = |c: &Chord| (c.quality.has_major_third(), c.quality.has_minor_third());
                if third(&found) == third(&truth.chord) {
                    majmin += 1.0;
                }
                if found.quality == truth.chord.quality {
                    exact += 1.0;
                    is_exact = true;
                    if found.bass_note().pitch_class() == truth.chord.bass_note().pitch_class() {
                        with_bass += 1.0;
                    }
                }
            }
            if let Some(span) = span {
                let name = serde_json::to_value(span.certainty).expect("certitude").as_str().expect("texte").to_string();
                let bucket = certainty.entry(format!("{} {name}", piece.set)).or_default();
                bucket.seconds += 0.01;
                if is_exact {
                    bucket.exact += 0.01;
                }
            }
            let true_key = piece.keys.iter().find(|k| t >= at(k.start_beat) && t < at(k.start_beat + k.beats)).expect("tonalité de référence");
            if analysis.key_segments.iter().any(|k| ms >= k.start_ms && ms < k.end_ms && same_key(&k.key, &true_key.key)) {
                key_ok += 1.0;
            }
            total += 1.0;
            t += 0.01;
        }

        let total_beats = piece.chords.iter().map(|c| c.start_beat + c.beats).max().unwrap_or(0);
        let true_beats: Vec<f64> = (0..total_beats).map(at).collect();
        let true_downbeats: Vec<f64> = (0..total_beats).step_by(piece.beats_per_bar).map(at).collect();
        let seconds = |ms: &[u64]| ms.iter().map(|&v| v as f64 / 1000.0).collect::<Vec<f64>>();

        // Mélodie : appariement glouton des notes trouvées aux notes écrites.
        let found_notes: Vec<(f64, i32)> = analysis.melody.iter().map(|n| (n.start_ms as f64 / 1000.0, n.midi)).collect();
        let (melody_precision, melody_recall, melody_recall_octave, melody_false_per_minute) = if piece.melody.is_empty() {
            let minutes = analysis.duration_ms as f64 / 60_000.0;
            (None, None, None, Some(found_notes.len() as f64 / minutes.max(1e-9)))
        } else {
            let truth: Vec<(f64, i32)> = piece.melody.iter().map(|n| (corpus.lead_in_s + n.start_beat * beat_s, n.midi)).collect();
            let matches = |octave: bool| {
                let mut used = vec![false; found_notes.len()];
                let mut hits = 0;
                for (time, midi) in &truth {
                    if let Some(index) = found_notes.iter().enumerate().position(|(i, (t, m))| {
                        !used[i] && (t - time).abs() <= 0.1 && if octave { (m - midi).rem_euclid(12) == 0 } else { m == midi }
                    }) {
                        used[index] = true;
                        hits += 1;
                    }
                }
                hits as f64
            };
            let exact = matches(false);
            (
                Some(if found_notes.is_empty() { 0.0 } else { exact / found_notes.len() as f64 }),
                Some(exact / truth.len() as f64),
                Some(matches(true) / truth.len() as f64),
                None,
            )
        };

        pieces.push(PieceScore {
            set: piece.set.clone(),
            id: piece.id.clone(),
            title: piece.title.clone(),
            tempo_true: piece.bpm,
            tempo_found: analysis.tempo.as_ref().map(|t| t.bpm),
            tempo,
            meter_true: piece.beats_per_bar,
            meter_found: analysis.meter.as_ref().map(|m| m.beats_per_bar),
            key_true: main_key.to_string(),
            key_found: analysis.key.as_ref().map(|k| k.key.to_string()),
            key,
            key_time: key_ok / total,
            chord_root: root / total,
            chord_majmin: majmin / total,
            chord_exact: exact / total,
            chord_with_bass: with_bass / total,
            tuning_error_cents: (analysis.tuning.cents - piece.tuning_cents).abs(),
            beats_found: matched(&true_beats, &seconds(&analysis.beats_ms)),
            downbeats_found: matched(&true_downbeats, &seconds(&analysis.downbeats_ms)),
            melody_precision,
            melody_recall,
            melody_recall_octave,
            melody_false_per_minute,
        });
    }

    let mut summary = BTreeMap::new();
    for set in ["tuning", "validation"] {
        let members: Vec<&PieceScore> = pieces.iter().filter(|p| p.set == set).collect();
        if !members.is_empty() {
            summary.insert(set.to_string(), summarize(&members));
        }
    }

    println!("{:<20} {:>11} {:>6} {:<22} {:>5} {:>5} {:>5} {:>5} {:>5} {:>5}", "morceau", "tempo", "mes.", "tonalité", "fond.", "M/m", "exact", "basse", "temps", "1ers");
    for p in &pieces {
        let pct = |v: f64| format!("{:.0}", v * 100.0);
        println!(
            "{:<20} {:>5}/{:<5} {:>3}/{:<2} {:<22} {:>5} {:>5} {:>5} {:>5} {:>5} {:>5}",
            p.id,
            p.tempo_found.map_or("-".into(), |v| format!("{v:.0}")),
            format!("{:.0}", p.tempo_true),
            p.meter_found.map_or("-".into(), |v| v.to_string()),
            p.meter_true,
            format!("{} ({})", p.key_found.clone().unwrap_or("-".into()), p.key),
            pct(p.chord_root),
            pct(p.chord_majmin),
            pct(p.chord_exact),
            pct(p.chord_with_bass),
            pct(p.beats_found),
            pct(p.downbeats_found),
        );
    }
    println!("\nmélodie, par morceau :");
    for p in &pieces {
        match (p.melody_precision, p.melody_recall, p.melody_false_per_minute) {
            (Some(precision), Some(recall), _) => println!(
                "  {:<22} précision {:>3.0} %, rappel {:>3.0} % (à l'octave près {:>3.0} %)",
                p.id,
                precision * 100.0,
                recall * 100.0,
                p.melody_recall_octave.unwrap_or(0.0) * 100.0
            ),
            (_, _, Some(false_rate)) => println!("  {:<22} sans mélodie : {false_rate:.0} notes trouvées par minute", p.id),
            _ => {}
        }
    }
    for (set, values) in &summary {
        println!("\n== {set}");
        for (name, value) in values {
            println!("{name:<20} {value:.3}");
        }
    }
    println!();
    for (name, bucket) in &certainty {
        println!("certitude {name:<22} {:>6.1} s, accord exact {:.0} %", bucket.seconds, 100.0 * bucket.exact / bucket.seconds.max(1e-9));
    }

    let report = Report { pieces, summary, certainty };
    fs::write(report_path, serde_json::to_string_pretty(&report).expect("rapport sérialisable")).expect("écriture du rapport");
}
