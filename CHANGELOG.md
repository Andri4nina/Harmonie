# Journal des versions

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Numérotation : [SemVer](https://semver.org/lang/fr/). Chaque version correspond à
une étape du [plan](docs/ROADMAP.md) et à une étiquette git `vX.Y.Z`.

## [Non publié]

### Ajouté

- Connexion et inscription avec un compte Google (Supabase Auth), en plus de
  l'adresse et du mot de passe ; page Compte (`/compte`) qui dit ce
  qu'Harmonie garde d'un compte ; lien « Se connecter » sur la page de
  présentation. Réglage de Google et de Supabase : `docs/DEPLOYMENT.md`.

## [1.7.0] — 2026-11-13

Phase 7b : Android, mises à jour, publication simultanée.

### Ajouté

- Page de présentation (`/`) : plongée dans le nœud de la quinte au
  défilement, recul d'une note jusqu'au cercle des quintes, portée qui
  défile à l'horizontale avec les parties de l'application, défilé
  d'accords, portes qui se ferment sur un clavier en arpège. Tout est piloté
  par le défilement et s'arrête si l'on demande moins d'animation. Le
  tableau de bord passe à `/tableau-de-bord` ; les applications y arrivent
  directement.
- Navigation : entrées rangées par usage (Comprendre, Pratiquer, Mes
  morceaux), repère de la page courante qui glisse d'une entrée à l'autre,
  transition entre les pages.
- Composer devient un séquenceur : pistes avec instrument, volume, coupure
  et solo ; rouleau de piano (crayon, gomme, sélection, grille, zoom,
  vélocités, notes des autres pistes en filigrane) ; pas à pas pour la
  batterie ; lecture en boucle, métronome, tempo modifiable pendant la
  lecture ; enregistrement au clavier d'ordinateur aligné sur la grille ;
  annuler et rétablir ; projet gardé sur l'appareil. Le morceau généré
  devient un projet éditable (`project.rs`) et l'export MIDI reprend les
  pistes entendues, la batterie sur le canal 10.
- Clavier d'ordinateur : rangée Z → / pour les blanches et A → ' pour les
  noires, rangée Q → ] et rangée des chiffres une octave plus haut. Les
  touches sont lues par position : QWERTY, AZERTY ou QWERTZ jouent les mêmes
  notes, et chaque touche du piano affiche le caractère de la disposition
  détectée. Transposition par demi-ton et par octave.
- Instruments : le son suit l'instrument choisi (piano, guitare, ukulélé,
  basse, violon, violoncelle, flûte, saxophones, synthétiseur, batterie),
  synthétisé sans échantillon donc hors connexion ; cordes pincées par
  Karplus-Strong, justes à moins de 5 cents (testé).

- Application Android : la même application que pour ordinateur, compilée
  par Tauri pour Android, avec le même site et le même moteur. APK signé
  (clé gratuite) joint à chaque publication ; l'application signale les
  nouvelles versions.
- Mises à jour automatiques de l'application de bureau : à chaque lancement,
  elle lit la dernière publication (`latest.json` signé), propose la nouvelle
  version, l'installe et redémarre.
- Publication simultanée : une étiquette `vX.Y.Z` publie le site, les
  installateurs et l'APK (`release.yml`, `deploy-web.yml`) ; le site n'est
  plus publié à chaque modification de `main`.
- `scripts/set_version.py` : un seul numéro de version pour le site, les
  applications et le worker.

- Harmonie devient un logiciel libre : licence AGPL-3.0-or-later (`LICENSE`),
  déclarée dans chaque paquet et dans les installateurs ; lien vers le code
  source au bas du site et des applications ; `CONTRIBUTING.md`.

### Corrigé

- Thème clair : survols invisibles (blanc sur blanc) dans toute
  l'interface, logo dans un carré sombre, sélecteur de thème qui débordait
  du menu mobile.

### Modifié

- Mobile : Tauri au lieu d'Expo / React Native (décision D7 révisée,
  `docs/ARCHITECTURE.md`).
- Identifiant des applications : `app.harmonie`.

## [1.6.0] — 2026-11-13

Phase 7a : application de bureau.

### Ajouté

- `apps/desktop` : application Tauri 2 qui embarque le site construit et son
  moteur WebAssembly ; explorateur, cours, entraînement de l'oreille et
  Composer fonctionnent hors connexion. Fenêtre native, icônes tirées du logo.
- Exports MIDI et MusicXML par la boîte « Enregistrer sous » du système dans
  l'application ; téléchargement ordinaire dans le navigateur.
- Hors connexion, les sections qui passent par le serveur (analyse,
  bibliothèque) le disent ; l'entrée « Télécharger » disparaît de
  l'application.
- Publication automatique des installateurs (Windows `.exe` et `.msi`, macOS
  Apple Silicon et Intel, Linux `.AppImage` et `.deb`) à chaque étiquette de
  version ; la page « Télécharger » conseille le `.exe` et l'AppImage.

### Limites

- Installateurs **non signés** tant qu'aucun certificat n'est fourni
  (Windows : avertissement SmartScreen ; macOS : ouverture à autoriser).
  Procédure dans `apps/desktop/README.md`.
- Pas encore de mise à jour automatique de l'application.

## [1.5.0] — 2026-11-12

Phase 6 : apprendre et composer.

### Ajouté

- Générateur (`compose`) : grilles d'accords par chaîne de Markov sur les
  fonctions tonales, formule cadentielle S – D – T, trois styles (pop,
  classique, jazz) en majeur et en mineur ; mélodie qui pose les notes de
  l'accord sur les temps forts et avance par degrés conjoints.
- Export (`export`) : MIDI standard type 1 (conduite, mélodie, accords, basse)
  et partition MusicXML 4.0 (armure, mesure, symboles d'accords). Relus par
  `mido` et un parseur XML (`scripts/check_exports.py`), aussi en intégration
  continue.
- Page « Composer » (pré-rendue, indexée) : tonalité, style, nombre de mesures,
  tempo, écoute avec tête de lecture, téléchargements MIDI et MusicXML.
- Cours interactifs (`content/lessons`, données) : six cours, des notes aux
  cadences ; étapes de texte, piano, écoute, comparaison, question expliquée,
  quiz d'oreille généré par le moteur, lien vers l'explorateur. Pages
  pré-rendues et indexées (`LearningResource`), progression sur l'appareil.

### Corrigé

- La septième diminuée du mineur harmonique est bâtie sur la sensible
  (`#vii°7` : sol♯ en la mineur), trouvé par les tests du générateur.

### Limites

- La progression des cours reste sur l'appareil (pas encore liée au compte).
- Le générateur écrit un accord par mesure, à 4/4.

## [1.4.0] — 2026-11-12

Phase 5 : entraînement de l'oreille complet, mélodie dans l'analyse,
thèmes, logo.

### Ajouté

- Module `ear` du moteur : quatre exercices (intervalles, accords, degrés
  après cadence, progressions), 17 niveaux, questions générées par la
  théorie à partir d'une graine, répétition espacée (SM-2 simplifié) et
  maîtrise par élément. Exporté en WebAssembly.
- Page « Entraîner l'oreille » (pré-rendue, indexée) : choix de l'exercice et
  du niveau, écoute, réponses au clavier, correction expliquée, progrès
  enregistrés sur l'appareil.
- Thèmes clair, sombre et « système », appliqués avant le premier affichage.
- Logo : la quinte juste en figure de Lissajous (3:2), parcourue par une note ;
  loader et écran de démarrage animés sur cette figure.
- Barres de défilement arrondies.
- Fichiers d'environnement pour Supabase, Render, Vercel et GitHub
  (`deploy/env`).
- Exercices de rythme (mesure à 4/4 après décompte, quatre notations proches,
  dessinées en SVG) et de dictée mélodique (degrés note par note).
- Mélodie dans l'analyse : ligne supérieure par saillance harmonique, notes
  découpées par le moteur, piste dans la frise. Rappel 75 % (validation) ;
  jamais annoncée « détectée » (voir les limites).
- Progrès de l'oreille synchronisés avec le compte (migration `0003`,
  `GET/PUT /v1/ear/cards`) ; la fiche la plus avancée l'emporte.

### Limites

- La ligne supérieure n'est pas toujours la mélodie : sans mélodie, elle
  suit la voix aiguë des accords (130 notes par minute sur le corpus).
- Sans compte, les progrès restent sur l'appareil.

## [1.3.0] — 2026-11-12

Phase 4 : analyse audio, API, base de données, hébergement et écran
d'analyse.

### Ajouté

- `workers/audio-analyzer` : worker Python (librosa 1.0) qui mesure le signal —
  chroma, chroma grave, temps, attaques, accordage, netteté de la pulsation —
  sans aucune interprétation musicale. Ligne de commande
  `python -m harmonia_worker extract`.
- `harmonia-audio` : interprétation en Rust, appuyée sur le moteur de théorie :
  accords (gabarits + Viterbi, renversements par la basse), tonalité et
  modulations (Krumhansl-Kessler départagé par les accords), degrés, cadences,
  tempo, mesure et premiers temps ; confiance et certitude sur chaque résultat.
  Exécutable `harmonia-analyze`.
- Corpus d'évaluation de 36 morceaux écrits par le moteur et rendus en audio,
  dont 16 réservés à la validation. Sur la validation : 97 % de la durée avec
  l'accord exact, 16 tonalités sur 16, 14 tempos sur 16.

- `harmonia-api` : API Axum sur PostgreSQL — dépôt de morceaux, file d'analyse
  (`FOR UPDATE SKIP LOCKED`, reprise des jobs abandonnés, trois tentatives),
  routes internes des workers, résultats en événements horodatés, corrections
  manuelles en couche séparée, comptes Supabase Auth, stockage S3 (Supabase
  Storage) ou local.
- Mode service du worker : `python -m harmonia_worker serve`.
- Migration `0002` : comptes gérés par Supabase Auth, RLS activée.
- Docker (`deploy/`, `docker-compose.yml`), Render (`render.yaml`), Vercel
  (`apps/web/vercel.json`, publication par GitHub Actions), tests en
  intégration continue. Guide : `docs/DEPLOYMENT.md`.
- Site : page « Télécharger » (Windows, macOS, Linux, APK Android) alimentée
  par les publications GitHub ; écran de démarrage et barre de chargement ;
  titres en dégradé, halos, boutons et navigation retravaillés ; pied de page.
- Écran « Analyser un morceau » : connexion Supabase, dépôt par glisser-déposer,
  bibliothèque rafraîchie pendant l'analyse, page d'un morceau avec résumé
  (tonalité, tempo, mesure, diapason et leur certitude), lecture synchronisée
  avec l'accord courant en grand, frise des accords, tonalités, temps et
  cadences, correction d'un accord (lectures alternatives ou saisie vérifiée
  par le moteur). Pages chargées à la demande : le client Supabase n'alourdit
  pas les pages publiques.
- Nouvelle identité : bleu nuit, ivoire et laiton ; Unbounded et Syne ;
  interface responsive vérifiée à 375, 768 et 1440 px.
- Référencement au nom « Andrianina Rasoamanana - Harmonie » : titres,
  auteur, données structurées `WebSite` / `WebApplication` / `Person`, image
  de partage 1200 × 630, manifeste d'application, validation Search Console.

### Limites

- Mélodie (suivi de f0) non faite : reportée à la v1.4.0.
- Analyse mesurée uniquement sur des sons synthétiques.
- Erreurs d'octave du tempo aux extrêmes (60–80 et 168–180 BPM).
- Aucun installateur publié : la page « Télécharger » l'indique ; le dépôt
  GitHub étant privé, ses publications ne sont pas visibles des visiteurs.

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
