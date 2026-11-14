//! Vues prêtes à afficher, construites à partir du moteur.
//!
//! Ce module ne contient aucune règle musicale : il met en forme ce que
//! `harmonia-theory` calcule. Il est en Rust pur, donc testable sans navigateur.

use harmonia_theory::relations::{Node, Relation, conventional_root, conventional_tonic, edges};
use harmonia_theory::{
    A4_STANDARD_HZ, Chord, ChordQuality, CommonProgression, Instrument, Key, Layout, Mode, Note,
    Pitch, PitchClass, Scale, ScaleType, Spelling, Transposition,
};
use serde::Serialize;

/// Une note à mettre en évidence sur un instrument.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tone {
    pub note: String,
    pub pitch_class: u8,
    /// Degré dans la gamme (`"3"`) ou intervalle depuis la fondamentale (`"m3"`).
    pub role: String,
    pub midi: i32,
}

/// Ce qu'il faut jouer pour entendre le nœud : une suite de pas, chacun étant
/// une ou plusieurs notes MIDI simultanées.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Playback {
    /// `melodic` (notes successives), `harmonic` (un accord), `sequence`
    /// (suite d'accords).
    pub mode: &'static str,
    pub steps: Vec<Vec<i32>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Fact {
    pub key: &'static str,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub kind: &'static str,
    /// Précision sur la relation : degré, intervalle, chiffrage…
    pub detail: Option<String>,
    /// Classe de hauteur de la tonique ou de la fondamentale (couleur).
    pub pitch_class: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Group {
    pub key: &'static str,
    pub items: Vec<Item>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeView {
    pub id: String,
    pub kind: &'static str,
    pub pitch_class: u8,
    pub tones: Vec<Tone>,
    pub playback: Playback,
    pub facts: Vec<Fact>,
    pub groups: Vec<Group>,
}

fn kind_of(node: &Node) -> &'static str {
    match node {
        Node::Note(_) => "note",
        Node::Scale(_) => "scale",
        Node::Chord(_) => "chord",
        Node::Key(_) => "key",
        Node::Progression { .. } => "progression",
    }
}

fn pitch_class_of(node: &Node) -> u8 {
    let note = match node {
        Node::Note(note) => *note,
        Node::Scale(scale) => scale.tonic,
        Node::Chord(chord) => chord.root,
        Node::Key(key) => key.tonic,
        Node::Progression { key, .. } => key.tonic,
    };
    note.pitch_class().value()
}

/// Regroupe une relation sous une rubrique et en extrait la précision.
fn classify(relation: &Relation) -> (&'static str, Option<String>) {
    match relation {
        Relation::Enharmonic => ("enharmonic", None),
        Relation::ChromaticNeighbor => ("neighbors", None),
        Relation::IntervalAbove(interval) => ("intervals", Some(interval.to_string())),
        Relation::DegreeOfKey(degree) => ("keys", Some(degree.to_string())),
        Relation::TonicOfMode => ("modes", None),
        Relation::TonicOfScale => ("scales", None),
        Relation::ToneOfChord(role) => ("chords", Some(role.to_string())),
        Relation::ScaleDegree(degree) => ("degrees", Some(degree.to_string())),
        Relation::HarmonizedChord(degree) => ("harmonized", Some(degree.to_string())),
        Relation::RelativeMode => ("relative_modes", None),
        Relation::KeyOfScale => ("key", None),
        Relation::ChordTone(interval) => ("chord_tones", Some(interval.to_string())),
        Relation::Inversion(n) => ("inversions", Some(n.to_string())),
        Relation::RootPosition => ("root_position", None),
        Relation::DiatonicIn(numeral) => ("diatonic_in", Some(numeral.to_string())),
        Relation::ScaleOfKey => ("scale", None),
        Relation::DiatonicChord(numeral) => ("diatonic_chords", Some(numeral.to_string())),
        Relation::RelativeKey => ("related_keys", Some("relative".into())),
        Relation::ParallelKey => ("related_keys", Some("parallel".into())),
        Relation::DominantKey => ("related_keys", Some("dominant".into())),
        Relation::SubdominantKey => ("related_keys", Some("subdominant".into())),
        Relation::CommonProgression => ("progressions", None),
        Relation::ProgressionStep(index) => ("steps", Some((index + 1).to_string())),
    }
}

fn groups_of(node: &Node) -> Vec<Group> {
    let mut groups: Vec<Group> = Vec::new();
    for edge in edges(node) {
        let (key, detail) = classify(&edge.relation);
        let item = Item {
            id: edge.target.id(),
            kind: kind_of(&edge.target),
            detail,
            pitch_class: pitch_class_of(&edge.target),
        };
        match groups.iter_mut().find(|g| g.key == key) {
            Some(group) => group.items.push(item),
            None => groups.push(Group {
                key,
                items: vec![item],
            }),
        }
    }
    groups
}

/// Octave d'écoute : garde les fondamentales entre Sol3 et Fa#4, là où un
/// accord serré reste clair.
fn listening_octave(root: Note) -> i8 {
    if root.pitch_class().value() >= 7 { 3 } else { 4 }
}

fn join<T: ToString>(items: &[T]) -> String {
    items
        .iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(" ")
}

fn fact(key: &'static str, value: impl Into<String>) -> Fact {
    Fact {
        key,
        value: value.into(),
    }
}

fn scale_tones(scale: &Scale) -> Vec<Tone> {
    let octave = listening_octave(scale.tonic);
    scale
        .notes()
        .iter()
        .zip(scale.pitches(octave))
        .enumerate()
        .map(|(index, (note, pitch))| Tone {
            note: note.to_string(),
            pitch_class: note.pitch_class().value(),
            role: (index + 1).to_string(),
            midi: pitch.midi(),
        })
        .collect()
}

/// La gamme montée jusqu'à l'octave de la tonique.
fn scale_playback(scale: &Scale) -> Playback {
    let octave = listening_octave(scale.tonic);
    let mut steps: Vec<Vec<i32>> = scale
        .pitches(octave)
        .iter()
        .map(|p| vec![p.midi()])
        .collect();
    steps.push(vec![Pitch::new(scale.tonic, octave + 1).midi()]);
    Playback {
        mode: "melodic",
        steps,
    }
}

fn chord_midi(chord: &Chord) -> Vec<i32> {
    chord
        .voicing(listening_octave(chord.bass_note()))
        .iter()
        .map(|p| p.midi())
        .collect()
}

fn signature_text(signature: i32) -> String {
    match signature {
        0 => "0".to_string(),
        n if n > 0 => format!("{n}#"),
        n => format!("{}b", -n),
    }
}

/// Tout ce que l'explorateur affiche pour un nœud du graphe musical.
pub fn node_view(node: &Node) -> NodeView {
    let (tones, playback, facts) = match node {
        Node::Note(note) => {
            let pitch = Pitch::new(*note, 4);
            let tone = Tone {
                note: note.to_string(),
                pitch_class: note.pitch_class().value(),
                role: "1".to_string(),
                midi: pitch.midi(),
            };
            let facts = vec![
                fact("pitch_class", note.pitch_class().value().to_string()),
                fact("midi", format!("{pitch} = {}", pitch.midi())),
                fact(
                    "frequency",
                    format!("{:.2} Hz", pitch.frequency(A4_STANDARD_HZ)),
                ),
            ];
            let playback = Playback {
                mode: "melodic",
                steps: vec![vec![pitch.midi()]],
            };
            (vec![tone], playback, facts)
        }
        Node::Scale(scale) => {
            let facts = vec![
                fact("notes", join(&scale.notes())),
                fact("formula", join(scale.kind.intervals())),
            ];
            (scale_tones(scale), scale_playback(scale), facts)
        }
        Node::Chord(chord) => {
            let midi = chord_midi(chord);
            let voicing = chord.voicing(listening_octave(chord.bass_note()));
            let tones = chord
                .notes()
                .iter()
                .zip(chord.quality.intervals())
                .map(|(note, interval)| Tone {
                    note: note.to_string(),
                    pitch_class: note.pitch_class().value(),
                    role: interval.to_string(),
                    midi: voicing
                        .iter()
                        .find(|p| p.note == *note)
                        .map_or(Pitch::new(*note, 4).midi(), |p| p.midi()),
                })
                .collect();
            let mut facts = vec![
                fact("notes", join(&chord.notes_from_bass())),
                fact("formula", join(chord.quality.intervals())),
            ];
            match chord.inversion() {
                Some(n) => facts.push(fact("inversion", n.to_string())),
                None => facts.push(fact("foreign_bass", chord.bass_note().to_string())),
            }
            if let Some(figure) = chord.figured_bass().filter(|f| !f.is_empty()) {
                facts.push(fact("figured_bass", figure));
            }
            let playback = Playback {
                mode: "harmonic",
                steps: vec![midi],
            };
            (tones, playback, facts)
        }
        Node::Key(key) => {
            let scale = key.scale();
            let facts = vec![
                fact("notes", join(&scale.notes())),
                fact("signature", signature_text(key.signature())),
                fact("relative", Node::Key(key.relative()).id()),
            ];
            (scale_tones(&scale), scale_playback(&scale), facts)
        }
        Node::Progression { key, id } => {
            let mut facts = Vec::new();
            let mut steps = Vec::new();
            if let Some(common) = CommonProgression::by_id(id) {
                let progression = common.progression();
                let chords = progression.resolve(key);
                steps = chords.iter().map(chord_midi).collect();
                facts.push(fact("numerals", progression.to_string()));
                facts.push(fact("chords", join(&chords)));
                if let Some(cadence) = progression.final_cadence(key) {
                    facts.push(fact("cadence", format!("{cadence:?}").to_lowercase()));
                }
            }
            let playback = Playback {
                mode: "sequence",
                steps,
            };
            (scale_tones(&key.scale()), playback, facts)
        }
    };
    NodeView {
        id: node.id(),
        kind: kind_of(node),
        pitch_class: pitch_class_of(node),
        tones,
        playback,
        facts,
        groups: groups_of(node),
    }
}

/// Interprète une saisie libre : `C#`, `Am7`, `F# minor`, `D dorian`, ou un
/// identifiant de nœud. Une saisie ambiguë donne plusieurs réponses (`C` est
/// une note, un accord et une tonalité), de la plus simple à la plus riche.
pub fn resolve_query(text: &str) -> Vec<String> {
    let text = text.trim();
    let mut found: Vec<Node> = Vec::new();
    if let Some(node) = Node::from_id(text) {
        found.push(node);
    }
    if let Ok(note) = text.parse::<Note>() {
        found.push(Node::Note(note));
    }
    if let Ok(chord) = text.parse::<Chord>() {
        found.push(Node::Chord(chord));
    }
    if let Ok(key) = text.parse::<Key>() {
        found.push(Node::Key(key));
    }
    if let Some((tonic, kind)) = text.split_once(char::is_whitespace) {
        let kind = kind.trim().to_lowercase().replace([' ', '-'], "_");
        if let (Ok(tonic), Some(kind)) = (tonic.parse::<Note>(), ScaleType::from_id(&kind)) {
            found.push(Node::Scale(Scale::new(tonic, kind)));
        }
    }
    let mut ids: Vec<String> = Vec::new();
    for node in found {
        let id = node.id();
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    ids
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct StringView {
    pub open: String,
    pub midi: i32,
}

/// Description d'un instrument pour l'affichage.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct InstrumentView {
    pub id: String,
    pub name: String,
    /// `keyboard`, `strings`, `wind` ou `percussion`.
    pub layout: &'static str,
    /// Cordes à vide, de la plus grave à la plus aiguë.
    pub strings: Vec<StringView>,
    pub span: u8,
    pub fretted: bool,
    /// Tessiture réelle en numéros MIDI.
    pub range: Option<[i32; 2]>,
    /// Note entendue quand l'instrument lit un do (« Eb » pour un
    /// instrument en mi bémol), ou `None` pour un instrument en ut.
    pub pitched_in: Option<String>,
}

pub fn instrument_view(instrument: &Instrument) -> InstrumentView {
    let (layout, strings, span, fretted) = match &instrument.layout {
        Layout::Keyboard => ("keyboard", Vec::new(), 0, false),
        Layout::Wind => ("wind", Vec::new(), 0, false),
        Layout::Percussion { .. } => ("percussion", Vec::new(), 0, false),
        Layout::Strings {
            open,
            span,
            fretted,
        } => {
            let strings = open
                .iter()
                .map(|p| StringView {
                    open: p.to_string(),
                    midi: p.midi(),
                })
                .collect();
            ("strings", strings, *span, *fretted)
        }
    };
    InstrumentView {
        id: instrument.id.clone(),
        name: instrument.name.clone(),
        layout,
        strings,
        span,
        fretted,
        range: instrument.range.map(|(low, high)| [low.midi(), high.midi()]),
        pitched_in: match instrument.transposition {
            Transposition::Concert => None,
            other => Some(other.to_sounding(Pitch::new("C".parse().expect("do"), 4)).note.to_string()),
        },
    }
}

/// Une position de tablature.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TabPosition {
    /// 0 = corde la plus grave.
    pub string: usize,
    pub stop: u8,
}

/// Doigté d'une ligne mélodique (MIDI réels) sur un instrument à cordes ;
/// `None` pour une note hors de l'instrument. Vide si l'instrument est inconnu.
pub fn tablature(instrument_id: &str, midis: &[i32]) -> Vec<Option<TabPosition>> {
    let Some(instrument) = Instrument::presets().into_iter().find(|i| i.id == instrument_id) else {
        return Vec::new();
    };
    instrument
        .tablature(midis)
        .into_iter()
        .map(|p| p.map(|p| TabPosition { string: p.string, stop: p.stop }))
        .collect()
}

/// Notes à lire sur l'instrument pour faire entendre `midis` (« Eb4 »).
/// `flats` choisit l'orthographe des notes réelles (tonalité en bémols).
pub fn written_notes(instrument_id: &str, midis: &[i32], flats: bool) -> Vec<String> {
    let transposition = Instrument::presets()
        .into_iter()
        .find(|i| i.id == instrument_id)
        .map_or(Transposition::Concert, |i| i.transposition);
    let spelling = if flats { Spelling::Flats } else { Spelling::Sharps };
    midis
        .iter()
        .map(|&midi| transposition.to_written(Pitch::from_midi(midi, spelling)).to_string())
        .collect()
}

/// Symboles d'accords à lire sur l'instrument ; un symbole illisible est
/// rendu tel quel.
pub fn written_chords(instrument_id: &str, symbols: &[String]) -> Vec<String> {
    let instrument = Instrument::presets().into_iter().find(|i| i.id == instrument_id);
    symbols
        .iter()
        .map(|symbol| match (&instrument, symbol.parse::<harmonia_theory::Chord>()) {
            (Some(instrument), Ok(chord)) => instrument.written_chord(&chord).to_string(),
            _ => symbol.clone(),
        })
        .collect()
}

/// Une note placée sur le manche.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FretMark {
    /// 0 = corde la plus grave.
    pub string: usize,
    pub stop: u8,
    pub note: String,
    pub pitch_class: u8,
    pub midi: i32,
}

/// Toutes les positions des notes données sur un instrument à cordes.
/// Vide si l'instrument est inconnu ou n'a pas de cordes.
pub fn fretboard(instrument_id: &str, notes: &[String]) -> Vec<FretMark> {
    let Some(instrument) = Instrument::presets()
        .into_iter()
        .find(|i| i.id == instrument_id)
    else {
        return Vec::new();
    };
    let mut marks = Vec::new();
    for text in notes {
        let Ok(note) = text.parse::<Note>() else {
            continue;
        };
        for position in instrument.positions_of(note) {
            if let Some(pitch) = instrument.pitch_at(position, Spelling::Sharps) {
                marks.push(FretMark {
                    string: position.string,
                    stop: position.stop,
                    note: note.to_string(),
                    pitch_class: note.pitch_class().value(),
                    midi: pitch.midi(),
                });
            }
        }
    }
    marks
}

/// Un secteur du cercle des quintes.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CircleSector {
    pub major: String,
    pub major_id: String,
    pub minor: String,
    pub minor_id: String,
    pub signature: i32,
    pub pitch_class: u8,
}

pub fn circle_of_fifths() -> Vec<CircleSector> {
    Key::circle_of_fifths()
        .into_iter()
        .map(|key| {
            let relative = key.relative();
            CircleSector {
                major: key.tonic.to_string(),
                major_id: Node::Key(key).id(),
                minor: format!("{}m", relative.tonic),
                minor_id: Node::Key(relative).id(),
                signature: key.signature(),
                pitch_class: key.tonic.pitch_class().value(),
            }
        })
        .collect()
}

/// Identifiants des pages de référence : chaque élément musical une seule
/// fois, sous son orthographe usuelle.
///
/// - les 17 notes naturelles, diésées et bémolisées ;
/// - les 24 tonalités du cercle des quintes ;
/// - chaque type de gamme sur les 12 toniques (sauf la gamme chromatique, la
///   même partout, et les gammes majeure et mineure naturelle, décrites par
///   leur tonalité) ;
/// - chaque qualité d'accord sur les 12 fondamentales, en position fondamentale ;
/// - chaque progression usuelle dans une tonalité d'exemple (Do majeur ou
///   La mineur).
pub fn catalog() -> Vec<String> {
    let mut nodes: Vec<Node> = Vec::new();
    for pc in 0..12 {
        for spelling in [Spelling::Sharps, Spelling::Flats] {
            let node = Node::Note(Note::from_pitch_class(PitchClass::new(pc), spelling));
            if !nodes.contains(&node) {
                nodes.push(node);
            }
        }
    }
    for key in Key::circle_of_fifths() {
        nodes.push(Node::Key(key));
        nodes.push(Node::Key(key.relative()));
    }
    for &kind in ScaleType::ALL {
        if matches!(
            kind,
            ScaleType::Chromatic | ScaleType::Major | ScaleType::NaturalMinor
        ) {
            continue;
        }
        for pc in 0..12 {
            let tonic = conventional_tonic(PitchClass::new(pc), kind);
            nodes.push(Node::Scale(Scale::new(tonic, kind)));
        }
    }
    for &quality in ChordQuality::ALL {
        for pc in 0..12 {
            let root = conventional_root(PitchClass::new(pc), quality);
            nodes.push(Node::Chord(Chord::new(root, quality)));
        }
    }
    for progression in CommonProgression::ALL {
        let tonic: Note = match progression.mode {
            Mode::Major => "C",
            Mode::Minor => "A",
        }
        .parse()
        .expect("tonique d'exemple valide");
        nodes.push(Node::Progression {
            key: Key {
                tonic,
                mode: progression.mode,
            },
            id: progression.id,
        });
    }
    nodes.iter().map(Node::id).collect()
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct WrittenTone {
    /// Note entendue.
    pub sounding: String,
    /// Note à écrire (et à doigter) pour l'obtenir.
    pub written: String,
}

/// Ce qu'un instrument à vent doit lire pour faire entendre des notes données.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct WindView {
    pub id: String,
    pub name: String,
    /// Intervalle de transposition (`"M6"`), ou `None` pour un instrument en ut.
    pub interval: Option<String>,
    /// `true` si l'instrument sonne plus bas que l'écrit.
    pub sounds_below: bool,
    pub tones: Vec<WrittenTone>,
}

/// Notes écrites correspondantes pour chaque instrument à vent fourni.
pub fn winds(notes: &[String]) -> Vec<WindView> {
    let notes: Vec<Note> = notes.iter().filter_map(|n| n.parse().ok()).collect();
    Instrument::presets()
        .into_iter()
        .filter(|instrument| instrument.layout == Layout::Wind)
        .map(|instrument| {
            let (interval, sounds_below) = match instrument.transposition {
                Transposition::Concert => (None, false),
                Transposition::SoundsBelow(interval) => (Some(interval.to_string()), true),
                Transposition::SoundsAbove(interval) => (Some(interval.to_string()), false),
            };
            let tones = notes
                .iter()
                .map(|&note| WrittenTone {
                    sounding: note.to_string(),
                    written: instrument
                        .transposition
                        .to_written(Pitch::new(note, 4))
                        .note
                        .to_string(),
                })
                .collect();
            WindView {
                id: instrument.id,
                name: instrument.name,
                interval,
                sounds_below,
                tones,
            }
        })
        .collect()
}

/// Fréquence d'une note MIDI pour un La4 donné.
pub fn midi_to_frequency(midi: i32, a4_hz: f64) -> f64 {
    Pitch::from_midi(midi, Spelling::Sharps).frequency(a4_hz)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(id: &str) -> NodeView {
        node_view(&Node::from_id(id).unwrap())
    }
    fn fact_of<'a>(view: &'a NodeView, key: &str) -> &'a str {
        &view.facts.iter().find(|f| f.key == key).unwrap().value
    }
    fn group<'a>(view: &'a NodeView, key: &str) -> Vec<&'a str> {
        view.groups
            .iter()
            .find(|g| g.key == key)
            .map(|g| g.items.iter().map(|i| i.id.as_str()).collect())
            .unwrap_or_default()
    }

    #[test]
    fn note_view() {
        let c = view("note:C");
        assert_eq!(c.kind, "note");
        assert_eq!(c.playback.steps, [[60]]);
        assert_eq!(fact_of(&c, "frequency"), "261.63 Hz");
        assert_eq!(group(&c, "neighbors"), ["note:B", "note:C#"]);
        assert_eq!(group(&c, "keys").len(), 14);
        assert_eq!(group(&c, "chords").len(), 24);
        assert_eq!(group(&c, "modes").len(), 7);
        assert_eq!(group(&c, "scales").len(), 8);
    }

    #[test]
    fn scale_view_plays_up_to_the_octave() {
        let scale = view("scale:C:major");
        assert_eq!(fact_of(&scale, "notes"), "C D E F G A B");
        assert_eq!(fact_of(&scale, "formula"), "P1 M2 M3 P4 P5 M6 M7");
        let melody: Vec<i32> = scale.playback.steps.iter().map(|s| s[0]).collect();
        assert_eq!(melody, [60, 62, 64, 65, 67, 69, 71, 72]);
        assert_eq!(scale.tones[4].role, "5");
        assert_eq!(scale.tones[4].note, "G");
        // Une tonique haute descend d'une octave pour rester dans le médium.
        assert_eq!(view("scale:A:natural_minor").playback.steps[0], [57]);
    }

    #[test]
    fn chord_view() {
        let chord = view("chord:Am7/C");
        assert_eq!(chord.playback.mode, "harmonic");
        assert_eq!(chord.playback.steps, [[60, 64, 67, 69]]);
        assert_eq!(fact_of(&chord, "notes"), "C E G A");
        assert_eq!(fact_of(&chord, "inversion"), "1");
        assert_eq!(fact_of(&chord, "figured_bass"), "6/5");
        let roles: Vec<&str> = chord.tones.iter().map(|t| t.role.as_str()).collect();
        assert_eq!(roles, ["P1", "m3", "P5", "m7"]);
        // Chaque note mise en évidence est bien une note jouée.
        for tone in &chord.tones {
            assert!(chord.playback.steps[0].contains(&tone.midi), "{}", tone.note);
        }
        assert_eq!(group(&chord, "root_position"), ["chord:Am7"]);

        let slash = view("chord:C/D");
        assert_eq!(fact_of(&slash, "foreign_bass"), "D");
        assert!(slash.facts.iter().all(|f| f.key != "figured_bass"));
    }

    #[test]
    fn key_and_progression_views() {
        let key = view("key:Eb:major");
        assert_eq!(fact_of(&key, "signature"), "3b");
        assert_eq!(fact_of(&key, "relative"), "key:C:minor");
        assert_eq!(view("key:D:major").facts[1].value, "2#");
        assert_eq!(view("key:A:minor").facts[1].value, "0");
        assert!(group(&key, "progressions").contains(&"progression:pop:Eb:major"));

        let pop = view("progression:pop:C:major");
        assert_eq!(pop.playback.mode, "sequence");
        assert_eq!(fact_of(&pop, "chords"), "C G Am F");
        assert_eq!(pop.playback.steps.len(), 4);
        assert_eq!(pop.playback.steps[0], [60, 64, 67]);
        assert_eq!(group(&pop, "steps"), ["chord:C", "chord:G", "chord:Am", "chord:F"]);
        let cadence = view("progression:two-five-one:C:major");
        assert_eq!(fact_of(&cadence, "cadence"), "authentic");
    }

    #[test]
    fn every_reachable_view_is_playable() {
        let start = view("key:C:major");
        for group in &start.groups {
            for item in &group.items {
                let target = view(&item.id);
                assert!(!target.playback.steps.is_empty(), "{}", item.id);
                assert!(target.playback.steps.iter().all(|s| !s.is_empty()), "{}", item.id);
                assert!(!target.tones.is_empty(), "{}", item.id);
            }
        }
    }

    #[test]
    fn queries() {
        assert_eq!(resolve_query("C"), ["note:C", "chord:C", "key:C:major"]);
        assert_eq!(resolve_query(" am "), ["chord:Am", "key:A:minor"]);
        assert_eq!(resolve_query("F#m7b5"), ["chord:F#m7b5"]);
        assert_eq!(resolve_query("D dorian"), ["scale:D:dorian"]);
        assert_eq!(resolve_query("A harmonic minor"), ["scale:A:harmonic_minor"]);
        assert_eq!(resolve_query("Bb major"), ["key:Bb:major", "scale:Bb:major"]);
        assert_eq!(resolve_query("scale:E:phrygian"), ["scale:E:phrygian"]);
        assert!(resolve_query("xyz").is_empty());
        assert!(resolve_query("").is_empty());
    }

    #[test]
    fn instruments_and_fretboard() {
        let views: Vec<InstrumentView> = Instrument::presets().iter().map(instrument_view).collect();
        let guitar = views.iter().find(|v| v.id == "guitar").unwrap();
        assert_eq!(guitar.layout, "strings");
        assert_eq!(guitar.strings.len(), 6);
        assert_eq!(guitar.strings[0].midi, 40);
        assert_eq!(guitar.range, Some([40, 86]));
        assert_eq!(views.iter().find(|v| v.id == "piano").unwrap().range, Some([21, 108]));
        assert_eq!(views.iter().find(|v| v.id == "drum-kit").unwrap().range, None);

        let marks = fretboard("guitar", &["C".to_string(), "E".to_string(), "G".to_string()]);
        assert!(marks.contains(&FretMark {
            string: 1,
            stop: 3,
            note: "C".into(),
            pitch_class: 0,
            midi: 48
        }));
        // Les cordes à vide Mi, Sol, Mi font partie de l'accord de Do.
        assert_eq!(marks.iter().filter(|m| m.stop == 0).count(), 3);
        assert!(fretboard("piano", &["C".to_string()]).is_empty());
        assert!(fretboard("nope", &["C".to_string()]).is_empty());
        assert!(fretboard("guitar", &["H".to_string()]).is_empty());
    }

    #[test]
    fn circle_and_frequency() {
        let circle = circle_of_fifths();
        assert_eq!(circle.len(), 12);
        assert_eq!(circle[0].major, "C");
        assert_eq!(circle[0].minor, "Am");
        assert_eq!(circle[1].signature, 1);
        assert_eq!(circle[11].major_id, "key:F:major");
        assert_eq!(circle[11].signature, -1);
        assert!((midi_to_frequency(69, 440.0) - 440.0).abs() < 1e-9);
        assert!((midi_to_frequency(57, 442.0) - 221.0).abs() < 1e-9);
    }

    #[test]
    fn catalog_lists_each_reference_page_once() {
        let ids = catalog();
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
        let count = |prefix: &str| ids.iter().filter(|id| id.starts_with(prefix)).count();
        assert_eq!(count("note:"), 17);
        assert_eq!(count("key:"), 24);
        assert_eq!(count("scale:"), 13 * 12);
        assert_eq!(count("chord:"), 28 * 12);
        assert_eq!(count("progression:"), CommonProgression::ALL.len());
        for id in ["note:Bb", "key:F#:major", "key:D#:minor", "scale:A:blues", "chord:Dbmaj7",
                   "chord:C#m7", "progression:andalusian:A:minor"] {
            assert!(ids.contains(&id.to_string()), "{id} absent du catalogue");
        }
        // Chaque identifiant désigne un nœud valide et affichable.
        for id in &ids {
            let node = Node::from_id(id).unwrap_or_else(|| panic!("identifiant invalide : {id}"));
            assert_eq!(&node_view(&node).id, id);
        }
    }

    #[test]
    fn wind_instruments_read_transposed_notes() {
        let views = winds(&["C".to_string(), "E".to_string(), "G".to_string()]);
        let written = |id: &str| -> Vec<String> {
            let view = views.iter().find(|v| v.id == id).unwrap();
            view.tones.iter().map(|t| t.written.clone()).collect()
        };
        // Pour entendre Do majeur, l'alto lit La majeur, le ténor Ré majeur.
        assert_eq!(written("alto-saxophone"), ["A", "C#", "E"]);
        assert_eq!(written("tenor-saxophone"), ["D", "F#", "A"]);
        assert_eq!(written("flute"), ["C", "E", "G"]);
        let alto = views.iter().find(|v| v.id == "alto-saxophone").unwrap();
        assert_eq!(alto.interval.as_deref(), Some("M6"));
        assert!(alto.sounds_below);
        assert_eq!(views.iter().find(|v| v.id == "flute").unwrap().interval, None);
        assert!(views.iter().all(|v| v.id != "guitar"));
    }

    #[test]
    fn views_serialize_in_camel_case() {
        let json = serde_json::to_value(view("chord:C")).unwrap();
        assert_eq!(json["pitchClass"], 0);
        assert_eq!(json["tones"][1]["pitchClass"], 4);
        assert_eq!(json["playback"]["mode"], "harmonic");
        assert_eq!(json["groups"][0]["key"], "chord_tones");
        assert_eq!(json["groups"][0]["items"][0]["id"], "note:C");
    }
}
