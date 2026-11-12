"""Relit les exports du générateur avec des outils indépendants du projet.

    cargo run -p harmonia-theory --example export_sample --features serde -- out
    python scripts/check_exports.py out

- MIDI : relu par `mido` (bibliothèque Python de référence) ; nombre de
  pistes, de notes, tempo et armure comparés à ce que le moteur a généré.
- MusicXML : analysé par un parseur XML standard ; chaque mesure doit durer
  exactement quatre temps.
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import mido

folder = Path(sys.argv[1])
failures = 0
for summary_path in sorted(folder.glob("sample-*.json")):
    expected = json.loads(summary_path.read_text(encoding="utf-8"))
    stem = summary_path.with_suffix("")
    midi = mido.MidiFile(stem.with_suffix(".mid"))
    ons = [sum(1 for m in track if m.type == "note_on" and m.velocity > 0) for track in midi.tracks]
    tempo = next(m.tempo for m in midi.tracks[0] if m.type == "set_tempo")
    key = next(m.key for m in midi.tracks[0] if m.type == "key_signature")
    problems = []
    if midi.type != 1 or len(midi.tracks) != 4:
        problems.append(f"type {midi.type}, {len(midi.tracks)} pistes")
    if ons != [0, expected["melody"], expected["chord_notes"], expected["chords"]]:
        problems.append(f"notes {ons}")
    if abs(mido.tempo2bpm(tempo) - expected["bpm"]) > 0.01:
        problems.append(f"tempo {mido.tempo2bpm(tempo)}")
    if abs(midi.length - expected["chords"] * 4 * 60 / expected["bpm"]) > 0.6:
        problems.append(f"durée {midi.length:.2f} s")

    root = ET.parse(stem.with_suffix(".musicxml")).getroot()
    divisions = int(root.find(".//divisions").text)
    fifths = int(root.find(".//key/fifths").text)
    measures = root.findall(".//measure")
    for measure in measures:
        total = sum(int(d.text) for d in measure.findall("note/duration"))
        if total != 4 * divisions:
            problems.append(f"mesure {measure.get('number')} : {total}")
    if fifths != expected["fifths"] or len(measures) != expected["chords"]:
        problems.append(f"armure {fifths} ou mesures {len(measures)}")
    if len(root.findall(".//harmony")) != expected["chords"]:
        problems.append("symboles d'accords manquants")

    status = "ok" if not problems else "ERREUR " + "; ".join(problems)
    failures += bool(problems)
    print(f"{stem.name} : MIDI {len(midi.tracks)} pistes, {sum(ons)} notes, {midi.length:.1f} s, armure {key} ; MusicXML {len(measures)} mesures -> {status}")
sys.exit(1 if failures else 0)
