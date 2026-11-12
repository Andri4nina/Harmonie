//! Contrat d'entrée : les descripteurs produits par le worker audio.
//!
//! Le worker découpe le morceau en *trames* contiguës, une par temps détecté
//! (ou de durée fixe si aucun temps n'a été suivi). Pour chaque trame il
//! fournit un chroma (énergie des 12 classes de hauteur, `C` en position 0),
//! un chroma du registre grave, l'énergie et la force de l'attaque initiale.
//!
//! Ce contrat ne contient aucune notion musicale : ni accord, ni tonalité.

use serde::{Deserialize, Serialize};

/// Version du contrat comprise par cette crate.
pub const SCHEMA: u32 = 1;

pub type Chroma = [f64; 12];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Features {
    pub schema: u32,
    pub duration_s: f64,
    pub sample_rate: u32,
    /// Écart d'accordage mesuré par rapport au La 440 Hz, en cents.
    pub tuning_cents: f64,
    /// `true` si les trames suivent des temps réellement détectés.
    pub beats_tracked: bool,
    /// Netteté de la pulsation, de 0 (rien ne marque les temps) à 1.
    pub pulse_clarity: f64,
    pub frames: Frames,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Frames {
    /// Bornes des trames en secondes : `N + 1` valeurs croissantes.
    pub boundaries: Vec<f64>,
    pub chroma: Vec<Chroma>,
    pub bass_chroma: Vec<Chroma>,
    /// Énergie efficace de chaque trame.
    pub rms: Vec<f64>,
    /// Force de l'attaque au début de la trame.
    pub onset_strength: Vec<f64>,
    /// La trame commence sur un temps détecté.
    pub on_beat: Vec<bool>,
}

impl Features {
    pub fn len(&self) -> usize {
        self.frames.chroma.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Vérifie la cohérence du contrat avant toute interprétation.
    pub fn validate(&self) -> Result<(), String> {
        if self.schema != SCHEMA {
            return Err(format!("schéma {} non pris en charge (attendu : {SCHEMA})", self.schema));
        }
        let frames = &self.frames;
        let n = frames.chroma.len();
        let lengths = [
            ("bass_chroma", frames.bass_chroma.len()),
            ("rms", frames.rms.len()),
            ("onset_strength", frames.onset_strength.len()),
            ("on_beat", frames.on_beat.len()),
        ];
        for (name, length) in lengths {
            if length != n {
                return Err(format!("{name} contient {length} trames, chroma en contient {n}"));
            }
        }
        if n > 0 && frames.boundaries.len() != n + 1 {
            return Err(format!("{} bornes pour {n} trames (attendu : {})", frames.boundaries.len(), n + 1));
        }
        if frames.boundaries.windows(2).any(|pair| pair[1].partial_cmp(&pair[0]) != Some(std::cmp::Ordering::Greater)) {
            return Err("les bornes des trames doivent être strictement croissantes".into());
        }
        let finite = |values: &[f64]| values.iter().all(|v| v.is_finite() && *v >= 0.0);
        let chroma_ok = frames.chroma.iter().chain(&frames.bass_chroma).all(|c| finite(c));
        if !chroma_ok || !finite(&frames.rms) || !finite(&frames.onset_strength) || !finite(&frames.boundaries) {
            return Err("les descripteurs doivent être finis et positifs".into());
        }
        if !self.duration_s.is_finite() || !self.tuning_cents.is_finite() || !self.pulse_clarity.is_finite() {
            return Err("durée ou accordage invalide".into());
        }
        Ok(())
    }
}
