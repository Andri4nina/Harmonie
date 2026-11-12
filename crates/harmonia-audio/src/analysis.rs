//! Assemble l'analyse d'un morceau à partir de ses descripteurs.
//!
//! Chaque résultat porte une **confiance** entre 0 et 1 et une **certitude** :
//!
//! | Certitude | Confiance | Sens |
//! |---|---|---|
//! | `detected` | ≥ 0,75 | le signal désigne nettement ce résultat |
//! | `estimated` | ≥ 0,50 | lecture la plus probable, d'autres restent plausibles |
//! | `uncertain` | < 0,50 | à vérifier ; les alternatives sont fournies |
//!
//! Les formules de confiance sont documentées sur chaque fonction ; elles sont
//! des mesures de netteté du signal, pas des probabilités étalonnées.

use harmonia_theory::{Cadence, Chord, Key, Note, PitchClass, RomanNumeral, Spelling};
use serde::{Deserialize, Serialize};

use crate::chords::{self, Segment};
use crate::features::Features;
use crate::meter;
use crate::tonality::{self, FrameChord, KeySegment};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Certainty {
    Detected,
    Estimated,
    Uncertain,
}

impl Certainty {
    pub fn of(confidence: f64) -> Certainty {
        if confidence >= 0.75 {
            Certainty::Detected
        } else if confidence >= 0.5 {
            Certainty::Estimated
        } else {
            Certainty::Uncertain
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Analysis {
    pub schema: u32,
    pub duration_ms: u64,
    pub tuning: Tuning,
    /// Absent si moins de quatre temps ont été suivis.
    pub tempo: Option<TempoResult>,
    /// Absente si aucun indice de mesure ne se dégage.
    pub meter: Option<MeterResult>,
    /// Tonalité principale : celle qui occupe la plus grande durée.
    pub key: Option<KeyResult>,
    /// Tonalités successives ; plus d'un élément signale une modulation.
    pub key_segments: Vec<KeySpan>,
    pub chords: Vec<ChordSpan>,
    pub cadences: Vec<CadenceEvent>,
    pub beats_ms: Vec<u64>,
    pub downbeats_ms: Vec<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tuning {
    pub a4_hz: f64,
    pub cents: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TempoResult {
    pub bpm: f64,
    pub confidence: f64,
    pub certainty: Certainty,
    /// Moitié et double : lectures possibles de la même pulsation.
    pub alternatives_bpm: Vec<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MeterResult {
    pub beats_per_bar: usize,
    pub confidence: f64,
    pub certainty: Certainty,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KeyResult {
    pub key: Key,
    pub confidence: f64,
    pub certainty: Certainty,
    pub alternatives: Vec<KeyAlternative>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KeyAlternative {
    pub key: Key,
    pub correlation: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KeySpan {
    pub start_ms: u64,
    pub end_ms: u64,
    pub key: Key,
    pub confidence: f64,
    pub certainty: Certainty,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChordSpan {
    pub start_ms: u64,
    pub end_ms: u64,
    /// `None` : pas d'accord (silence, bruit).
    pub chord: Option<Chord>,
    /// Degré dans la tonalité locale, quand il se lit.
    pub roman: Option<String>,
    pub confidence: f64,
    pub certainty: Certainty,
    pub alternatives: Vec<ChordAlternative>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChordAlternative {
    pub chord: Chord,
    /// Similarité entre le chroma et cet accord, de 0 à 1.
    pub fit: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CadenceEvent {
    /// Instant où l'accord d'arrivée commence.
    pub at_ms: u64,
    pub cadence: Cadence,
    pub key: Key,
    pub confidence: f64,
    pub certainty: Certainty,
}

/// Réglages de l'interprétation.
#[derive(Clone, Copy, Debug, Default)]
pub struct Params {
    pub chords: chords::Params,
    pub tonality: tonality::Params,
}

fn ms(seconds: f64) -> u64 {
    (seconds * 1000.0).round().max(0.0) as u64
}

fn round(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

/// Orthographe des notes dans une tonalité : les notes de la gamme gardent
/// leur nom, les autres suivent le sens de l'armure.
fn spelling_in(key: &Key) -> impl Fn(u8) -> Note {
    let scale = key.scale().notes();
    let signature = key.signature();
    move |pc| {
        if let Some(note) = scale.iter().find(|n| n.pitch_class().value() == pc) {
            return *note;
        }
        match signature {
            1.. => Note::from_pitch_class(PitchClass::new(pc as i32), Spelling::Sharps),
            0 => chords::plain_spelling(pc),
            _ => Note::from_pitch_class(PitchClass::new(pc as i32), Spelling::Flats),
        }
    }
}

/// Confiance d'un accord : 60 % de ressemblance au gabarit, 40 % d'avance
/// sur le meilleur accord d'une autre fondamentale (pleine à 0,25).
fn chord_confidence(segment: &Segment) -> f64 {
    (0.6 * segment.fit + 0.4 * (segment.margin / 0.25).clamp(0.0, 1.0)).clamp(0.0, 1.0)
}

/// Confiance d'une tonalité : moitié corrélation avec son profil, moitié
/// avance de son score sur la tonalité suivante (pleine à 0,15).
fn key_confidence(correlation: f64, margin: f64) -> f64 {
    (0.5 * correlation.max(0.0) + 0.5 * (margin / 0.15).clamp(0.0, 1.0)).clamp(0.0, 1.0)
}

/// Interprète les descripteurs d'un morceau.
pub fn analyze(features: &Features, params: &Params) -> Result<Analysis, String> {
    features.validate()?;
    let frames = &features.frames;
    let bounds = &frames.boundaries;
    let n = features.len();

    // Temps et tempo.
    let beat_frames: Vec<usize> = if features.beats_tracked { (0..n).filter(|&i| frames.on_beat[i]).collect() } else { Vec::new() };
    let beat_times: Vec<f64> = beat_frames.iter().map(|&i| bounds[i]).collect();
    let tempo = meter::tempo(&beat_times).map(|t| {
        // Pleine confiance pour une pulsation régulière, suivie sur au moins
        // 16 temps et réellement marquée dans le signal (netteté ≥ 0,4) : un
        // suiveur de temps produit des temps réguliers même sur des nappes.
        let confidence = (1.0 - t.irregularity / 0.2).clamp(0.0, 1.0) * (t.beats as f64 / 16.0).min(1.0) * (features.pulse_clarity / 0.4).clamp(0.0, 1.0);
        TempoResult {
            bpm: (t.bpm * 10.0).round() / 10.0,
            confidence: round(confidence),
            certainty: Certainty::of(confidence),
            alternatives_bpm: vec![(t.bpm * 5.0).round() / 10.0, (t.bpm * 20.0).round() / 10.0],
        }
    });

    // Tonalités.
    let loudest = frames.rms.iter().cloned().fold(0.0, f64::max);
    let weights: Vec<f64> = (0..n)
        .map(|i| (bounds[i + 1] - bounds[i]) * if loudest > 0.0 { frames.rms[i] / loudest } else { 0.0 })
        .collect();
    // Accords, d'abord sans orthographe : ils aident à fixer la tonalité.
    let durations: Vec<f64> = bounds.windows(2).map(|pair| pair[1] - pair[0]).collect();
    let segments = chords::recognize(&frames.chroma, &frames.bass_chroma, &frames.rms, &durations, &params.chords);
    let mut frame_chords: Vec<Option<FrameChord>> = vec![None; n];
    for segment in &segments {
        if let Some(candidate) = segment.candidate {
            let frame = FrameChord {
                root: candidate.root,
                pitch_classes: candidate.pitch_classes().iter().fold(0, |mask, pc| mask | 1 << pc),
                major_third: candidate.quality.has_major_third(),
                minor_third: candidate.quality.has_minor_third(),
            };
            frame_chords[segment.start..segment.end].fill(Some(frame));
        }
    }

    // Les fenêtres de tonalité se comptent en temps, pas en trames.
    let per_beat = if beat_frames.is_empty() { 1.0 } else { (n as f64 / beat_frames.len() as f64).max(1.0) };
    let scaled = |frames: usize| (frames as f64 * per_beat).round() as usize;
    let windows = tonality::Params { window: scaled(params.tonality.window), hop: scaled(params.tonality.hop), ..params.tonality };
    let tracked = tonality::track(&frames.chroma, &weights, &windows);
    let key_segments: Vec<KeySegment> = tonality::refine(&tracked, &frames.chroma, &weights, &frame_chords);
    let key_at = |frame: usize| key_segments.iter().find(|s| frame >= s.start && frame < s.end).map(|s| s.key);
    let main = key_segments
        .iter()
        .max_by(|a, b| (bounds[a.end] - bounds[a.start]).total_cmp(&(bounds[b.end] - bounds[b.start])));
    let key = main.map(|segment| {
        let confidence = key_confidence(segment.correlation, segment.margin);
        KeyResult {
            key: segment.key,
            confidence: round(confidence),
            certainty: Certainty::of(confidence),
            alternatives: segment.alternatives.iter().map(|(key, c)| KeyAlternative { key: *key, correlation: round(*c) }).collect(),
        }
    });

    // Accords orthographiés et chiffrés dans leur tonalité locale.
    let mut chord_spans = Vec::with_capacity(segments.len());
    let mut resolved: Vec<Option<(Chord, Option<Key>, f64)>> = Vec::with_capacity(segments.len());
    for segment in &segments {
        let local_key = key_at(segment.start);
        let (start_ms, end_ms) = (ms(bounds[segment.start]), ms(bounds[segment.end]));
        let Some(candidate) = segment.candidate else {
            chord_spans.push(ChordSpan { start_ms, end_ms, chord: None, roman: None, confidence: 0.0, certainty: Certainty::Uncertain, alternatives: Vec::new() });
            resolved.push(None);
            continue;
        };
        let spell: Box<dyn Fn(u8) -> Note> = match &local_key {
            Some(key) => Box::new(spelling_in(key)),
            None => Box::new(chords::plain_spelling),
        };
        let chord = candidate.chord(&*spell, segment.bass);
        let roman = local_key.and_then(|key| RomanNumeral::functional(&chord, &key)).map(|numeral| numeral.to_string());
        let confidence = chord_confidence(segment);
        chord_spans.push(ChordSpan {
            start_ms,
            end_ms,
            chord: Some(chord),
            roman,
            confidence: round(confidence),
            certainty: Certainty::of(confidence),
            alternatives: segment
                .alternatives
                .iter()
                .map(|(other, fit)| ChordAlternative { chord: other.chord(&*spell, None), fit: round(*fit) })
                .collect(),
        });
        resolved.push(Some((chord, local_key, confidence)));
    }

    // Mouvements cadentiels entre deux accords consécutifs d'une même tonalité.
    let mut cadences = Vec::new();
    for (index, pair) in resolved.windows(2).enumerate() {
        let (Some((from, Some(key), from_confidence)), Some((to, Some(to_key), to_confidence))) = (&pair[0], &pair[1]) else {
            continue;
        };
        if key != to_key {
            continue;
        }
        if let Some(cadence) = Cadence::detect(key, from, to) {
            let confidence = from_confidence.min(*to_confidence);
            cadences.push(CadenceEvent {
                at_ms: chord_spans[index + 1].start_ms,
                cadence,
                key: *key,
                confidence: round(confidence),
                certainty: Certainty::of(confidence),
            });
        }
    }

    // Mesure : accents des temps et position des changements d'accord.
    let strengths: Vec<f64> = beat_frames.iter().map(|&i| frames.onset_strength[i]).collect();
    let changes: Vec<usize> = segments
        .iter()
        .skip(1)
        .filter_map(|segment| beat_frames.binary_search(&segment.start).ok())
        .collect();
    let found = meter::meter(&strengths, &changes);
    let downbeats_ms = found.map_or(Vec::new(), |m| beat_times.iter().skip(m.phase).step_by(m.beats_per_bar).map(|&t| ms(t)).collect());
    let meter = found.map(|m| {
        // Moitié force de l'indice (pleine à 0,5), moitié avance sur
        // l'hypothèse concurrente (pleine à 0,25) ; le tout ne vaut que si la
        // pulsation est réellement marquée.
        let pulse = (features.pulse_clarity / 0.4).clamp(0.0, 1.0);
        let confidence = pulse * (0.5 * (m.evidence / 0.5).min(1.0) + 0.5 * (m.margin / 0.25).clamp(0.0, 1.0));
        MeterResult { beats_per_bar: m.beats_per_bar, confidence: round(confidence), certainty: Certainty::of(confidence) }
    });

    Ok(Analysis {
        schema: crate::features::SCHEMA,
        duration_ms: ms(features.duration_s),
        tuning: Tuning { a4_hz: round(440.0 * 2f64.powf(features.tuning_cents / 1200.0)), cents: round(features.tuning_cents) },
        tempo,
        meter,
        key,
        key_segments: key_segments
            .iter()
            .map(|segment| {
                let confidence = key_confidence(segment.correlation, segment.margin);
                KeySpan {
                    start_ms: ms(bounds[segment.start]),
                    end_ms: ms(bounds[segment.end]),
                    key: segment.key,
                    confidence: round(confidence),
                    certainty: Certainty::of(confidence),
                }
            })
            .collect(),
        chords: chord_spans,
        cadences,
        beats_ms: beat_times.iter().map(|&t| ms(t)).collect(),
        downbeats_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::{Chroma, Frames, SCHEMA};

    /// Descripteurs idéaux : un accord par mesure de 4 temps à 120 BPM.
    fn features(chords: &[&str]) -> Features {
        let mut frames = Frames { boundaries: vec![0.0], chroma: vec![], bass_chroma: vec![], rms: vec![], onset_strength: vec![], on_beat: vec![] };
        for name in chords {
            let chord: Chord = name.parse().unwrap();
            let mut chroma: Chroma = [0.02; 12];
            for note in chord.notes() {
                chroma[note.pitch_class().value() as usize] = 1.0;
            }
            let mut bass: Chroma = [0.0; 12];
            bass[chord.bass_note().pitch_class().value() as usize] = 1.0;
            for beat in 0..4 {
                frames.chroma.push(chroma);
                frames.bass_chroma.push(bass);
                frames.rms.push(1.0);
                frames.onset_strength.push(if beat == 0 { 1.0 } else { 0.5 });
                frames.on_beat.push(true);
                frames.boundaries.push(frames.boundaries.last().unwrap() + 0.5);
            }
        }
        Features { schema: SCHEMA, duration_s: chords.len() as f64 * 2.0, sample_rate: 22050, tuning_cents: 0.0, beats_tracked: true, pulse_clarity: 0.8, frames }
    }

    fn chord_names(analysis: &Analysis) -> Vec<String> {
        analysis.chords.iter().map(|c| c.chord.map_or("N".into(), |chord| chord.to_string())).collect()
    }

    #[test]
    fn analyzes_a_pop_progression_end_to_end() {
        let analysis = analyze(&features(&["C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "F", "C"]), &Params::default()).unwrap();
        assert_eq!(analysis.key.as_ref().unwrap().key.to_string(), "C major");
        assert_eq!(chord_names(&analysis)[..4], ["C", "G", "Am", "F"]);
        let romans: Vec<&str> = analysis.chords[..4].iter().map(|c| c.roman.as_deref().unwrap()).collect();
        assert_eq!(romans, ["I", "V", "vi", "IV"]);
        assert_eq!(analysis.tempo.as_ref().unwrap().bpm, 120.0);
        assert_eq!(analysis.tempo.as_ref().unwrap().certainty, Certainty::Detected);
        assert_eq!(analysis.meter.as_ref().unwrap().beats_per_bar, 4);
        assert_eq!(analysis.downbeats_ms[..3], [0, 2000, 4000]);
        assert_eq!((analysis.chords[1].start_ms, analysis.chords[1].end_ms), (2000, 4000));
        // Le dernier enchaînement, Fa → Do, est une cadence plagale.
        assert_eq!(analysis.cadences.last().unwrap().cadence, Cadence::Plagal);
    }

    #[test]
    fn chords_are_spelled_in_the_key() {
        let analysis = analyze(&features(&["Eb", "Ab", "Bb", "Eb", "Cm", "Ab", "Bb", "Eb"]), &Params::default()).unwrap();
        assert_eq!(analysis.key.as_ref().unwrap().key.to_string(), "Eb major");
        assert_eq!(chord_names(&analysis)[..4], ["Eb", "Ab", "Bb", "Eb"]);
        let sharp = analyze(&features(&["E", "A", "B", "E", "C#m", "A", "B", "E"]), &Params::default()).unwrap();
        assert_eq!(chord_names(&sharp)[4], "C#m");
    }

    #[test]
    fn output_is_plain_json() {
        let analysis = analyze(&features(&["Am", "Dm", "E", "Am", "Am", "Dm", "E", "Am"]), &Params::default()).unwrap();
        let json = serde_json::to_value(&analysis).unwrap();
        assert_eq!(json["key"]["key"], "A minor");
        assert_eq!(json["chords"][2]["chord"], "E");
        assert_eq!(json["chords"][2]["roman"], "V");
        assert_eq!(json["chords"][0]["certainty"], "detected");
        // Ré mineur → Mi : demi-cadence ; Mi → La mineur : cadence parfaite.
        assert_eq!(json["cadences"][0]["cadence"], "half");
        assert_eq!(json["cadences"][1]["cadence"], "authentic");
    }

    #[test]
    fn untracked_beats_give_neither_tempo_nor_meter() {
        let mut input = features(&["C", "F", "G", "C"]);
        input.beats_tracked = false;
        let analysis = analyze(&input, &Params::default()).unwrap();
        assert!(analysis.tempo.is_none() && analysis.meter.is_none() && analysis.beats_ms.is_empty());
        assert_eq!(chord_names(&analysis), ["C", "F", "G", "C"]);
    }

    #[test]
    fn inconsistent_features_are_rejected() {
        let mut input = features(&["C", "F"]);
        input.frames.rms.pop();
        assert!(analyze(&input, &Params::default()).is_err());
        let mut input = features(&["C", "F"]);
        input.schema = 99;
        assert!(analyze(&input, &Params::default()).is_err());
    }

    #[test]
    fn an_empty_piece_gives_an_empty_analysis() {
        let input = features(&[]);
        let analysis = analyze(&input, &Params::default()).unwrap();
        assert!(analysis.key.is_none() && analysis.chords.is_empty() && analysis.tempo.is_none());
    }
}
