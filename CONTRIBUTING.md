# Contribuer à Harmonie

Merci de votre intérêt. Harmonie est un logiciel libre sous licence
AGPL-3.0-or-later ; en proposant une contribution, vous acceptez qu'elle soit
publiée sous cette licence.

## Avant de proposer une modification

- Ouvrez d'abord une *issue* pour tout changement important : on s'accorde
  sur l'approche avant d'écrire le code.
- Une seule source de vérité musicale : toute règle de théorie va dans
  `crates/harmonia-theory` (Rust), jamais dans l'interface.
- Pas de fausse fonction : un bouton fait ce qu'il annonce, une analyse
  annonce sa confiance, une limite est écrite.

## Vérifier

```bash
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

```bash
cd apps/web && npm ci && npm run wasm && npm test && npm run build
```

```bash
cd workers/audio-analyzer && python -m pip install -e ".[dev]" && python -m pytest
```

L'intégration continue lance les mêmes commandes sur chaque *pull request*.

## Écrire

- Textes de l'interface et documentation en français ; espaces insécables
  avant `: ; ? !`.
- Interface : suivre `docs/DESIGN.md` (palette, typographies Unbounded et
  Syne, responsive vérifié de 375 à 1440 px, thèmes clair et sombre).
- Cours : données dans `content/lessons` (voir son README).
