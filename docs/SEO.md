# SEO et hébergement

Harmonia sera hébergée. Une application React pure (rendu côté client) est mal
indexée : le SEO impose donc une décision d'architecture, pas seulement des
balises.

## Décision : deux surfaces

| Surface | Contenu | Rendu | Indexée |
|---|---|---|---|
| **Site public** | Accueil, cours, référence de théorie, pages légales | **Pré-rendu statique** au build (HTML complet) puis hydratation | Oui |
| **Application** | Analyseur, ear training, générateur, bibliothèque, réglages | Rendu client, derrière connexion | Non (`noindex`) |

Les deux partagent le design system et le moteur de théorie (WASM). L'outil de
pré-rendu sera choisi au début de la Phase 3, à sa dernière version stable.

## Le levier principal : la référence de théorie

Le moteur sait calculer chaque gamme, accord, intervalle et tonalité. Chaque
entité devient une page publique générée au build, avec un contenu réel et
interactif :

| Modèle d'URL | Exemple | Volume |
|---|---|---|
| `/gammes/{tonique}-{type}` | `/gammes/do-majeur` | 12 toniques × 16 types |
| `/accords/{symbole}` | `/accords/la-mineur-7` | 12 fondamentales × 28 qualités |
| `/tonalites/{tonalite}` | `/tonalites/mi-bemol-majeur` | 24 |
| `/intervalles/{nom}` | `/intervalles/tierce-majeure` | ~20 |
| `/progressions/{id}` | `/progressions/ii-v-i` | catalogue |
| `/instruments/{id}/accords/{symbole}` | `/instruments/guitare/accords/sol-7` | selon instruments |
| `/cours/{slug}` | `/cours/construire-une-gamme-majeure` | cours |

Chaque page contient : les notes, un lecteur audio, la visualisation sur
instrument, les relations (liens vers les pages voisines du graphe musical).
Le maillage interne **est** le graphe de relations du moteur.

Garde-fous : pas de pages quasi identiques (les enharmonies pointent par
`rel="canonical"` vers l'orthographe usuelle), pas de page sans contenu propre.

## Socle technique

| Sujet | Règle |
|---|---|
| Balises | `<title>` et `meta description` uniques par page, générés depuis les données du moteur. |
| URL | Lisibles, en minuscules, stables. Une redirection 301 pour tout changement. |
| Canonical | Sur chaque page publique. |
| Langues | Français et anglais, URL distinctes (`/fr/`, `/en/`), balises `hreflang`. |
| Plan du site | `sitemap.xml` généré au build, `robots.txt` excluant l'application et l'API. |
| Données structurées | JSON-LD : `WebApplication` (accueil), `Course` et `LearningResource` (cours), `BreadcrumbList`, `DefinedTerm` (référence). |
| Partage | Open Graph et Twitter Card ; image générée par page (nom de l'accord + diagramme). |
| HTML | Un seul `h1`, titres hiérarchisés, texte alternatif pour chaque visualisation. |
| Accessibilité | Contraste AA, navigation clavier, visualisations doublées d'un équivalent textuel. |

## Performance (Core Web Vitals)

Le thème verre + relief animé est le principal risque.

| Indicateur | Cible | Moyen |
|---|---|---|
| LCP | < 2,5 s | HTML pré-rendu, polices locales préchargées, pas d'image d'en-tête lourde. |
| INP | < 200 ms | Calculs lourds en worker ; WASM chargé après le premier rendu. |
| CLS | < 0,1 | Dimensions réservées pour chaque visualisation. |
| Poids | JS initial des pages publiques < 150 Ko compressé | Hydratation partielle, audio et WASM chargés à la première interaction. |

Le relief topographique des pages publiques est un SVG statique pré-rendu ;
l'animation ne démarre qu'après le chargement et jamais si
`prefers-reduced-motion` est actif.

## Hébergement

| Élément | Besoin |
|---|---|
| Site public | Fichiers statiques derrière un CDN. |
| API Rust | Un service conteneurisé. |
| PostgreSQL, RustFS | Services gérés ou conteneurs avec volumes persistants. |
| Workers Python | Conteneurs séparés, dimensionnables indépendamment. |
| HTTPS | Obligatoire (également requis par l'API Web Audio sur certains navigateurs et par les `AudioWorklet`). |
| En-têtes | `Cross-Origin-Opener-Policy` et `Cross-Origin-Embedder-Policy` si le WASM utilise des threads ; cache long sur les fichiers versionnés. |

## Mesure

Suivi sans traceur tiers intrusif : journaux du serveur et un outil d'audience
respectueux de la vie privée, auto-hébergeable. Audit Lighthouse dans la CI sur
les pages publiques, avec les cibles ci-dessus comme seuils bloquants.
