//! Bindings WebAssembly du moteur de théorie.
//!
//! Façade mince : chaque fonction exportée appelle [`view`] et sérialise le
//! résultat en objet JavaScript. Les types TypeScript correspondants vivent
//! dans `apps/web/src/theory/engine.ts`.

pub mod view;

use harmonia_theory::Instrument;
use harmonia_theory::relations::Node;
use serde::Serialize;
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|error| JsError::new(&error.to_string()))
}

/// Vue complète d'un nœud du graphe musical (`note:C`, `chord:Am7`…).
#[wasm_bindgen(js_name = nodeView)]
pub fn node_view(id: &str) -> Result<JsValue, JsError> {
    let node = Node::from_id(id).ok_or_else(|| JsError::new(&format!("nœud inconnu : {id}")))?;
    to_js(&view::node_view(&node))
}

/// Identifiants des nœuds correspondant à une saisie libre.
#[wasm_bindgen(js_name = resolveQuery)]
pub fn resolve_query(text: &str) -> Vec<String> {
    view::resolve_query(text)
}

/// Les instruments fournis avec l'application.
#[wasm_bindgen]
pub fn instruments() -> Result<JsValue, JsError> {
    let views: Vec<view::InstrumentView> = Instrument::presets()
        .iter()
        .map(view::instrument_view)
        .collect();
    to_js(&views)
}

/// Positions de notes sur le manche d'un instrument à cordes.
#[wasm_bindgen]
pub fn fretboard(instrument_id: &str, notes: Vec<String>) -> Result<JsValue, JsError> {
    to_js(&view::fretboard(instrument_id, &notes))
}

/// Identifiants des pages de référence (voir [`view::catalog`]).
#[wasm_bindgen]
pub fn catalog() -> Vec<String> {
    view::catalog()
}

/// Notes écrites pour chaque instrument à vent.
#[wasm_bindgen]
pub fn winds(notes: Vec<String>) -> Result<JsValue, JsError> {
    to_js(&view::winds(&notes))
}

#[wasm_bindgen(js_name = circleOfFifths)]
pub fn circle_of_fifths() -> Result<JsValue, JsError> {
    to_js(&view::circle_of_fifths())
}

#[wasm_bindgen(js_name = midiToFrequency)]
pub fn midi_to_frequency(midi: i32, a4_hz: f64) -> f64 {
    view::midi_to_frequency(midi, a4_hz)
}

// ------------------------------------------------------------------ oreille

use harmonia_theory::ear::{self, Card, Exercise};

fn exercise(id: &str) -> Result<Exercise, JsError> {
    Exercise::from_id(id).ok_or_else(|| JsError::new(&format!("exercice inconnu : {id}")))
}

fn cards(value: JsValue) -> Result<Vec<Card>, JsError> {
    if value.is_undefined() || value.is_null() {
        return Ok(Vec::new());
    }
    serde_wasm_bindgen::from_value(value).map_err(|error| JsError::new(&error.to_string()))
}

#[derive(Serialize)]
struct LevelView {
    level: usize,
    items: Vec<String>,
}

#[derive(Serialize)]
struct ExerciseView {
    id: &'static str,
    levels: Vec<LevelView>,
}

/// Les exercices et, pour chaque niveau, ses éléments.
#[wasm_bindgen(js_name = earExercises)]
pub fn ear_exercises() -> Result<JsValue, JsError> {
    let views: Vec<ExerciseView> = Exercise::ALL
        .into_iter()
        .map(|exercise| ExerciseView {
            id: exercise.id(),
            levels: (1..=exercise.levels()).map(|level| LevelView { level, items: ear::level_items(exercise, level) }).collect(),
        })
        .collect();
    to_js(&views)
}

/// Une question. `item` (facultatif) impose l'élément ; `seed` est un entier < 2^53.
#[wasm_bindgen(js_name = earQuestion)]
pub fn ear_question(exercise_id: &str, level: usize, item: Option<String>, seed: f64) -> Result<JsValue, JsError> {
    let question = ear::question(exercise(exercise_id)?, level, item.as_deref(), seed as u64)
        .ok_or_else(|| JsError::new("niveau ou élément inconnu"))?;
    to_js(&question)
}

/// Élément à interroger, d'après les fiches de répétition.
#[wasm_bindgen(js_name = earPick)]
pub fn ear_pick(items: Vec<String>, known: JsValue, now_ms: f64, last: Option<String>, seed: f64) -> Result<Option<String>, JsError> {
    Ok(ear::pick(&items, &cards(known)?, now_ms as i64, last.as_deref(), seed as u64))
}

/// Fiche mise à jour après une réponse (nouvelle fiche si `card` est absente).
#[wasm_bindgen(js_name = earReview)]
pub fn ear_review(item: &str, card: JsValue, correct: bool, now_ms: f64) -> Result<JsValue, JsError> {
    let current = if card.is_undefined() || card.is_null() {
        Card::new(item)
    } else {
        serde_wasm_bindgen::from_value(card).map_err(|error| JsError::new(&error.to_string()))?
    };
    to_js(&ear::review(&current, correct, now_ms as i64))
}

/// Éléments maîtrisés d'un niveau : `[maîtrisés, total]`.
#[wasm_bindgen(js_name = earProgress)]
pub fn ear_progress(exercise_id: &str, level: usize, known: JsValue) -> Result<Vec<usize>, JsError> {
    let (mastered, total) = ear::level_progress(exercise(exercise_id)?, level, &cards(known)?);
    Ok(vec![mastered, total])
}

// ------------------------------------------------------------------ générateur

use harmonia_theory::compose::{self, Piece, Settings};
use harmonia_theory::export;

fn piece_from(value: JsValue) -> Result<Piece, JsError> {
    serde_wasm_bindgen::from_value(value).map_err(|error| JsError::new(&error.to_string()))
}

/// Compose un morceau. `settings` : `{ key, style, bars, bpm }` ; `seed` < 2^53.
#[wasm_bindgen]
pub fn compose(settings: JsValue, seed: f64) -> Result<JsValue, JsError> {
    let settings: Settings = serde_wasm_bindgen::from_value(settings).map_err(|error| JsError::new(&error.to_string()))?;
    if !(3..=32).contains(&settings.bars) || !(40.0..=220.0).contains(&settings.bpm) {
        return Err(JsError::new("de 3 à 32 mesures, de 40 à 220 BPM"));
    }
    to_js(&compose::compose(&settings, seed as u64))
}

/// Le morceau en fichier MIDI standard.
#[wasm_bindgen(js_name = pieceMidi)]
pub fn piece_midi(piece: JsValue) -> Result<Vec<u8>, JsError> {
    Ok(export::to_midi(&piece_from(piece)?))
}

/// Le morceau en partition MusicXML.
#[wasm_bindgen(js_name = pieceMusicXml)]
pub fn piece_musicxml(piece: JsValue, title: &str) -> Result<String, JsError> {
    Ok(export::to_musicxml(&piece_from(piece)?, title))
}

/// Événements à jouer pour écouter le morceau.
#[wasm_bindgen(js_name = piecePlayback)]
pub fn piece_playback(piece: JsValue) -> Result<JsValue, JsError> {
    to_js(&export::playback(&piece_from(piece)?))
}

// ------------------------------------------------------------------ séquenceur

use harmonia_theory::project::{self, MAX_TRACKS, Project};

fn project_from(value: JsValue) -> Result<Project, JsError> {
    let project: Project = serde_wasm_bindgen::from_value(value).map_err(|error| JsError::new(&error.to_string()))?;
    if project.tracks.len() > MAX_TRACKS || !(40.0..=220.0).contains(&project.bpm) || !(1..=12).contains(&project.beats_per_bar) {
        return Err(JsError::new("au plus 16 pistes, de 40 à 220 BPM"));
    }
    Ok(project)
}

/// Le morceau généré, en projet éditable (pistes et batterie).
#[wasm_bindgen(js_name = pieceProject)]
pub fn piece_project(piece: JsValue) -> Result<JsValue, JsError> {
    to_js(&project::from_piece(&piece_from(piece)?))
}

/// Le projet en fichier MIDI. `key` : tonalité (« C », « A minor »), pour
/// l'armure du fichier, ou rien.
#[wasm_bindgen(js_name = projectMidi)]
pub fn project_midi(value: JsValue, key: Option<String>) -> Result<Vec<u8>, JsError> {
    let project = project_from(value)?;
    let key = match key {
        Some(text) => Some(text.parse::<harmonia_theory::Key>().map_err(|error| JsError::new(&error.to_string()))?),
        None => None,
    };
    Ok(project::to_midi(&project, key.map(|k| (k.signature() as i8, k.mode))))
}
