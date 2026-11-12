"""Ligne de commande : `python -m harmonia_worker extract morceau.wav -o descripteurs.json`."""

from __future__ import annotations

import argparse
import json
import sys

from .features import extract


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="harmonia_worker", description="Extraction des descripteurs audio d'Harmonia.")
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("extract", help="mesure un fichier audio")
    command.add_argument("audio", help="fichier audio (WAV, FLAC, OGG, MP3)")
    command.add_argument("-o", "--output", help="fichier JSON de sortie (sortie standard par défaut)")
    command.add_argument("--offset", type=float, default=0.0, help="début de la portion à analyser, en secondes")
    command.add_argument("--duration", type=float, default=None, help="durée de la portion, en secondes")
    args = parser.parse_args(argv)

    try:
        features = extract(args.audio, offset_s=args.offset, duration_s=args.duration)
    except Exception as error:  # fichier illisible, format inconnu
        print(f"extraction impossible : {error}", file=sys.stderr)
        return 1
    text = json.dumps(features)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(text)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
