"""Tests de l'extraction : signaux construits dont on connaît le contenu."""

import json
import subprocess
import sys

import numpy as np
import pytest

from harmonia_worker import SCHEMA, extract_from_signal

SR = 22_050


def tone(midi: float, seconds: float, cents: float = 0.0) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    freq = 440.0 * 2 ** ((midi - 69) / 12 + cents / 1200)
    return sum(np.sin(2 * np.pi * freq * k * t) / k**1.5 for k in range(1, 5))


def clicks(bpm: float, seconds: float) -> np.ndarray:
    out = np.zeros(int(seconds * SR))
    burst = np.exp(-np.arange(int(0.03 * SR)) / (0.005 * SR))
    step = 60.0 / bpm
    for i in range(int(seconds / step)):
        start = int(i * step * SR)
        out[start : start + len(burst)] += burst[: len(out) - start]
    return out


def c_major(seconds: float = 8.0, cents: float = 0.0) -> np.ndarray:
    return sum(tone(m, seconds, cents) for m in (48, 52, 55)) + tone(36, seconds, cents)


def check_contract(features: dict) -> None:
    frames = features["frames"]
    n = len(frames["chroma"])
    assert features["schema"] == SCHEMA
    for name in ("bass_chroma", "rms", "onset_strength", "on_beat"):
        assert len(frames[name]) == n
    if n:
        assert len(frames["boundaries"]) == n + 1
        assert all(b > a for a, b in zip(frames["boundaries"], frames["boundaries"][1:]))
        assert all(len(row) == 12 and max(row) <= 1.0 + 1e-9 for row in frames["chroma"])
    json.dumps(features)  # sérialisable tel quel


def test_chroma_of_a_c_major_chord() -> None:
    features = extract_from_signal(0.2 * c_major())
    check_contract(features)
    middle = np.mean(features["frames"]["chroma"][2:-2], axis=0)
    strongest = set(np.argsort(middle)[-3:].tolist())
    assert strongest == {0, 4, 7}  # Do, Mi, Sol
    bass = np.mean(features["frames"]["bass_chroma"][2:-2], axis=0)
    assert int(np.argmax(bass)) == 0


def test_tuning_offset_is_measured() -> None:
    features = extract_from_signal(0.2 * c_major(cents=30.0))
    assert features["tuning_cents"] == pytest.approx(30.0, abs=6.0)


def test_beats_follow_a_click_track() -> None:
    signal = 0.1 * c_major(12.0) + 0.6 * clicks(120.0, 12.0)
    features = extract_from_signal(signal)
    check_contract(features)
    assert features["beats_tracked"]
    frames = features["frames"]
    beat_times = [t for t, on in zip(frames["boundaries"], frames["on_beat"]) if on]
    assert np.median(np.diff(beat_times)) == pytest.approx(0.5, abs=0.03)
    assert features["pulse_clarity"] > 0.4


def test_silence_gives_no_frame() -> None:
    features = extract_from_signal(np.zeros(SR * 3))
    check_contract(features)
    assert features["frames"]["chroma"] == []
    assert not features["beats_tracked"]


def test_very_short_signal_gives_no_frame() -> None:
    assert extract_from_signal(0.1 * tone(60, 0.05))["frames"]["chroma"] == []


def test_command_line_reports_unreadable_files(tmp_path) -> None:
    missing = tmp_path / "absent.wav"
    result = subprocess.run(
        [sys.executable, "-m", "harmonia_worker", "extract", str(missing)], capture_output=True, text=True
    )
    assert result.returncode == 1
    assert "extraction impossible" in result.stderr
