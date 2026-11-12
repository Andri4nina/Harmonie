//! Export d'un morceau généré : MIDI standard et MusicXML.
//!
//! - **MIDI** (fichier standard, type 1, 480 tics par noire) : une piste de
//!   conduite (tempo, mesure, armure), puis mélodie (canal 1, piano), accords
//!   (canal 2, piano) et basse (canal 3, contrebasse).
//! - **MusicXML 4.0** (partition) : la mélodie sur une portée en clé de sol,
//!   l'armure et la mesure, et les accords en symboles (`<harmony>`), que
//!   MuseScore, Finale ou Sibelius affichent au-dessus de la portée.
//!
//! Pur : ces fonctions renvoient des octets ou du texte, sans rien écrire.

use crate::compose::Piece;
use crate::ear::TimedEvent;
use crate::{Chord, ChordQuality, Mode, Pitch};

const TICKS_PER_BEAT: u32 = 480;

/// Entier à longueur variable du format MIDI.
fn vlq(mut value: u32, out: &mut Vec<u8>) {
    let mut bytes = vec![(value & 0x7F) as u8];
    value >>= 7;
    while value > 0 {
        bytes.push(((value & 0x7F) as u8) | 0x80);
        value >>= 7;
    }
    bytes.reverse();
    out.extend(bytes);
}

/// Un événement MIDI à un instant donné (en tics).
struct Event {
    tick: u32,
    /// Les fins de note passent avant les débuts au même instant.
    order: u8,
    bytes: Vec<u8>,
}

fn track(events: &mut Vec<Event>) -> Vec<u8> {
    events.sort_by_key(|e| (e.tick, e.order));
    let mut data = Vec::new();
    let mut last = 0;
    for event in events.iter() {
        vlq(event.tick - last, &mut data);
        data.extend(&event.bytes);
        last = event.tick;
    }
    data.extend([0x00, 0xFF, 0x2F, 0x00]);
    let mut chunk = b"MTrk".to_vec();
    chunk.extend((data.len() as u32).to_be_bytes());
    chunk.extend(data);
    chunk
}

fn ticks(beats: f64) -> u32 {
    (beats * TICKS_PER_BEAT as f64).round() as u32
}

fn meta(tick: u32, kind: u8, payload: &[u8]) -> Event {
    let mut bytes = vec![0xFF, kind];
    vlq(payload.len() as u32, &mut bytes);
    bytes.extend(payload);
    Event { tick, order: 0, bytes }
}

fn notes(channel: u8, program: u8, name: &str, items: impl Iterator<Item = (f64, f64, i32, u8)>) -> Vec<u8> {
    let mut events = vec![meta(0, 0x03, name.as_bytes()), Event { tick: 0, order: 0, bytes: vec![0xC0 | channel, program] }];
    for (beat, length, midi, velocity) in items {
        let key = midi.clamp(0, 127) as u8;
        let start = ticks(beat);
        // Une note s'arrête un peu avant la suivante : articulation lisible.
        let end = start + (ticks(length) * 95 / 100).max(1);
        events.push(Event { tick: start, order: 2, bytes: vec![0x90 | channel, key, velocity] });
        events.push(Event { tick: end, order: 1, bytes: vec![0x80 | channel, key, 64] });
    }
    track(&mut events)
}

/// Voicing serré de l'accord, basse entre Do 3 et Si 3.
fn voiced(chord: &Chord) -> Vec<i32> {
    let mut pitches: Vec<i32> = chord.voicing(3).iter().map(|p| p.midi()).collect();
    while pitches[0] < 48 {
        pitches.iter_mut().for_each(|m| *m += 12);
    }
    while pitches[0] > 59 {
        pitches.iter_mut().for_each(|m| *m -= 12);
    }
    pitches
}

/// Événements à jouer dans le navigateur : accords, basse et mélodie, avec
/// les mêmes voicings que le fichier MIDI.
pub fn playback(piece: &Piece) -> Vec<TimedEvent> {
    let mut events = Vec::new();
    for placed in &piece.chords {
        events.push(TimedEvent { beat: placed.beat, length: placed.length, notes: voiced(&placed.chord), click: false });
        let root = Pitch::new(placed.chord.bass_note(), 2).midi();
        events.push(TimedEvent { beat: placed.beat, length: placed.length, notes: vec![if root > 47 { root - 12 } else { root }], click: false });
    }
    for note in &piece.melody {
        events.push(TimedEvent { beat: note.beat, length: note.length, notes: vec![note.pitch.midi()], click: false });
    }
    events.sort_by(|a, b| a.beat.total_cmp(&b.beat));
    events
}

/// Le morceau en fichier MIDI standard (type 1).
pub fn to_midi(piece: &Piece) -> Vec<u8> {
    let tempo = (60_000_000.0 / piece.bpm).round() as u32;
    let signature = piece.key.signature().clamp(-7, 7) as i8;
    let mut conductor = vec![
        meta(0, 0x03, b"Harmonie"),
        meta(0, 0x51, &tempo.to_be_bytes()[1..]),
        meta(0, 0x58, &[piece.beats_per_bar as u8, 2, 24, 8]),
        meta(0, 0x59, &[signature as u8, u8::from(piece.key.mode == Mode::Minor)]),
    ];
    let melody = notes(0, 0, "Melodie", piece.melody.iter().map(|n| (n.beat, n.length, n.pitch.midi(), 96)));
    let chords = notes(
        1,
        0,
        "Accords",
        piece.chords.iter().flat_map(|c| voiced(&c.chord).into_iter().map(move |m| (c.beat, c.length, m, 64))),
    );
    let bass = notes(
        2,
        32,
        "Basse",
        piece.chords.iter().map(|c| {
            let root = Pitch::new(c.chord.bass_note(), 2).midi();
            (c.beat, c.length, if root > 47 { root - 12 } else { root }, 80)
        }),
    );
    let mut file = b"MThd".to_vec();
    file.extend(6u32.to_be_bytes());
    file.extend(1u16.to_be_bytes());
    file.extend(4u16.to_be_bytes());
    file.extend((TICKS_PER_BEAT as u16).to_be_bytes());
    file.extend(track(&mut conductor));
    file.extend(melody);
    file.extend(chords);
    file.extend(bass);
    file
}

// ------------------------------------------------------------------ MusicXML

/// Divisions de la noire : la double croche est la plus petite valeur.
const DIVISIONS: u32 = 4;

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Type de note MusicXML et point éventuel pour une durée en temps.
fn note_type(beats: f64) -> Option<(&'static str, bool)> {
    [(4.0, "whole", false), (3.0, "half", true), (2.0, "half", false), (1.5, "quarter", true), (1.0, "quarter", false), (0.75, "eighth", true), (0.5, "eighth", false), (0.25, "16th", false)]
        .iter()
        .find(|(value, _, _)| (beats - value).abs() < 1e-9)
        .map(|(_, kind, dotted)| (*kind, *dotted))
}

/// Nature de l'accord au sens de MusicXML, et son écriture.
fn kind(quality: ChordQuality) -> &'static str {
    use ChordQuality::*;
    match quality {
        Major => "major",
        Minor => "minor",
        Diminished => "diminished",
        Augmented => "augmented",
        Dominant7 => "dominant",
        Major7 => "major-seventh",
        Minor7 => "minor-seventh",
        HalfDiminished7 => "half-diminished",
        Diminished7 => "diminished-seventh",
        MinorMajor7 => "major-minor",
        Sus2 => "suspended-second",
        Sus4 => "suspended-fourth",
        Major6 => "major-sixth",
        Minor6 => "minor-sixth",
        Dominant9 => "dominant-ninth",
        Major9 => "major-ninth",
        Minor9 => "minor-ninth",
        _ => "other",
    }
}

fn step(pitch_letter: char, accidental: i8) -> String {
    let alter = if accidental != 0 { format!("<alter>{accidental}</alter>") } else { String::new() };
    format!("<step>{pitch_letter}</step>{alter}")
}

/// Le morceau en partition MusicXML 4.0 (une partie, clé de sol).
pub fn to_musicxml(piece: &Piece, title: &str) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 4.0 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">\n<score-partwise version=\"4.0\">\n",
    );
    xml += &format!("  <work><work-title>{}</work-title></work>\n", escape(title));
    xml += "  <identification><encoding><software>Harmonie</software></encoding></identification>\n";
    xml += "  <part-list><score-part id=\"P1\"><part-name>Mélodie</part-name></score-part></part-list>\n  <part id=\"P1\">\n";
    let bar_beats = piece.beats_per_bar as f64;
    let mode = if piece.key.mode == Mode::Minor { "minor" } else { "major" };
    for (index, placed) in piece.chords.iter().enumerate() {
        xml += &format!("    <measure number=\"{}\">\n", index + 1);
        if index == 0 {
            xml += &format!(
                "      <attributes><divisions>{DIVISIONS}</divisions><key><fifths>{}</fifths><mode>{mode}</mode></key><time><beats>{}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>\n",
                piece.key.signature(),
                piece.beats_per_bar
            );
            xml += &format!("      <direction placement=\"above\"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>{}</per-minute></metronome></direction-type><sound tempo=\"{}\"/></direction>\n", piece.bpm.round(), piece.bpm.round());
        }
        let chord = &placed.chord;
        let alter = if chord.root.accidental != 0 { format!("<root-alter>{}</root-alter>", chord.root.accidental) } else { String::new() };
        xml += &format!(
            "      <harmony><root><root-step>{}</root-step>{alter}</root><kind text=\"{}\">{}</kind></harmony>\n",
            chord.root.letter.as_char(),
            escape(chord.quality.suffix()),
            kind(chord.quality)
        );
        let start = placed.beat;
        for note in piece.melody.iter().filter(|n| n.beat >= start && n.beat < start + bar_beats) {
            let (kind, dotted) = note_type(note.length).unwrap_or(("quarter", false));
            xml += &format!(
                "      <note><pitch>{}<octave>{}</octave></pitch><duration>{}</duration><type>{kind}</type>{}</note>\n",
                step(note.pitch.note.letter.as_char(), note.pitch.note.accidental),
                note.pitch.octave,
                (note.length * DIVISIONS as f64).round() as u32,
                if dotted { "<dot/>" } else { "" }
            );
        }
        if index + 1 == piece.chords.len() {
            xml += "      <barline location=\"right\"><bar-style>light-heavy</bar-style></barline>\n";
        }
        xml += "    </measure>\n";
    }
    xml += "  </part>\n</score-partwise>\n";
    xml
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compose::{Settings, Style, compose};

    fn piece() -> Piece {
        compose(&Settings { key: "Eb".parse().unwrap(), style: Style::Jazz, bars: 8, bpm: 100.0 }, 5)
    }

    /// Lecteur minimal : chunks, et nombre de débuts de note par piste.
    fn read(file: &[u8]) -> (u16, u16, Vec<usize>) {
        assert_eq!(&file[0..4], b"MThd");
        let format = u16::from_be_bytes([file[8], file[9]]);
        let count = u16::from_be_bytes([file[10], file[11]]);
        let mut at = 14;
        let mut note_ons = Vec::new();
        while at < file.len() {
            assert_eq!(&file[at..at + 4], b"MTrk");
            let length = u32::from_be_bytes(file[at + 4..at + 8].try_into().unwrap()) as usize;
            let data = &file[at + 8..at + 8 + length];
            let mut i = 0;
            let mut ons = 0;
            loop {
                while data[i] & 0x80 != 0 {
                    i += 1;
                }
                i += 1;
                let status = data[i];
                match status {
                    0xFF => {
                        let kind = data[i + 1];
                        let len = data[i + 2] as usize;
                        i += 3 + len;
                        if kind == 0x2F {
                            break;
                        }
                    }
                    s if s & 0xF0 == 0xC0 => i += 2,
                    s if s & 0xF0 == 0x90 => {
                        ons += 1;
                        i += 3;
                    }
                    s if s & 0xF0 == 0x80 => i += 3,
                    other => panic!("octet d'état inattendu {other:#x}"),
                }
            }
            assert_eq!(i, data.len(), "la piste se termine sur sa fin");
            note_ons.push(ons);
            at += 8 + length;
        }
        (format, count, note_ons)
    }

    #[test]
    fn midi_has_one_conductor_and_three_instrument_tracks() {
        let piece = piece();
        let (format, count, note_ons) = read(&to_midi(&piece));
        assert_eq!((format, count), (1, 4));
        let chord_notes: usize = piece.chords.iter().map(|c| c.chord.notes().len()).sum();
        assert_eq!(note_ons, vec![0, piece.melody.len(), chord_notes, piece.chords.len()]);
    }

    #[test]
    fn variable_length_quantities_follow_the_standard() {
        for (value, bytes) in [(0, vec![0x00]), (0x7F, vec![0x7F]), (0x80, vec![0x81, 0x00]), (0x3FFF, vec![0xFF, 0x7F]), (0x0FFF_FFFF, vec![0xFF, 0xFF, 0xFF, 0x7F])] {
            let mut out = Vec::new();
            vlq(value, &mut out);
            assert_eq!(out, bytes, "{value:#x}");
        }
    }

    #[test]
    fn musicxml_measures_are_full_and_chords_are_named() {
        let piece = piece();
        let xml = to_musicxml(&piece, "Essai & co");
        assert!(xml.contains("<fifths>-3</fifths><mode>major</mode>"));
        assert!(xml.contains("<work-title>Essai &amp; co</work-title>"));
        assert_eq!(xml.matches("<measure ").count(), 8);
        assert_eq!(xml.matches("<harmony>").count(), 8);
        assert!(xml.contains("<root><root-step>E</root-step><root-alter>-1</root-alter></root>"), "{}", &xml[..1200]);
        for measure in xml.split("<measure ").skip(1) {
            let total: u32 = measure.split("<duration>").skip(1).map(|d| d.split('<').next().unwrap().parse::<u32>().unwrap()).sum();
            assert_eq!(total, 4 * DIVISIONS, "{measure}");
        }
        assert_eq!(xml.matches("<note>").count(), piece.melody.len());
    }
}
