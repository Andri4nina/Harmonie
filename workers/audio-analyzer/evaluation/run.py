"""Évaluation de bout en bout sur le corpus synthétique.

    python -m evaluation.run            (depuis workers/audio-analyzer)

Pour chaque morceau : rendu audio, extraction des descripteurs (ce worker),
interprétation (`harmonia-analyze`, Rust), puis notation (`score`, Rust).
Les fichiers intermédiaires vont dans `evaluation/out/` (non versionné).
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import soundfile

from harmonia_worker import extract

from . import synth

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE / "out"


def cargo(*args: str) -> None:
    subprocess.run(["cargo", *args], cwd=ROOT, check=True)


def main() -> int:
    OUT.mkdir(exist_ok=True)
    corpus_path = HERE / "corpus.json"
    cargo("run", "-q", "--release", "-p", "harmonia-audio", "--example", "corpus", "--", str(corpus_path))
    cargo("build", "-q", "--release", "-p", "harmonia-audio", "--bins", "--examples")
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    suffix = ".exe" if sys.platform == "win32" else ""
    analyze = ROOT / "target" / "release" / f"harmonia-analyze{suffix}"
    score = ROOT / "target" / "release" / "examples" / f"score{suffix}"
    reuse = "--reuse" in sys.argv

    for piece in corpus["pieces"]:
        features_path = OUT / f"{piece['id']}.features.json"
        if not (reuse and features_path.exists()):
            signal, truth = synth.render(piece, corpus["lead_in_s"])
            wav = OUT / f"{piece['id']}.wav"
            soundfile.write(wav, signal, synth.SR, subtype="PCM_16")
            started = time.perf_counter()
            features = extract(str(wav))
            elapsed = time.perf_counter() - started
            features_path.write_text(json.dumps(features), encoding="utf-8")
            print(f"{piece['id']:<22} {truth['duration_s']:5.1f} s audio, extraction {elapsed:4.1f} s", flush=True)
        subprocess.run([str(analyze), str(features_path), str(OUT / f"{piece['id']}.analysis.json")], check=True)

    subprocess.run([str(score), str(corpus_path), str(OUT), str(HERE / "report.json")], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
