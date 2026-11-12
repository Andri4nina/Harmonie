use std::fmt;

/// Erreurs du moteur de théorie. Chaque variante porte l'entrée fautive.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TheoryError {
    InvalidNote(String),
    InvalidPitch(String),
    InvalidInterval(String),
    InvalidChord(String),
    InvalidKey(String),
    InvalidRomanNumeral(String),
    /// L'opération exige une gamme de sept notes.
    NotHeptatonic,
    /// L'empilement de tierces ne correspond à aucune qualité d'accord connue.
    UnknownChordQuality,
}

impl fmt::Display for TheoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidNote(s) => write!(f, "note invalide : « {s} »"),
            Self::InvalidPitch(s) => write!(f, "hauteur invalide : « {s} »"),
            Self::InvalidInterval(s) => write!(f, "intervalle invalide : « {s} »"),
            Self::InvalidChord(s) => write!(f, "accord invalide : « {s} »"),
            Self::InvalidKey(s) => write!(f, "tonalité invalide : « {s} »"),
            Self::InvalidRomanNumeral(s) => write!(f, "degré invalide : « {s} »"),
            Self::NotHeptatonic => write!(f, "l'opération exige une gamme de sept notes"),
            Self::UnknownChordQuality => write!(f, "qualité d'accord inconnue"),
        }
    }
}

impl std::error::Error for TheoryError {}
