"""Fixe le numéro de version partout à la fois.

    python scripts/set_version.py 1.7.0

Le site, l'application de bureau, l'APK Android et le worker sont publiés
ensemble (étiquette vX.Y.Z) : ils doivent porter le même numéro, celui que
les applications comparent aux publications pour se mettre à jour.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
version = sys.argv[1] if len(sys.argv) > 1 else ""
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    sys.exit("usage : python scripts/set_version.py X.Y.Z")


def replace(path: str, pattern: str, template: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, template.format(version=version), text, count=1, flags=re.MULTILINE)
    if count != 1:
        sys.exit(f"{path} : numéro de version introuvable")
    file.write_text(updated, encoding="utf-8", newline="\n")
    print(f"{path} -> {version}")


def json_version(path: str) -> None:
    file = ROOT / path
    data = json.loads(file.read_text(encoding="utf-8"))
    data["version"] = version
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{path} -> {version}")


replace("Cargo.toml", r'^version = "[^"]+"', 'version = "{version}"')
replace("apps/desktop/src-tauri/Cargo.toml", r'^version = "[^"]+"', 'version = "{version}"')
replace("workers/audio-analyzer/pyproject.toml", r'^version = "[^"]+"', 'version = "{version}"')
replace("workers/audio-analyzer/harmonia_worker/client.py", r'^VERSION = "[^"]+"', 'VERSION = "{version}"')
replace("README.md", r"\*\*Version actuelle : [0-9.]+\*\*", "**Version actuelle : {version}**")
for path in ("apps/web/package.json", "apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json"):
    json_version(path)
print("Penser au CHANGELOG, puis : git tag -a v" + version)
