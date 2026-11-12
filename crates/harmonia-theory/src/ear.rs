//! Entraînement de l'oreille : exercices, niveaux, questions, répétition
//! espacée.
//!
//! Tout est calculé ici, à partir de la théorie : l'interface ne fait que
//! jouer les notes et afficher les choix. Les questions sont tirées d'une
//! graine (générateur SplitMix64) : la même graine donne la même question,
//! ce qui rend l'ensemble testable.
//!
//! # Exercices
//!
//! | Exercice | Ce qu'on entend | Ce qu'on reconnaît |
//! |---|---|---|
//! | Intervalles | deux notes, successives ou simultanées | l'intervalle |
//! | Accords | un accord plaqué | sa qualité |
//! | Degrés | une cadence I-IV-V-I, puis une note | son degré dans la tonalité |
//! | Progressions | une suite d'accords | la progression |
//!
//! # Répétition espacée
//!
//! Chaque élément (« la quinte ascendante », « l'accord diminué »…) a sa
//! fiche. Une bonne réponse espace la prochaine apparition (1 min, 10 min,
//! 1 jour, puis × facilité) ; une erreur la ramène dans 30 secondes et baisse
//! la facilité. Le tirage privilégie les fiches échues, puis les éléments
//! jamais vus, puis les plus souvent manqués.

use crate::{Chord, ChordQuality, CommonProgression, Interval, Key, Mode, Note, Pitch, PitchClass, Progression, Spelling};

/// Générateur pseudo-aléatoire SplitMix64 : petit, rapide, reproductible.
#[derive(Clone, Debug)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        Rng(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Entier dans `0..n` (`n > 0`).
    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n as u64) as usize
    }

    /// Réel dans `[0, 1)`.
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Exercise {
    Intervals,
    Chords,
    Degrees,
    Progressions,
}

impl Exercise {
    pub const ALL: [Exercise; 4] = [Exercise::Intervals, Exercise::Chords, Exercise::Degrees, Exercise::Progressions];

    pub fn id(self) -> &'static str {
        match self {
            Exercise::Intervals => "intervals",
            Exercise::Chords => "chords",
            Exercise::Degrees => "degrees",
            Exercise::Progressions => "progressions",
        }
    }

    pub fn from_id(id: &str) -> Option<Exercise> {
        Exercise::ALL.into_iter().find(|exercise| exercise.id() == id)
    }

    /// Nombre de niveaux de l'exercice.
    pub fn levels(self) -> usize {
        match self {
            Exercise::Intervals => 6,
            Exercise::Chords => 5,
            Exercise::Degrees => 3,
            Exercise::Progressions => 3,
        }
    }
}

/// Façon de jouer une question (mêmes modes que la lecture des pages).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Playing {
    /// Notes l'une après l'autre.
    Melodic,
    /// Notes ensemble.
    Harmonic,
    /// Suite d'accords (ou de notes) à intervalle régulier.
    Sequence,
}

/// Une réponse possible. `answer` est son identifiant, `symbol` son écriture
/// musicale (« P5 », « dim », « IV »…), traduite par l'interface.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Choice {
    pub answer: String,
    pub symbol: String,
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Question {
    pub exercise: Exercise,
    pub level: usize,
    /// Fiche de répétition concernée (`interval:P5:asc`, `chord:Diminished`…).
    pub item: String,
    pub playing: Playing,
    /// Pas à jouer : chaque pas est une liste de notes MIDI ; un pas vide est un silence.
    pub steps: Vec<Vec<i32>>,
    pub choices: Vec<Choice>,
    /// Identifiant de la bonne réponse, parmi `choices`.
    pub answer: String,
    /// Tonalité de référence, pour les exercices qui en ont une.
    pub key: Option<Key>,
    /// Ce qui a été joué, en clair (« C4 → G4 », « F#dim »…), révélé après la réponse.
    pub reveal: String,
}

// ------------------------------------------------------------------ niveaux

const M2: Interval = Interval::MAJOR_SECOND;

fn interval_set(level: usize) -> Vec<Interval> {
    use Interval as I;
    let all = vec![
        I::MINOR_SECOND,
        M2,
        I::MINOR_THIRD,
        I::MAJOR_THIRD,
        I::PERFECT_FOURTH,
        I::AUGMENTED_FOURTH,
        I::PERFECT_FIFTH,
        I::MINOR_SIXTH,
        I::MAJOR_SIXTH,
        I::MINOR_SEVENTH,
        I::MAJOR_SEVENTH,
        I::OCTAVE,
    ];
    match level {
        1 => vec![I::MAJOR_THIRD, I::PERFECT_FIFTH, I::OCTAVE],
        2 => vec![I::MINOR_THIRD, I::MAJOR_THIRD, I::PERFECT_FOURTH, I::PERFECT_FIFTH, I::MAJOR_SIXTH, I::OCTAVE],
        3 => vec![
            I::MINOR_SECOND,
            M2,
            I::MINOR_THIRD,
            I::MAJOR_THIRD,
            I::PERFECT_FOURTH,
            I::PERFECT_FIFTH,
            I::MINOR_SIXTH,
            I::MAJOR_SIXTH,
            I::OCTAVE,
        ],
        _ => all,
    }
}

/// Direction des intervalles : niveaux 1 à 4 ascendants, 5 descendants, 6 simultanés.
fn interval_direction(level: usize) -> &'static str {
    match level {
        5 => "desc",
        6 => "harm",
        _ => "asc",
    }
}

fn chord_set(level: usize) -> Vec<ChordQuality> {
    use ChordQuality::*;
    match level {
        1 => vec![Major, Minor],
        2 => vec![Major, Minor, Diminished, Augmented],
        3 => vec![Major, Minor, Dominant7, Major7, Minor7],
        4 => vec![Dominant7, Major7, Minor7, HalfDiminished7, Diminished7, MinorMajor7],
        _ => vec![Major, Sus2, Sus4, Major6, Minor6, Add9],
    }
}

/// Degrés entendus et mode : niveau 1 (1, 3, 5 en majeur), 2 (les 7 en majeur), 3 (les 7 en mineur).
fn degree_set(level: usize) -> (Vec<usize>, Mode) {
    match level {
        1 => (vec![1, 3, 5], Mode::Major),
        2 => ((1..=7).collect(), Mode::Major),
        _ => ((1..=7).collect(), Mode::Minor),
    }
}

fn progression_set(level: usize) -> Vec<&'static str> {
    match level {
        1 => vec!["three-chord", "pop", "fifties"],
        2 => vec!["pop", "fifties", "six-four-one-five", "circle", "two-five-one"],
        _ => vec!["andalusian", "aeolian", "minor-pop", "minor-three-chord", "minor-two-five-one"],
    }
}

fn quality_id(quality: ChordQuality) -> String {
    format!("{quality:?}")
}

fn mode_id(mode: Mode) -> &'static str {
    match mode {
        Mode::Major => "major",
        Mode::Minor => "minor",
    }
}

/// Fiches de répétition d'un niveau.
pub fn level_items(exercise: Exercise, level: usize) -> Vec<String> {
    match exercise {
        Exercise::Intervals => {
            let direction = interval_direction(level);
            interval_set(level).iter().map(|i| format!("interval:{i}:{direction}")).collect()
        }
        Exercise::Chords => chord_set(level).into_iter().map(|q| format!("chord:{}", quality_id(q))).collect(),
        Exercise::Degrees => {
            let (degrees, mode) = degree_set(level);
            degrees.iter().map(|d| format!("degree:{d}:{}", mode_id(mode))).collect()
        }
        Exercise::Progressions => progression_set(level).iter().map(|id| format!("progression:{id}")).collect(),
    }
}

// ------------------------------------------------------------------ sons

/// Tonalité tirée au hasard, orthographe usuelle (celle du cercle des quintes).
fn random_key(rng: &mut Rng, mode: Mode) -> Key {
    let majors: Vec<Key> = Key::circle_of_fifths().into_iter().filter(|key| key.mode == Mode::Major).collect();
    let major = majors[rng.below(majors.len())];
    if mode == Mode::Minor { major.relative() } else { major }
}

/// Voicing serré de l'accord, transposé par octaves pour que sa basse tombe
/// entre `low` et `low + 11`.
fn placed(chord: &Chord, low: i32) -> Vec<i32> {
    let mut notes: Vec<i32> = chord.voicing(3).iter().map(|p| p.midi()).collect();
    while notes[0] < low {
        notes.iter_mut().for_each(|n| *n += 12);
    }
    while notes[0] > low + 11 {
        notes.iter_mut().for_each(|n| *n -= 12);
    }
    notes
}

fn note_name(midi: i32) -> String {
    Pitch::from_midi(midi, Spelling::Sharps).to_string()
}

/// Génère une question du niveau. `item` impose l'élément interrogé (choisi
/// par [`pick`]) ; sans lui, il est tiré au hasard.
pub fn question(exercise: Exercise, level: usize, item: Option<&str>, seed: u64) -> Option<Question> {
    if level == 0 || level > exercise.levels() {
        return None;
    }
    let mut rng = Rng::new(seed);
    let items = level_items(exercise, level);
    let item = match item {
        Some(chosen) if items.iter().any(|i| i == chosen) => chosen.to_string(),
        Some(_) => return None,
        None => items[rng.below(items.len())].clone(),
    };
    let parts: Vec<&str> = item.split(':').collect();

    Some(match exercise {
        Exercise::Intervals => {
            let set = interval_set(level);
            let interval = set.iter().copied().find(|i| i.to_string() == parts[1])?;
            let direction = parts[2];
            let semitones = interval.semitones();
            // Note de départ : intervalle entier entre Mi3 (52) et Do6 (84).
            let start = if direction == "desc" { 64 + rng.below(13) as i32 } else { 52 + rng.below(13) as i32 };
            let other = if direction == "desc" { start - semitones } else { start + semitones };
            let (steps, playing) = match direction {
                "harm" => (vec![vec![start, other]], Playing::Harmonic),
                _ => (vec![vec![start], vec![other]], Playing::Melodic),
            };
            Question {
                exercise,
                level,
                item: item.clone(),
                playing,
                steps,
                choices: set.iter().map(|i| Choice { answer: i.to_string(), symbol: i.to_string() }).collect(),
                answer: interval.to_string(),
                key: None,
                reveal: format!("{} {} {}", note_name(start), if direction == "harm" { "+" } else { "→" }, note_name(other)),
            }
        }
        Exercise::Chords => {
            let set = chord_set(level);
            let quality = set.iter().copied().find(|q| quality_id(*q) == parts[1])?;
            let root = Note::from_pitch_class(PitchClass::new(rng.below(12) as i32), if rng.below(2) == 0 { Spelling::Sharps } else { Spelling::Flats });
            let chord = Chord::new(root, quality);
            Question {
                exercise,
                level,
                item: item.clone(),
                playing: Playing::Harmonic,
                steps: vec![placed(&chord, 48)],
                choices: set.iter().map(|q| Choice { answer: quality_id(*q), symbol: q.suffix().to_string() }).collect(),
                answer: quality_id(quality),
                key: None,
                reveal: chord.to_string(),
            }
        }
        Exercise::Degrees => {
            let (degrees, mode) = degree_set(level);
            let degree: usize = parts[1].parse().ok()?;
            let key = random_key(&mut rng, mode);
            let cadence = if mode == Mode::Major { "I-IV-V-I" } else { "i-iv-V-i" };
            let chords = cadence.parse::<Progression>().ok()?.resolve(&key);
            let mut steps: Vec<Vec<i32>> = chords.iter().map(|chord| placed(chord, 48)).collect();
            steps.push(Vec::new());
            let scale = key.scale().notes();
            let target = scale[degree - 1];
            let tonic_midi = 60 + key.tonic.pitch_class().value() as i32;
            let tonic_midi = if tonic_midi > 66 { tonic_midi - 12 } else { tonic_midi };
            let midi = tonic_midi + (target.pitch_class().value() as i32 - key.tonic.pitch_class().value() as i32).rem_euclid(12);
            steps.push(vec![midi]);
            Question {
                exercise,
                level,
                item: item.clone(),
                playing: Playing::Sequence,
                steps,
                choices: degrees.iter().map(|d| Choice { answer: d.to_string(), symbol: d.to_string() }).collect(),
                answer: degree.to_string(),
                key: Some(key),
                reveal: format!("{target} en {key}"),
            }
        }
        Exercise::Progressions => {
            let set = progression_set(level);
            let id = set.iter().copied().find(|id| *id == parts[1])?;
            let common = CommonProgression::by_id(id)?;
            let key = random_key(&mut rng, common.mode);
            let chords = common.progression().resolve(&key);
            Question {
                exercise,
                level,
                item: item.clone(),
                playing: Playing::Sequence,
                steps: chords.iter().map(|chord| placed(chord, 48)).collect(),
                choices: set
                    .iter()
                    .filter_map(|id| CommonProgression::by_id(id))
                    .map(|p| Choice { answer: p.id.to_string(), symbol: p.numerals.to_string() })
                    .collect(),
                answer: id.to_string(),
                key: Some(key),
                reveal: chords.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(" "),
            }
        }
    })
}

// ------------------------------------------------------------------ répétition

/// Fiche de répétition d'un élément.
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Card {
    pub item: String,
    /// Facilité (SM-2) : multiplie l'intervalle après chaque réussite.
    pub ease: f64,
    /// Réussites consécutives.
    pub streak: u32,
    pub seen: u32,
    pub correct: u32,
    /// Délai avant la prochaine apparition, en millisecondes.
    pub interval_ms: i64,
    /// Instant (ms depuis l'époque Unix) où la fiche redevient prioritaire.
    pub due_ms: i64,
}

const MINUTE: i64 = 60_000;
const DAY: i64 = 24 * 60 * MINUTE;

impl Card {
    pub fn new(item: &str) -> Card {
        Card { item: item.to_string(), ease: 2.5, streak: 0, seen: 0, correct: 0, interval_ms: 0, due_ms: 0 }
    }

    /// Une fiche est maîtrisée après trois réussites de suite et 80 % de réussite.
    pub fn mastered(&self) -> bool {
        self.streak >= 3 && self.correct * 5 >= self.seen * 4
    }
}

/// Met la fiche à jour après une réponse donnée à l'instant `now_ms`.
pub fn review(card: &Card, correct: bool, now_ms: i64) -> Card {
    let mut next = card.clone();
    next.seen += 1;
    if correct {
        next.correct += 1;
        next.streak += 1;
        next.interval_ms = match next.streak {
            1 => MINUTE,
            2 => 10 * MINUTE,
            3 => DAY,
            _ => (card.interval_ms.max(DAY) as f64 * card.ease) as i64,
        };
        next.ease = (card.ease + 0.05).min(3.0);
    } else {
        next.streak = 0;
        next.interval_ms = 30_000;
        next.ease = (card.ease - 0.2).max(1.3);
    }
    next.due_ms = now_ms + next.interval_ms;
    next
}

/// Choisit l'élément à interroger parmi `items`. `cards` contient les fiches
/// connues ; `last` évite de reposer immédiatement la même question.
pub fn pick(items: &[String], cards: &[Card], now_ms: i64, last: Option<&str>, seed: u64) -> Option<String> {
    let mut rng = Rng::new(seed);
    let candidates: Vec<&String> = if items.len() > 1 { items.iter().filter(|i| Some(i.as_str()) != last).collect() } else { items.iter().collect() };
    if candidates.is_empty() {
        return None;
    }
    let card = |item: &str| cards.iter().find(|c| c.item == item);
    // 1. Fiches échues, la plus en retard d'abord (à peu près).
    let mut due: Vec<(&String, i64)> = candidates.iter().filter_map(|i| card(i).filter(|c| c.seen > 0 && c.due_ms <= now_ms).map(|c| (*i, now_ms - c.due_ms))).collect();
    if !due.is_empty() {
        due.sort_by_key(|(_, late)| -late);
        let top = due.len().min(3);
        return Some(due[rng.below(top)].0.clone());
    }
    // 2. Éléments jamais vus.
    let unseen: Vec<&&String> = candidates.iter().filter(|i| card(i).is_none_or(|c| c.seen == 0)).collect();
    if !unseen.is_empty() {
        return Some((*unseen[rng.below(unseen.len())]).clone());
    }
    // 3. Tirage pondéré par le taux d'erreur.
    let weights: Vec<f64> = candidates
        .iter()
        .map(|i| card(i).map_or(1.0, |c| 1.0 - c.correct as f64 / c.seen.max(1) as f64 + 0.15))
        .collect();
    let total: f64 = weights.iter().sum();
    let mut target = rng.unit() * total;
    for (item, weight) in candidates.iter().zip(&weights) {
        if target < *weight {
            return Some((*item).clone());
        }
        target -= weight;
    }
    candidates.last().map(|i| (*i).clone())
}

/// Nombre d'éléments maîtrisés dans un niveau, et nombre total.
pub fn level_progress(exercise: Exercise, level: usize, cards: &[Card]) -> (usize, usize) {
    let items = level_items(exercise, level);
    let mastered = items.iter().filter(|i| cards.iter().any(|c| &c.item == *i && c.mastered())).count();
    (mastered, items.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_gives_the_same_question() {
        let a = question(Exercise::Intervals, 3, None, 42).unwrap();
        let b = question(Exercise::Intervals, 3, None, 42).unwrap();
        assert_eq!(a, b);
        let others: Vec<String> = (0..20).map(|seed| question(Exercise::Intervals, 3, None, seed).unwrap().item).collect();
        assert!(others.iter().any(|item| item != &others[0]), "le tirage doit varier");
    }

    #[test]
    fn interval_questions_play_the_right_distance() {
        for seed in 0..50 {
            for level in 1..=6 {
                let q = question(Exercise::Intervals, level, None, seed).unwrap();
                let interval: Interval = q.answer.parse().unwrap();
                let notes: Vec<i32> = q.steps.concat();
                assert_eq!((notes[1] - notes[0]).abs(), interval.semitones(), "{q:?}");
                assert!(notes.iter().all(|n| (40..=96).contains(n)));
                assert!(q.choices.iter().any(|c| c.answer == q.answer));
                match level {
                    5 => assert!(notes[1] < notes[0]),
                    6 => assert_eq!(q.playing, Playing::Harmonic),
                    _ => assert!(notes[1] > notes[0]),
                }
            }
        }
    }

    #[test]
    fn chord_questions_play_the_chord_of_the_answer() {
        for seed in 0..60 {
            let q = question(Exercise::Chords, 4, None, seed).unwrap();
            let played: Vec<Note> = q.steps[0].iter().map(|m| Pitch::from_midi(*m, Spelling::Sharps).note).collect();
            let found = Chord::identify(&played);
            assert!(found.iter().any(|c| quality_id(c.quality) == q.answer), "{} → {found:?}", q.reveal);
            assert!((48..=59).contains(&q.steps[0][0]), "basse {}", q.steps[0][0]);
        }
    }

    #[test]
    fn degree_questions_end_on_the_asked_degree() {
        for seed in 0..60 {
            for level in 1..=3 {
                let q = question(Exercise::Degrees, level, None, seed).unwrap();
                let key = q.key.unwrap();
                let degree: usize = q.answer.parse().unwrap();
                let target = *q.steps.last().unwrap().first().unwrap();
                assert_eq!(target.rem_euclid(12) as u8, key.scale().notes()[degree - 1].pitch_class().value(), "{}", q.reveal);
                assert_eq!(q.steps.len(), 6, "cadence de 4 accords, silence, note");
                assert!(q.steps[4].is_empty());
                assert_eq!(key.mode, if level == 3 { Mode::Minor } else { Mode::Major });
            }
        }
    }

    #[test]
    fn progression_questions_play_one_chord_per_numeral() {
        for seed in 0..30 {
            for level in 1..=3 {
                let q = question(Exercise::Progressions, level, None, seed).unwrap();
                let common = CommonProgression::by_id(&q.answer).unwrap();
                assert_eq!(q.steps.len(), common.numerals.split('-').count());
                assert_eq!(q.key.unwrap().mode, common.mode);
            }
        }
    }

    #[test]
    fn every_level_of_every_exercise_produces_questions() {
        for exercise in Exercise::ALL {
            for level in 1..=exercise.levels() {
                for item in level_items(exercise, level) {
                    let q = question(exercise, level, Some(&item), 7).unwrap_or_else(|| panic!("{item}"));
                    assert_eq!(q.item, item);
                    assert!(q.choices.len() >= 2);
                }
            }
            assert!(question(exercise, 0, None, 1).is_none());
            assert!(question(exercise, exercise.levels() + 1, None, 1).is_none());
        }
        assert!(question(Exercise::Chords, 1, Some("chord:Diminished"), 1).is_none(), "élément hors niveau");
    }

    #[test]
    fn review_spaces_successes_and_brings_back_errors() {
        let mut card = Card::new("interval:P5:asc");
        let now = 1_000_000;
        card = review(&card, true, now);
        assert_eq!((card.streak, card.due_ms - now), (1, MINUTE));
        card = review(&card, true, now);
        assert_eq!(card.due_ms - now, 10 * MINUTE);
        card = review(&card, true, now);
        assert_eq!(card.due_ms - now, DAY);
        assert!(card.mastered());
        let later = review(&card, true, now);
        assert!(later.interval_ms > DAY);
        let missed = review(&later, false, now);
        assert_eq!((missed.streak, missed.due_ms - now), (0, 30_000));
        assert!(missed.ease < later.ease && !missed.mastered());
    }

    #[test]
    fn pick_prefers_due_then_unseen_cards_and_avoids_repeats() {
        let items: Vec<String> = level_items(Exercise::Intervals, 1);
        let now = 10 * DAY;
        let mut cards: Vec<Card> = items.iter().map(|i| review(&Card::new(i), true, now - DAY)).collect();
        // Toutes vues, une seule échue.
        cards[0].due_ms = now + DAY;
        cards[1].due_ms = now - 5;
        cards[2].due_ms = now + DAY;
        assert_eq!(pick(&items, &cards, now, None, 3).as_deref(), Some(items[1].as_str()));
        // Aucune échue : jamais la même que la précédente.
        cards[1].due_ms = now + DAY;
        for seed in 0..30 {
            assert_ne!(pick(&items, &cards, now, Some(&items[2]), seed).as_deref(), Some(items[2].as_str()));
        }
        // Un élément jamais vu passe avant les autres.
        let fresh = vec![items[0].clone(), "interval:m3:asc".to_string()];
        assert_eq!(pick(&fresh, &cards, now, None, 9).as_deref(), Some("interval:m3:asc"));
    }

    #[test]
    fn progress_counts_mastered_items() {
        let items = level_items(Exercise::Chords, 1);
        let mut card = Card::new(&items[0]);
        for _ in 0..3 {
            card = review(&card, true, 0);
        }
        assert_eq!(level_progress(Exercise::Chords, 1, &[card]), (1, 2));
    }
}
