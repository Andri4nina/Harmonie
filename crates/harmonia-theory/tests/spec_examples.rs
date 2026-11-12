//! Exemples du cahier des charges, vérifiés par l'API publique du moteur.

use harmonia_theory::{
    Chord, Instrument, Interval, Key, Note, Progression, Scale, ScaleType,
};

fn joined<T: ToString>(items: &[T]) -> String {
    items
        .iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(" ")
}

#[test]
fn c_major_notes_chords_and_progression() {
    let key: Key = "C".parse().unwrap();

    assert_eq!(joined(&key.scale().notes()), "C D E F G A B");
    assert_eq!(joined(&key.diatonic_triads()), "C Dm Em F G Am Bdim");

    let progression: Progression = "I - V - vi - IV".parse().unwrap();
    assert_eq!(joined(&progression.resolve(&key)), "C G Am F");
}

/// « Lorsqu'il clique sur C » : chaque relation attendue est calculable.
#[test]
fn relations_of_the_note_c() {
    let c: Note = "C".parse().unwrap();

    // Gammes majeures contenant C : sept, de Db (5 bémols) à G (1 dièse).
    let majors_with_c: Vec<String> = Key::circle_of_fifths()
        .into_iter()
        .filter(|key| key.scale().contains(c))
        .map(|key| key.tonic.to_string())
        .collect();
    assert_eq!(majors_with_c, ["C", "G", "Db", "Ab", "Eb", "Bb", "F"]);

    // Accords diatoniques de Do majeur contenant C.
    let key: Key = "C".parse().unwrap();
    let chords_with_c: Vec<Chord> = key
        .diatonic_triads()
        .into_iter()
        .filter(|chord| chord.notes().contains(&c))
        .collect();
    assert_eq!(joined(&chords_with_c), "C F Am");

    // Intervalles depuis C.
    assert_eq!(c.up(Interval::MAJOR_THIRD).to_string(), "E");
    assert_eq!(c.up(Interval::PERFECT_FIFTH).to_string(), "G");
    assert_eq!(c.up(Interval::MINOR_SEVENTH).to_string(), "Bb");

    // Notes voisines.
    assert_eq!(c.down(Interval::MINOR_SECOND).to_string(), "B");
    assert_eq!(c.up(Interval::MINOR_SECOND).to_string(), "Db");

    // Modes associés : C est la tonique de sept modes de gammes différentes.
    let modes: Vec<Vec<Note>> = ScaleType::DIATONIC_MODES
        .iter()
        .map(|&kind| Scale::new(c, kind).notes())
        .collect();
    assert_eq!(joined(&modes[1]), "C D Eb F G A Bb"); // dorien
    assert_eq!(joined(&modes[3]), "C D E F# G A B"); // lydien

    // Positions sur différents instruments.
    assert_eq!(Instrument::guitar().positions_of(c).len(), 12);
    assert_eq!(Instrument::bass().positions_of(c).len(), 7);
    let piano_cs = Instrument::piano()
        .available_pitches(harmonia_theory::Spelling::Sharps)
        .into_iter()
        .filter(|p| p.note == c)
        .count();
    assert_eq!(piano_cs, 8);
}

#[test]
fn a_song_can_be_transposed_for_a_transposing_instrument() {
    // Une grille en Do, à faire jouer par un saxophone alto (en mi♭) :
    // la partie écrite est une sixte majeure plus haut, donc en La.
    let concert: Key = "C".parse().unwrap();
    let progression: Progression = "I-vi-ii-V7".parse().unwrap();
    let written_key = concert.transposed_up(Interval::MAJOR_SIXTH);

    assert_eq!(written_key.to_string(), "A major");
    assert_eq!(joined(&progression.resolve(&written_key)), "A F#m Bm E7");
}
