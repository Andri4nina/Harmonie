//! Écrit des morceaux générés en MIDI et MusicXML, pour les relire avec des
//! outils indépendants (`scripts/check_exports.py`).
//!
//! ```text
//! cargo run -p harmonia-theory --example export_sample -- dossier
//! ```

use std::{env, fs};

use harmonia_theory::compose::{Settings, Style, compose};
use harmonia_theory::export::{to_midi, to_musicxml};

fn main() {
    let dir = env::args().nth(1).expect("usage : export_sample <dossier>");
    fs::create_dir_all(&dir).expect("dossier de sortie");
    let cases = [("C", Style::Pop, 8), ("Eb", Style::Jazz, 8), ("A minor", Style::Classical, 16), ("F# minor", Style::Pop, 4), ("B", Style::Jazz, 12)];
    for (index, (key, style, bars)) in cases.iter().enumerate() {
        let piece = compose(&Settings { key: key.parse().unwrap(), style: *style, bars: *bars, bpm: 92.0 + index as f64 * 7.0 }, index as u64 * 31 + 7);
        let grid: Vec<String> = piece.chords.iter().map(|c| c.chord.to_string()).collect();
        println!("{key} {style:?} : {}", grid.join(" "));
        let name = format!("{dir}/sample-{index}");
        fs::write(format!("{name}.mid"), to_midi(&piece)).unwrap();
        fs::write(format!("{name}.musicxml"), to_musicxml(&piece, &format!("Essai {key}"))).unwrap();
        let summary = serde_json::json!({ "melody": piece.melody.len(), "chords": piece.chords.len(), "chord_notes": piece.chords.iter().map(|c| c.chord.notes().len()).sum::<usize>(), "bpm": piece.bpm, "fifths": piece.key.signature() });
        fs::write(format!("{name}.json"), summary.to_string()).unwrap();
    }
    println!("{} morceaux écrits dans {dir}", cases.len());
}
