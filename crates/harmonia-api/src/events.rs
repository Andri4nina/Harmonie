//! Passage de l'analyse aux événements horodatés de la base, et application
//! des corrections manuelles à la lecture.
//!
//! Une analyse produit :
//!
//! | `feature` | Intervalle | `payload` |
//! |---|---|---|
//! | `tempo` | tout le morceau | `bpm`, `alternatives_bpm` |
//! | `meter` | tout le morceau | `beats_per_bar` |
//! | `key` | tout le morceau | tonalité principale, `alternatives` |
//! | `key_segment` | segment | tonalité locale (modulations) |
//! | `chord` | segment | `chord`, `roman`, `alternatives` |
//! | `cadence` | instant | `cadence`, `key` |
//!
//! Les informations sans confiance propre (durée, accordage, grille des
//! temps) vont dans le résumé du job. Les trames sans accord ne produisent
//! pas d'événement : le vide de la frise les représente.
//!
//! Les corrections ne modifient jamais les événements : elles forment une
//! couche appliquée à la lecture (remplacer, supprimer, insérer).

use harmonia_audio::{Analysis, Certainty};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq)]
pub struct NewEvent {
    pub feature: &'static str,
    pub start_ms: i32,
    pub end_ms: i32,
    pub confidence: f32,
    pub certainty: Certainty,
    pub payload: Value,
}

fn ms(value: u64) -> i32 {
    i32::try_from(value).unwrap_or(i32::MAX)
}

pub fn certainty_name(certainty: Certainty) -> &'static str {
    match certainty {
        Certainty::Detected => "detected",
        Certainty::Estimated => "estimated",
        Certainty::Uncertain => "uncertain",
    }
}

/// Événements d'une analyse.
pub fn from_analysis(analysis: &Analysis) -> Vec<NewEvent> {
    let end = ms(analysis.duration_ms);
    let mut events = Vec::new();
    let mut push = |feature, start_ms, end_ms, confidence: f64, certainty, payload| {
        events.push(NewEvent { feature, start_ms, end_ms, confidence: confidence.clamp(0.0, 1.0) as f32, certainty, payload });
    };
    if let Some(tempo) = &analysis.tempo {
        push("tempo", 0, end, tempo.confidence, tempo.certainty, json!({ "bpm": tempo.bpm, "alternatives_bpm": tempo.alternatives_bpm }));
    }
    if let Some(meter) = &analysis.meter {
        push("meter", 0, end, meter.confidence, meter.certainty, json!({ "beats_per_bar": meter.beats_per_bar }));
    }
    if let Some(key) = &analysis.key {
        push("key", 0, end, key.confidence, key.certainty, json!({ "key": key.key, "alternatives": key.alternatives }));
    }
    for span in &analysis.key_segments {
        push("key_segment", ms(span.start_ms), ms(span.end_ms), span.confidence, span.certainty, json!({ "key": span.key }));
    }
    for span in &analysis.chords {
        if let Some(chord) = span.chord {
            let payload = json!({ "chord": chord, "roman": span.roman, "alternatives": span.alternatives });
            push("chord", ms(span.start_ms), ms(span.end_ms), span.confidence, span.certainty, payload);
        }
    }
    for cadence in &analysis.cadences {
        let at = ms(cadence.at_ms);
        push("cadence", at, at, cadence.confidence, cadence.certainty, json!({ "cadence": cadence.cadence, "key": cadence.key }));
    }
    events
}

/// Informations globales, rangées avec le job.
pub fn summary(analysis: &Analysis) -> Value {
    json!({
        "duration_ms": analysis.duration_ms,
        "tuning": analysis.tuning,
        "beats_ms": analysis.beats_ms,
        "downbeats_ms": analysis.downbeats_ms,
    })
}

/// Un événement tel qu'il est stocké.
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct StoredEvent {
    pub id: i64,
    pub feature: String,
    pub start_ms: i32,
    pub end_ms: i32,
    pub confidence: f32,
    pub certainty: String,
    pub payload: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Correction {
    pub id: uuid::Uuid,
    pub event_id: Option<i64>,
    pub action: String,
    pub feature: Option<String>,
    pub start_ms: Option<i32>,
    pub end_ms: Option<i32>,
    pub payload: Option<Value>,
}

/// Un événement tel que l'utilisateur le voit, corrections appliquées.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct ViewEvent {
    /// `e<n>` pour un événement analysé, `c<uuid>` pour un ajout manuel.
    pub id: String,
    pub feature: String,
    pub start_ms: i32,
    pub end_ms: i32,
    /// `None` pour ce que l'utilisateur a saisi ou corrigé.
    pub confidence: Option<f64>,
    /// `corrected` pour ce que l'utilisateur a saisi ou corrigé.
    pub certainty: String,
    pub payload: Value,
}

/// Applique les corrections, de la plus ancienne à la plus récente.
pub fn apply(events: Vec<StoredEvent>, corrections: &[Correction]) -> Vec<ViewEvent> {
    let mut view: Vec<ViewEvent> = events
        .into_iter()
        .map(|e| ViewEvent {
            id: format!("e{}", e.id),
            feature: e.feature,
            start_ms: e.start_ms,
            end_ms: e.end_ms,
            // Stockée en REAL : arrondie au millième pour ne pas exposer
            // les artefacts de la simple précision (0.773000001…).
            confidence: Some((f64::from(e.confidence) * 1000.0).round() / 1000.0),
            certainty: e.certainty,
            payload: e.payload,
        })
        .collect();
    for correction in corrections {
        let target = correction.event_id.map(|id| format!("e{id}"));
        match correction.action.as_str() {
            "delete" => view.retain(|event| Some(&event.id) != target.as_ref()),
            "replace" => {
                if let Some(event) = view.iter_mut().find(|event| Some(&event.id) == target.as_ref()) {
                    event.payload = correction.payload.clone().unwrap_or(Value::Null);
                    event.start_ms = correction.start_ms.unwrap_or(event.start_ms);
                    event.end_ms = correction.end_ms.unwrap_or(event.end_ms);
                    event.confidence = None;
                    event.certainty = "corrected".into();
                }
            }
            "insert" => view.push(ViewEvent {
                id: format!("c{}", correction.id),
                feature: correction.feature.clone().unwrap_or_default(),
                start_ms: correction.start_ms.unwrap_or(0),
                end_ms: correction.end_ms.unwrap_or(0),
                confidence: None,
                certainty: "corrected".into(),
                payload: correction.payload.clone().unwrap_or(Value::Null),
            }),
            _ => {}
        }
    }
    view.sort_by(|a, b| a.feature.cmp(&b.feature).then(a.start_ms.cmp(&b.start_ms)));
    view
}

#[cfg(test)]
mod tests {
    use super::*;
    use harmonia_audio::features::{Features, Frames, SCHEMA};
    use harmonia_audio::{Params, analyze};
    use harmonia_theory::Chord;

    /// Une analyse réelle, calculée sur des descripteurs idéaux (C G Am F).
    fn analysis() -> Analysis {
        let mut frames = Frames { boundaries: vec![0.0], chroma: vec![], bass_chroma: vec![], rms: vec![], onset_strength: vec![], on_beat: vec![] };
        for name in ["C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "F", "C"] {
            let chord: Chord = name.parse().unwrap();
            let mut chroma = [0.02; 12];
            for note in chord.notes() {
                chroma[note.pitch_class().value() as usize] = 1.0;
            }
            let mut bass = [0.0; 12];
            bass[chord.root.pitch_class().value() as usize] = 1.0;
            for beat in 0..4 {
                frames.chroma.push(chroma);
                frames.bass_chroma.push(bass);
                frames.rms.push(1.0);
                frames.onset_strength.push(if beat == 0 { 1.0 } else { 0.5 });
                frames.on_beat.push(true);
                frames.boundaries.push(frames.boundaries.last().unwrap() + 0.5);
            }
        }
        let features = Features { schema: SCHEMA, duration_s: 24.0, sample_rate: 22050, tuning_cents: 0.0, beats_tracked: true, pulse_clarity: 0.8, frames };
        analyze(&features, &Params::default()).unwrap()
    }

    #[test]
    fn an_analysis_becomes_timeline_events() {
        let events = from_analysis(&analysis());
        let chords: Vec<&Value> = events.iter().filter(|e| e.feature == "chord").map(|e| &e.payload["chord"]).collect();
        assert_eq!(chords[..4], [&json!("C"), &json!("G"), &json!("Am"), &json!("F")]);
        let key = events.iter().find(|e| e.feature == "key").unwrap();
        assert_eq!(key.payload["key"], "C major");
        assert_eq!((key.start_ms, key.end_ms), (0, 24_000));
        assert!(events.iter().any(|e| e.feature == "tempo" && e.payload["bpm"] == 120.0));
        assert!(events.iter().all(|e| (0.0..=1.0).contains(&e.confidence) && e.end_ms >= e.start_ms));
        assert_eq!(summary(&analysis())["duration_ms"], 24_000);
    }

    fn stored(id: i64, chord: &str, start: i32) -> StoredEvent {
        StoredEvent { id, feature: "chord".into(), start_ms: start, end_ms: start + 1000, confidence: 0.6, certainty: "estimated".into(), payload: json!({ "chord": chord }) }
    }

    fn correction(action: &str, event_id: Option<i64>, payload: Option<Value>) -> Correction {
        Correction {
            id: uuid::Uuid::nil(),
            event_id,
            action: action.into(),
            feature: (action == "insert").then(|| "chord".into()),
            start_ms: (action == "insert").then_some(500),
            end_ms: (action == "insert").then_some(900),
            payload,
        }
    }

    #[test]
    fn corrections_replace_delete_and_insert_without_touching_the_analysis() {
        let events = vec![stored(1, "C", 0), stored(2, "Gm", 1000), stored(3, "Am", 2000)];
        let corrections = [
            correction("replace", Some(2), Some(json!({ "chord": "G" }))),
            correction("delete", Some(3), None),
            correction("insert", None, Some(json!({ "chord": "Csus4" }))),
        ];
        let view = apply(events, &corrections);
        let chords: Vec<(&str, &str)> = view.iter().map(|e| (e.payload["chord"].as_str().unwrap(), e.certainty.as_str())).collect();
        assert_eq!(chords, [("C", "estimated"), ("Csus4", "corrected"), ("G", "corrected")]);
        assert_eq!(view[2].confidence, None);
        assert_eq!(view[1].id, format!("c{}", uuid::Uuid::nil()));
    }

    #[test]
    fn a_correction_of_a_missing_event_is_ignored() {
        let view = apply(vec![stored(1, "C", 0)], &[correction("delete", Some(42), None)]);
        assert_eq!(view.len(), 1);
    }
}
