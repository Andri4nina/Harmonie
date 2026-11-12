# Harmonia

Environnement interactif pour comprendre, explorer, écouter, analyser et pratiquer
la musique.

**Version actuelle : 1.2.0** — voir le [journal des versions](CHANGELOG.md) et le
[suivi jusqu'à la version finale](docs/ROADMAP.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — décisions, services, pipeline audio, arborescence, modèle de données
- [Direction artistique et motion](docs/DESIGN.md) — verre et relief topographique
- [SEO et hébergement](docs/SEO.md)
- [Bibliothèques et licences](docs/LIBRARIES.md)
- [API](docs/API.md)
- [Plan et versions](docs/ROADMAP.md)
- [Risques de la transcription polyphonique](docs/POLYPHONIC-RISKS.md)

## Moteur de théorie

`crates/harmonia-theory` : crate Rust pure, sans I/O. Notes, intervalles, gammes,
modes, accords, renversements, basse chiffrée, tonalités, cercle des quintes,
degrés, dominantes secondaires, progressions, cadences, transposition,
harmonisation de mélodie, instruments, graphe de relations.

```bash
cargo test --workspace --all-features
```

```rust
use harmonia_theory::{Graph, Key, Node, Progression};

let key: Key = "C".parse().unwrap();
let progression: Progression = "I-V-vi-IV".parse().unwrap();
// C G Am F
for chord in progression.resolve(&key) {
    println!("{chord}: {:?}", chord.notes());
}

// Tout ce qui est relié à la note Do.
let graph = Graph::around(Node::from_id("note:C").unwrap(), 1);
println!("{} relations", graph.links.len());
```

## Application web

Nécessite Node.js 22 ou plus, la cible Rust `wasm32-unknown-unknown` et
`wasm-bindgen-cli` (même version que la dépendance `wasm-bindgen`).

```bash
cd apps/web
npm install
npm run wasm   # compile le moteur en WebAssembly
npm run dev    # http://localhost:5173
```

```bash
npm test        # tests de l'interface
npm run build   # site statique pré-rendu dans dist/
```

Pour la mise en ligne, définir `VITE_SITE_URL` (adresse publique du site) avant
`npm run build` : elle produit les adresses canoniques et `sitemap.xml`.
