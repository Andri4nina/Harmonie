//! Moteur de théorie musicale d'Harmonia.
//!
//! Crate pure : aucune I/O, aucune dépendance, aucun état global. Elle est la
//! seule source de vérité musicale du projet (API, WASM, mobile).
//!
//! # Conventions
//!
//! - Une [`Note`] conserve son orthographe : `F#` et `Gb` sont distinctes mais
//!   partagent la même [`PitchClass`].
//! - Les octaves suivent la notation scientifique : `C4` = do central = MIDI 60,
//!   `A4` = 440 Hz par défaut. L'octave appartient à la lettre : `Cb4` = MIDI 59.
//! - Un [`Interval`] est ascendant et stocke degrés diatoniques + demi-tons, ce
//!   qui distingue une quarte augmentée (`A4`) d'une quinte diminuée (`d5`).
//!
//! ```
//! use harmonia_theory::{Key, Progression};
//!
//! let key: Key = "C".parse().unwrap();
//! let progression: Progression = "I-V-vi-IV".parse().unwrap();
//! let chords: Vec<String> = progression.resolve(&key).iter().map(|c| c.to_string()).collect();
//! assert_eq!(chords, ["C", "G", "Am", "F"]);
//! ```

pub mod chord;
pub mod compose;
pub mod ear;
pub mod export;
pub mod error;
pub mod harmony;
pub mod instrument;
pub mod interval;
pub mod key;
pub mod melody;
pub mod pitch;
pub mod relations;
pub mod scale;
#[cfg(feature = "serde")]
mod serde_impl;

pub use chord::{Chord, ChordQuality};
pub use error::TheoryError;
pub use harmony::{Cadence, CommonProgression, Progression, RomanNumeral};
pub use instrument::{Family, Instrument, Layout, PercussionPiece, StringPosition, Transposition};
pub use interval::{Interval, IntervalQuality};
pub use key::{estimate_key, Key, KeyEstimate, Mode};
pub use melody::{chords_for_note, harmonize_melody};
pub use pitch::{Letter, Note, Pitch, PitchClass, Spelling, A4_STANDARD_HZ};
pub use relations::{Edge, Graph, Link, Node, Relation};
pub use scale::{Scale, ScaleType};
