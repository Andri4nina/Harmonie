//! Projet de séquenceur : des pistes de notes libres, chacune jouée par un
//! instrument, que l'on édite dans le rouleau de piano et le séquenceur pas à
//! pas de la page Composer.
//!
//! - [`from_piece`] transforme un morceau généré en projet (mélodie, accords,
//!   basse, batterie) avec les mêmes voicings que l'export du morceau ;
//! - [`to_midi`] écrit le projet en fichier MIDI standard (type 1), une piste
//!   par piste du projet, la batterie sur le canal 10 (General MIDI).
//!
//! Pur : aucune lecture ni écriture de fichier.

use crate::compose::{Piece, Style};
use crate::export::{TICKS_PER_BEAT, meta, notes, track, voiced};
use crate::{Mode, Pitch};

/// Nombre maximal de pistes : 16 canaux MIDI.
pub const MAX_TRACKS: usize = 16;

/// Pas du séquenceur : la double croche.
pub const STEP: f64 = 0.25;

/// Une note du rouleau de piano. Pour la batterie, `midi` est la pièce
/// (numérotation General MIDI : 36 grosse caisse, 38 caisse claire…).
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct RollNote {
    pub midi: i32,
    /// Début, en temps (noires) depuis le début du projet.
    pub beat: f64,
    pub length: f64,
    /// Vélocité MIDI, de 1 à 127.
    #[cfg_attr(feature = "serde", serde(default = "default_velocity"))]
    pub velocity: u8,
}

fn default_velocity() -> u8 {
    96
}

/// Une piste : un instrument (identifiant du moteur : `piano`, `guitar`,
/// `drum-kit`…) et ses notes.
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Track {
    pub name: String,
    pub sound: String,
    /// Volume de 0 à 1.
    #[cfg_attr(feature = "serde", serde(default = "default_volume"))]
    pub volume: f64,
    pub notes: Vec<RollNote>,
}

fn default_volume() -> f64 {
    0.8
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Project {
    pub bpm: f64,
    pub beats_per_bar: u32,
    /// Longueur du projet, en mesures.
    pub bars: u32,
    pub tracks: Vec<Track>,
}

impl Track {
    /// Vrai pour une piste de batterie (canal 10, sans hauteur).
    pub fn is_drums(&self) -> bool {
        self.sound == "drum-kit"
    }
}

/// Programme General MIDI (0 à 127) d'un instrument du moteur ; `None` pour
/// la batterie, qui n'a pas de programme mais un canal réservé.
pub fn general_midi_program(sound: &str) -> Option<u8> {
    Some(match sound {
        "drum-kit" => return None,
        "guitar" | "guitar-drop-d" => 25,
        "ukulele" => 24,
        "bass" => 33,
        "violin" => 40,
        "cello" => 42,
        "flute" => 73,
        "alto-saxophone" => 65,
        "tenor-saxophone" => 66,
        "synthesizer" => 81,
        _ => 0,
    })
}

fn note(midi: i32, beat: f64, length: f64, velocity: u8) -> RollNote {
    RollNote { midi, beat, length, velocity }
}

/// Batterie d'accompagnement selon le style, une mesure de 4/4 répétée :
/// pop (grosse caisse 1 et 3, caisse claire 2 et 4, charleston en croches),
/// jazz (ride en croches ternaires, charleston au pied sur 2 et 4). Le style
/// classique n'a pas de batterie.
fn drums(style: Style, bars: u32, beats_per_bar: u32) -> Vec<RollNote> {
    let mut out = Vec::new();
    for bar in 0..bars {
        let start = f64::from(bar * beats_per_bar);
        match style {
            Style::Classical => {}
            Style::Pop => {
                for beat in 0..beats_per_bar {
                    let at = start + f64::from(beat);
                    out.push(note(if beat % 2 == 0 { 36 } else { 38 }, at, STEP, if beat == 0 { 110 } else { 96 }));
                    out.push(note(42, at, STEP, 80));
                    out.push(note(42, at + 0.5, STEP, 60));
                }
            }
            Style::Jazz => {
                for beat in 0..beats_per_bar {
                    let at = start + f64::from(beat);
                    out.push(note(51, at, STEP, 84));
                    if beat % 2 == 1 {
                        out.push(note(51, at + 0.75, STEP, 64));
                        out.push(note(44, at, STEP, 72));
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.beat.total_cmp(&b.beat).then(a.midi.cmp(&b.midi)));
    out
}

/// Le morceau généré, en projet éditable.
pub fn from_piece(piece: &Piece) -> Project {
    let bars = piece.chords.len() as u32;
    let melody = piece.melody.iter().map(|n| note(n.pitch.midi(), n.beat, n.length, 96)).collect();
    let chords = piece
        .chords
        .iter()
        .flat_map(|c| voiced(&c.chord).into_iter().map(move |m| note(m, c.beat, c.length, 64)))
        .collect();
    let bass = piece
        .chords
        .iter()
        .map(|c| {
            let root = Pitch::new(c.chord.bass_note(), 2).midi();
            note(if root > 47 { root - 12 } else { root }, c.beat, c.length, 80)
        })
        .collect();
    let mut tracks = vec![
        Track { name: "Mélodie".into(), sound: "piano".into(), volume: 0.85, notes: melody },
        Track { name: "Accords".into(), sound: "piano".into(), volume: 0.6, notes: chords },
        Track { name: "Basse".into(), sound: "bass".into(), volume: 0.8, notes: bass },
    ];
    let beat = drums(piece.style, bars, piece.beats_per_bar);
    if !beat.is_empty() {
        tracks.push(Track { name: "Batterie".into(), sound: "drum-kit".into(), volume: 0.7, notes: beat });
    }
    Project { bpm: piece.bpm, beats_per_bar: piece.beats_per_bar, bars, tracks }
}

/// Le projet en fichier MIDI standard (type 1) : une piste de conduite, puis
/// une piste par piste du projet. Les instruments mélodiques prennent les
/// canaux 1 à 9 et 11 à 16, la batterie le canal 10.
pub fn to_midi(project: &Project, key_signature: Option<(i8, Mode)>) -> Vec<u8> {
    let tempo = (60_000_000.0 / project.bpm).round() as u32;
    let mut conductor = vec![
        meta(0, 0x03, b"Harmonie"),
        meta(0, 0x51, &tempo.to_be_bytes()[1..]),
        meta(0, 0x58, &[project.beats_per_bar as u8, 2, 24, 8]),
    ];
    if let Some((signature, mode)) = key_signature {
        conductor.push(meta(0, 0x59, &[signature.clamp(-7, 7) as u8, u8::from(mode == Mode::Minor)]));
    }
    let mut chunks = vec![track(&mut conductor)];
    let mut next_channel = 0u8;
    for item in project.tracks.iter().take(MAX_TRACKS) {
        let (channel, program) = match general_midi_program(&item.sound) {
            None => (9, 0),
            Some(program) => {
                if next_channel == 9 {
                    next_channel += 1;
                }
                let channel = next_channel.min(15);
                next_channel += 1;
                (channel, program)
            }
        };
        let gain = item.volume.clamp(0.0, 1.0);
        chunks.push(notes(
            channel,
            program,
            &item.name,
            item.notes.iter().map(|n| {
                let velocity = (f64::from(n.velocity.clamp(1, 127)) * gain).round().clamp(1.0, 127.0) as u8;
                (n.beat.max(0.0), n.length.max(STEP / 4.0), n.midi, velocity)
            }),
        ));
    }
    let mut file = b"MThd".to_vec();
    file.extend(6u32.to_be_bytes());
    file.extend(1u16.to_be_bytes());
    file.extend((chunks.len() as u16).to_be_bytes());
    file.extend((TICKS_PER_BEAT as u16).to_be_bytes());
    for chunk in chunks {
        file.extend(chunk);
    }
    file
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compose::{Settings, compose};

    fn piece(style: Style) -> Piece {
        compose(&Settings { key: "A minor".parse().unwrap(), style, bars: 8, bpm: 110.0 }, 9)
    }

    #[test]
    fn a_generated_piece_becomes_editable_tracks() {
        let piece = piece(Style::Pop);
        let project = from_piece(&piece);
        assert_eq!(project.bars, 8);
        let names: Vec<&str> = project.tracks.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, ["Mélodie", "Accords", "Basse", "Batterie"]);
        assert_eq!(project.tracks[0].notes.len(), piece.melody.len());
        assert_eq!(project.tracks[2].notes.len(), piece.chords.len());
        // Batterie pop : grosse caisse sur 1 et 3, caisse claire sur 2 et 4.
        let first_bar: Vec<(i32, f64)> =
            project.tracks[3].notes.iter().filter(|n| n.beat < 4.0 && n.midi != 42).map(|n| (n.midi, n.beat)).collect();
        assert_eq!(first_bar, [(36, 0.0), (38, 1.0), (36, 2.0), (38, 3.0)]);
    }

    #[test]
    fn classical_pieces_have_no_drums() {
        assert!(from_piece(&piece(Style::Classical)).tracks.iter().all(|t| !t.is_drums()));
    }

    #[test]
    fn drums_go_to_channel_ten_and_others_skip_it() {
        let mut project = from_piece(&piece(Style::Jazz));
        for i in 0..10 {
            project.tracks.push(Track { name: format!("p{i}"), sound: "guitar".into(), volume: 0.5, notes: vec![note(60, 0.0, 1.0, 90)] });
        }
        let file = to_midi(&project, None);
        // Canal de chaque piste : premier octet d'état de note.
        let mut at = 14;
        let mut channels = Vec::new();
        while at < file.len() {
            let length = u32::from_be_bytes(file[at + 4..at + 8].try_into().unwrap()) as usize;
            let data = &file[at + 8..at + 8 + length];
            channels.push(data.windows(1).find(|w| w[0] & 0xF0 == 0x90).map(|w| w[0] & 0x0F));
            at += 8 + length;
        }
        assert_eq!(channels[0], None, "piste de conduite");
        assert_eq!(channels[4], Some(9), "batterie sur le canal 10");
        let melodic: Vec<u8> = channels[1..].iter().enumerate().filter(|(i, _)| *i != 3).filter_map(|(_, c)| *c).collect();
        assert!(!melodic.contains(&9));
        assert_eq!(&file[10..12], &(project.tracks.len() as u16 + 1).to_be_bytes());
    }

    #[test]
    fn volume_scales_velocity() {
        let project = Project {
            bpm: 120.0,
            beats_per_bar: 4,
            bars: 1,
            tracks: vec![Track { name: "a".into(), sound: "piano".into(), volume: 0.5, notes: vec![note(60, 0.0, 1.0, 100)] }],
        };
        let file = to_midi(&project, None);
        let on = file.windows(3).find(|w| w[0] == 0x90 && w[1] == 60).unwrap();
        assert_eq!(on[2], 50);
    }
}
