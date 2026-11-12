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
