# Journal des versions

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Numérotation : [SemVer](https://semver.org/lang/fr/). Chaque version correspond à
une étape du [plan](docs/ROADMAP.md) et à une étiquette git `vX.Y.Z`.

## [Non publié] — vers 1.2.0

Phase 3 en cours : le Theory Explorer fonctionne dans le navigateur.

### Ajouté

- `harmonia-theory-wasm` : le moteur compilé en WebAssembly, avec des vues
  prêtes à afficher (nœud, instruments, manche, cercle des quintes, recherche).
- Application web (`apps/web`) : React 19, Vite 8, Tailwind 4, TypeScript 7.
- Design system verre + relief topographique animé, mode léger.
- Theory Explorer : recherche libre, fiche d'un élément, graphe musical,
  cercle des quintes, piano, manche (guitare, basse, violon, violoncelle),
  relations cliquables.
- Synthèse sonore Web Audio : écoute des notes, gammes, accords et
  progressions, affichage synchronisé sur l'horloge audio.
- Dashboard et réglages (mode léger, diapason).

### Reste à faire avant la 1.2.0

- Site public pré-rendu (référence de théorie, SEO) et audit Lighthouse.
- Analyseur de spectre, représentations des vents et des percussions.
- Tests automatisés de l'interface.

## [1.1.0] — 2026-11-12

Phase 2b : le moteur sait relier les éléments entre eux.

### Ajouté

- Graphe de relations (`relations`) : nœuds note, gamme, accord, tonalité,
  progression ; arêtes typées ; voisinage à profondeur donnée ; identifiants
  stables pour l'API et les URL.
- Dominantes secondaires et accords de sensible appliqués (`V7/V`, `vii°/ii`) :
  lecture, résolution, analyse fonctionnelle.
- Basse chiffrée des triades et accords de septième (`6`, `6/4`, `6/5`, `4/3`, `4/2`).
- Catalogue de progressions usuelles, en majeur et en mineur.
- Harmonisation de mélodie : accords candidats par note et proposition d'une
  suite d'accords.
- Sérialisation `serde` optionnelle (fonctionnalité `serde`).
- Direction artistique (verre + relief topographique), motion design, plan SEO.
- Suivi des versions.

### Modifié

- Édition Rust 2024.
- `RomanNumeral` porte un champ `applied_to`.

## [1.0.0] — 2026-11-12

Phases 1 et 2 : fondations.

### Ajouté

- Architecture technique, modèle de données, contrat d'API, plan par phases.
- Inventaire des bibliothèques et de leurs licences.
- Analyse des risques de la transcription polyphonique.
- Schéma PostgreSQL initial.
- Moteur de théorie `harmonia-theory` : notes, intervalles, gammes et modes,
  accords, renversements, voicings, identification d'accords, tonalités,
  armures, cercle des quintes, estimation de tonalité, degrés, progressions,
  cadences, transposition, instruments.
