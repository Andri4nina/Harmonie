# Bibliothèques et licences

> Les licences ci-dessous sont celles connues à la rédaction. **À revérifier sur le
> dépôt de chaque projet avant toute distribution**, en particulier pour les poids de
> modèles, dont la licence diffère parfois de celle du code.

## Retenues

### Cœur Rust

| Bibliothèque | Rôle | Licence | Note |
|---|---|---|---|
| Axum, Tokio, Tower | HTTP, async | MIT | |
| SQLx | PostgreSQL (et SQLite desktop) | MIT / Apache-2.0 | |
| aws-sdk-s3 ou `object_store` | Client S3 vers RustFS | Apache-2.0 | |
| serde, tracing, thiserror | Sérialisation, logs, erreurs | MIT / Apache-2.0 | |
| utoipa | Génération OpenAPI | MIT / Apache-2.0 | Source des types TS partagés. |
| midly | Lecture/écriture MIDI | Unlicense | Import MIDI et export du générateur. |
| symphonia | Décodage MP3/FLAC/WAV/OGG/AAC | MPL-2.0 | Copyleft par fichier : utilisable tel quel sans modifier ses sources. |
| wasm-bindgen | Moteur de théorie vers WASM | MIT / Apache-2.0 | |

### Infrastructure

| Composant | Licence | Note |
|---|---|---|
| PostgreSQL | PostgreSQL License (type BSD) | |
| RustFS | Apache-2.0 | Stockage objet uniquement. |
| Tauri 2 | MIT / Apache-2.0 | |

### Workers Python

| Bibliothèque | Rôle | Licence | Note |
|---|---|---|---|
| librosa | Chroma CQT, beats, pYIN, HPSS | ISC | **Choix par défaut** du pipeline. |
| NumPy / SciPy | Calcul | BSD-3 | |
| soundfile (libsndfile) | Lecture audio | BSD-3 (lib : LGPL-2.1) | Liaison dynamique. |
| Basic Pitch (Spotify) | Transcription polyphonique légère | Apache-2.0 (code et modèle) | Mode Complex. Modèle petit, compatible CPU. |
| pretty_midi / mido | MIDI | MIT | |
| Demucs | Séparation de sources | MIT | Optionnel, lourd : mode avancé uniquement. |

### Frontend

| Bibliothèque | Rôle | Licence |
|---|---|---|
| React, Vite, Tailwind CSS, Zustand, TanStack Query | Socle | MIT |
| Web Audio API | Synthèse et lecture | Standard W3C |
| signalsmith-stretch (WASM) | Ralenti sans changement de hauteur | MIT |
| VexFlow | Gravure de portées (cours) | MIT |
| Expo / React Native | Mobile | MIT |

### Sons

| Ressource | Licence | Usage |
|---|---|---|
| Synthèse Web Audio (oscillateurs, enveloppes) | — | Défaut : aucun téléchargement, fonctionne hors ligne. |
| FluidR3_GM (SoundFont) | MIT | Instruments réalistes, chargés à la demande. |
| GeneralUser GS | Licence permissive propre | Alternative plus légère. |
| Salamander Grand Piano | CC BY 3.0 | Attribution obligatoire. |

### Formats

| Format | Statut |
|---|---|
| MIDI | Spécification ouverte. |
| MusicXML | W3C Community, libre de redevances. Export prévu en Phase 6. |

## Évaluées avec réserve

| Bibliothèque | Licence | Décision |
|---|---|---|
| **Essentia** | **AGPL-3.0** — compatible depuis qu'Harmonie est elle-même sous AGPL-3.0-or-later (v1.7.0) | Très bon (HPCP, détection de tonalité, rythme), mais l'AGPL impose de publier le code de ce qui l'intègre, y compris en service réseau. **Adaptateur optionnel**, isolé dans un worker séparé, désactivé par défaut. Le pipeline doit rester complet sans lui. Avis juridique requis avant tout usage commercial. |
| FluidSynth | LGPL-2.1+ | Utilisable en liaison dynamique (rendu MIDI côté serveur/desktop). Non nécessaire tant que le rendu se fait en Web Audio. |
| FFmpeg | LGPL ou GPL selon la compilation | Uniquement comme exécutable externe, build LGPL, si symphonia ne suffit pas pour un format. |
| SoundTouchJS | LGPL-2.1 | Repli pour le time-stretch. |
| Tonal.js | MIT | Bonne bibliothèque, **non retenue** : dupliquerait le moteur Rust (règle D1). |

## Écartées

| Bibliothèque | Raison |
|---|---|
| madmom | Code BSD mais **modèles en CC BY-NC-SA** : usage commercial interdit. |
| Rubber Band | GPL ou licence commerciale payante. |
| aubio | GPL-3.0. |
| Chordino / NNLS-Chroma | GPL. |
| API cloud de transcription ou d'analyse | Contraire à l'exigence de fonctionnement local et d'indépendance vis-à-vis d'API payantes. |

## Règle de dépendance

Aucune fonctionnalité fondamentale ne dépend d'un service externe. Tout composant sous
copyleft fort reste optionnel, dans un processus séparé, derrière une interface que le
pipeline par défaut satisfait sans lui.
