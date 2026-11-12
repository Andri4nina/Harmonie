# Mise en ligne

| Élément | Hébergeur | Rôle |
|---|---|---|
| Base de données | **Supabase** (PostgreSQL 17+) | Morceaux, file d'analyse, résultats, corrections. Joignable de partout. |
| Comptes | **Supabase Auth** | Inscription, connexion, jetons vérifiés par l'API. |
| Fichiers audio | **Supabase Storage** (protocole S3) | Bucket privé `audio`. |
| API | **Render** (service web Docker) | `deploy/api.Dockerfile`. |
| Worker d'analyse | **Render** (background worker Docker) | `deploy/worker.Dockerfile`. |
| Site | **Vercel** | Site statique pré-rendu, publié par GitHub Actions. |

```
navigateur ──► Vercel (site)          ┌──► Supabase PostgreSQL
     │                                │
     └──────► Render : API ───────────┼──► Supabase Storage (S3)
                 ▲                    │
                 └── Render : worker  └──► Supabase Auth (clés publiques)
```

La base n'est jamais ouverte au navigateur : seule l'API s'y connecte. Sur
Supabase, la migration `0002` active la sécurité par ligne (RLS) sans aucune
politique, ce qui ferme l'accès des clés publiques du projet aux tables.

## 1. Supabase

1. Créer un projet sur <https://supabase.com> (région Europe, mot de passe de
   base fort, conservé dans un gestionnaire de mots de passe).
2. **Base** : *Connect* → *Session pooler* → copier l'URL
   `postgresql://postgres.<ref>:<mot de passe>@aws-…pooler.supabase.com:5432/postgres`.
   C'est `DATABASE_URL`. Les tables sont créées par l'API à son premier
   démarrage (migrations de `db/migrations`).
3. **Comptes** : *Authentication* → *Sign In / Providers* → laisser *Email*
   actif. L'adresse du projet (`https://<ref>.supabase.co`) est `SUPABASE_URL`.
   *Project Settings* → *API Keys* : la clé **publishable** (`sb_publishable_…`)
   est faite pour le navigateur ; c'est `SUPABASE_PUBLISHABLE_KEY`. La clé
   secrète ne doit jamais aller dans le site. *Authentication* → *URL
   Configuration* : mettre l'adresse du site Vercel en *Site URL* et ajouter
   `https://<site>/analyser` aux *Redirect URLs* (lien de confirmation des
   inscriptions).
4. **Stockage** : *Storage* → *New bucket* `audio`, **privé**. Puis
   *Storage* → *S3 Connection* → *New access key*. Reporter l'*Endpoint*
   (`S3_ENDPOINT`), la *Region* (`S3_REGION`) et la paire de clés
   (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). La clé secrète n'est
   affichée qu'une fois.

## 2. Render

1. Pousser le dépôt sur GitHub, puis sur <https://render.com> : *New* →
   *Blueprint* → choisir le dépôt. Render lit `render.yaml` et propose les
   deux services.
2. Saisir les secrets demandés :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | URL Supabase de l'étape 1.2 |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `WORKER_TOKEN` | même valeur pour l'API et le worker ; `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
   | `CORS_ORIGINS` | adresse du site Vercel, ex. `https://harmonie.vercel.app` |
   | `S3_*` | valeurs de l'étape 1.4 |
   | `HARMONIE_API_URL` (worker) | adresse de l'API Render, ex. `https://harmonie-api.onrender.com` |

3. Vérifier : `https://harmonie-api.onrender.com/health` doit répondre
   `"database": true`.

Limites de l'offre gratuite de Render : le service web s'endort après
15 minutes sans requête (premier appel lent, environ 1 minute) ; le worker
demande une offre payante (*Starter*). Sans worker en ligne, les analyses
restent en file ; un worker lancé sur un ordinateur personnel peut les
traiter :

```bash
HARMONIE_API_URL=https://harmonie-api.onrender.com WORKER_TOKEN=… python -m harmonia_worker serve
```

## 3. Vercel

1. Sur <https://vercel.com> : *Add New* → *Project* → créer un projet vide
   (sans importer de dépôt : la construction a lieu dans GitHub Actions, qui
   dispose de Rust pour compiler le moteur).
2. *Account Settings* → *Tokens* → créer un jeton. Dans `.vercel/project.json`
   (créé par `npx vercel link` dans `apps/web`) ou les réglages du projet,
   relever l'identifiant d'équipe et celui du projet.
3. Sur GitHub, *Settings* → *Secrets and variables* → *Actions* :
   - secrets : `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` ;
   - variables : `SITE_URL` (ex. `https://harmonie.vercel.app`), `API_URL`
     (adresse de l'API Render), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et,
     facultatif, `GOOGLE_SITE_VERIFICATION`. Sans `API_URL` ni Supabase, la
     page « Analyser un morceau » explique ce qui manque au lieu de proposer
     une connexion qui échouerait.
4. Chaque poussée sur `main` qui touche le site le publie
   (`.github/workflows/deploy-web.yml`).

## 4. Référencement

1. *Google Search Console* → ajouter la propriété avec l'adresse du site →
   méthode « balise HTML » : copier la valeur `content` dans la variable
   `GOOGLE_SITE_VERIFICATION`, republier, valider.
2. Soumettre `https://<site>/sitemap.xml`.
3. Le titre de l'accueil est « Andrianina Rasoamanana - Harmonie » ; les
   données structurées déclarent le site, l'application et leur auteur.
   L'apparition dans les résultats dépend ensuite de Google (de quelques jours
   à quelques semaines) ; aucun réglage ne la garantit.

## Développement local

Avec Docker :

```bash
cp .env.example .env
docker compose up --build
```

Sans Docker, avec un PostgreSQL quelconque (ou la base Supabase) :

```bash
DATABASE_URL=… WORKER_TOKEN=… SUPABASE_URL=… cargo run -p harmonia-api
```

Essayer l'écran d'analyse contre une API locale sans projet Supabase : lancer
l'API avec `SUPABASE_JWT_SECRET`, fabriquer un jeton HS256 signé avec ce secret
(`aud: authenticated`), puis dans `apps/web/.env.local` (jamais versionné) :

```bash
VITE_API_URL=http://127.0.0.1:8080
VITE_DEV_ACCESS_TOKEN=<jeton>
```

Ce jeton n'est lu qu'en développement (`npm run dev`), jamais dans un build.

Test d'intégration de l'API (crée puis supprime un schéma temporaire) :

```bash
TEST_DATABASE_URL=postgres://… cargo test -p harmonia-api --test flow
```
