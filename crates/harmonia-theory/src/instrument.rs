//! Modèle d'instrument générique : cordes, claviers, vents, percussions.
//!
//! Toutes les hauteurs stockées sont des hauteurs **réelles** (sons entendus).
//! La [`Transposition`] convertit vers et depuis les hauteurs écrites.

use crate::interval::Interval;
use crate::pitch::{Note, Pitch, Spelling};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Family {
    Keyboard,
    PluckedString,
    BowedString,
    Woodwind,
    Brass,
    Percussion,
    Electronic,
}

/// Rapport entre la note écrite et la note entendue.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Transposition {
    /// Instrument en ut : écrit = entendu.
    Concert,
    /// Sonne plus bas que l'écrit (saxophone alto : sixte majeure).
    SoundsBelow(Interval),
    /// Sonne plus haut que l'écrit (piccolo : octave).
    SoundsAbove(Interval),
}

impl Transposition {
    pub fn to_sounding(self, written: Pitch) -> Pitch {
        match self {
            Transposition::Concert => written,
            Transposition::SoundsBelow(interval) => written.down(interval),
            Transposition::SoundsAbove(interval) => written.up(interval),
        }
    }

    pub fn to_written(self, sounding: Pitch) -> Pitch {
        match self {
            Transposition::Concert => sounding,
            Transposition::SoundsBelow(interval) => sounding.up(interval),
            Transposition::SoundsAbove(interval) => sounding.down(interval),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub struct PercussionPiece {
    pub name: String,
    /// Note du plan de percussions General MIDI.
    pub midi_note: u8,
}

/// Façon dont l'instrument se représente et produit ses notes.
#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub enum Layout {
    /// Une touche par demi-ton sur toute la tessiture.
    Keyboard,
    /// Cordes à vide de la plus grave à la plus aiguë. `span` est le nombre
    /// de demi-tons jouables au-dessus de chaque corde à vide (nombre de
    /// frettes, ou étendue pratique sur une touche lisse).
    Strings {
        open: Vec<Pitch>,
        span: u8,
        fretted: bool,
    },
    /// Instrument monodique à tessiture continue.
    Wind,
    /// Éléments à hauteur indéterminée.
    Percussion { pieces: Vec<PercussionPiece> },
}

/// Position d'une note sur un instrument à cordes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub struct StringPosition {
    /// Index dans `Layout::Strings::open` : 0 = corde la plus grave.
    pub string: usize,
    /// Demi-tons au-dessus de la corde à vide (numéro de frette).
    pub stop: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize), serde(rename_all = "snake_case"))]
pub struct Instrument {
    pub id: String,
    pub name: String,
    pub family: Family,
    pub layout: Layout,
    /// Tessiture en hauteurs réelles ; `None` pour les percussions.
    pub range: Option<(Pitch, Pitch)>,
    pub transposition: Transposition,
}

fn pitch(s: &str) -> Pitch {
    s.parse().expect("hauteur de preset valide")
}

impl Instrument {
    /// Instrument à cordes, standard ou personnalisé. La tessiture est
    /// déduite de l'accordage et de `span`.
    pub fn strings(
        id: &str,
        name: &str,
        family: Family,
        open: Vec<Pitch>,
        span: u8,
        fretted: bool,
        transposition: Transposition,
    ) -> Instrument {
        let lowest = open.iter().map(|p| p.midi()).min();
        let highest = open.iter().map(|p| p.midi()).max();
        let range = lowest.zip(highest).map(|(low, high)| {
            (
                Pitch::from_midi(low, Spelling::Sharps),
                Pitch::from_midi(high + span as i32, Spelling::Sharps),
            )
        });
        Instrument {
            id: id.to_string(),
            name: name.to_string(),
            family,
            layout: Layout::Strings {
                open,
                span,
                fretted,
            },
            range,
            transposition,
        }
    }

    /// Instrument à tessiture continue, décrit par sa tessiture **écrite**.
    pub fn ranged(
        id: &str,
        name: &str,
        family: Family,
        layout: Layout,
        written_low: Pitch,
        written_high: Pitch,
        transposition: Transposition,
    ) -> Instrument {
        Instrument {
            id: id.to_string(),
            name: name.to_string(),
            family,
            layout,
            range: Some((
                transposition.to_sounding(written_low),
                transposition.to_sounding(written_high),
            )),
            transposition,
        }
    }

    pub fn piano() -> Instrument {
        Instrument::ranged(
            "piano",
            "Piano",
            Family::Keyboard,
            Layout::Keyboard,
            pitch("A0"),
            pitch("C8"),
            Transposition::Concert,
        )
    }

    /// Clavier couvrant toute l'étendue MIDI.
    pub fn synthesizer() -> Instrument {
        Instrument::ranged(
            "synthesizer",
            "Synthesizer",
            Family::Electronic,
            Layout::Keyboard,
            pitch("C-1"),
            pitch("G9"),
            Transposition::Concert,
        )
    }

    /// Guitare 6 cordes, accordage standard, 22 frettes. S'écrit une octave
    /// au-dessus du son réel.
    pub fn guitar() -> Instrument {
        Instrument::strings(
            "guitar",
            "Guitar",
            Family::PluckedString,
            ["E2", "A2", "D3", "G3", "B3", "E4"].map(pitch).to_vec(),
            22,
            true,
            Transposition::SoundsBelow(Interval::OCTAVE),
        )
    }

    /// Basse 4 cordes, accordage standard, 20 frettes.
    pub fn bass() -> Instrument {
        Instrument::strings(
            "bass",
            "Bass",
            Family::PluckedString,
            ["E1", "A1", "D2", "G2"].map(pitch).to_vec(),
            20,
            true,
            Transposition::SoundsBelow(Interval::OCTAVE),
        )
    }

    /// Violon. `span` de deux octaves par corde : étendue pratique, pas une
    /// limite physique.
    pub fn violin() -> Instrument {
        Instrument::strings(
            "violin",
            "Violin",
            Family::BowedString,
            ["G3", "D4", "A4", "E5"].map(pitch).to_vec(),
            24,
            false,
            Transposition::Concert,
        )
    }

    pub fn cello() -> Instrument {
        Instrument::strings(
            "cello",
            "Cello",
            Family::BowedString,
            ["C2", "G2", "D3", "A3"].map(pitch).to_vec(),
            24,
            false,
            Transposition::Concert,
        )
    }

    pub fn flute() -> Instrument {
        Instrument::ranged(
            "flute",
            "Flute",
            Family::Woodwind,
            Layout::Wind,
            pitch("C4"),
            pitch("C7"),
            Transposition::Concert,
        )
    }

    /// Saxophone alto en mi♭ : sonne une sixte majeure sous l'écrit.
    pub fn alto_saxophone() -> Instrument {
        Instrument::ranged(
            "alto-saxophone",
            "Alto Saxophone",
            Family::Woodwind,
            Layout::Wind,
            pitch("Bb3"),
            pitch("F6"),
            Transposition::SoundsBelow(Interval::MAJOR_SIXTH),
        )
    }

    /// Saxophone ténor en si♭ : sonne une neuvième majeure sous l'écrit.
    pub fn tenor_saxophone() -> Instrument {
        Instrument::ranged(
            "tenor-saxophone",
            "Tenor Saxophone",
            Family::Woodwind,
            Layout::Wind,
            pitch("Bb3"),
            pitch("F6"),
            Transposition::SoundsBelow(Interval::MAJOR_NINTH),
        )
    }

    /// Batterie standard, numérotation General MIDI.
    pub fn drum_kit() -> Instrument {
        let pieces = [
            ("Kick", 36),
            ("Snare", 38),
            ("Closed Hi-Hat", 42),
            ("Pedal Hi-Hat", 44),
            ("Open Hi-Hat", 46),
            ("Floor Tom", 43),
            ("Low Tom", 45),
            ("Mid Tom", 47),
            ("High Tom", 50),
            ("Crash Cymbal", 49),
            ("Ride Cymbal", 51),
        ]
        .into_iter()
        .map(|(name, midi_note)| PercussionPiece {
            name: name.to_string(),
            midi_note,
        })
        .collect();
        Instrument {
            id: "drum-kit".to_string(),
            name: "Drum Kit".to_string(),
            family: Family::Percussion,
            layout: Layout::Percussion { pieces },
            range: None,
            transposition: Transposition::Concert,
        }
    }

    /// Les instruments fournis avec l'application.
    pub fn presets() -> Vec<Instrument> {
        vec![
            Instrument::piano(),
            Instrument::guitar(),
            Instrument::bass(),
            Instrument::drum_kit(),
            Instrument::violin(),
            Instrument::cello(),
            Instrument::alto_saxophone(),
            Instrument::tenor_saxophone(),
            Instrument::flute(),
            Instrument::synthesizer(),
        ]
    }

    /// Vrai si la hauteur réelle est dans la tessiture.
    pub fn can_play(&self, sounding: Pitch) -> bool {
        self.range.is_some_and(|(low, high)| {
            (low.midi()..=high.midi()).contains(&sounding.midi())
        })
    }

    /// Toutes les hauteurs réelles jouables, de la plus grave à la plus aiguë.
    pub fn available_pitches(&self, spelling: Spelling) -> Vec<Pitch> {
        match self.range {
            Some((low, high)) => (low.midi()..=high.midi())
                .map(|midi| Pitch::from_midi(midi, spelling))
                .collect(),
            None => Vec::new(),
        }
    }

    /// Positions où jouer une hauteur réelle précise. Vide pour les
    /// instruments sans cordes.
    pub fn positions(&self, sounding: Pitch) -> Vec<StringPosition> {
        let Layout::Strings { open, span, .. } = &self.layout else {
            return Vec::new();
        };
        open.iter()
            .enumerate()
            .filter_map(|(string, open_pitch)| {
                let stop = sounding.midi() - open_pitch.midi();
                (0..=*span as i32)
                    .contains(&stop)
                    .then_some(StringPosition {
                        string,
                        stop: stop as u8,
                    })
            })
            .collect()
    }

    /// Toutes les positions d'une note, à toutes les octaves (pour afficher
    /// une note, une gamme ou un accord sur le manche).
    pub fn positions_of(&self, note: Note) -> Vec<StringPosition> {
        let Layout::Strings { open, span, .. } = &self.layout else {
            return Vec::new();
        };
        let target = note.pitch_class().value() as i32;
        let mut positions = Vec::new();
        for (string, open_pitch) in open.iter().enumerate() {
            for stop in 0..=*span {
                if (open_pitch.midi() + stop as i32).rem_euclid(12) == target {
                    positions.push(StringPosition { string, stop });
                }
            }
        }
        positions
    }

    /// Doigté d'une ligne mélodique (hauteurs réelles, en MIDI), note après
    /// note : la position qui limite les déplacements de la main et préfère le
    /// bas du manche. `None` pour une hauteur hors de l'instrument (elle
    /// n'interrompt pas le reste du doigté).
    pub fn tablature(&self, sounding: &[i32]) -> Vec<Option<StringPosition>> {
        // Chaque note : ses positions possibles. Puis plus court chemin
        // (Viterbi) : coût d'une position + coût du passage de l'une à l'autre.
        let candidates: Vec<Vec<StringPosition>> =
            sounding.iter().map(|&midi| self.positions(Pitch::from_midi(midi, Spelling::Sharps))).collect();
        let place = |p: &StringPosition| f64::from(p.stop) * 0.12;
        let shift = |a: &StringPosition, b: &StringPosition| {
            // Une corde à vide ne bouge pas la main.
            let hand = if a.stop == 0 || b.stop == 0 { 0.5 } else { f64::from((i32::from(a.stop) - i32::from(b.stop)).unsigned_abs()) };
            hand + 0.3 * (a.string as f64 - b.string as f64).abs()
        };
        let mut result = vec![None; sounding.len()];
        let mut start = 0;
        while start < candidates.len() {
            if candidates[start].is_empty() {
                start += 1;
                continue;
            }
            // Tronçon de notes jouables consécutives.
            let mut end = start;
            while end < candidates.len() && !candidates[end].is_empty() {
                end += 1;
            }
            let mut cost: Vec<f64> = candidates[start].iter().map(place).collect();
            let mut back: Vec<Vec<usize>> = vec![vec![0; candidates[start].len()]];
            for i in start + 1..end {
                let mut next_cost = Vec::with_capacity(candidates[i].len());
                let mut next_back = Vec::with_capacity(candidates[i].len());
                for b in &candidates[i] {
                    let (best, value) = candidates[i - 1]
                        .iter()
                        .enumerate()
                        .map(|(k, a)| (k, cost[k] + shift(a, b)))
                        .min_by(|x, y| x.1.total_cmp(&y.1))
                        .unwrap_or((0, 0.0));
                    next_cost.push(value + place(b));
                    next_back.push(best);
                }
                cost = next_cost;
                back.push(next_back);
            }
            let mut k = cost.iter().enumerate().min_by(|x, y| x.1.total_cmp(y.1)).map(|(k, _)| k).unwrap_or(0);
            for i in (start..end).rev() {
                result[i] = Some(candidates[i][k]);
                k = back[i - start][k];
            }
            start = end;
        }
        result
    }

    /// Accord écrit pour cet instrument, pour faire entendre `sounding`
    /// (identique pour un instrument en ut).
    pub fn written_chord(&self, sounding: &crate::Chord) -> crate::Chord {
        match self.transposition {
            Transposition::Concert => *sounding,
            Transposition::SoundsBelow(interval) => sounding.transposed_up(interval),
            Transposition::SoundsAbove(interval) => sounding.transposed_down(interval),
        }
    }

    /// Hauteur réelle produite à une position.
    pub fn pitch_at(&self, position: StringPosition, spelling: Spelling) -> Option<Pitch> {
        let Layout::Strings { open, span, .. } = &self.layout else {
            return None;
        };
        let open_pitch = open.get(position.string)?;
        (position.stop <= *span)
            .then(|| Pitch::from_midi(open_pitch.midi() + position.stop as i32, spelling))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(string: usize, stop: u8) -> StringPosition {
        StringPosition { string, stop }
    }

    #[test]
    fn tablature_keeps_the_hand_still_and_skips_what_cannot_be_played() {
        let guitar = Instrument::guitar();
        // Mi grave, la à vide, puis une gamme montante : positions sobres.
        let tab = guitar.tablature(&[40, 45, 47, 48, 50]);
        assert_eq!(tab[0], Some(at(0, 0)));
        assert_eq!(tab[1], Some(at(1, 0)));
        assert!(tab.iter().flatten().all(|p| p.stop <= 5), "{tab:?}");
        // Chaque position sonne bien la hauteur demandée.
        for (midi, position) in [40, 45, 47, 48, 50].iter().zip(&tab) {
            let pitch = guitar.pitch_at(position.unwrap(), Spelling::Sharps).unwrap();
            assert_eq!(pitch.midi(), *midi);
        }
        // Trop grave pour la guitare : rien, et le reste continue.
        let tab = guitar.tablature(&[20, 64]);
        assert_eq!(tab[0], None);
        assert!(tab[1].is_some());
        assert!(Instrument::flute().tablature(&[60]).iter().all(Option::is_none));
    }

    #[test]
    fn transposing_instruments_read_chords_shifted() {
        let chord: crate::Chord = "C".parse().unwrap();
        // Saxophone alto en mi bémol : pour entendre do, il lit la.
        assert_eq!(Instrument::alto_saxophone().written_chord(&chord).to_string(), "A");
        // Saxophone ténor en si bémol : il lit ré.
        assert_eq!(Instrument::tenor_saxophone().written_chord(&chord).to_string(), "D");
        assert_eq!(Instrument::piano().written_chord(&chord).to_string(), "C");
    }

    #[test]
    fn piano_has_88_keys() {
        let piano = Instrument::piano();
        let keys = piano.available_pitches(Spelling::Sharps);
        assert_eq!(keys.len(), 88);
        assert_eq!(keys[0].to_string(), "A0");
        assert_eq!(keys[87].to_string(), "C8");
        assert!(piano.can_play(pitch("C4")));
        assert!(!piano.can_play(pitch("G#0")));
        assert!(piano.positions(pitch("C4")).is_empty());
    }

    #[test]
    fn guitar_positions_for_a_pitch() {
        let guitar = Instrument::guitar();
        assert_eq!(
            guitar.positions(pitch("E4")),
            [at(1, 19), at(2, 14), at(3, 9), at(4, 5), at(5, 0)]
        );
        assert_eq!(guitar.positions(pitch("E2")), [at(0, 0)]);
        assert!(guitar.positions(pitch("D2")).is_empty());
        let (low, high) = guitar.range.unwrap();
        assert_eq!((low.to_string(), high.to_string()), ("E2".into(), "D6".into()));
    }

    #[test]
    fn guitar_positions_for_a_note_name() {
        let guitar = Instrument::guitar();
        let c: Note = "C".parse().unwrap();
        let positions = guitar.positions_of(c);
        // Do sur chaque corde : frettes 8 et 20 (mi), 3 et 15 (la), 10 et 22 (ré),
        // 5 et 17 (sol), 1 et 13 (si), 8 et 20 (mi aigu).
        assert_eq!(
            positions,
            [
                at(0, 8),
                at(0, 20),
                at(1, 3),
                at(1, 15),
                at(2, 10),
                at(2, 22),
                at(3, 5),
                at(3, 17),
                at(4, 1),
                at(4, 13),
                at(5, 8),
                at(5, 20)
            ]
        );
        for position in positions {
            let found = guitar.pitch_at(position, Spelling::Sharps).unwrap();
            assert_eq!(found.note.pitch_class(), c.pitch_class());
        }
        assert_eq!(guitar.pitch_at(at(0, 23), Spelling::Sharps), None);
        assert_eq!(guitar.pitch_at(at(6, 0), Spelling::Sharps), None);
    }

    #[test]
    fn bowed_strings_are_fretless() {
        let violin = Instrument::violin();
        assert!(matches!(violin.layout, Layout::Strings { fretted: false, .. }));
        assert_eq!(violin.positions(pitch("A4")), [at(0, 14), at(1, 7), at(2, 0)]);
        assert!(!violin.can_play(pitch("F3")));
        assert!(Instrument::cello().can_play(pitch("C2")));
    }

    #[test]
    fn transposing_instruments() {
        let alto = Instrument::alto_saxophone();
        assert_eq!(alto.transposition.to_sounding(pitch("C5")), pitch("Eb4"));
        assert_eq!(alto.transposition.to_written(pitch("Eb4")), pitch("C5"));
        let (low, high) = alto.range.unwrap();
        assert_eq!((low, high), (pitch("Db3"), pitch("Ab5")));

        let tenor = Instrument::tenor_saxophone();
        assert_eq!(tenor.transposition.to_sounding(pitch("C5")), pitch("Bb3"));
        assert_eq!(tenor.range.unwrap(), (pitch("Ab2"), pitch("Eb5")));

        let guitar = Instrument::guitar();
        assert_eq!(guitar.transposition.to_written(pitch("E2")), pitch("E3"));

        let flute = Instrument::flute();
        assert_eq!(flute.transposition.to_sounding(pitch("C5")), pitch("C5"));
    }

    #[test]
    fn written_and_sounding_round_trip() {
        for instrument in Instrument::presets() {
            for midi in [40, 55, 60, 73] {
                let sounding = Pitch::from_midi(midi, Spelling::Flats);
                let written = instrument.transposition.to_written(sounding);
                assert_eq!(
                    instrument.transposition.to_sounding(written).midi(),
                    midi,
                    "{}",
                    instrument.name
                );
            }
        }
    }

    #[test]
    fn drum_kit_has_no_pitched_range() {
        let kit = Instrument::drum_kit();
        assert_eq!(kit.range, None);
        assert!(!kit.can_play(pitch("C4")));
        assert!(kit.available_pitches(Spelling::Sharps).is_empty());
        let Layout::Percussion { pieces } = &kit.layout else {
            panic!("la batterie doit être une percussion");
        };
        assert!(pieces.iter().any(|p| p.name == "Kick" && p.midi_note == 36));
        assert!(pieces.iter().any(|p| p.name == "Snare" && p.midi_note == 38));
    }

    #[test]
    fn custom_tunings() {
        let drop_d = Instrument::strings(
            "guitar-drop-d",
            "Guitar (Drop D)",
            Family::PluckedString,
            ["D2", "A2", "D3", "G3", "B3", "E4"].map(pitch).to_vec(),
            24,
            true,
            Transposition::SoundsBelow(Interval::OCTAVE),
        );
        assert_eq!(drop_d.positions(pitch("D2")), [at(0, 0)]);
        assert_eq!(drop_d.range.unwrap().1.to_string(), "E6");

        let ukulele = Instrument::strings(
            "ukulele",
            "Ukulele",
            Family::PluckedString,
            ["G4", "C4", "E4", "A4"].map(pitch).to_vec(),
            12,
            true,
            Transposition::Concert,
        );
        // Accordage rentrant : la corde la plus grave n'est pas la première.
        assert_eq!(ukulele.range.unwrap().0.to_string(), "C4");
    }

    #[test]
    fn presets_have_unique_ids_and_cover_the_required_instruments() {
        let presets = Instrument::presets();
        let ids: std::collections::HashSet<&str> = presets.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(ids.len(), presets.len());
        for id in ["piano", "guitar", "bass", "drum-kit", "violin", "cello", "flute", "synthesizer"] {
            assert!(ids.contains(id), "preset manquant : {id}");
        }
    }
}
