//! Graphe des relations musicales : ce qui relie notes, gammes, accords,
//! tonalités et progressions.
//!
//! Le graphe n'est pas stocké : [`edges`] calcule à la demande les relations
//! d'un nœud. [`Graph::around`] en déduit un voisinage pour l'affichage.

use std::collections::HashMap;
use std::fmt;

use crate::chord::{Chord, ChordQuality};
use crate::harmony::{CommonProgression, RomanNumeral};
use crate::interval::Interval;
use crate::interval::short::*;
use crate::key::{Key, Mode};
use crate::pitch::{Note, PitchClass, Spelling};
use crate::scale::{Scale, ScaleType};

/// Qualités d'accords parcourues par défaut dans le graphe.
pub const EXPLORER_CHORDS: &[ChordQuality] = &[
    ChordQuality::Major,
    ChordQuality::Minor,
    ChordQuality::Diminished,
    ChordQuality::Augmented,
    ChordQuality::Dominant7,
    ChordQuality::Major7,
    ChordQuality::Minor7,
];

const INTERVALS_FROM_A_NOTE: [Interval; 11] = [m2, M2, m3, M3, P4, A4, P5, m6, M6, m7, M7];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(rename_all = "snake_case"))]
pub enum Node {
    Note(Note),
    Scale(Scale),
    Chord(Chord),
    Key(Key),
    /// Une progression usuelle jouée dans une tonalité.
    Progression { key: Key, id: &'static str },
}

/// Nature du lien entre un nœud et sa cible.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(rename_all = "snake_case"))]
pub enum Relation {
    // Note → note
    /// Même son, autre nom.
    Enharmonic,
    /// Un demi-ton au-dessus ou au-dessous.
    ChromaticNeighbor,
    /// La cible est cet intervalle au-dessus.
    IntervalAbove(Interval),
    // Note → tonalité, gamme, accord
    /// La note est ce degré (1 à 7) de la tonalité.
    DegreeOfKey(u8),
    /// La note est la tonique de ce mode.
    TonicOfMode,
    /// La note est la tonique de cette gamme (hors modes de la gamme majeure).
    TonicOfScale,
    /// La note tient ce rôle dans l'accord (fondamentale = `P1`, tierce…).
    ToneOfChord(Interval),
    // Gamme →
    /// La cible est ce degré de la gamme.
    ScaleDegree(u8),
    /// Accord construit sur ce degré.
    HarmonizedChord(u8),
    /// Mode partageant les mêmes notes.
    RelativeMode,
    KeyOfScale,
    // Accord →
    ChordTone(Interval),
    /// Renversement numéro n.
    Inversion(u8),
    RootPosition,
    /// L'accord est ce degré de la tonalité.
    DiatonicIn(RomanNumeral),
    // Tonalité →
    ScaleOfKey,
    DiatonicChord(RomanNumeral),
    RelativeKey,
    ParallelKey,
    DominantKey,
    SubdominantKey,
    CommonProgression,
    // Progression →
    /// Accord à cette position (à partir de 0).
    ProgressionStep(u8),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Edge {
    pub relation: Relation,
    pub target: Node,
}

/// Choisit l'orthographe d'une fondamentale ou d'une tonique.
///
/// Ordre de préférence : celle dont les notes contiennent `wanted` écrite à
/// l'identique ; puis celle qui demande le moins d'altérations ; à égalité,
/// les bémols pour les structures mineures et les dièses pour les autres
/// (Mi♭ mineur, Fa♯ majeur : l'usage courant).
fn spell(
    pc: PitchClass,
    wanted: Option<Note>,
    minor_like: bool,
    build: impl Fn(Note) -> Vec<Note>,
) -> Note {
    let sharp = Note::from_pitch_class(pc, Spelling::Sharps);
    let flat = Note::from_pitch_class(pc, Spelling::Flats);
    if sharp == flat {
        return sharp;
    }
    let score = |root: Note| {
        let notes = build(root);
        let exact = wanted.is_some_and(|w| notes.contains(&w));
        let cost: u32 = notes.iter().map(|n| n.accidental.unsigned_abs() as u32).sum();
        (!exact, cost)
    };
    match score(sharp).cmp(&score(flat)) {
        std::cmp::Ordering::Less => sharp,
        std::cmp::Ordering::Greater => flat,
        std::cmp::Ordering::Equal if minor_like => flat,
        std::cmp::Ordering::Equal => sharp,
    }
}

/// Tonique usuelle d'une gamme pour une classe de hauteur : l'orthographe qui
/// demande le moins d'altérations (Ré♭ majeur plutôt que Do♯ majeur).
pub fn conventional_tonic(pc: PitchClass, kind: ScaleType) -> Note {
    let minor_like = kind.intervals().contains(&m3);
    spell(pc, None, minor_like, |t| Scale::new(t, kind).notes())
}

/// Fondamentale usuelle d'un accord pour une classe de hauteur.
pub fn conventional_root(pc: PitchClass, quality: ChordQuality) -> Note {
    spell(pc, None, quality.has_minor_third(), |r| {
        Chord::new(r, quality).notes()
    })
}

/// Les douze classes de hauteur en partant de celle de `note`.
fn pitch_classes_from(note: Note) -> impl Iterator<Item = PitchClass> {
    let start = note.pitch_class().value() as i32;
    (0..12).map(move |offset| PitchClass::new(start + offset))
}

/// Gammes des types demandés contenant la note, avec le degré qu'elle y occupe
/// (1 = tonique). L'appartenance s'entend à l'enharmonie près.
pub fn scales_containing(note: Note, kinds: &[ScaleType]) -> Vec<(Scale, usize)> {
    let mut found = Vec::new();
    for &kind in kinds {
        let minor_like = kind.intervals().contains(&m3);
        for pc in pitch_classes_from(note) {
            let tonic = spell(pc, Some(note), minor_like, |t| Scale::new(t, kind).notes());
            let scale = Scale::new(tonic, kind);
            if let Some(degree) = scale.degree_of(note) {
                found.push((scale, degree));
            }
        }
    }
    found
}

/// Accords des qualités demandées contenant la note, avec le rôle qu'elle y
/// tient (intervalle depuis la fondamentale).
pub fn chords_containing(note: Note, qualities: &[ChordQuality]) -> Vec<(Chord, Interval)> {
    let mut found = Vec::new();
    for &quality in qualities {
        for pc in pitch_classes_from(note) {
            let root = spell(pc, Some(note), quality.has_minor_third(), |r| {
                Chord::new(r, quality).notes()
            });
            let chord = Chord::new(root, quality);
            let position = chord
                .notes()
                .iter()
                .position(|n| n.pitch_class() == note.pitch_class());
            if let Some(index) = position {
                found.push((chord, quality.intervals()[index]));
            }
        }
    }
    found
}

/// Tonalités majeures et mineures dont l'accord est un degré (triade ou
/// accord de septième diatonique), avec ce degré. La basse est ignorée.
pub fn keys_containing_chord(chord: &Chord) -> Vec<(Key, RomanNumeral)> {
    let mut found = Vec::new();
    for mode in [Mode::Major, Mode::Minor] {
        for pc in pitch_classes_from(chord.root) {
            let tonic = spell(pc, Some(chord.root), mode == Mode::Minor, |t| {
                Key { tonic: t, mode }.scale().notes()
            });
            let key = Key { tonic, mode };
            let diatonic = key
                .diatonic_triads()
                .into_iter()
                .chain(key.diatonic_sevenths())
                .any(|d| d.root == chord.root && d.quality == chord.quality);
            if diatonic && let Some(numeral) = RomanNumeral::of(chord, &key) {
                found.push((key, numeral));
            }
        }
    }
    found
}

fn note_edges(note: Note, out: &mut Vec<Edge>) {
    let mut push = |relation, target| out.push(Edge { relation, target });
    let pc = note.pitch_class();
    for spelling in [Spelling::Sharps, Spelling::Flats] {
        let other = Note::from_pitch_class(pc, spelling);
        if other != note {
            push(Relation::Enharmonic, Node::Note(other));
            if spelling == Spelling::Sharps
                && other == Note::from_pitch_class(pc, Spelling::Flats)
            {
                break;
            }
        }
    }
    let below = Note::from_pitch_class(PitchClass::new(pc.value() as i32 - 1), Spelling::Flats);
    let above = Note::from_pitch_class(PitchClass::new(pc.value() as i32 + 1), Spelling::Sharps);
    push(Relation::ChromaticNeighbor, Node::Note(below));
    push(Relation::ChromaticNeighbor, Node::Note(above));
    for interval in INTERVALS_FROM_A_NOTE {
        push(Relation::IntervalAbove(interval), Node::Note(note.up(interval)));
    }
    for (scale, degree) in scales_containing(note, &[ScaleType::Major, ScaleType::NaturalMinor]) {
        let key = match scale.kind {
            ScaleType::Major => Key::major(scale.tonic),
            _ => Key::minor(scale.tonic),
        };
        push(Relation::DegreeOfKey(degree as u8), Node::Key(key));
    }
    for kind in ScaleType::DIATONIC_MODES {
        push(Relation::TonicOfMode, Node::Scale(Scale::new(note, kind)));
    }
    for &kind in ScaleType::ALL {
        if kind != ScaleType::Chromatic && !ScaleType::DIATONIC_MODES.contains(&kind) {
            push(Relation::TonicOfScale, Node::Scale(Scale::new(note, kind)));
        }
    }
    for (chord, role) in chords_containing(note, EXPLORER_CHORDS) {
        push(Relation::ToneOfChord(role), Node::Chord(chord));
    }
}

fn scale_edges(scale: Scale, out: &mut Vec<Edge>) {
    let mut push = |relation, target| out.push(Edge { relation, target });
    for (index, note) in scale.notes().into_iter().enumerate() {
        push(Relation::ScaleDegree(index as u8 + 1), Node::Note(note));
    }
    if let Ok(chords) = scale.harmonize(false) {
        for (index, chord) in chords.into_iter().enumerate() {
            push(Relation::HarmonizedChord(index as u8 + 1), Node::Chord(chord));
        }
    }
    for mode in scale.modes() {
        if mode != scale {
            push(Relation::RelativeMode, Node::Scale(mode));
        }
    }
    match scale.kind {
        ScaleType::Major => push(Relation::KeyOfScale, Node::Key(Key::major(scale.tonic))),
        ScaleType::NaturalMinor => push(Relation::KeyOfScale, Node::Key(Key::minor(scale.tonic))),
        _ => {}
    }
}

fn chord_edges(chord: Chord, out: &mut Vec<Edge>) {
    let mut push = |relation, target| out.push(Edge { relation, target });
    let notes = chord.notes();
    for (note, &interval) in notes.iter().zip(chord.quality.intervals()) {
        push(Relation::ChordTone(interval), Node::Note(*note));
    }
    if chord.bass.is_some() {
        let root_position = Chord::new(chord.root, chord.quality);
        push(Relation::RootPosition, Node::Chord(root_position));
    } else {
        for n in 1..notes.len() {
            if let Some(inverted) = chord.inverted(n) {
                push(Relation::Inversion(n as u8), Node::Chord(inverted));
            }
        }
    }
    for (key, numeral) in keys_containing_chord(&chord) {
        push(Relation::DiatonicIn(numeral), Node::Key(key));
    }
}

fn key_edges(key: Key, out: &mut Vec<Edge>) {
    let mut push = |relation, target| out.push(Edge { relation, target });
    push(Relation::ScaleOfKey, Node::Scale(key.scale()));
    for chord in key.diatonic_triads() {
        if let Some(numeral) = RomanNumeral::of(&chord, &key) {
            push(Relation::DiatonicChord(numeral), Node::Chord(chord));
        }
    }
    push(Relation::RelativeKey, Node::Key(key.relative()));
    push(Relation::ParallelKey, Node::Key(key.parallel()));
    push(Relation::DominantKey, Node::Key(key.dominant()));
    push(Relation::SubdominantKey, Node::Key(key.subdominant()));
    for progression in CommonProgression::ALL {
        if progression.mode == key.mode {
            let target = Node::Progression {
                key,
                id: progression.id,
            };
            push(Relation::CommonProgression, target);
        }
    }
}

/// Toutes les relations partant d'un nœud.
pub fn edges(node: &Node) -> Vec<Edge> {
    let mut out = Vec::new();
    match *node {
        Node::Note(note) => note_edges(note, &mut out),
        Node::Scale(scale) => scale_edges(scale, &mut out),
        Node::Chord(chord) => chord_edges(chord, &mut out),
        Node::Key(key) => key_edges(key, &mut out),
        Node::Progression { key, id } => {
            if let Some(progression) = CommonProgression::by_id(id) {
                let chords = progression.progression().resolve(&key);
                for (index, chord) in chords.into_iter().enumerate() {
                    out.push(Edge {
                        relation: Relation::ProgressionStep(index as u8),
                        target: Node::Chord(chord),
                    });
                }
            }
        }
    }
    out
}

fn mode_id(mode: Mode) -> &'static str {
    match mode {
        Mode::Major => "major",
        Mode::Minor => "minor",
    }
}

fn parse_mode(s: &str) -> Option<Mode> {
    match s {
        "major" => Some(Mode::Major),
        "minor" => Some(Mode::Minor),
        _ => None,
    }
}

impl Node {
    /// Identifiant stable, utilisable dans une URL ou comme clé :
    /// `note:C#`, `scale:D:dorian`, `chord:Am7/G`, `key:A:minor`,
    /// `progression:pop:C:major`.
    pub fn id(&self) -> String {
        self.to_string()
    }

    /// Inverse de [`Node::id`].
    pub fn from_id(id: &str) -> Option<Node> {
        let (kind, rest) = id.split_once(':')?;
        match kind {
            "note" => rest.parse().ok().map(Node::Note),
            "chord" => rest.parse().ok().map(Node::Chord),
            "scale" => {
                let (tonic, kind) = rest.split_once(':')?;
                Some(Node::Scale(Scale::new(
                    tonic.parse().ok()?,
                    ScaleType::from_id(kind)?,
                )))
            }
            "key" => {
                let (tonic, mode) = rest.split_once(':')?;
                Some(Node::Key(Key {
                    tonic: tonic.parse().ok()?,
                    mode: parse_mode(mode)?,
                }))
            }
            "progression" => {
                let mut parts = rest.split(':');
                let progression = CommonProgression::by_id(parts.next()?)?;
                let tonic = parts.next()?.parse().ok()?;
                let mode = parse_mode(parts.next()?)?;
                parts.next().is_none().then_some(Node::Progression {
                    key: Key { tonic, mode },
                    id: progression.id,
                })
            }
            _ => None,
        }
    }
}

impl fmt::Display for Node {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Node::Note(note) => write!(f, "note:{note}"),
            Node::Scale(scale) => write!(f, "scale:{}:{}", scale.tonic, scale.kind.id()),
            Node::Chord(chord) => write!(f, "chord:{chord}"),
            Node::Key(key) => write!(f, "key:{}:{}", key.tonic, mode_id(key.mode)),
            Node::Progression { key, id } => {
                write!(f, "progression:{id}:{}:{}", key.tonic, mode_id(key.mode))
            }
        }
    }
}

/// Lien d'un [`Graph`] : indices dans `Graph::nodes`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Link {
    pub source: usize,
    pub target: usize,
    pub relation: Relation,
}

/// Portion du graphe musical, prête à être affichée.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Graph {
    /// Nœuds sans doublon ; le premier est le centre.
    pub nodes: Vec<Node>,
    pub links: Vec<Link>,
}

impl Graph {
    /// Voisinage d'un nœud : tout ce qu'on atteint en `depth` relations au
    /// plus. `depth` 1 donne le nœud et ses relations directes.
    ///
    /// La taille croît vite (une note a une soixantaine de relations) :
    /// l'interface demande 1, rarement 2.
    pub fn around(center: Node, depth: u8) -> Graph {
        let mut nodes = vec![center];
        let mut index: HashMap<Node, usize> = HashMap::from([(center, 0)]);
        let mut links = Vec::new();
        let mut frontier = vec![0usize];
        for _ in 0..depth {
            let mut next = Vec::new();
            for source in frontier {
                for edge in edges(&nodes[source]) {
                    let target = *index.entry(edge.target).or_insert_with(|| {
                        nodes.push(edge.target);
                        next.push(nodes.len() - 1);
                        nodes.len() - 1
                    });
                    links.push(Link {
                        source,
                        target,
                        relation: edge.relation,
                    });
                }
            }
            frontier = next;
        }
        Graph { nodes, links }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str) -> Node {
        Node::from_id(id).unwrap_or_else(|| panic!("identifiant invalide : {id}"))
    }

    /// Identifiants des cibles reliées par une relation satisfaisant `filter`.
    fn targets(id: &str, filter: impl Fn(&Relation) -> bool) -> Vec<String> {
        edges(&node(id))
            .into_iter()
            .filter(|e| filter(&e.relation))
            .map(|e| e.target.id())
            .collect()
    }

    #[test]
    fn keys_containing_c() {
        let keys = targets("note:C", |r| matches!(r, Relation::DegreeOfKey(_)));
        assert_eq!(
            keys,
            [
                "key:C:major",
                "key:Db:major",
                "key:Eb:major",
                "key:F:major",
                "key:G:major",
                "key:Ab:major",
                "key:Bb:major",
                "key:C:minor",
                "key:D:minor",
                "key:E:minor",
                "key:F:minor",
                "key:G:minor",
                "key:A:minor",
                "key:Bb:minor",
            ]
        );
    }

    #[test]
    fn chords_containing_c_with_its_role() {
        let chords = chords_containing("C".parse().unwrap(), &[ChordQuality::Major]);
        let described: Vec<String> = chords.iter().map(|(c, role)| format!("{c}:{role}")).collect();
        // C est la fondamentale de C, la quinte de F et la tierce de Ab.
        assert_eq!(described, ["C:P1", "F:P5", "Ab:M3"]);

        let all = targets("note:C", |r| matches!(r, Relation::ToneOfChord(_)));
        // 3 par triade (×4 qualités) + 4 par accord de septième (×3 qualités).
        assert_eq!(all.len(), 24);
        for id in ["chord:Am", "chord:D7", "chord:Dbmaj7", "chord:F#dim", "chord:Dm7"] {
            assert!(all.contains(&id.to_string()), "{id} manquant dans {all:?}");
        }
    }

    #[test]
    fn spelling_follows_the_queried_note() {
        // Avec Do#, l'accord de La est majeur (A C# E), pas « Bbb ».
        let sharp = chords_containing("C#".parse().unwrap(), &[ChordQuality::Major]);
        let names: Vec<String> = sharp.iter().map(|(c, _)| c.to_string()).collect();
        assert_eq!(names, ["C#", "F#", "A"]);
        // Avec Ré♭, les mêmes sons s'écrivent en bémols quand c'est possible.
        let flat = chords_containing("Db".parse().unwrap(), &[ChordQuality::Major]);
        let names: Vec<String> = flat.iter().map(|(c, _)| c.to_string()).collect();
        assert_eq!(names, ["Db", "Gb", "A"]);
    }

    #[test]
    fn note_neighbors_intervals_and_modes() {
        assert_eq!(
            targets("note:C", |r| *r == Relation::ChromaticNeighbor),
            ["note:B", "note:C#"]
        );
        assert_eq!(
            targets("note:C#", |r| *r == Relation::Enharmonic),
            ["note:Db"]
        );
        assert!(targets("note:C", |r| *r == Relation::Enharmonic).is_empty());
        assert_eq!(
            targets("note:C", |r| *r == Relation::IntervalAbove(P5)),
            ["note:G"]
        );
        assert_eq!(targets("note:C", |r| matches!(r, Relation::IntervalAbove(_))).len(), 11);
        let modes = targets("note:C", |r| *r == Relation::TonicOfMode);
        assert_eq!(modes.len(), 7);
        assert!(modes.contains(&"scale:C:lydian".to_string()));
        let others = targets("note:A", |r| *r == Relation::TonicOfScale);
        assert_eq!(others.len(), 8);
        assert!(others.contains(&"scale:A:blues".to_string()));
        assert!(others.contains(&"scale:A:harmonic_minor".to_string()));
        assert!(!others.iter().any(|id| id.ends_with(":chromatic") || id.ends_with(":dorian")));
    }

    #[test]
    fn conventional_spellings() {
        let tonic = |pc: i32, kind| conventional_tonic(PitchClass::new(pc), kind).to_string();
        assert_eq!(tonic(1, ScaleType::Major), "Db");
        assert_eq!(tonic(6, ScaleType::Major), "F#");
        assert_eq!(tonic(8, ScaleType::NaturalMinor), "G#");
        assert_eq!(tonic(3, ScaleType::NaturalMinor), "Eb");
        assert_eq!(tonic(10, ScaleType::Blues), "Bb");
        let root = |pc: i32, quality| conventional_root(PitchClass::new(pc), quality).to_string();
        assert_eq!(root(1, ChordQuality::Major), "Db");
        assert_eq!(root(1, ChordQuality::Minor), "C#");
        assert_eq!(root(10, ChordQuality::Dominant7), "Bb");
    }

    #[test]
    fn scale_relations() {
        assert_eq!(
            targets("scale:D:dorian", |r| matches!(r, Relation::ScaleDegree(_))),
            ["note:D", "note:E", "note:F", "note:G", "note:A", "note:B", "note:C"]
        );
        assert_eq!(
            targets("scale:D:dorian", |r| matches!(r, Relation::HarmonizedChord(_))),
            [
                "chord:Dm",
                "chord:Em",
                "chord:F",
                "chord:G",
                "chord:Am",
                "chord:Bdim",
                "chord:C"
            ]
        );
        let modes = targets("scale:D:dorian", |r| *r == Relation::RelativeMode);
        assert_eq!(modes.len(), 6);
        assert!(modes.contains(&"scale:C:major".to_string()));
        assert_eq!(
            targets("scale:A:natural_minor", |r| *r == Relation::KeyOfScale),
            ["key:A:minor"]
        );
        // Une gamme pentatonique ne s'harmonise pas par tierces.
        assert!(targets("scale:A:minor_pentatonic", |r| matches!(r, Relation::HarmonizedChord(_)))
            .is_empty());
    }

    #[test]
    fn chord_relations() {
        assert_eq!(
            targets("chord:Am", |r| matches!(r, Relation::ChordTone(_))),
            ["note:A", "note:C", "note:E"]
        );
        assert_eq!(
            targets("chord:Am", |r| matches!(r, Relation::Inversion(_))),
            ["chord:Am/C", "chord:Am/E"]
        );
        assert_eq!(
            targets("chord:Am/C", |r| *r == Relation::RootPosition),
            ["chord:Am"]
        );

        let keys: Vec<String> = keys_containing_chord(&"Am".parse().unwrap())
            .iter()
            .map(|(key, numeral)| format!("{numeral} in {key}"))
            .collect();
        assert_eq!(
            keys,
            [
                "vi in C major",
                "iii in F major",
                "ii in G major",
                "i in A minor",
                "v in D minor",
                "iv in E minor"
            ]
        );
        // G7 n'est diatonique qu'en Do majeur et dans son relatif.
        let g7: Vec<String> = keys_containing_chord(&"G7".parse().unwrap())
            .iter()
            .map(|(key, numeral)| format!("{numeral} in {key}"))
            .collect();
        assert_eq!(g7, ["V7 in C major", "VII7 in A minor"]);
    }

    #[test]
    fn enharmonic_chords_find_keys_in_their_own_spelling() {
        let gb: Vec<String> = keys_containing_chord(&"Gb".parse().unwrap())
            .iter()
            .map(|(key, _)| key.to_string())
            .collect();
        assert!(gb.contains(&"Gb major".to_string()), "{gb:?}");
        assert!(gb.contains(&"Db major".to_string()), "{gb:?}");
        let fs: Vec<String> = keys_containing_chord(&"F#".parse().unwrap())
            .iter()
            .map(|(key, _)| key.to_string())
            .collect();
        assert!(fs.contains(&"F# major".to_string()), "{fs:?}");
        assert!(fs.contains(&"B major".to_string()), "{fs:?}");
    }

    #[test]
    fn key_relations() {
        assert_eq!(targets("key:C:major", |r| *r == Relation::RelativeKey), ["key:A:minor"]);
        assert_eq!(targets("key:C:major", |r| *r == Relation::DominantKey), ["key:G:major"]);
        assert_eq!(
            targets("key:C:major", |r| matches!(r, Relation::DiatonicChord(_))),
            [
                "chord:C",
                "chord:Dm",
                "chord:Em",
                "chord:F",
                "chord:G",
                "chord:Am",
                "chord:Bdim"
            ]
        );
        let progressions = targets("key:C:major", |r| *r == Relation::CommonProgression);
        assert!(progressions.contains(&"progression:pop:C:major".to_string()));
        assert!(!progressions.iter().any(|p| p.contains("andalusian")));
        assert_eq!(
            targets("progression:pop:C:major", |_| true),
            ["chord:C", "chord:G", "chord:Am", "chord:F"]
        );
        assert_eq!(
            targets("progression:andalusian:A:minor", |_| true),
            ["chord:Am", "chord:G", "chord:F", "chord:E"]
        );
    }

    #[test]
    fn ids_round_trip_across_the_whole_neighborhood() {
        let graph = Graph::around(node("note:C"), 2);
        assert!(graph.nodes.len() > 100);
        for n in &graph.nodes {
            assert_eq!(Node::from_id(&n.id()), Some(*n), "{}", n.id());
        }
        for id in ["", "note", "note:H", "scale:C", "scale:C:nope", "key:C:dorian",
                   "progression:nope:C:major", "progression:pop:C:major:x", "thing:C"] {
            assert_eq!(Node::from_id(id), None, "{id:?}");
        }
    }

    #[test]
    fn neighborhood_graph_is_well_formed() {
        let center = node("key:C:major");
        assert_eq!(Graph::around(center, 0).nodes, [center]);

        let graph = Graph::around(center, 1);
        assert_eq!(graph.nodes[0], center);
        assert_eq!(graph.links.len(), edges(&center).len());
        assert!(graph.links.iter().all(|l| l.source == 0 && l.target < graph.nodes.len()));
        let unique: std::collections::HashSet<&Node> = graph.nodes.iter().collect();
        assert_eq!(unique.len(), graph.nodes.len());

        let deeper = Graph::around(center, 2);
        assert!(deeper.nodes.len() > graph.nodes.len());
        assert!(deeper.links.iter().all(|l| l.source < deeper.nodes.len()
            && l.target < deeper.nodes.len()));
    }

    #[test]
    fn every_edge_of_every_reachable_node_is_musically_consistent() {
        let graph = Graph::around(node("note:F#"), 2);
        for link in &graph.links {
            let (source, target) = (graph.nodes[link.source], graph.nodes[link.target]);
            match (source, link.relation, target) {
                (Node::Note(n), Relation::ToneOfChord(role), Node::Chord(c)) => {
                    assert_eq!(c.root.up(role).pitch_class(), n.pitch_class(), "{c}");
                }
                (Node::Note(n), Relation::DegreeOfKey(d), Node::Key(k)) => {
                    assert_eq!(k.scale().degree_of(n), Some(d as usize), "{k}");
                }
                (Node::Chord(c), Relation::DiatonicIn(numeral), Node::Key(k)) => {
                    assert_eq!(numeral.resolve(&k).root, c.root, "{c} in {k}");
                    assert_eq!(numeral.quality, c.quality);
                }
                (Node::Key(k), Relation::DiatonicChord(numeral), Node::Chord(c)) => {
                    assert_eq!(numeral.resolve(&k), c);
                }
                (Node::Note(a), Relation::Enharmonic, Node::Note(b)) => {
                    assert!(a.is_enharmonic_with(b) && a != b);
                }
                _ => {}
            }
        }
    }
}
