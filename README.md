# Harmonia

Environnement interactif pour comprendre, explorer, écouter, analyser et pratiquer
la musique.

## État

| Phase | État |
|---|---|
| 1 — Architecture | Faite |
| 2 — Moteur de théorie musicale | Faite (`crates/harmonia-theory`) |
| 3 à 7 | À faire — voir [le plan](docs/ROADMAP.md) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — décisions, services, pipeline audio, arborescence, modèle de données
- [Bibliothèques et licences](docs/LIBRARIES.md)
- [API](docs/API.md)
- [Plan de développement](docs/ROADMAP.md)
- [Risques de la transcription polyphonique](docs/POLYPHONIC-RISKS.md)

## Moteur de théorie

Crate Rust pure, sans dépendance : notes, intervalles, gammes, modes, accords,
renversements, tonalités, cercle des quintes, degrés, progressions, cadences,
transposition, instruments.

```bash
cargo test -p harmonia-theory
```

```rust
use harmonia_theory::{Key, Progression};

let key: Key = "C".parse().unwrap();
let progression: Progression = "I-V-vi-IV".parse().unwrap();
// C G Am F
for chord in progression.resolve(&key) {
    println!("{chord}: {:?}", chord.notes());
}
```
