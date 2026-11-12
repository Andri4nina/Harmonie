# Plan de développement

Chaque phase se termine par un critère vérifiable. Une phase n'est close que si ses
tests passent.

| Phase | Contenu | Critère de sortie | État |
|---|---|---|---|
| **1 — Architecture** | Modules, modèle de données, API, architecture audio, licences, risques. | Documents dans `docs/`, schéma SQL. | Fait (schéma SQL non encore exécuté sur PostgreSQL) |
| **2 — Moteur de théorie** | Notes, intervalles, gammes, modes, accords, renversements, tonalités, cercle des quintes, degrés, progressions, cadences, transposition, instruments. | `cargo test -p harmonia-theory` vert. | Fait |
| 2b | Graphe de relations (note → gammes, accords, tonalités), harmonisation de mélodie, dominantes secondaires, basse chiffrée, sérialisation serde. | Tests + exemples du cahier des charges. | À faire |
| **3 — Frontend** | Bindings WASM, design system Harmonia, navigation, Theory Explorer, piano, manche, cercle des quintes, graphe musical, synthèse Web Audio, lecteur. | Explorer utilisable hors ligne, aucun bouton inerte. | À faire |
| **4 — Analyseur audio** | Crates domain/application/infrastructure/api, file de jobs, worker Python, BPM, tonalité, accords, mélodie, timeline synchronisée, corrections. | Précision mesurée sur un jeu d'essai synthétique ; tests d'intégration API + stockage. | À faire |
| **5 — Ear training** | Notes, intervalles, accords, progressions, rythme ; niveaux ; répétition espacée. | Questions générées par le moteur, statistiques persistées. | À faire |
| **6 — Cours et générateur** | Cours interactifs (7 volets chacun), génération de progressions et mélodies expliquées, export MIDI / MusicXML. | Chaque cours manipulable et audible ; MIDI relu sans erreur. | À faire |
| **7 — Desktop et mobile** | Tauri 2, Expo, mode hors ligne, synchronisation. | Même moteur sur les trois plateformes. | À faire |

## Prérequis d'environnement constatés sur ce poste

| Outil | Constat | Nécessaire pour |
|---|---|---|
| Rust 1.99 | Présent | Tout le cœur. |
| Python 3.12 | Présent | Workers (Phase 4). |
| Node.js **v12** | **Trop ancien** : Vite et Tailwind exigent Node 20+. | Phase 3. |
| PostgreSQL | Absent | Phase 4, validation du schéma. |
| Docker | Absent | RustFS et PostgreSQL locaux, tests d'intégration. |

## Ordre recommandé

Le moteur d'abord, parce que tout le reste en dépend : l'explorateur l'affiche,
l'analyseur lui confie l'interprétation, l'ear training et le générateur lui
demandent leurs questions et leurs propositions.
