# Risques techniques de la transcription polyphonique

La transcription d'un enregistrement mixé en notes exactes est un problème de
recherche non résolu. Harmonia doit l'assumer dans son architecture et dans son
interface.

## Risques

| # | Risque | Cause | Conséquence | Parade |
|---|---|---|---|---|
| R1 | **Erreurs d'octave et harmoniques prises pour des notes** | Les partiels d'une note se superposent aux fondamentales d'autres notes. | Notes fantômes, accords enrichis à tort (fausses 7e, 9e). | Seuils par note, exiger la présence dans la chroma grave pour la basse, ne proposer une extension que si elle persiste sur la durée de l'accord. |
| R2 | **Mixage dense** | Batterie, distorsion, réverbération, compression masquent les hauteurs. | Chute forte de la précision hors piano ou guitare seule. | Séparation percussif/harmonique (HPSS) systématique ; séparation de sources optionnelle ; certitude abaissée automatiquement quand l'énergie percussive domine. |
| R3 | **Instruments indissociables** | Une note détectée n'a pas d'instrument attaché. | Impossible d'attribuer une voix à un instrument de façon fiable. | L'identification d'instrument reste « lorsque possible », toujours marquée `uncertain` sans séparation de sources. |
| R4 | **Renversements** | Dépendent de la note la plus grave réellement jouée, souvent par la basse. | Renversement faux si la basse est mal suivie. | N'afficher un renversement que si la confiance de la basse dépasse un seuil ; sinon accord en position fondamentale marqué `estimated`. |
| R5 | **Ambiguïté harmonique réelle** | Am7 et C6 ont les mêmes notes ; sus2 et sus4 sont le renversement l'un de l'autre. | Plusieurs réponses justes. | Conserver les candidats classés, départager par la basse et le contexte tonal, exposer les alternatives à l'utilisateur. |
| R6 | **Accordage non standard** | La ≠ 440 Hz, bandes ralenties, instruments désaccordés. | Chroma étalée entre deux demi-tons. | Estimation de l'accordage avant la chroma, correction, valeur affichée. |
| R7 | **Tempo et mesure** | Tempo double ou moitié, rubato, mesures composées. | BPM ×2 ou ÷2, signature fausse. | Renvoyer les candidats de tempo ; signature rythmique toujours `estimated` ; correction manuelle propagée à la grille. |
| R8 | **Modulation ou emprunt** | Une fenêtre courte ne distingue pas un accord emprunté d'un changement de tonalité. | Fausses modulations. | Fenêtres longues avec hystérésis ; durée minimale pour déclarer une modulation. |
| R9 | **Coût de calcul** | Réseaux de neurones et séparation de sources sur CPU modeste. | Minutes de calcul, mémoire saturée. | Traitement par segments, modèles chargés à la demande, analyse d'une portion, mode léger sans réseau de neurones. |
| R10 | **Évaluation trompeuse** | Sans vérité terrain, on ne sait pas si l'analyse est bonne. | Régressions invisibles. | Jeu d'essai généré depuis des MIDI connus rendus en audio, métriques par feature suivies en CI. |
| R11 | **Licences des modèles** | Certains modèles performants interdisent l'usage commercial. | Blocage juridique tardif. | Liste blanche dans [LIBRARIES.md](LIBRARIES.md) ; les poids sont audités comme le code. |
| R12 | **Confiance mal calibrée** | Un score de réseau n'est pas une probabilité. | Un « 0,9 » faux trompe l'utilisateur. | Calibration sur le jeu d'essai ; seuils `detected / estimated / uncertain` fixés par feature à partir de la précision mesurée. |

## Ce que l'application peut promettre

| Feature | Attente réaliste sur musique mixée |
|---|---|
| BPM, tonalité principale | Fiable sur la plupart des morceaux tonaux à tempo stable. |
| Accords majeurs/mineurs, fondamentales | Bon sur harmonie claire ; dégradé sur mixage dense. |
| 7e, sus, dim, aug | Estimation ; à confirmer par l'utilisateur. |
| Extensions 9, 11, 13, voicings | Incertain hors instrument isolé. |
| Mélodie principale | Correcte quand une voix domine nettement. |
| Transcription polyphonique complète | Utilisable sur piano ou guitare seule ; indicative ailleurs. |
| Identification d'instruments | Indicative. |

## Conséquences sur le produit

1. Aucun résultat sans `confidence`, horodatage et certitude.
2. L'interface distingue visuellement `detected`, `estimated`, `uncertain`.
3. Tout résultat est corrigeable, et la correction ne détruit jamais le résultat brut.
4. Le mode Complex annonce ses limites avant le lancement, pas après.
5. Aucune valeur n'est fabriquée : une étape qui échoue ne produit pas d'événement.
