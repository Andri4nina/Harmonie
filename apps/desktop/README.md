# Harmonie pour ordinateur

Application de bureau (Tauri 2) : une fenêtre qui affiche le site construit
(`apps/web/dist`), servi depuis l'application. Même moteur, même code que le
site ; aucune logique musicale ici.

| Fonction | Hors connexion |
|---|---|
| Explorer la théorie, cours, entraînement de l'oreille, Composer | oui (moteur WebAssembly embarqué) |
| Exports MIDI et MusicXML | oui, boîte « Enregistrer sous » du système |
| Analyser un morceau, bibliothèque, progrès liés au compte | non : ils passent par le serveur |

Droits accordés à la fenêtre (`src-tauri/capabilities/default.json`) :
ouvrir la boîte « Enregistrer sous » et écrire le fichier choisi. Rien
d'autre.

## Développer

Prérequis : Rust, Node, `wasm-bindgen-cli` (voir `apps/web`), et sous Windows
WebView2 (présent sur Windows 10 et 11 à jour).

```bash
npm install
npm run dev        # site en développement dans la fenêtre de l'application
npm run build      # installateurs dans src-tauri/target/release/bundle/
```

`npm run build` reconstruit le moteur WebAssembly et le site, puis les
installateurs : `.exe` (NSIS) et `.msi` sous Windows, `.dmg` sous macOS,
`.AppImage` et `.deb` sous Linux. Les variables `VITE_*` du site s'appliquent
(voir `deploy/env/vercel.env.example`) ; sans elles, l'application fonctionne
entièrement hors connexion, sans l'analyse.

Pour que l'analyse fonctionne depuis l'application, ajouter son origine aux
origines autorisées de l'API : `CORS_ORIGINS=…,http://tauri.localhost`
(Windows) et `tauri://localhost` (macOS, Linux).

## Tester

`src-tauri/tauri.e2e.conf.json` construit une variante **de test** qui ouvre
le port de débogage de WebView2 (9333), pour piloter la fenêtre avec
Playwright. Ne jamais l'utiliser pour un installateur publié :

```bash
npx tauri build --no-bundle -c src-tauri/tauri.e2e.conf.json
```

## Publier

Une étiquette `vX.Y.Z` poussée sur GitHub déclenche
`.github/workflows/release-desktop.yml`, qui construit les installateurs pour
Windows, macOS (Apple Silicon et Intel) et Linux et les joint à la
publication. La page « Télécharger » du site les propose alors d'elle-même.

## Signature

Sans signature, Windows affiche « Éditeur inconnu » (SmartScreen) et macOS
refuse d'ouvrir l'application sans manipulation. La signature demande des
certificats payants, au nom de l'éditeur :

- **Windows** : un certificat de signature de code (OV ou EV). Une fois
  obtenu, l'ajouter aux secrets du dépôt et renseigner
  `bundle.windows.certificateThumbprint` (ou `signCommand`) dans
  `src-tauri/tauri.conf.json` ; voir la documentation de Tauri,
  « Windows Code Signing ».
- **macOS** : un compte Apple Developer, puis les secrets `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` pour la signature et la notarisation.
