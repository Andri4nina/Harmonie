//! Tempo et mesure à partir des temps détectés.
//!
//! # Tempo
//!
//! Le tempo est l'inverse de l'intervalle médian entre deux temps, mesuré sur
//! des groupes de huit temps pour dépasser la résolution des trames d'analyse
//! (23 ms). La régularité des intervalles (écart interquartile rapporté à la
//! médiane) et la netteté de la pulsation donnent la confiance.
//! Un suiveur de temps peut se caler sur la moitié ou le double de la
//! pulsation ressentie : ces deux lectures sont toujours proposées.
//!
//! # Mesure
//!
//! Pour chaque hypothèse (2, 3 ou 4 temps par mesure) et chaque décalage du
//! premier temps, deux indices sont combinés :
//!
//! - **accent** : les attaques des temps supposés forts dépassent-elles celles
//!   des autres temps ?
//! - **harmonie** : les changements d'accord tombent-ils sur ces temps ?
//!
//! # Limites connues
//!
//! - 2 et 4 temps donnent des indices presque identiques. La mesure à 2 temps
//!   n'est retenue que si les accents alternent fort / faible sans qu'un temps
//!   sur quatre se détache ; sinon 4, de loin la plus courante.
//! - Si le suivi des temps s'est calé sur le double ou la moitié de la
//!   pulsation, la mesure annoncée est fausse dans la même proportion.
//! - Le dénominateur n'est pas mesurable : 3/4 et 6/8 lent, ou 4/4 et 2/2, ne
//!   sont pas distingués. Le résultat s'exprime en temps par mesure.
//! - Les mesures composées, asymétriques (5/4, 7/8) ou changeantes ne sont
//!   pas reconnues.

/// Pulsation mesurée.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Tempo {
    pub bpm: f64,
    /// Dispersion des intervalles entre temps : 0 = métronomique.
    pub irregularity: f64,
    pub beats: usize,
}

/// Mesure le tempo. `None` s'il y a moins de quatre temps.
pub fn tempo(beat_times: &[f64]) -> Option<Tempo> {
    if beat_times.len() < 4 {
        return None;
    }
    let mut intervals: Vec<f64> = beat_times.windows(2).map(|pair| pair[1] - pair[0]).collect();
    intervals.sort_by(f64::total_cmp);
    let at = |q: f64| intervals[((intervals.len() - 1) as f64 * q).round() as usize];
    let median = at(0.5);
    if median <= 0.0 {
        return None;
    }
    let irregularity = (at(0.75) - at(0.25)) / median;
    let span = 8.min(beat_times.len() - 1);
    let mut periods: Vec<f64> = beat_times.windows(span + 1).map(|group| (group[span] - group[0]) / span as f64).collect();
    periods.sort_by(f64::total_cmp);
    let period = periods[periods.len() / 2];
    Some(Tempo { bpm: 60.0 / period, irregularity, beats: beat_times.len() })
}

/// Temps par mesure et position du premier temps.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Meter {
    pub beats_per_bar: usize,
    /// Indice (dans la suite des temps) du premier temps fort.
    pub phase: usize,
    /// Force de l'indice retenu, de 0 à 1.
    pub evidence: f64,
    /// Écart avec la meilleure hypothèse concurrente (2 et 4 confondus).
    pub margin: f64,
}

/// Indices en faveur d'une hypothèse : (accent brut, accent borné, harmonie).
fn evidence(strengths: &[f64], changes: &[usize], beats_per_bar: usize, phase: usize) -> (f64, f64) {
    let n = strengths.len();
    let strong = |i: usize| i % beats_per_bar == phase;
    let mean = strengths.iter().sum::<f64>() / n as f64;
    let deviation = (strengths.iter().map(|s| (s - mean).powi(2)).sum::<f64>() / n as f64).sqrt();
    // Écart entre l'attaque moyenne des temps forts et celle des autres
    // temps, en écarts-types.
    let accent = if deviation > 1e-9 * mean.abs().max(1.0) {
        let (mut on, mut off, mut on_count, mut off_count) = (0.0, 0.0, 0.0, 0.0);
        for (i, s) in strengths.iter().enumerate() {
            if strong(i) {
                on += s;
                on_count += 1.0;
            } else {
                off += s;
                off_count += 1.0;
            }
        }
        if on_count > 0.0 && off_count > 0.0 { ((on / on_count - off / off_count) / deviation).max(0.0) } else { 0.0 }
    } else {
        0.0
    };
    // Part des changements d'accord tombant sur un temps fort, ramenée à 0
    // quand elle vaut ce que donnerait le hasard.
    let harmony = if changes.len() >= 3 {
        let chance = 1.0 / beats_per_bar as f64;
        let share = changes.iter().filter(|&&i| strong(i)).count() as f64 / changes.len() as f64;
        ((share - chance) / (1.0 - chance)).clamp(0.0, 1.0)
    } else {
        0.0
    };
    (accent, harmony)
}

fn combined((accent, harmony): (f64, f64)) -> f64 {
    0.5 * (accent / 2.0).min(1.0) + 0.5 * harmony
}

/// Estime la mesure. `strengths[i]` est la force de l'attaque du temps `i`,
/// `changes` les indices des temps où l'accord change.
///
/// Renvoie `None` s'il y a moins de douze temps ou si aucun indice ne se
/// dégage : mieux vaut ne rien annoncer qu'inventer une mesure.
pub fn meter(strengths: &[f64], changes: &[usize]) -> Option<Meter> {
    if strengths.len() < 12 {
        return None;
    }
    let best_for = |beats_per_bar: usize| {
        (0..beats_per_bar)
            .map(|phase| (phase, evidence(strengths, changes, beats_per_bar, phase)))
            .fold((0, (0.0, 0.0), f64::NEG_INFINITY), |acc, (phase, clues)| if combined(clues) > acc.2 { (phase, clues, combined(clues)) } else { acc })
    };
    let (duple, triple, quadruple) = (best_for(2), best_for(3), best_for(4));
    // Binaire : la force de l'indice est celle de la meilleure des deux
    // lectures ; le choix entre 2 et 4 ne repose que sur les accents.
    let alternating = duple.1.0 > 0.5 && duple.1.0 > 1.25 * quadruple.1.0;
    let (binary_beats, binary_phase) = if alternating { (2, duple.0) } else { (4, quadruple.0) };
    let binary_score = duple.2.max(quadruple.2);
    let (beats_per_bar, phase, score, rival) =
        if triple.2 > binary_score { (3, triple.0, triple.2, binary_score) } else { (binary_beats, binary_phase, binary_score, triple.2) };
    (score >= 0.15).then_some(Meter { beats_per_bar, phase, evidence: score, margin: score - rival })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steady_beats_give_the_tempo() {
        let beats: Vec<f64> = (0..32).map(|i| 0.3 + i as f64 * 0.5).collect();
        let tempo = tempo(&beats).unwrap();
        assert!((tempo.bpm - 120.0).abs() < 1e-9);
        assert!(tempo.irregularity < 1e-9);
    }

    #[test]
    fn unsteady_beats_are_reported_as_irregular() {
        let beats: Vec<f64> = (0..32).map(|i| i as f64 * 0.5 + if i % 3 == 0 { 0.12 } else { 0.0 }).collect();
        assert!(tempo(&beats).unwrap().irregularity > 0.1);
    }

    #[test]
    fn too_few_beats_give_nothing() {
        assert_eq!(tempo(&[0.0, 0.5, 1.0]), None);
        assert_eq!(meter(&[1.0; 8], &[]), None);
    }

    fn accents(beats_per_bar: usize, phase: usize, n: usize) -> Vec<f64> {
        (0..n).map(|i| if i % beats_per_bar == phase { 1.0 } else { 0.4 }).collect()
    }

    #[test]
    fn accents_reveal_three_beats_per_bar() {
        let found = meter(&accents(3, 1, 36), &[]).unwrap();
        assert_eq!((found.beats_per_bar, found.phase), (3, 1));
    }

    #[test]
    fn accents_reveal_four_beats_per_bar_and_the_downbeat() {
        let found = meter(&accents(4, 2, 48), &[]).unwrap();
        assert_eq!((found.beats_per_bar, found.phase), (4, 2));
    }

    #[test]
    fn chord_changes_alone_reveal_the_bar() {
        let changes: Vec<usize> = (0..12).map(|bar| bar * 3).collect();
        let found = meter(&[1.0; 36], &changes).unwrap();
        assert_eq!((found.beats_per_bar, found.phase), (3, 0));
    }

    #[test]
    fn featureless_beats_give_no_meter() {
        assert_eq!(meter(&[1.0; 48], &[]), None);
    }
}
