# Mise en ligne

Les fichiers prêts à remplir sont dans `deploy/env/` : `supabase`,
`render-api`, `render-worker`, `vercel` (variables GitHub du site) et
`github-secrets`. Les `.env.example` sont versionnés ; les copies `.env`
(non versionnées) contiennent déjà un `WORKER_TOKEN` généré, commun à l'API et
au worker. Ordre : Supabase d'abord (ses valeurs remplissent les autres
fichiers), puis Render, puis Vercel.

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
   `https://<site>/**` aux *Redirect URLs* (confirmation des inscriptions et
   retour de Google sur la page d'où l'on s'est connecté), plus
   `http://localhost:5173/**` pour le développement.
   **Connexion avec Google** (gratuite) : dans Google Cloud Console, créer un
   projet, *Google Auth Platform* → *Branding* (nom « Harmonie », adresse de
   contact, domaine du site), *Audience* → *External*, puis *Clients* →
   *Create client* → *Web application*. En *Authorized JavaScript origins*,
   l'adresse du site ; en *Authorized redirect URIs*,
   `https://<ref>.supabase.co/auth/v1/callback`. Copier l'identifiant et le
   secret du client dans Supabase : *Authentication* → *Sign In / Providers*
   → *Google* → activer. Seules les portées par défaut (`openid`, `email`,
   `profile`) sont demandées : aucune validation de Google n'est nécessaire.
   Dans les applications (ordinateur, Android), Google refuse les vues web
   intégrées : le bouton n'y est pas proposé, la connexion par adresse reste.
   **Rester connecté** : la session est gardée sur l'appareil et renouvelée
   en arrière-plan ; on reste connecté jusqu'à « Se déconnecter ». Dans
   *Authentication* → *Sessions*, laisser *Time-box user sessions* et
   *Inactivity timeout* désactivés (réglages par défaut).
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

## 3. Vercel (le site)

Le site est **construit par GitHub** (il faut Rust pour compiler le moteur)
puis **envoyé à Vercel**, qui ne fait que l'héberger. Vercel ne doit donc
pas construire lui-même : on crée un projet vide et on donne à GitHub trois
secrets pour y envoyer le site. Compter dix minutes, une seule fois.

### 3.1 Créer le compte et le projet

1. Ouvrir <https://vercel.com/signup> et s'inscrire avec **Continue with
   GitHub** (offre *Hobby*, gratuite). Accepter l'accès demandé à GitHub.
2. Installer Node.js si ce n'est pas fait (<https://nodejs.org>, version LTS).
3. Dans un terminal, depuis le dossier du dépôt :

   ```bash
   cd apps/web
   npx vercel login
   ```

   Choisir *Continue with GitHub* ; le navigateur s'ouvre, valider.
4. Toujours dans `apps/web` :

   ```bash
   npx vercel link
   ```

   Répondre :
   - *Set up and deploy?* → **Y** ;
   - *Which scope?* → votre nom d'utilisateur ;
   - *Link to existing project?* → **N** ;
   - *What's your project's name?* → **harmonie** (ce nom donne l'adresse
     `https://harmonie.vercel.app`, ou une variante s'il est pris) ;
   - *In which directory is your code located?* → **./** (Entrée).

   La commande crée `apps/web/.vercel/project.json` (non versionné), qui
   contient `orgId` et `projectId`.
5. Sur vercel.com, ouvrir le projet → *Settings* → *Build and Deployment* →
   *Framework Preset* : **Other** ; désactiver *Build Command* et *Install
   Command* (interrupteur *Override* puis champ vide). Le site arrive déjà
   construit.
6. *Account Settings* (avatar en haut à droite) → *Tokens* → *Create Token* :
   nom « GitHub Harmonie », *Scope* : votre compte, *Expiration* : *No
   expiration* (ou un an, à renouveler). Copier le jeton : il n'est affiché
   qu'une fois.

### 3.2 Donner les clés à GitHub

Sur <https://github.com/Andri4nina/Harmonie/settings/secrets/actions> :

1. Onglet **Secrets** → *New repository secret*, trois fois :

   | Nom | Valeur |
   | --- | --- |
   | `VERCEL_TOKEN` | le jeton de l'étape 3.1.6 |
   | `VERCEL_ORG_ID` | `orgId` de `apps/web/.vercel/project.json` |
   | `VERCEL_PROJECT_ID` | `projectId` du même fichier |

2. Onglet **Variables** → *New repository variable*, une par ligne de
   `deploy/env/vercel.env` (mêmes noms) :

   | Nom | Valeur |
   | --- | --- |
   | `VITE_SITE_URL` | l'adresse du site, ex. `https://harmonie.vercel.app` (sans `/` final) |
   | `VITE_API_URL` | l'adresse de l'API Render (étape 2) |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` (étape 1.3) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | la clé `sb_publishable_…` (étape 1.3) |
   | `VITE_GOOGLE_SITE_VERIFICATION` | facultatif (étape 5) |

   Ces valeurs sont publiques par nature : elles finissent dans le site.
   Sans `VITE_SUPABASE_*`, les outils ne demandent pas de connexion ; sans
   `VITE_API_URL`, l'analyse explique ce qui manque.

### 3.3 Publier et vérifier

1. Publier sans nouvelle version : *Actions* → *Site web* → *Run workflow*
   → *Run workflow*. Ensuite, chaque étiquette `vX.Y.Z` publie le site.
2. Dans l'exécution, l'étape **Publier sur Vercel** doit être verte (et non
   *Publication sautée*) ; son journal se termine par l'adresse du site.
3. Ouvrir l'adresse : la page de présentation s'affiche. Vérifier aussi une
   page profonde, ex. `/notes/do`, et `/robots.txt`.
4. Reporter l'adresse finale dans Supabase (*Authentication* → *URL
   Configuration* : *Site URL* et `https://<site>/**` en *Redirect URLs*) et
   dans Google Cloud (*Authorized JavaScript origins*).
5. Domaine personnel (facultatif) : projet Vercel → *Settings* → *Domains* →
   *Add*, puis suivre les enregistrements DNS indiqués ; mettre ensuite à
   jour `VITE_SITE_URL`, Supabase et Google avec ce domaine.

**Problèmes fréquents**

- *Publication sautée* : `VERCEL_TOKEN` absent ou rangé dans *Variables* au
  lieu de *Secrets* (ou dans un *Environment*).
- *Error: Project not found* : `VERCEL_ORG_ID` ou `VERCEL_PROJECT_ID`
  inversés ou copiés avec des guillemets.
- Page blanche après connexion Google : l'adresse du site manque dans les
  *Redirect URLs* de Supabase.

## 4. Application de bureau

Pousser une étiquette `vX.Y.Z` suffit : GitHub construit les installateurs
(Windows, macOS, Linux) et les joint à la publication ; la page
« Télécharger » les propose. Pour que l'analyse marche depuis l'application,
ajouter `http://tauri.localhost` et `tauri://localhost` à `CORS_ORIGINS` de
l'API. Signature des installateurs : `apps/desktop/README.md`.

## 5. Référencement

1. *Google Search Console* → ajouter la propriété avec l'adresse du site →
   méthode « balise HTML » : copier la valeur `content` dans la variable
   `VITE_GOOGLE_SITE_VERIFICATION`, republier, valider.
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
