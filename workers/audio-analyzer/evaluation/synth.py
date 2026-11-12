"""Rend en audio les morceaux du corpus d'évaluation.

Ce script ne contient aucune règle musicale : il joue les notes MIDI listées
dans `corpus.json` (écrit par le moteur Rust) avec des timbres additifs
simples, une batterie synthétique et, au besoin, un bruit de fond.

Ces sons sont des instruments de mesure, pas de la musique réelle : ils ont
des harmoniques, des attaques et des percussions, mais ni réverbération, ni
voix, ni mixage. Les scores obtenus dessus sont un plafond optimiste.
"""

from __future__ import annotations

import numpy as np

SR = 22_050

# timbre : (nombre de partiels, pente du spectre, durée d'attaque en secondes)
TIMBRES = {
    "piano": (8, 1.3, 0.005),
    "pad": (6, 1.6, 0.08),
    "bright": (14, 1.0, 0.005),
    "bass": (4, 1.5, 0.01),
    "lead": (3, 2.0, 0.01),
}


def _hz(midi: float, cents: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69) / 12.0 + cents / 1200.0)


def _tone(freq: float, seconds: float, timbre: str) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    out = np.zeros_like(t)
    partials, slope, attack = TIMBRES[timbre]
    for k in range(1, partials + 1):
        if freq * k >= SR / 2:
            break
        partial = np.sin(2 * np.pi * freq * k * t) / k**slope
        if timbre == "piano":
            partial *= np.exp(-t * (0.6 + 0.5 * k))
        elif timbre == "bright":
            partial *= np.exp(-t / 1.5)
        out += partial
    envelope = np.minimum(1.0, t / attack)
    release = min(0.06, seconds / 4)
    envelope *= np.minimum(1.0, (seconds - t) / release)
    return out * envelope


def _add(mix: np.ndarray, sound: np.ndarray, at_s: float, gain: float) -> None:
    start = int(at_s * SR)
    end = min(len(mix), start + len(sound))
    if end > start:
        mix[start:end] += gain * sound[: end - start]


def _kick() -> np.ndarray:
    t = np.arange(int(0.18 * SR)) / SR
    phase = 2 * np.pi * (50 * t + (120 - 50) * 0.04 * (1 - np.exp(-t / 0.04)))
    return np.sin(phase) * np.exp(-t / 0.06)


def _noise_hit(rng: np.random.Generator, seconds: float, decay: float, bright: bool) -> np.ndarray:
    n = int(seconds * SR)
    noise = rng.standard_normal(n)
    if bright:  # différence première : ne garde que l'aigu
        noise = np.diff(noise, prepend=0.0)
    return noise * np.exp(-np.arange(n) / SR / decay)


def render(piece: dict, lead_in_s: float) -> tuple[np.ndarray, dict]:
    """Renvoie le signal et la vérité de terrain en secondes."""
    rng = np.random.default_rng(sum(map(ord, piece["id"])))
    beat_s = 60.0 / piece["bpm"]
    total_beats = max(c["start_beat"] + c["beats"] for c in piece["chords"])
    duration = lead_in_s + total_beats * beat_s + 1.0
    mix = np.zeros(int(duration * SR))
    cents = piece["tuning_cents"]
    timbre = piece["timbre"]

    def at(beat: float) -> float:
        return lead_in_s + beat * beat_s

    for chord in piece["chords"]:
        start, beats = chord["start_beat"], chord["beats"]
        _add(mix, _tone(_hz(chord["bass"], cents), beats * beat_s, "bass"), at(start), 0.5)
        if piece["pattern"] == "arpeggio":
            notes = chord["notes"]
            for step in range(beats * 2):
                note = notes[step % len(notes)]
                _add(mix, _tone(_hz(note, cents), beat_s, timbre), at(start + step / 2), 0.45)
        elif timbre == "pad":
            for note in chord["notes"]:
                _add(mix, _tone(_hz(note, cents), beats * beat_s, timbre), at(start), 0.3)
        else:
            for b in range(beats):
                for note in chord["notes"]:
                    _add(mix, _tone(_hz(note, cents), beat_s, timbre), at(start + b), 0.3 if b == 0 else 0.22)

    for note in piece["melody"]:
        _add(mix, _tone(_hz(note["midi"], cents), note["beats"] * beat_s, "lead"), at(note["start_beat"]), 0.25)

    if piece["drums"]:
        bar = piece["beats_per_bar"]
        kick = _kick()
        for beat in range(total_beats):
            position = beat % bar
            if position == 0:
                _add(mix, kick, at(beat), 0.9)
            elif bar == 4 and position == 2:
                _add(mix, kick, at(beat), 0.55)
            if (bar == 4 and position in (1, 3)) or (bar == 3 and position in (1, 2)):
                _add(mix, _noise_hit(rng, 0.12, 0.03, False), at(beat), 0.22 if bar == 4 else 0.12)
            _add(mix, _noise_hit(rng, 0.04, 0.008, True), at(beat), 0.08)
            _add(mix, _noise_hit(rng, 0.04, 0.008, True), at(beat + 0.5), 0.05)

    if piece["noise_snr_db"] is not None:
        power = float(np.mean(mix**2))
        noise_power = power / 10 ** (piece["noise_snr_db"] / 10)
        mix = mix + rng.standard_normal(len(mix)) * np.sqrt(noise_power)

    mix = 0.8 * mix / max(1e-9, float(np.max(np.abs(mix))))
    return mix.astype(np.float32), {"duration_s": duration}
