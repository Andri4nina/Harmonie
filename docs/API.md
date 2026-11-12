# API Harmonie — v1

## Implémenté (v1.3.0)

Code : `crates/harmonia-api`. Base : `/v1` (pas de préfixe `/api`). Erreurs :
`{ "error": "code", "message": "…" }`. Authentification : jeton d'accès
Supabase Auth (`Authorization: Bearer`).

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | État du service et de la base (503 si la base est injoignable). |
| GET | `/v1/me` | Utilisateur courant (créé à la première requête). |
| GET | `/v1/tracks` | Morceaux de l'utilisateur, avec l'état de leur dernière analyse. |
| POST | `/v1/tracks` | Dépôt multipart (`file`, `title`) : stockage, création, mise en file. |
| GET | `/v1/tracks/{id}` | Un morceau et l'état de son analyse. |
| GET | `/v1/tracks/{id}/audio` | Fichier audio d'origine. |
| GET | `/v1/tracks/{id}/analysis` | Dernière analyse réussie : résumé et événements, corrections appliquées. |
| POST | `/v1/tracks/{id}/corrections` | `delete` / `replace` / `insert` ; un accord saisi doit être lisible par le moteur. |

Routes des workers (`WORKER_TOKEN`) : `POST /internal/jobs/claim`,
`GET /internal/jobs/{id}/audio`, `POST /internal/jobs/{id}/heartbeat`,
`POST /internal/jobs/{id}/complete`, `POST /internal/jobs/{id}/fail`. Détail en
tête de `crates/harmonia-api/src/jobs.rs`.

## Spécification cible

La suite du document décrit l'API visée par les versions suivantes ; elle
n'est pas encore implémentée.

Base : `/api/v1`. JSON. Erreurs au format RFC 9457 (`application/problem+json`).
Authentification : jeton de session (`Authorization: Bearer`). Les routes `/theory`
sont publiques et sans état.

Le contrat OpenAPI sera généré depuis le code (utoipa) en Phase 4 ; ce document en
est la spécification de départ.

## Théorie (sans état, calculé par `harmonia-theory`)

Les clients web et desktop appellent le moteur en WASM directement ; ces routes
servent le mobile, les intégrations et les tests de contrat.

| Méthode | Route | Description |
|---|---|---|
| GET | `/theory/notes/{note}` | Note, classe de hauteur, enharmoniques. |
| GET | `/theory/notes/{note}/relations` | Graphe : gammes, accords, intervalles, tonalités contenant la note. |
| GET | `/theory/intervals?from=C&to=G` | Intervalle entre deux notes. |
| GET | `/theory/scales` | Types de gammes disponibles. |
| GET | `/theory/scales/{tonic}/{type}` | Notes, degrés, modes, accords diatoniques. |
| GET | `/theory/chords/{symbol}` | Notes, intervalles, renversements, voicing. |
| POST | `/theory/chords/identify` | `{notes:[…]}` → accords candidats. |
| GET | `/theory/keys/{key}` | Armure, relatif, voisins, accords diatoniques. |
| GET | `/theory/keys/circle-of-fifths` | Les 12 tonalités ordonnées. |
| POST | `/theory/progressions/resolve` | `{key, numerals}` → accords. |
| POST | `/theory/progressions/analyze` | `{key, chords}` → degrés, cadences. |
| POST | `/theory/transpose` | Notes, accords ou progression vers une autre tonalité. |

## Instruments

| Méthode | Route | Description |
|---|---|---|
| GET | `/instruments` | Presets + instruments de l'utilisateur. |
| POST | `/instruments` | Créer un instrument personnalisé. |
| GET / PUT / DELETE | `/instruments/{id}` | |
| GET | `/instruments/{id}/positions?note=C` | Positions d'une note ou d'une hauteur. |
| GET | `/instruments/{id}/chords/{symbol}` | Diagramme ou doigté de l'accord. |

## Morceaux et fichiers

| Méthode | Route | Description |
|---|---|---|
| POST | `/tracks` | Crée le morceau, renvoie une URL d'upload pré-signée. |
| POST | `/tracks/{id}/upload-complete` | Valide l'upload (taille, type, empreinte). |
| GET | `/tracks` · `/tracks/{id}` | |
| DELETE | `/tracks/{id}` | Supprime le morceau et ses objets. |
| GET | `/tracks/{id}/audio` | URL de lecture pré-signée. |
| GET | `/tracks/{id}/waveform?resolution=` | Pics pré-calculés. |

## Analyses

| Méthode | Route | Description |
|---|---|---|
| GET | `/analysis/features` | Features disponibles, dépendances, coût estimé, modes prédéfinis. |
| POST | `/tracks/{id}/analyses` | `{mode, features?, range?}` → `202` + job. |
| GET | `/analyses/{job_id}` | État, progression, étape courante. |
| POST | `/analyses/{job_id}/cancel` | |
| GET | `/tracks/{id}/analysis?features=&from=&to=` | Événements, corrections appliquées. `?raw=true` pour les résultats bruts. |
| POST | `/tracks/{id}/corrections` | `{action: replace\|delete\|insert, event_id?, payload}`. |
| DELETE | `/corrections/{id}` | Annule une correction. |
| GET | `/tracks/{id}/export?format=midi\|musicxml\|json` | |

Forme d'un événement :

```json
{
  "id": "…",
  "feature": "chord",
  "start_ms": 12480,
  "end_ms": 14400,
  "confidence": 0.71,
  "certainty": "estimated",
  "source": "engine",
  "payload": { "symbol": "Am7", "root": "A", "quality": "m7", "bass": null, "roman": "vi7" }
}
```

## Ear training, cours, générateur, bibliothèque

| Méthode | Route | Description |
|---|---|---|
| POST | `/ear/sessions` | `{exercise, level}` → session. |
| POST | `/ear/sessions/{id}/attempts` | Enregistre une réponse. |
| GET | `/ear/stats` | Progression par compétence, prochaines révisions. |
| GET | `/lessons` · `/lessons/{slug}` | Contenu des cours. |
| PUT | `/lessons/{slug}/progress` | |
| POST | `/generator/progressions` | `{key, scale, length, style?}` → variantes expliquées. |
| POST | `/generator/melodies` | `{key, chords, tempo}` → variantes. |
| CRUD | `/compositions` | |
| GET | `/compositions/{id}/export?format=midi` | |
| CRUD | `/library` | Favoris et collections. |
| GET / PUT | `/me` · `/me/settings` | |
| POST | `/auth/register` · `/auth/login` · `/auth/logout` | |

Les questions d'ear training sont générées côté client par le moteur (WASM) : le
serveur n'enregistre que les tentatives, ce qui permet le mode hors ligne.

## Temps réel

| Canal | Messages |
|---|---|
| `WS /ws/jobs/{job_id}` | `progress {stage, percent}`, `events {feature, items[]}`, `done`, `failed {error}` |

## API interne (workers, réseau privé, jeton de service)

| Méthode | Route | Description |
|---|---|---|
| POST | `/internal/jobs/claim` | `{worker_id, capabilities}` → job + URLs pré-signées, ou `204`. |
| POST | `/internal/jobs/{id}/heartbeat` | |
| POST | `/internal/jobs/{id}/features` | Lot de features d'une étape + checkpoint. |
| POST | `/internal/jobs/{id}/complete` · `/fail` | |
| GET | `/health` · `/ready` | |
