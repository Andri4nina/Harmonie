//! Interprétation musicale des descripteurs audio.
//!
//! Le worker audio (Python) mesure le signal : chroma, temps, énergie. Cette
//! crate en tire la musique — tonalité, accords, degrés, cadences, mesure — en
//! s'appuyant sur le moteur de théorie, seule définition des accords et des
//! tonalités du projet. Elle est pure : ni fichier, ni réseau, ni horloge.
//!
//! Point d'entrée : [`analyze`].

pub mod analysis;
pub mod chords;
pub mod features;
pub mod melody;
pub mod meter;
pub mod tonality;

pub use analysis::{Analysis, Certainty, Params, analyze};
pub use features::Features;
