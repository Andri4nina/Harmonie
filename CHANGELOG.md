# Journal des versions

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Numérotation : [SemVer](https://semver.org/lang/fr/). Chaque version correspond à
une étape du [plan](docs/ROADMAP.md) et à une étiquette git `vX.Y.Z`.

## [1.2.0] — 2026-11-12

Phase 3 : le Theory Explorer, en ligne et référençable.

### Ajouté

- `harmonia-theory-wasm` : le moteur compilé en WebAssembly, avec des vues
  prêtes à afficher (nœud, instruments, manche, cercle des quintes, recherche,
  catalogue des pages, instruments transpositeurs).
- Application web (`apps/web`) : React 19, Vite 8, Tailwind 4, TypeScript 7.
- Design system verre + relief topographique animé, mode léger.
- Theory Explorer : recherche libre, fiche d'un élément, graphe musical,
  cercle des quintes, piano, manche (guitare, basse, violon, violoncelle),
  notes à lire pour les instruments à vent, relations cliquables.
- Synthèse sonore Web Audio, affichage synchronisé sur l'horloge audio,
  analyseur de spectre.
- Adresses lisibles en français (`/accords/la-mineur-7`, `/gammes/re-dorien`).
- Pré-rendu statique de 547 pages (accueil + référence de théorie) avec titre,
  description, données structurées, `robots.txt` et, si `VITE_SITE_URL` est
  définie, adresses canoniques et `sitemap.xml`.
- Moteur : gammes non modales reliées à leur tonique, orthographes usuelles.
- Tests de l'interface (adresses, balises, pré-rendu).
- Dashboard et réglages (mode léger, diapason).

### Mesuré (Lighthouse, émulation mobile, serveur local)

- SEO, accessibilité, bonnes pratiques : 100 sur les pages testées.
- Performance : 100 (accueil), 85 à 92 (pages de référence). LCP 0,8 s, CLS 0.
- Temps de blocage de 340 à 610 ms sur les pages de référence : au-dessus de
  l'idéal, dû à l'activation des visualisations. À reprendre.

### Reporté

- Représentation des percussions : avec le rythme, en v1.4.0.
- Fonctionnement sans réseau après installation (service worker) : en v1.6.0.
  L'explorateur ne fait aucun appel serveur une fois chargé.

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
