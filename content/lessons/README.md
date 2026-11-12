# Cours

Un cours par fichier JSON, lu par le site (pages `/cours/…`, pré-rendues) et,
plus tard, par les applications. Ce sont des données : aucune règle musicale
n'y est calculée ; les notes, accords et exercices viennent du moteur.

| Champ | Rôle |
|---|---|
| `slug` | adresse de la page (`/cours/<slug>`) |
| `order`, `level` | place dans la liste, niveau affiché |
| `title`, `summary` | titre et résumé (aussi utilisés pour le référencement) |
| `steps` | étapes, dans l'ordre |

Types d'étapes :

| `type` | Champs | Effet |
|---|---|---|
| `text` | `body` | paragraphes ; `**gras**` met un terme en valeur |
| `piano` | `node`, `caption` | clavier montrant les notes de l'élément |
| `listen` | `node`, `label` | bouton qui joue l'élément |
| `sequence` | `nodes`, `label` | joue plusieurs éléments à la suite, pour comparer |
| `question` | `prompt`, `choices`, `answer`, `explanation` | question à choix, expliquée après la réponse |
| `quiz` | `exercise`, `level`, `count`, `label` | questions d'oreille générées par le moteur |
| `explore` | `node`, `label` | lien vers la page de l'élément dans l'explorateur |

`node` est un identifiant du moteur (`note:C#`, `chord:Am7`, `scale:D:dorian`,
`key:F#:minor`, `progression:pop:C:major`). Les tests du site vérifient que
chaque identifiant existe, que chaque réponse figure parmi ses choix et que
chaque exercice existe à ce niveau.
