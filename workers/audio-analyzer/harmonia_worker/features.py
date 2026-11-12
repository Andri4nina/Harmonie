"""Extraction des descripteurs audio.

Ce module mesure le signal et rien d'autre : énergie par classe de hauteur
(chroma), temps, attaques, accordage. Il ne nomme ni accord ni tonalité —
c'est le rôle du moteur Rust (`crates/harmonia-audio`), qui reçoit le
dictionnaire produit ici.

Chaîne de traitement
--------------------
1. Décodage en mono à 22 050 Hz.
2. Séparation harmonique / percussive (HPSS) : le chroma est mesuré sur la
   partie harmonique, pour que la batterie ne le brouille pas.
3. Accordage : écart moyen des partiels par rapport au La 440, compensé dans
   les bancs de filtres.
4. Chroma à Q constant (Do 3 à Si 7, amplitudes compressées) et chroma grave
   (Do 1 à Si 2).
5. Suivi des temps (programmation dynamique d'Ellis) sur l'enveloppe des
   attaques. Sans temps exploitables, des trames de durée fixe sont utilisées.
   Chaque temps est coupé en deux trames.
6. Ligne supérieure : à chaque pas, la plus aiguë des hauteurs saillantes
   (sommation harmonique sur la CQT, de Sol 3 à Sol 6). Dans une musique
   accompagnée, c'est le plus souvent la mélodie ; sans mélodie, c'est la
   voix supérieure des accords. Le moteur Rust la découpe en notes.
7. Netteté de la pulsation : les attaques reviennent-elles à chaque temps ?
8. Synthèse par trame : médiane du chroma, énergie moyenne,
   force de l'attaque initiale.
"""

from __future__ import annotations

import librosa
import numpy as np

SCHEMA = 1
SAMPLE_RATE = 22_050
HOP = 512
# Durée des trames quand aucun temps n'est suivi.
FALLBACK_FRAME_S = 0.5
# En deçà, le fichier est considéré comme muet.
SILENCE_PEAK = 1e-4
BINS_PER_OCTAVE = 36
# Longueur minimale d'une trame, en pas d'analyse (environ 70 ms).
MIN_FRAME = 3
# Facteur de la compression logarithmique du spectre.
COMPRESSION = 50.0


def _empty(duration_s: float) -> dict:
    return {
        "schema": SCHEMA,
        "duration_s": round(duration_s, 4),
        "sample_rate": SAMPLE_RATE,
        "tuning_cents": 0.0,
        "beats_tracked": False,
        "pulse_clarity": 0.0,
        "frames": {
            "boundaries": [],
            "chroma": [],
            "bass_chroma": [],
            "rms": [],
            "onset_strength": [],
            "on_beat": [],
        },
    }


def _normalize(columns: np.ndarray) -> np.ndarray:
    """Ramène chaque trame à un maximum de 1 ; une trame nulle reste nulle."""
    peak = columns.max(axis=0, keepdims=True)
    return np.divide(columns, peak, out=np.zeros_like(columns), where=peak > 1e-9)


# Ligne supérieure : Sol 3 (MIDI 55) à Sol 6, 36 cases par octave.
LINE_LOW_MIDI = 55
LINE_OCTAVES = 3
# Harmoniques sommées et leurs poids.
HARMONICS = ((1, 1.0), (2, 0.6), (3, 0.4), (4, 0.3))
# Une hauteur est saillante si elle atteint cette part du maximum du pas.
SALIENT = 0.55


def pitch_track(harmonic: np.ndarray, sr: int, tuning: float) -> dict:
    """Hauteur de la ligne supérieure à chaque pas (0 si rien ne se détache)
    et sa clarté : saillance de la hauteur retenue rapportée au maximum du pas,
    de 0 à 1."""
    bins = BINS_PER_OCTAVE * LINE_OCTAVES
    spectrum = np.abs(
        librosa.cqt(
            harmonic, sr=sr, hop_length=HOP, tuning=tuning, fmin=librosa.midi_to_hz(LINE_LOW_MIDI),
            n_bins=BINS_PER_OCTAVE * (LINE_OCTAVES + 2), bins_per_octave=BINS_PER_OCTAVE,
        )
    )
    level = np.log1p(30.0 * spectrum / (float(spectrum.max()) or 1.0))
    salience = np.zeros((bins, level.shape[1]))
    for harmonic_number, weight in HARMONICS:
        shift = int(round(BINS_PER_OCTAVE * np.log2(harmonic_number)))
        salience += weight * level[shift : shift + bins]

    energy = librosa.feature.rms(y=harmonic, hop_length=HOP)[0][: salience.shape[1]]
    audible = energy > 0.1 * float(np.median(energy[energy > 0])) if np.any(energy > 0) else np.zeros_like(energy, bool)
    top = salience.max(axis=0)
    floor = np.median(salience, axis=0)
    # Maxima locaux assez saillants ; on garde le plus aigu.
    peak = (salience[1:-1] >= salience[:-2]) & (salience[1:-1] >= salience[2:]) & (salience[1:-1] >= SALIENT * top)
    hz = np.zeros(salience.shape[1])
    clarity = np.zeros(salience.shape[1])
    for t in np.flatnonzero(audible & (top > 0) & peak.any(axis=0)):
        b = int(np.flatnonzero(peak[:, t]).max()) + 1
        midi = LINE_LOW_MIDI + b / (BINS_PER_OCTAVE / 12) + tuning
        hz[t] = librosa.midi_to_hz(midi)
        clarity[t] = min(1.0, max(0.0, (salience[b, t] - floor[t]) / max(top[t] - floor[t], 1e-9)))
    return {"hop_s": HOP / sr, "hz": np.round(hz, 2).tolist(), "clarity": np.round(clarity, 3).tolist()}


def extract_from_signal(y: np.ndarray, sr: int = SAMPLE_RATE, melody: bool = True) -> dict:
    """Descripteurs d'un signal mono déjà décodé."""
    duration_s = len(y) / sr
    if len(y) < 4 * HOP or float(np.max(np.abs(y))) < SILENCE_PEAK:
        return _empty(duration_s)

    harmonic, _percussive = librosa.effects.hpss(y)
    tuning = float(librosa.estimate_tuning(y=harmonic, sr=sr))  # fraction de demi-ton

    # Chroma des accords : Do 3 à Si 7. Le registre grave en est exclu (la
    # basse l'écraserait) et les amplitudes sont compressées (logarithme) pour
    # que la tierce et la septième pèsent face à la fondamentale.
    treble = np.abs(
        librosa.cqt(
            harmonic, sr=sr, hop_length=HOP, tuning=tuning, fmin=librosa.note_to_hz("C3"),
            n_bins=5 * BINS_PER_OCTAVE, bins_per_octave=BINS_PER_OCTAVE,
        )
    )
    reference = float(np.percentile(treble, 99.9)) or 1.0
    chroma = librosa.feature.chroma_cqt(
        C=np.log1p(COMPRESSION * treble / reference), sr=sr, hop_length=HOP,
        fmin=librosa.note_to_hz("C3"), bins_per_octave=BINS_PER_OCTAVE, norm=None,
    )
    # Chroma grave : Do 1 à Si 2, sans compression — seule la note dominante compte.
    bass = librosa.feature.chroma_cqt(
        y=harmonic, sr=sr, hop_length=HOP, tuning=tuning, fmin=librosa.note_to_hz("C1"), n_octaves=2, norm=None
    )
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    onsets = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    n = min(chroma.shape[1], bass.shape[1], len(rms), len(onsets))

    _tempo, beats = librosa.beat.beat_track(onset_envelope=onsets, sr=sr, hop_length=HOP)
    beats = np.unique(beats[(beats > 0) & (beats < n)])
    tracked = len(beats) >= 4
    if tracked:
        # Deux trames par temps : un accord peut changer sur un contretemps,
        # et un suivi calé à contretemps reste aligné sur la musique.
        halves = [(a + b) // 2 for a, b in zip(beats[:-1], beats[1:]) if b - a >= 2 * MIN_FRAME]
        starts = np.unique(np.concatenate(([0], beats, halves))).astype(int)
    else:
        step = max(1, round(FALLBACK_FRAME_S * sr / HOP))
        starts = np.arange(0, n, step)
    edges = np.concatenate((starts, [n]))
    # Une dernière trame trop courte est rattachée à la précédente.
    if len(edges) > 2 and edges[-1] - edges[-2] < 2:
        edges = np.delete(edges, -2)
    beat_set = set(beats.tolist()) if tracked else set()

    # Netteté de la pulsation : autocorrélation de l'enveloppe des attaques à
    # la période des temps, rapportée à son énergie. Proche de 0 quand rien ne
    # marque les temps (nappes tenues), élevée avec une batterie régulière.
    pulse_clarity = 0.0
    if tracked:
        centered = onsets[:n] - np.mean(onsets[:n])
        correlation = librosa.autocorrelate(centered)
        period = int(round(float(np.median(np.diff(beats)))))
        if correlation[0] > 1e-9 and 1 <= period < len(correlation) - 1:
            pulse_clarity = float(np.clip(np.max(correlation[period - 1 : period + 2]) / correlation[0], 0.0, 1.0))

    chroma_frames, bass_frames, rms_frames, onset_frames, on_beat = [], [], [], [], []
    for start, end in zip(edges[:-1], edges[1:]):
        chroma_frames.append(np.median(chroma[:, start:end], axis=1))
        bass_frames.append(np.median(bass[:, start:end], axis=1))
        rms_frames.append(float(np.mean(rms[start:end])))
        # L'attaque peut précéder ou suivre le temps détecté de quelques trames.
        onset_frames.append(float(np.max(onsets[max(0, start - 2) : min(n, start + 3)])))
        on_beat.append(int(start) in beat_set)

    chroma_out = _normalize(np.array(chroma_frames).T).T
    bass_out = _normalize(np.array(bass_frames).T).T
    times = librosa.frames_to_time(edges, sr=sr, hop_length=HOP)
    times[-1] = max(duration_s, times[-2] + 1e-3)

    return {
        "schema": SCHEMA,
        "duration_s": round(duration_s, 4),
        "sample_rate": sr,
        "tuning_cents": round(tuning * 100.0, 2),
        "beats_tracked": bool(tracked),
        "pulse_clarity": round(pulse_clarity, 4),
        "pitch": pitch_track(harmonic, sr, tuning) if melody else None,
        "frames": {
            "boundaries": [round(float(t), 4) for t in times],
            "chroma": np.round(chroma_out, 4).tolist(),
            "bass_chroma": np.round(bass_out, 4).tolist(),
            "rms": [round(v, 6) for v in rms_frames],
            "onset_strength": [round(v, 4) for v in onset_frames],
            "on_beat": on_beat,
        },
    }


def extract(path: str, offset_s: float = 0.0, duration_s: float | None = None, melody: bool = True) -> dict:
    """Descripteurs d'un fichier audio, ou d'une portion de ce fichier."""
    y, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True, offset=offset_s, duration=duration_s)
    return extract_from_signal(y, sr, melody=melody)
