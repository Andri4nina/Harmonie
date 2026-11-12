//! Reconnaissance d'accords : gabarits de chroma + lissage de Viterbi.
//!
//! # Algorithme
//!
//! 1. **Gabarits.** Chaque accord candidat (12 fondamentales × [`VOCABULARY`])
//!    est un vecteur binaire de 12 classes de hauteur, tiré des intervalles du
//!    moteur de théorie : il n'existe qu'une définition d'un accord.
//! 2. **Harmonique de la basse.** Le troisième harmonique de la note de basse
//!    sonne une quinte au-dessus d'elle, dans le registre des accords. Cette
//!    quinte est ajoutée à tous les gabarits de la trame : sans cela, un
//!    La majeur sur basse Do dièse (qui fait entendre un Sol dièse) serait lu
//!    Do dièse mineur.
//! 3. **Score d'une trame.** Similarité cosinus entre le chroma et le gabarit
//!    (1 = mêmes notes, mêmes proportions), moins une pénalité pour les
//!    accords plus rares que les triades majeure et mineure, plus un bonus si
//!    le registre grave joue la fondamentale.
//! 4. **Lissage.** L'algorithme de Viterbi cherche la suite d'accords de score
//!    total maximal. Le score d'une trame est pondéré par sa durée et chaque
//!    changement d'accord coûte [`Params::change_cost`] : un accord ne
//!    s'impose que s'il est nettement meilleur pendant assez longtemps.
//! 5. **Segments.** Les trames consécutives de même accord sont fusionnées. La
//!    basse du segment décide d'un éventuel renversement.
//!
//! # Limites connues
//!
//! - Les harmoniques d'une triade majeure nourrissent sa septième majeure et
//!   sa neuvième : la distinction triade / accord de septième est la moins
//!   fiable, d'où la pénalité et une confiance plus basse.
//! - Les accords hors vocabulaire (neuvièmes, accords altérés, augmentés…)
//!   sont ramenés au gabarit le plus proche.
//! - La résolution temporelle est celle des trames : un demi-temps.

use harmonia_theory::{Chord, ChordQuality, Note, PitchClass, Spelling};

use crate::features::Chroma;

/// Qualités reconnues depuis l'audio.
pub const VOCABULARY: &[ChordQuality] = &[
    ChordQuality::Major,
    ChordQuality::Minor,
    ChordQuality::Dominant7,
    ChordQuality::Major7,
    ChordQuality::Minor7,
    ChordQuality::Diminished,
    ChordQuality::Sus4,
];

const STATES: usize = 12 * VOCABULARY.len() + 1;
/// Dernier état : « pas d'accord » (silence, bruit, note isolée).
const NO_CHORD: usize = STATES - 1;

/// Réglages de la reconnaissance. Les valeurs par défaut ont été ajustées sur
/// le jeu de morceaux synthétiques de `workers/audio-analyzer/evaluation`.
#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// Coût d'un changement d'accord, en score × secondes : à 0,06, un accord
    /// meilleur de 0,12 doit durer une demi-seconde pour s'imposer.
    pub change_cost: f64,
    /// Poids, dans les gabarits, du troisième harmonique de la basse.
    pub bass_harmonic: f64,
    /// Pénalité des accords de quatre sons et des accords diminués ou suspendus.
    pub rare_penalty: f64,
    /// Poids de la basse quand elle joue la fondamentale.
    pub bass_weight: f64,
    /// Score constant de l'état « pas d'accord ».
    pub no_chord_score: f64,
    /// Une trame dont l'énergie est sous cette fraction de l'énergie médiane
    /// est muette.
    pub silence_ratio: f64,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            change_cost: 0.06,
            bass_harmonic: 0.4,
            rare_penalty: 0.05,
            bass_weight: 0.10,
            no_chord_score: 0.55,
            silence_ratio: 0.2,
        }
    }
}

/// Un candidat : classe de hauteur de la fondamentale et qualité.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Candidate {
    pub root: u8,
    pub quality: ChordQuality,
}

impl Candidate {
    fn from_state(state: usize) -> Option<Candidate> {
        (state != NO_CHORD).then(|| Candidate {
            root: (state / VOCABULARY.len()) as u8,
            quality: VOCABULARY[state % VOCABULARY.len()],
        })
    }

    /// Classes de hauteur de l'accord.
    pub fn pitch_classes(&self) -> Vec<u8> {
        self.quality.pitch_class_set().iter().map(|pc| (pc + self.root) % 12).collect()
    }

    /// L'accord orthographié, avec sa basse si elle n'est pas la fondamentale.
    pub fn chord(&self, spelling: &dyn Fn(u8) -> Note, bass: Option<u8>) -> Chord {
        let root = spelling(self.root);
        match bass.filter(|&b| b != self.root) {
            // La basse reprend l'orthographe de la note de l'accord.
            Some(bass) => {
                let note = Chord::new(root, self.quality)
                    .notes()
                    .into_iter()
                    .find(|n| n.pitch_class().value() == bass)
                    .unwrap_or_else(|| spelling(bass));
                Chord::with_bass(root, self.quality, note)
            }
            None => Chord::new(root, self.quality),
        }
    }
}

/// Un accord tenu sur plusieurs trames consécutives.
#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    /// Première trame (incluse) et dernière trame (exclue).
    pub start: usize,
    pub end: usize,
    /// `None` : pas d'accord.
    pub candidate: Option<Candidate>,
    /// Classe de hauteur de la basse si elle révèle un renversement.
    pub bass: Option<u8>,
    /// Similarité moyenne entre le chroma et le gabarit, de 0 à 1.
    pub fit: f64,
    /// Écart moyen avec le meilleur accord d'une autre fondamentale.
    pub margin: f64,
    /// Autres lectures plausibles, de la meilleure à la moins bonne.
    pub alternatives: Vec<(Candidate, f64)>,
}

fn templates() -> Vec<Chroma> {
    let mut all = Vec::with_capacity(STATES - 1);
    for root in 0..12u8 {
        for quality in VOCABULARY {
            let mut template = [0.0; 12];
            for pc in quality.pitch_class_set() {
                template[((pc + root) % 12) as usize] = 1.0;
            }
            all.push(template);
        }
    }
    all
}

fn cosine(a: &Chroma, b: &Chroma) -> f64 {
    let dot: f64 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm = |v: &Chroma| v.iter().map(|x| x * x).sum::<f64>().sqrt();
    let denominator = norm(a) * norm(b);
    if denominator > f64::EPSILON { dot / denominator } else { 0.0 }
}

fn penalty(quality: ChordQuality, params: &Params) -> f64 {
    match quality {
        ChordQuality::Major | ChordQuality::Minor => 0.0,
        _ => params.rare_penalty,
    }
}

/// Scores bruts (similarité seule) et scores de décision d'une trame.
fn frame_scores(chroma: &Chroma, bass: &Chroma, silent: bool, templates: &[Chroma], params: &Params) -> ([f64; STATES], [f64; STATES]) {
    let mut fit = [0.0; STATES];
    let mut score = [0.0; STATES];
    let (lowest, bass_peak) = argmax(bass);
    for (state, template) in templates.iter().enumerate() {
        let candidate = Candidate::from_state(state).expect("état d'accord");
        let mut expected = *template;
        if bass_peak > f64::EPSILON {
            expected[(lowest + 7) % 12] += params.bass_harmonic;
        }
        fit[state] = cosine(chroma, &expected);
        let bass_support = if bass_peak > f64::EPSILON { bass[candidate.root as usize] / bass_peak } else { 0.0 };
        score[state] = fit[state] - penalty(candidate.quality, params) + params.bass_weight * bass_support;
        if silent {
            score[state] = 0.0;
        }
    }
    fit[NO_CHORD] = 0.0;
    score[NO_CHORD] = if silent { 1.0 } else { params.no_chord_score };
    (fit, score)
}

/// Reconnaît les accords d'une suite de trames. `durations` donne la durée de
/// chaque trame en secondes.
pub fn recognize(chroma: &[Chroma], bass: &[Chroma], rms: &[f64], durations: &[f64], params: &Params) -> Vec<Segment> {
    let n = chroma.len();
    if n == 0 {
        return Vec::new();
    }
    let templates = templates();
    let mut sorted: Vec<f64> = rms.iter().cloned().filter(|v| *v > 0.0).collect();
    sorted.sort_by(f64::total_cmp);
    let median = sorted.get(sorted.len() / 2).cloned().unwrap_or(0.0);
    let mut fits = Vec::with_capacity(n);
    let mut scores = Vec::with_capacity(n);
    for t in 0..n {
        let silent = median <= f64::EPSILON || rms[t] < median * params.silence_ratio;
        let (fit, score) = frame_scores(&chroma[t], &bass[t], silent, &templates, params);
        fits.push(fit);
        scores.push(score);
    }

    // Viterbi : `best[s]` est le meilleur score total d'un chemin finissant
    // dans l'état `s`. Tous les changements coûtant le même prix, le meilleur
    // prédécesseur est soit l'état lui-même, soit le meilleur état précédent.
    let weighted = |t: usize, state: usize| scores[t][state] * durations[t];
    let mut best = [0.0; STATES];
    for (state, slot) in best.iter_mut().enumerate() {
        *slot = weighted(0, state);
    }
    let mut back: Vec<[usize; STATES]> = Vec::with_capacity(n);
    back.push([0; STATES]);
    for t in 1..n {
        let (leader, leader_score) = argmax(&best);
        let mut next = [0.0; STATES];
        let mut pointers = [0; STATES];
        for state in 0..STATES {
            let stay = best[state];
            let change = leader_score - params.change_cost;
            let (previous, value) = if stay >= change { (state, stay) } else { (leader, change) };
            next[state] = value + weighted(t, state);
            pointers[state] = previous;
        }
        best = next;
        back.push(pointers);
    }
    let mut path = vec![0; n];
    path[n - 1] = argmax(&best).0;
    for t in (1..n).rev() {
        path[t - 1] = back[t][path[t]];
    }

    let mut segments = Vec::new();
    let mut start = 0;
    for t in 1..=n {
        if t == n || path[t] != path[start] {
            segments.push(describe(path[start], start, t, &fits, &scores, bass, durations));
            start = t;
        }
    }
    segments
}

fn argmax(values: &[f64]) -> (usize, f64) {
    values.iter().cloned().enumerate().fold((0, f64::NEG_INFINITY), |acc, item| if item.1 > acc.1 { item } else { acc })
}

fn describe(state: usize, start: usize, end: usize, fits: &[[f64; STATES]], scores: &[[f64; STATES]], bass: &[Chroma], durations: &[f64]) -> Segment {
    let seconds: f64 = durations[start..end].iter().sum();
    let mean = |table: &[[f64; STATES]], s: usize| table[start..end].iter().zip(&durations[start..end]).map(|(row, d)| row[s] * d).sum::<f64>() / seconds;
    let Some(candidate) = Candidate::from_state(state) else {
        return Segment { start, end, candidate: None, bass: None, fit: 0.0, margin: 0.0, alternatives: Vec::new() };
    };

    // Autres lectures : les meilleurs états, un seul par fondamentale et
    // jamais la fondamentale retenue pour la marge.
    let mut ranked: Vec<(usize, f64)> = (0..NO_CHORD).filter(|&s| s != state).map(|s| (s, mean(scores, s))).collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    let own = mean(scores, state);
    let rival = ranked
        .iter()
        .find(|(s, _)| Candidate::from_state(*s).is_some_and(|c| c.root != candidate.root))
        .map_or(0.0, |(_, score)| *score);
    let alternatives = ranked
        .iter()
        .take(3)
        .filter_map(|&(s, _)| Candidate::from_state(s).map(|c| (c, mean(fits, s))))
        .collect();

    // Renversement : la note la plus forte du grave est une autre note de
    // l'accord et domine nettement la fondamentale.
    let mut low = [0.0; 12];
    for (row, duration) in bass[start..end].iter().zip(&durations[start..end]) {
        for (slot, value) in low.iter_mut().zip(row) {
            *slot += value * duration;
        }
    }
    let (lowest, strength) = argmax(&low);
    let lowest = lowest as u8;
    let inverted = lowest != candidate.root
        && candidate.pitch_classes().contains(&lowest)
        && strength > 1.5 * low[candidate.root as usize]
        && strength > f64::EPSILON;

    Segment {
        start,
        end,
        candidate: Some(candidate),
        bass: inverted.then_some(lowest),
        fit: mean(fits, state),
        margin: own - rival,
        alternatives,
    }
}

/// Orthographe par défaut d'une classe de hauteur, hors de toute tonalité.
pub fn plain_spelling(pc: u8) -> Note {
    let spelling = if pc == 6 { Spelling::Sharps } else { Spelling::Flats };
    Note::from_pitch_class(PitchClass::new(pc as i32), spelling)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chroma_of(chord: &str) -> Chroma {
        let chord: Chord = chord.parse().unwrap();
        let mut chroma = [0.02; 12];
        for note in chord.notes() {
            chroma[note.pitch_class().value() as usize] = 1.0;
        }
        chroma
    }

    fn bass_of(note: &str) -> Chroma {
        let note: Note = note.parse().unwrap();
        let mut chroma = [0.0; 12];
        chroma[note.pitch_class().value() as usize] = 1.0;
        chroma
    }

    fn names(segments: &[Segment]) -> Vec<String> {
        segments
            .iter()
            .map(|s| match s.candidate {
                Some(c) => format!("{}:{}", c.chord(&plain_spelling, s.bass), s.end - s.start),
                None => format!("N:{}", s.end - s.start),
            })
            .collect()
    }

    fn run(frames: &[(&str, &str)]) -> Vec<Segment> {
        let chroma: Vec<Chroma> = frames.iter().map(|(c, _)| chroma_of(c)).collect();
        let bass: Vec<Chroma> = frames.iter().map(|(_, b)| bass_of(b)).collect();
        recognize(&chroma, &bass, &vec![1.0; frames.len()], &vec![0.5; frames.len()], &Params::default())
    }

    #[test]
    fn recognizes_a_clean_progression() {
        let frames: Vec<(&str, &str)> = [("C", "C"), ("G", "G"), ("Am", "A"), ("F", "F")]
            .iter()
            .flat_map(|pair| std::iter::repeat_n(*pair, 4))
            .collect();
        assert_eq!(names(&run(&frames)), ["C:4", "G:4", "Am:4", "F:4"]);
    }

    #[test]
    fn recognizes_seventh_chords() {
        let frames: Vec<(&str, &str)> = [("Dm7", "D"), ("G7", "G"), ("Cmaj7", "C")]
            .iter()
            .flat_map(|pair| std::iter::repeat_n(*pair, 4))
            .collect();
        assert_eq!(names(&run(&frames)), ["Dm7:4", "G7:4", "Cmaj7:4"]);
    }

    #[test]
    fn bass_separates_am7_from_c6() {
        // La, Do, Mi, Sol : seule la basse dit s'il s'agit d'un La mineur 7.
        let frames = vec![("Am7", "A"); 4];
        assert_eq!(names(&run(&frames)), ["Am7:4"]);
    }

    #[test]
    fn detects_an_inversion_from_the_bass() {
        let frames = vec![("C", "E"); 4];
        assert_eq!(names(&run(&frames)), ["C/E:4"]);
    }

    #[test]
    fn a_single_noisy_frame_does_not_change_the_chord() {
        let mut chroma = vec![chroma_of("C"); 8];
        // Une trame où le Fa remplace partiellement le Mi.
        chroma[4][5] = 0.9;
        chroma[4][4] = 0.5;
        let bass = vec![bass_of("C"); 8];
        let segments = recognize(&chroma, &bass, &[1.0; 8], &[0.5; 8], &Params::default());
        assert_eq!(names(&segments), ["C:8"]);
    }

    #[test]
    fn silence_and_flat_spectra_are_not_chords() {
        let mut chroma = vec![chroma_of("C"); 4];
        chroma.extend(vec![[1.0; 12]; 4]);
        chroma.extend(vec![chroma_of("G"); 4]);
        let mut bass = vec![bass_of("C"); 4];
        bass.extend(vec![[0.0; 12]; 4]);
        bass.extend(vec![bass_of("G"); 4]);
        let mut rms = vec![1.0; 12];
        rms[8] = 0.0;
        let segments = recognize(&chroma, &bass, &rms, &[0.5; 12], &Params::default());
        // La trame muette qui suit le spectre plat prolonge le « pas d'accord ».
        assert_eq!(names(&segments), ["C:4", "N:5", "G:3"]);
        assert!(segments.iter().all(|s| s.candidate.is_some() || s.fit == 0.0));
    }

    #[test]
    fn the_bass_harmonic_does_not_hide_an_inversion() {
        // La majeur sur Do dièse : l'harmonique de la basse ajoute un Sol dièse.
        let mut chroma = chroma_of("A");
        chroma[8] = 0.5;
        let segments = recognize(&[chroma; 4], &[bass_of("C#"); 4], &[1.0; 4], &[0.5; 4], &Params::default());
        assert_eq!(names(&segments), ["A/C#:4"]);
    }

    #[test]
    fn a_short_lapse_is_absorbed_but_a_long_one_is_a_change() {
        let mut frames = vec![("C", "C"); 4];
        frames.extend(vec![("F", "F"); 4]);
        let chroma: Vec<Chroma> = frames.iter().map(|(c, _)| chroma_of(c)).collect();
        let bass: Vec<Chroma> = frames.iter().map(|(_, b)| bass_of(b)).collect();
        // Quatre trames de Fa de 20 ms : trop bref pour être un accord.
        let mut durations = vec![0.5; 4];
        durations.extend(vec![0.02; 4]);
        assert_eq!(names(&recognize(&chroma, &bass, &[1.0; 8], &durations, &Params::default())), ["C:8"]);
        assert_eq!(names(&recognize(&chroma, &bass, &[1.0; 8], &[0.5; 8], &Params::default())), ["C:4", "F:4"]);
    }

    #[test]
    fn empty_input_gives_no_segment() {
        assert!(recognize(&[], &[], &[], &[], &Params::default()).is_empty());
    }

    #[test]
    fn margin_is_lower_for_ambiguous_chroma() {
        let clean = run(&[("C", "C"); 4]);
        // Do et Sol seuls : majeur ou mineur ?
        let mut open = [0.02; 12];
        open[0] = 1.0;
        open[7] = 1.0;
        let ambiguous = recognize(&[open; 4], &[bass_of("C"); 4], &[1.0; 4], &[0.5; 4], &Params::default());
        assert!(ambiguous[0].fit < clean[0].fit);
    }
}
