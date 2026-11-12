//! Mélodie : découpage de la ligne supérieure en notes.
//!
//! # Algorithme
//!
//! 1. **Clarté.** Un pas est retenu si la clarté de sa hauteur atteint
//!    [`Params::voiced_threshold`] et sa fréquence est positive.
//! 2. **Demi-tons.** La fréquence devient une hauteur MIDI continue, corrigée
//!    de l'accordage mesuré (`tuning_cents`), puis lissée par une médiane
//!    glissante de cinq pas (vibrato, erreurs d'octave isolées).
//! 3. **Segments.** Les pas consécutifs de même demi-ton forment une note ;
//!    un trou de moins de [`Params::max_gap_s`] ne coupe pas une note.
//! 4. **Nettoyage.** Une note plus courte que [`Params::min_note_s`] est
//!    absorbée par sa voisine de même hauteur ou supprimée.
//! 5. **Confiance.** Clarté moyenne, diminuée de l'écart moyen au demi-ton
//!    (une note juste est au centre de sa case).
//!
//! # Limites connues
//!
//! La ligne supérieure n'est pas toujours la mélodie : sans mélodie, c'est la
//! voix supérieure des accords ; une contre-mélodie aiguë la remplace. Aucune
//! note n'est donc annoncée « détectée ». Un premier essai avec pYIN, fait pour
//! une voix seule, ne trouvait rien dans les mélanges. Mesures dans
//! `workers/audio-analyzer/README.md`.

#[derive(Clone, Copy, Debug)]
pub struct Params {
    pub voiced_threshold: f64,
    pub min_note_s: f64,
    pub max_gap_s: f64,
}

impl Default for Params {
    fn default() -> Self {
        Params { voiced_threshold: 0.5, min_note_s: 0.09, max_gap_s: 0.05 }
    }
}

/// Une note de la mélodie.
#[derive(Clone, Debug, PartialEq)]
pub struct Note {
    pub start_s: f64,
    pub end_s: f64,
    pub midi: i32,
    /// Voisement moyen moins l'écart au demi-ton, de 0 à 1.
    pub confidence: f64,
}

fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    sorted[sorted.len() / 2]
}

/// Découpe un suivi de hauteur en notes.
pub fn notes(hz: &[f64], voiced: &[f64], hop_s: f64, tuning_cents: f64, params: &Params) -> Vec<Note> {
    let n = hz.len().min(voiced.len());
    if n == 0 || hop_s <= 0.0 {
        return Vec::new();
    }
    // Hauteur continue par pas, `None` hors voisement.
    let reference = 440.0 * 2f64.powf(tuning_cents / 1200.0);
    let raw: Vec<Option<f64>> = (0..n)
        .map(|i| (hz[i] > 0.0 && voiced[i] >= params.voiced_threshold).then(|| 69.0 + 12.0 * (hz[i] / reference).log2()))
        .collect();
    // Médiane glissante sur les pas voisés voisins.
    let smooth: Vec<Option<f64>> = (0..n)
        .map(|i| {
            raw[i]?;
            let window: Vec<f64> = (i.saturating_sub(2)..(i + 3).min(n)).filter_map(|j| raw[j]).collect();
            Some(median(&window))
        })
        .collect();

    // Segments de même demi-ton ; un court trou est comblé.
    let max_gap = (params.max_gap_s / hop_s).round() as usize;
    let mut segments: Vec<(usize, usize, i32)> = Vec::new();
    for (i, value) in smooth.iter().enumerate() {
        let Some(pitch) = value else { continue };
        let semitone = pitch.round() as i32;
        match segments.last_mut() {
            Some((_, end, last)) if *last == semitone && i - *end <= max_gap + 1 => *end = i + 1,
            _ => segments.push((i, i + 1, semitone)),
        }
    }

    // Les fragments trop courts sont absorbés par une voisine de même hauteur, ou supprimés.
    let min_steps = (params.min_note_s / hop_s).ceil() as usize;
    let mut kept: Vec<(usize, usize, i32)> = Vec::new();
    for segment in segments {
        match kept.last_mut() {
            Some(previous) if previous.2 == segment.2 && segment.0 - previous.1 <= max_gap + 1 => previous.1 = segment.1,
            _ => kept.push(segment),
        }
    }
    kept.retain(|(start, end, _)| end - start >= min_steps);

    kept.into_iter()
        .map(|(start, end, midi)| {
            let steps: Vec<usize> = (start..end).filter(|i| smooth[*i].is_some()).collect();
            let count = steps.len().max(1) as f64;
            let voicing = steps.iter().map(|i| voiced[*i]).sum::<f64>() / count;
            let deviation = steps.iter().filter_map(|i| smooth[*i]).map(|p| (p - midi as f64).abs()).sum::<f64>() / count;
            Note {
                start_s: start as f64 * hop_s,
                end_s: end as f64 * hop_s,
                midi,
                confidence: (voicing * (1.0 - deviation)).clamp(0.0, 1.0),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOP: f64 = 512.0 / 22050.0;

    fn hz(midi: f64) -> f64 {
        440.0 * 2f64.powf((midi - 69.0) / 12.0)
    }

    /// Suivi synthétique : (hauteur MIDI ou silence, durée en secondes).
    fn track(parts: &[(Option<f64>, f64)]) -> (Vec<f64>, Vec<f64>) {
        let mut f = Vec::new();
        let mut v = Vec::new();
        for (pitch, seconds) in parts {
            for _ in 0..(seconds / HOP).round() as usize {
                f.push(pitch.map_or(0.0, hz));
                v.push(if pitch.is_some() { 0.9 } else { 0.05 });
            }
        }
        (f, v)
    }

    fn midis(notes: &[Note]) -> Vec<i32> {
        notes.iter().map(|n| n.midi).collect()
    }

    #[test]
    fn splits_a_clean_line_into_notes() {
        let (f, v) = track(&[(Some(72.0), 0.4), (None, 0.1), (Some(74.0), 0.4), (Some(76.0), 0.4)]);
        let found = notes(&f, &v, HOP, 0.0, &Params::default());
        assert_eq!(midis(&found), [72, 74, 76]);
        assert!((found[1].start_s - 0.5).abs() < 0.03, "{}", found[1].start_s);
        assert!(found.iter().all(|n| n.confidence > 0.8));
    }

    #[test]
    fn vibrato_and_isolated_octave_errors_are_smoothed() {
        let mut parts: Vec<(Option<f64>, f64)> = (0..20).map(|i| (Some(69.0 + if i % 2 == 0 { 0.3 } else { -0.3 }), HOP)).collect();
        parts.insert(10, (Some(81.0), HOP));
        let (f, v) = track(&parts);
        assert_eq!(midis(&notes(&f, &v, HOP, 0.0, &Params::default())), [69]);
    }

    #[test]
    fn tuning_shifts_the_grid() {
        // Une note 40 cents trop haute, mais l'accordage mesuré est de +40 cents.
        let (f, v) = track(&[(Some(72.4), 0.5)]);
        let found = notes(&f, &v, HOP, 40.0, &Params::default());
        assert_eq!(midis(&found), [72]);
        assert!(found[0].confidence > 0.85);
    }

    #[test]
    fn short_blips_and_unvoiced_frames_are_dropped() {
        let (f, v) = track(&[(Some(72.0), 0.04), (None, 0.3), (Some(76.0), 0.3)]);
        assert_eq!(midis(&notes(&f, &v, HOP, 0.0, &Params::default())), [76]);
        assert!(notes(&[], &[], HOP, 0.0, &Params::default()).is_empty());
    }
}
