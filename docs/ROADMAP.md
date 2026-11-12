# Plan de développement et versions

Chaque phase se termine par un critère vérifiable et par une version étiquetée.
Une version n'est publiée que si ses tests passent.

## Suivi des versions

| Version | Phase | Contenu | Critère de sortie | État |
|---|---|---|---|---|
| **v1.0.0** | 1 + 2 | Architecture, modèle de données, API, licences, risques. Moteur de théorie : notes, intervalles, gammes, accords, tonalités, progressions, cadences, instruments. | Documents dans `docs/` ; `cargo test` vert. | ✅ Publiée |
| **v1.1.0** | 2b | Graphe de relations, dominantes secondaires, basse chiffrée, progressions usuelles, harmonisation de mélodie, sérialisation. Direction artistique, SEO. | `cargo test --all-features` vert. | ✅ Publiée |
| v1.2.0 | 3 | Bindings WASM, design system (verre + relief), navigation, Theory Explorer, piano, manche, cercle des quintes, graphe musical, synthèse Web Audio. Site public pré-rendu. | Explorer utilisable hors ligne ; aucun bouton inerte ; Lighthouse aux seuils de [SEO.md](SEO.md). | ⬜ |
| v1.3.0 | 4 | API Rust, file de jobs, stockage, worker Python, BPM, tonalité, accords, mélodie, timeline synchronisée, corrections manuelles. | Précision mesurée sur un jeu d'essai synthétique ; tests d'intégration API + stockage. | ⬜ |
| v1.4.0 | 5 | Ear training : notes, intervalles, accords, progressions, rythme ; niveaux ; répétition espacée. | Questions générées par le moteur ; statistiques persistées. | ⬜ |
| v1.5.0 | 6 | Cours interactifs, générateur de progressions et de mélodies, export MIDI et MusicXML. | Chaque cours manipulable et audible ; MIDI relu sans erreur. | ⬜ |
| v1.6.0 | 7a | Desktop Tauri 2, mode hors ligne. | Même moteur que le web ; installeur signé. | ⬜ |
| v1.7.0 | 7b | Mobile Expo / React Native, synchronisation. | Même moteur sur les trois plateformes. | ⬜ |
| **v2.0.0** | Finale | Mise en production : hébergement, SEO vérifié, audit des licences, audit d'accessibilité et de performance, documentation utilisateur. | Tous les critères ci-dessus tenus en production. | ⬜ |

### Règles

- **Mineure** (`1.x.0`) : une phase livrée. **Correctif** (`1.x.y`) : corrections sans
  nouvelle fonctionnalité. **Majeure** (`2.0.0`) : la version finale, complète et hébergée.
- Tous les paquets du dépôt (crates, applications, workers) portent le même numéro.
- À chaque version : numéro mis à jour dans `Cargo.toml`, entrée dans
  [CHANGELOG.md](../CHANGELOG.md), étiquette git annotée, tests verts.

### Liste de contrôle d'une version

1. Tests verts (`cargo test --workspace --all-features`, puis tests web et workers quand ils existent).
2. Aucun avertissement du compilateur.
3. Critère de sortie de la phase vérifié.
4. `CHANGELOG.md` et ce tableau mis à jour.
5. Numéro de version mis à jour partout.
6. Commit, étiquette `vX.Y.Z`, push.

## Politique de versions des dépendances

Tout le projet utilise **la dernière version stable** de chaque outil et bibliothèque
au moment où la phase démarre.

- Rust : dernière version stable, **édition 2024**.
- Dépendances : dernière version stable, verrouillée par `Cargo.lock`, le lockfile
  JavaScript et le lockfile Python. Pas de version préliminaire (alpha, bêta, RC).
- Vérification à chaque version : `cargo update --dry-run`, équivalents côté
  JavaScript et Python, et lecture des notes de version en cas de saut majeur.
- Une dépendance n'est figée sur une version ancienne que pour une raison écrite
  ici (incompatibilité, licence).

## Prérequis d'environnement constatés sur ce poste

| Outil | Constat | Nécessaire pour |
|---|---|---|
| Rust | 1.99.1, à jour | Tout le cœur. |
| Python | 3.12 | Workers (v1.3.0). À mettre à jour vers la dernière version stable supportée par les bibliothèques audio. |
| Node.js | **v12 — bloquant** : à remplacer par la dernière version LTS. | v1.2.0. |
| PostgreSQL | Absent | v1.3.0, validation du schéma. |
| Docker | Absent | RustFS et PostgreSQL locaux, tests d'intégration. |
