//! Tonalité principale et modulations.
//!
//! # Algorithme
//!
//! Le morceau est parcouru par une fenêtre glissante. Sur chaque fenêtre, le
//! chroma cumulé est corrélé aux 24 profils de Krumhansl-Kessler du moteur de
//! théorie ([`harmonia_theory::estimate_key`]). Un lissage de Viterbi choisit
//! ensuite la suite de tonalités la plus vraisemblable, chaque changement
//! coûtant [`Params::change_cost`] : une modulation n'est retenue que si la
//! nouvelle tonalité s'installe durablement.
//!
//! La corrélation seule confond volontiers une tonalité avec sa relative (mêmes
//! notes) ou sa dominante (les harmoniques de chaque note renforcent sa
//! quinte). Chaque segment est donc réexaminé par [`refine`] à la lumière des
//! accords reconnus : le score d'une tonalité y ajoute
//!
//! - la part du temps occupée par des accords dont toutes les notes
//!   appartiennent à la gamme (× 0,4) ;
//! - la part du temps occupée par l'accord de tonique (× 0,3) ;
//! - un bonus si le segment commence (0,1) ou finit (0,1) sur la tonique.
//!
//! # Limites connues
//!
//! - Une tonalité et sa relative restent difficiles à départager quand le
//!   morceau ne s'appuie pas plus sur l'une que sur l'autre.
//! - Les poids ci-dessus ont été réglés sur le corpus synthétique ; ils n'ont
//!   pas été validés sur des enregistrements réels.
//! - Les musiques modales ou sans centre tonal sont ramenées à la tonalité
//!   majeure ou mineure la plus proche.

use harmonia_theory::{Key, Mode, Scale, ScaleType, estimate_key};

use crate::features::Chroma;

#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// Largeur de la fenêtre, en temps (ou en trames si aucun temps n'est suivi).
    pub window: usize,
    /// Pas entre deux fenêtres, dans la même unité.
    pub hop: usize,
    /// Coût d'un changement de tonalité entre deux fenêtres.
    pub change_cost: f64,
}

impl Default for Params {
    fn default() -> Self {
        Params { window: 32, hop: 4, change_cost: 0.6 }
    }
}

/// Une tonalité tenue sur un intervalle de trames.
#[derive(Clone, Debug, PartialEq)]
pub struct KeySegment {
    pub start: usize,
    pub end: usize,
    pub key: Key,
    /// Corrélation de la tonalité avec le chroma du segment, de -1 à 1.
    pub correlation: f64,
    /// Avance du score sur celui de la meilleure autre tonalité.
    pub margin: f64,
    /// Les autres tonalités les mieux notées, avec leur corrélation.
    pub alternatives: Vec<(Key, f64)>,
}

/// Une fenêtre : première trame, trame de fin, corrélations des 24 tonalités.
type Window = (usize, usize, Vec<(Key, f64)>);

/// Corrélations des 24 tonalités, dans un ordre fixe, pour un histogramme.
fn correlations(histogram: &Chroma) -> Option<Vec<(Key, f64)>> {
    let mut estimates = estimate_key(histogram);
    if estimates.is_empty() {
        return None;
    }
    estimates.sort_by_key(|e| (e.key.tonic.pitch_class().value(), e.key.mode as u8));
    Some(estimates.into_iter().map(|e| (e.key, e.correlation)).collect())
}

fn sum(chroma: &[Chroma], weights: &[f64]) -> Chroma {
    let mut total = [0.0; 12];
    for (row, weight) in chroma.iter().zip(weights) {
        for (slot, value) in total.iter_mut().zip(row) {
            *slot += value * weight;
        }
    }
    total
}

/// Suit la tonalité au fil des trames. `weights` pondère chaque trame (sa
/// durée multipliée par son énergie relative, par exemple).
pub fn track(chroma: &[Chroma], weights: &[f64], params: &Params) -> Vec<KeySegment> {
    let n = chroma.len();
    if n == 0 {
        return Vec::new();
    }
    let window = params.window.clamp(1, n);
    let hop = params.hop.max(1);

    // Fenêtres : (début, fin, corrélations). Une fenêtre sans contenu tonal
    // (silence) est ignorée.
    let mut windows: Vec<Window> = Vec::new();
    let mut start = 0;
    loop {
        let end = (start + window).min(n);
        if let Some(scores) = correlations(&sum(&chroma[start..end], &weights[start..end])) {
            windows.push((start, end, scores));
        }
        if end == n {
            break;
        }
        start += hop;
    }
    if windows.is_empty() {
        return Vec::new();
    }

    let states = windows[0].2.len();
    let mut best: Vec<f64> = windows[0].2.iter().map(|(_, c)| *c).collect();
    let mut back: Vec<Vec<usize>> = vec![vec![0; states]];
    for (_, _, scores) in &windows[1..] {
        let (leader, leader_score) = best
            .iter()
            .cloned()
            .enumerate()
            .fold((0, f64::NEG_INFINITY), |acc, item| if item.1 > acc.1 { item } else { acc });
        let mut next = vec![0.0; states];
        let mut pointers = vec![0; states];
        for state in 0..states {
            let change = leader_score - params.change_cost;
            let (previous, value) = if best[state] >= change { (state, best[state]) } else { (leader, change) };
            next[state] = value + scores[state].1;
            pointers[state] = previous;
        }
        best = next;
        back.push(pointers);
    }
    let mut path = vec![0; windows.len()];
    let last = windows.len() - 1;
    path[last] = best
        .iter()
        .cloned()
        .enumerate()
        .fold((0, f64::NEG_INFINITY), |acc, item| if item.1 > acc.1 { item } else { acc })
        .0;
    for w in (1..=last).rev() {
        path[w - 1] = back[w][path[w]];
    }

    // Chaque fenêtre décide pour les trames autour de son centre ; la frontière
    // entre deux tonalités tombe à mi-chemin des centres voisins.
    let center = |w: usize| (windows[w].0 + windows[w].1) / 2;
    let mut segments = Vec::new();
    let mut first = 0;
    for w in 1..=windows.len() {
        if w == windows.len() || path[w] != path[first] {
            let start = if first == 0 { 0 } else { (center(first - 1) + center(first)) / 2 };
            let end = if w == windows.len() { n } else { (center(w - 1) + center(w)) / 2 };
            if end > start {
                segments.push(segment(start, end, path[first], chroma, weights));
            }
            first = w;
        }
    }
    segments
}

/// L'accord reconnu sur une trame, réduit à ce qui intéresse la tonalité.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FrameChord {
    pub root: u8,
    /// Classes de hauteur de l'accord, un bit par classe.
    pub pitch_classes: u16,
    pub major_third: bool,
    pub minor_third: bool,
}

/// Classes de hauteur admises dans une tonalité : sa gamme, plus la sensible
/// en mineur (gamme mineure harmonique).
fn scale_mask(key: &Key) -> u16 {
    let mut notes = key.scale().notes();
    if key.mode == Mode::Minor {
        notes.extend(Scale::new(key.tonic, ScaleType::HarmonicMinor).notes());
    }
    notes.iter().fold(0, |mask, note| mask | 1 << note.pitch_class().value())
}

/// Réexamine la tonalité de chaque segment à la lumière des accords, puis
/// fusionne les segments voisins de même tonalité.
pub fn refine(segments: &[KeySegment], chroma: &[Chroma], weights: &[f64], chords: &[Option<FrameChord>]) -> Vec<KeySegment> {
    let mut refined: Vec<KeySegment> = Vec::new();
    for segment in segments {
        let best = decide(segment.start, segment.end, chroma, weights, chords).unwrap_or_else(|| segment.clone());
        match refined.last_mut() {
            Some(previous) if previous.key == best.key => {
                let merged = decide(previous.start, segment.end, chroma, weights, chords);
                *previous = merged.filter(|m| m.key == best.key).unwrap_or(KeySegment { start: previous.start, ..best });
            }
            _ => refined.push(best),
        }
    }
    refined
}

fn decide(start: usize, end: usize, chroma: &[Chroma], weights: &[f64], chords: &[Option<FrameChord>]) -> Option<KeySegment> {
    let scores = correlations(&sum(&chroma[start..end], &weights[start..end]))?;
    let played: Vec<(usize, FrameChord)> = (start..end).filter_map(|i| chords[i].map(|c| (i, c))).collect();
    let total: f64 = played.iter().map(|(i, _)| weights[*i]).sum();
    let mut ranked: Vec<(Key, f64, f64)> = scores
        .into_iter()
        .map(|(key, correlation)| {
            let mut score = correlation;
            if total > 0.0 {
                let mask = scale_mask(&key);
                let tonic = key.tonic.pitch_class().value();
                let is_tonic = |c: &FrameChord| c.root == tonic && if key.mode == Mode::Major { c.major_third } else { c.minor_third };
                let share = |test: &dyn Fn(&FrameChord) -> bool| played.iter().filter(|(_, c)| test(c)).map(|(i, _)| weights[*i]).sum::<f64>() / total;
                score += 0.4 * share(&|c| c.pitch_classes & !mask == 0) + 0.3 * share(&is_tonic);
                if played.first().is_some_and(|(_, c)| is_tonic(c)) {
                    score += 0.1;
                }
                if played.last().is_some_and(|(_, c)| is_tonic(c)) {
                    score += 0.1;
                }
            }
            (key, correlation, score)
        })
        .collect();
    ranked.sort_by(|a, b| b.2.total_cmp(&a.2));
    let (key, correlation, score) = ranked[0];
    let margin = score - ranked.get(1).map_or(score - 1.0, |other| other.2);
    let alternatives = ranked[1..].iter().take(3).map(|(key, correlation, _)| (*key, *correlation)).collect();
    Some(KeySegment { start, end, key, correlation, margin, alternatives })
}

fn segment(start: usize, end: usize, state: usize, chroma: &[Chroma], weights: &[f64]) -> KeySegment {
    let scores = correlations(&sum(&chroma[start..end], &weights[start..end])).unwrap_or_default();
    let (key, correlation) = scores.get(state).copied().expect("tonalité du chemin");
    let mut others: Vec<(Key, f64)> = scores.into_iter().filter(|(k, _)| *k != key).collect();
    others.sort_by(|a, b| b.1.total_cmp(&a.1));
    others.truncate(3);
    let margin = correlation - others.first().map_or(-1.0, |(_, c)| *c);
    KeySegment { start, end, key, correlation, margin, alternatives: others }
}

#[cfg(test)]
mod tests {
    use super::*;
    use harmonia_theory::Chord;

    fn frames(chords: &[&str], repeat: usize) -> Vec<Chroma> {
        chords
            .iter()
            .flat_map(|name| {
                let chord: Chord = name.parse().unwrap();
                let mut chroma = [0.0; 12];
                for note in chord.notes() {
                    chroma[note.pitch_class().value() as usize] = 1.0;
                }
                vec![chroma; repeat]
            })
            .collect()
    }

    fn keys(segments: &[KeySegment]) -> Vec<String> {
        segments.iter().map(|s| s.key.to_string()).collect()
    }

    #[test]
    fn a_stable_piece_has_one_key() {
        let chroma = frames(&["C", "F", "G", "C", "Am", "Dm", "G", "C"], 4);
        let segments = track(&chroma, &vec![1.0; chroma.len()], &Params::default());
        assert_eq!(keys(&segments), ["C major"]);
        assert_eq!((segments[0].start, segments[0].end), (0, chroma.len()));
        assert!(segments[0].margin > 0.0);
    }

    #[test]
    fn a_lasting_modulation_is_found_near_its_position() {
        let mut chroma = frames(&["C", "F", "G", "C", "Am", "Dm", "G", "C", "C", "F", "G", "C"], 4);
        let boundary = chroma.len();
        chroma.extend(frames(&["E", "A", "B", "E", "C#m", "F#m", "B", "E", "E", "A", "B", "E"], 4));
        let segments = track(&chroma, &vec![1.0; chroma.len()], &Params::default());
        assert_eq!(keys(&segments), ["C major", "E major"]);
        assert!(segments[0].end.abs_diff(boundary) <= 8, "frontière à {}", segments[0].end);
    }

    #[test]
    fn a_borrowed_chord_is_not_a_modulation() {
        let chroma = frames(&["C", "F", "G", "C", "Am", "D", "G", "C", "C", "F", "G", "C"], 4);
        let segments = track(&chroma, &vec![1.0; chroma.len()], &Params::default());
        assert_eq!(keys(&segments), ["C major"]);
    }

    fn frame_chords(chords: &[&str], repeat: usize) -> Vec<Option<FrameChord>> {
        chords
            .iter()
            .flat_map(|name| {
                let chord: Chord = name.parse().unwrap();
                let frame = FrameChord {
                    root: chord.root.pitch_class().value(),
                    pitch_classes: chord.notes().iter().fold(0, |m, n| m | 1 << n.pitch_class().value()),
                    major_third: chord.quality.has_major_third(),
                    minor_third: chord.quality.has_minor_third(),
                };
                vec![Some(frame); repeat]
            })
            .collect()
    }

    fn refined(chords: &[&str]) -> Vec<String> {
        let chroma = frames(chords, 4);
        let weights = vec![1.0; chroma.len()];
        let segments = track(&chroma, &weights, &Params::default());
        keys(&refine(&segments, &chroma, &weights, &frame_chords(chords, 4)))
    }

    #[test]
    fn chords_separate_a_minor_key_from_its_relative() {
        // Mêmes notes que Do majeur, mais tout part de La mineur et y revient.
        assert_eq!(refined(&["Am", "F", "C", "G", "Am", "F", "C", "G", "Am", "Dm", "E", "Am"]), ["A minor"]);
        assert_eq!(refined(&["C", "Am", "F", "G", "C", "Am", "F", "G", "C", "F", "G", "C"]), ["C major"]);
    }

    #[test]
    fn a_chord_outside_the_scale_rules_out_the_dominant_key() {
        // Fa majeur n'appartient pas à Sol majeur.
        assert_eq!(refined(&["C", "G", "F", "G", "C", "F", "G", "C"]), ["C major"]);
    }

    #[test]
    fn refining_keeps_a_real_modulation() {
        let chords = ["C", "F", "G", "C", "Am", "Dm", "G", "C", "C", "F", "G", "C", "E", "A", "B", "E", "C#m", "F#m", "B", "E", "E", "A", "B", "E"];
        assert_eq!(refined(&chords), ["C major", "E major"]);
    }

    #[test]
    fn silence_has_no_key() {
        assert!(track(&[[0.0; 12]; 8], &[1.0; 8], &Params::default()).is_empty());
        assert!(track(&[], &[], &Params::default()).is_empty());
    }
}
