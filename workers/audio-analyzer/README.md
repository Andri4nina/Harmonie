# Worker audio (`audio-analyzer`)

Le worker **mesure** le signal ; il ne nomme ni accord ni tonalité. Il produit
un fichier de descripteurs (contrat `schema: 1`, décrit dans
`crates/harmonia-audio/src/features.rs`) que le moteur Rust `harmonia-audio`
**interprète** : tonalité, modulations, accords, renversements, degrés,
cadences, tempo, mesure, chacun avec une confiance et une certitude
(`detected`, `estimated`, `uncertain`).

```
fichier audio ──► harmonia_worker (Python, librosa) ──► descripteurs.json
descripteurs.json ──► harmonia-analyze (Rust) ──► analyse.json
```

## Installation

Python 3.12 ou plus récent.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```

Sous Linux ou macOS, remplacer `.venv/Scripts/python` par `.venv/bin/python`.

## Utilisation

```bash
.venv/Scripts/python -m harmonia_worker extract morceau.wav -o descripteurs.json
```

```bash
cargo run --release -p harmonia-audio --bin harmonia-analyze -- descripteurs.json analyse.json
```

Options d'extraction : `--offset` et `--duration` (en secondes) pour n'analyser
qu'une portion.

## Ce qui est mesuré

| Descripteur | Méthode |
|---|---|
| Séparation | HPSS : le chroma est mesuré sur la partie harmonique. |
| Accordage | Écart moyen des partiels au La 440, compensé dans la CQT. |
| Chroma | CQT de Do 3 à Si 7, 36 cases par octave, amplitudes compressées (log). |
| Chroma grave | CQT de Do 1 à Si 2. |
| Temps | Suivi par programmation dynamique (Ellis) sur l'enveloppe des attaques. |
| Trames | Deux par temps ; trames fixes de 0,5 s si aucun temps n'est suivi. |
| Netteté de la pulsation | Autocorrélation de l'enveloppe des attaques à la période des temps. |
| Ligne supérieure | Saillance par sommation harmonique sur la CQT (Sol 3 à Sol 6) ; à chaque pas, la plus aiguë des hauteurs saillantes, et sa clarté. |

L'interprétation (gabarits d'accords + Viterbi, profils de Krumhansl-Kessler
départagés par les accords, tempo, mesure) est documentée en tête de chaque
module de `crates/harmonia-audio/src/`.

## Évaluation

```bash
.venv/Scripts/python -m evaluation.run
```

Le corpus (`evaluation/corpus.json`) est écrit par le moteur de théorie : la
vérité de terrain (accords, basses, tonalités, temps) vient de la même source
que l'analyse. `evaluation/synth.py` rend chaque morceau en audio (timbres
additifs, basse, batterie synthétique, bruit éventuel) ; le résultat détaillé
est dans `evaluation/report.json`.

Le corpus a deux parties :

- **réglage** (20 morceaux) : ont servi à ajuster les paramètres ;
- **validation** (16 morceaux) : autres tonalités, tempos et enchaînements,
  rendus une seule fois, paramètres figés.

### Résultats (2026-11-12)

| Mesure | Réglage | Validation |
|---|---|---|
| Accord exact (part de la durée) | 97,0 % | 97,2 % |
| Accord exact avec sa basse | 97,0 % | 97,2 % |
| Fondamentale juste | 97,2 % | 97,6 % |
| Tonalité principale exacte | 20 / 20 | 16 / 16 |
| Tonalité locale juste (part de la durée) | 99,9 % | 99,9 % |
| Tempo juste (± 4 %) | 16 / 20 | 14 / 16 |
| Tempo à la moitié ou au double | 3 / 20 | 2 / 16 |
| Temps par mesure juste | 16 / 20 | 16 / 16 |
| Temps retrouvés (± 70 ms) | 89 % | 96 % |
| Premiers temps retrouvés (± 70 ms) | 83 % | 86 % |
| Erreur d'accordage | 2,6 cents | 2,3 cents |

Fiabilité de la certitude annoncée, sur la validation : les accords marqués
`detected` sont exacts à 99 % (574 s), `estimated` à 71 % (19 s), `uncertain`
à 0 % (2 s).

Temps de calcul : 2 à 4 s d'extraction pour 30 à 70 s d'audio (hors premier
lancement, qui compile les fonctions de librosa : environ 20 s).

### Mélodie (ligne supérieure, v1.4.0)

Sur les trois morceaux du corpus qui ont une mélodie (attaque à 100 ms près,
même hauteur) :

| Mesure | Réglage (2 morceaux) | Validation (1 morceau) |
|---|---|---|
| Rappel | 77 % | 75 % |
| Rappel à l'octave près | 88 % | 81 % |
| Précision | 64 % | 68 % |

Sur les 33 morceaux **sans** mélodie, la méthode trouve en moyenne
**130 notes par minute** : la voix supérieure des accords. C'est sa limite
de principe — rien ne distingue, dans le signal, une mélodie de la voix
aiguë d'un accompagnement. Les notes sont donc présentées comme « ligne
supérieure (mélodie probable) » et jamais marquées `detected`.

Un premier essai avec pYIN (suivi de hauteur pour une voix seule) ne
trouvait **aucune** note dans ces mélanges : probabilité de voisement
proche de 0,01 partout. Il a été remplacé.

### Ce que ces chiffres ne disent pas

- **Ce ne sont pas des enregistrements.** Pas de voix, de réverbération, de
  guitares saturées, de mixage, de jeu humain. Sur de la musique réelle, les
  publications de référence (MIREX) situent les meilleurs systèmes autour de
  80 % pour les accords majeurs / mineurs ; il faut s'attendre à moins que les
  chiffres ci-dessus. Une évaluation sur des enregistrements annotés reste à
  faire.
- **Erreurs d'octave du tempo** : à 60–80 BPM le suivi des temps se cale
  souvent sur le double, à 168–180 BPM sur la moitié. Les deux lectures sont
  toujours proposées (`alternatives_bpm`) ; la mesure et les premiers temps
  sont alors faux dans la même proportion.
- **Pas de batterie** : sans attaques régulières, la netteté de la pulsation
  tombe à 0 et tempo et mesure sont marqués `uncertain` — à juste titre, mais
  ils ne sont pas trouvés.
- **Vocabulaire** : majeur, mineur, 7, maj7, m7, diminué, sus4. Les autres
  accords sont ramenés au plus proche.
- Structure (couplet / refrain) et transcription polyphonique ne sont pas
  encore faites. La mélodie n'est pas séparée de l'accompagnement (voir
  ci-dessus).
