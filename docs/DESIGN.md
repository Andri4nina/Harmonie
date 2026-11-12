# Direction artistique

> **Révision du 2026-11-12 (prime sur la suite du document).** L'identité verte
> et néon a été abandonnée : elle accumulait les défauts que le skill
> `frontend-design` demande d'éviter. Nouvelle direction, « la partition, la
> nuit » :
>
> | Nom | Hex | Rôle |
> |---|---|---|
> | Nuit | `#161A2E` | fond, encre bleu nuit |
> | Velours | `#232846` | verre |
> | Ivoire | `#ECE6D8` | texte (ivoire de piano), 66 % et 42 % pour les niveaux secondaires |
> | Laiton | `#D9B46A` | **seul accent** : action, état actif, focus |
> | Laiton sombre | `#8A6E3A` | traits fins |
>
> - Typographie (choix de l'utilisateur) : **Unbounded** pour les titres et
>   les noms de notes et d'accords, **Syne** pour le reste, chiffres alignés.
>   Unbounded n'a pas d'italique : les légendes restent en Syne droit. Aucune
>   monospace, aucune étiquette en capitales, aucun séparateur « · ».
> - Les couleurs des notes (une teinte par classe de hauteur, chroma 0,085)
>   ne servent qu'aux notes, jamais à l'interface.
> - Le verre est réservé au cadre (barre latérale, menu) et aux instruments ;
>   les sections de texte sont posées sur le relief. Rayons : cadre 26 px,
>   panneau 18 px, pastille 10 px.
> - **Thèmes** : sombre (par défaut, pages pré-rendues), clair et « système »
>   (suit l'appareil, en direct). Clair : papier froid `#EEF0F6` (pas de
>   crème), encre `#161A2E`, laiton foncé `#8A6526` pour le contraste AA,
>   notes plus saturées (L 0,56, C 0,12). Le thème est posé avant le premier
>   affichage par un script en ligne : aucun flash.
> - **Logo** : la quinte juste. Deux sons dans le rapport 3:2 tracent cette
>   figure de Lissajous ; une tête de note ivoire la parcourt (fixe dans le
>   logo, en mouvement dans le loader et l'écran de démarrage).
> - **Barres de défilement** : pastille fine et arrondie, laiton au survol.
> - Un seul mouvement orchestré : le nom de l'élément se « grave » au
>   chargement. Le reste ne bouge qu'en réponse à un geste.
> - Responsive vérifié à 375, 768 et 1440 px : sous 1024 px, barre supérieure
>   et menu en tiroir ; piano et manche défilent, le piano s'ouvre sur le do
>   central.


Ce document fixe l'identité visuelle d'Harmonia. Il sera traduit en design system
(tokens, composants) au début de la Phase 3.

## Concept : la topographie du son

Deux matières, superposées :

1. **Le relief** — un fond de lignes de niveau topographiques. Ce n'est pas un
   décor : les courbes sont *calculées*. Sur les écrans d'exploration elles sont
   générées par un champ de bruit lent ; sur les écrans d'écoute elles sont
   déformées par la musique (énergie du spectre, chroma). Le son dessine le
   terrain.
2. **Le verre** — les panneaux d'interface flottent au-dessus du relief :
   translucides, floutés, bordés d'un filet lumineux. On lit l'outil sans jamais
   perdre le paysage.

Le mélange donne la signature d'Harmonia : un instrument de mesure posé sur une
carte vivante.

## Graphisme

### Lignes topographiques

| Règle | Valeur |
|---|---|
| Génération | Isolignes (marching squares) d'un champ scalaire, rendues en SVG ou Canvas. Jamais d'image bitmap. |
| Trait | 1 px, continu pour les courbes maîtresses (une sur cinq), **tireté** pour les intermédiaires. |
| Opacité | 6 à 14 % au repos ; jusqu'à 30 % sous un élément actif. |
| Couleur | Teinte de l'accent courant, désaturée. |
| Sens | La densité des courbes encode une grandeur réelle (énergie, tension harmonique, distance sur le cercle des quintes). Pas de courbes purement décoratives sur les écrans d'analyse. |
| Cotes | Petites étiquettes d'altitude en chiffres tabulaires : elles portent des valeurs utiles (Hz, BPM, degré). |

### Verre

| Règle | Valeur |
|---|---|
| Fond de panneau | Blanc à 4–8 % d'opacité sur fond sombre. |
| Flou d'arrière-plan | 16 à 24 px, saturation légèrement relevée. |
| Bordure | 1 px, dégradé du blanc 18 % (haut-gauche) au blanc 4 % (bas-droite). |
| Rayons | 12 px (contrôles), 20 px (panneaux), 28 px (surfaces principales). |
| Profondeur | Trois niveaux seulement : relief, verre, verre surélevé (modales, menus). |
| Ombre | Large, très diffuse, teintée par le fond — jamais noire pure. |

### Couleur

Base sombre, froide, quasi neutre. Un seul accent à la fois, choisi par le contexte.

| Rôle | Intention |
|---|---|
| Fond | Bleu-noir profond, pas de noir pur. |
| Texte | Blanc cassé ; secondaire à 64 % ; tertiaire à 40 %. |
| Accent principal | Cyan-menthe lumineux (signal, sélection, lecture). |
| Accent secondaire | Ambre chaud (attention, estimé). |
| Sémantique d'analyse | `detected` = accent plein ; `estimated` = ambre ; `uncertain` = contour tireté sans remplissage. Le tireté signifie partout « incertain ». |
| Douze classes de hauteur | Une roue de 12 teintes ordonnée selon le cercle des quintes : deux notes voisines harmoniquement ont des couleurs voisines. |

Les valeurs exactes seront fixées avec un contrôle de contraste WCAG AA (4,5:1 pour
le texte) mesuré sur le verre, fond le plus défavorable compris.

### Typographie

- Titres et interface : une grotesque géométrique variable.
- Données musicales (notes, accords, degrés, temps) : une mono ou des chiffres
  tabulaires, pour que les colonnes ne dansent pas pendant la lecture.
- Polices sous licence libre (SIL OFL), hébergées localement : aucun appel à un
  service tiers.

## Motion design

Le mouvement explique, il ne décore pas.

| Principe | Application |
|---|---|
| **Le son mène** | Toute animation liée à l'audio est pilotée par l'horloge audio (`AudioContext.currentTime`), jamais par un minuteur indépendant. |
| **Continuité** | Passer d'une gamme à son accord, d'un accord à sa tonalité : les notes communes restent en place, les autres glissent. L'utilisateur voit la relation. |
| **Durées** | 120 ms (retour immédiat), 240 ms (transition d'état), 480 ms (changement de vue). Rien au-delà de 600 ms hors lecture musicale. |
| **Courbes** | Sortie douce pour les entrées, ressort amorti léger pour les objets manipulés (touches, cordes). Pas de rebond gratuit. |
| **Relief vivant** | Dérive très lente du fond (cycle de plusieurs dizaines de secondes) ; réaction à la musique limitée en amplitude. |
| **Verre** | Les panneaux apparaissent par opacité + léger déplacement vertical (8 px) ; le flou ne s'anime pas (trop coûteux). |
| **Micro-interactions** | Une touche enfoncée, une corde qui vibre, un accord qui s'allume : retour visuel sous 16 ms, synchrone avec l'attaque du son. |

### Contraintes non négociables

- `prefers-reduced-motion` : relief figé, transitions réduites à des fondus.
- `prefers-reduced-transparency` et **mode léger** : verre remplacé par des aplats
  opaques, flou désactivé. Le flou d'arrière-plan est l'effet le plus coûteux de
  l'interface ; le cahier des charges exige de tourner sur des machines modestes.
- Animations sur `transform` et `opacity` uniquement ; visualisations lourdes dans
  un Canvas, hors du thread principal quand c'est possible (`OffscreenCanvas`).
- Budget : 60 images par seconde pendant la lecture sur une machine modeste, sinon
  dégradation automatique vers le mode léger.

## Ce qu'on évite

- Le tableau de bord administratif générique (cartes de statistiques alignées).
- Le verre partout : au-delà de trois niveaux, la hiérarchie disparaît.
- Les dégradés arc-en-ciel et le néon : un accent à la fois.
- Toute ressemblance avec l'interface d'un logiciel de production existant.
