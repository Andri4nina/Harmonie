"""Ligne de commande.

    python -m harmonia_worker extract morceau.wav -o descripteurs.json
    python -m harmonia_worker serve        (HARMONIE_API_URL, WORKER_TOKEN)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
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
    service = commands.add_parser("serve", help="traite les analyses mises en file par l'API")
    service.add_argument("--poll", type=float, default=5.0, help="attente entre deux demandes, en secondes")
    service.add_argument("--once", action="store_true", help="s'arrêter quand la file est vide")
    args = parser.parse_args(argv)

    if args.command == "serve":
        from .client import serve

        url, token = os.environ.get("HARMONIE_API_URL"), os.environ.get("WORKER_TOKEN")
        if not url or not token:
            print("définir HARMONIE_API_URL et WORKER_TOKEN", file=sys.stderr)
            return 2
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        serve(url, token, poll_s=args.poll, once=args.once)
        return 0

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
