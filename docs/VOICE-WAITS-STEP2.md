# Étape 2 — Réduction des attentes vocales

2 novembre 2026. Référence : `2deb87e`. Branche conservée : `codex/voice-recovery-diagnostics`.
L'étape 1 est conservée. Aucune modification des consignes de dialogue, du modèle,
de la voix, des réglages ASR, des délais de silence ou de l'interface. L'étape 3
n'est pas commencée. Les serveurs actifs ne sont pas redémarrés.

## Attentes identifiées et décisions

| Étape | Observation et traitement |
| --- | --- |
| Fin de parole | Marges existantes 1,8 / 3,2 / 5 s conservées. Les données actuelles ne prouvent pas qu'un délai inférieur respecterait les hésitations et autocorrections. |
| Capture | Les 150 ms restent en place : l'API native ne fournit toujours pas de garantie de drainage des derniers buffers. |
| Whisper | Environ 104 ms de calcul final sur les sons faciles ; file finale médiane 0 ms, maximum 94 ms avant et 52 ms après. Ces maxima ne prouvent pas un gain de file. |
| Priorité ASR | Le final passait déjà avant les partiels en attente ; les partiels périmés sont déjà ignorés. Le test confirme qu'un ASR engagé termine sans interruption forcée. |
| Contrôle grammatical | Environ 1,3 s sur des commandes dont la formulation simple pouvait être vérifiée exactement avant une réponse contrôlée. C'est le gain récurrent ciblé. |
| Génération | Chemin génératif conservé avec son contrôle et sa validation complète ; pas de lecture de tokens partiels. Aucun gain intrinsèque Qwen revendiqué. |
| Synthèse | La première synthèse payait aussi le chargement des poids japonais : 1,54 à 1,76 s dans les premières sessions de référence. Préparation anticipée retenue. |
| Conversion de lecture | Médiane voisine de 0,2 ms : maintien de l'ordre actuel, sans pré-synthèse susceptible de survivre inutilement à une annulation. |
| Lecture / micro | Pas de lecture Android dans ces mesures. L'écoute reprend toujours après les WAV joués ; aucun nouveau délai client ajouté. |

## Deux optimisations livrées

**Grammaire contrôlée, laboratoire hybride uniquement.** Une liste étroite de
formulations de service complètes et grammaticalement connues dispense d'une
génération de contrôle Qwen redondante. Exemple : `コーヒーを一つください。` ou
`京都までお願いします。`. La réponse contrôlée et ses validations de contexte et
de traduction sont conservées. Le contrôleur seul ne constitue jamais la preuve
grammaticale : il faut d'abord une correspondance exacte avec ces formulations.

Les mauvaises particules, les compteurs inadaptés (`お茶を二枚ください。`),
`十つ`, les mots tronqués, les négations et les tours supplémentaires restent
dans le contrôle habituel. Les trois contrats laboratoire sont testés ; le
classique et la politique générative ne bénéficient pas de cette exemption.
Aucun acquis ou erreur pédagogique n'est enregistré par ce raccourci.

**Préparation japonaise au démarrage du laboratoire.** Le moteur existant charge
ses poids pendant la préparation du tuteur, sans synthétiser de phrase, produire
d'audio ou contacter le service français. L'opération est mutualisée ; si elle
échoue, la synthèse normale peut réessayer. La première sortie reste soumise à
la validation complète du tuteur. Style, vitesse, intonation et cache audio
restent identiques.

Une piste de suppression des partiels après stabilisation a été **retirée**.
Son contre-test montrait qu'un nouvel échantillon très faible pouvait ne plus
être analysé après deux partiels concordants. Le gate du worker s'applique au
snapshot entier : une queue sous −60 dBFS n'est donc pas une preuve de silence.
Le test de conservation de cette queue passe sur le code final. La cadence
ASR reste inchangée ; aucune économie de requêtes n'est revendiquée.

## Comparaison finale avant/après

Quatre sons synthétiques publics déjà utilisés : commande de café, destination,
origine et goût pour le japonais. Historiques fixes, un contrat `ja-first` avec
politique hybride, même flux vocal source. Référence serveur extraite du commit
`2deb87e` dans un dossier temporaire ; aucun changement de branche ou de serveur
actif. Les workers de mesure sont séparés, sur un port de boucle locale temporaire.
Les modèles de développement restent chargés : la charge GPU extérieure n'est
pas contrôlée et les conditions ne sont pas celles d'une machine exclusive.

Deux sessions par version, cache audio actif ou désactivé ; trois passages des
quatre entrées par session. **48 tentatives, 48 abouties techniquement, 0 échec.**
Les médianes à chaud ci-dessous utilisent les deuxième et troisième passages :
quatre observations par chemin et réglage, pas quatre utilisateurs indépendants.
Les silences de fin varient avec le pilotage réel de l'endpoint ; la voix source,
le texte effectivement transcrit et l'historique sont identiques dans les 24 paires.

### Fin explicite du tour → premier WAV reçu sur le Mac

| Chemin à chaud | Cache | Médiane avant → après | Maximum avant → après | Échecs avant / après |
| --- | --- | ---: | ---: | ---: |
| Contrôlé | Actif | 1,463 → 0,114 s | 1,471 → 0,120 s | 0/4 et 0/4 |
| Contrôlé | Désactivé | 1,959 → 0,666 s | 2,099 → 0,776 s | 0/4 et 0/4 |
| Généré | Actif | 2,478 → 2,414 s | 2,993 → 2,912 s | 0/4 et 0/4 |
| Généré | Désactivé | 3,234 → 3,182 s | 3,931 → 3,708 s | 0/4 et 0/4 |

### Texte reconnu → premier WAV reçu

| Chemin à chaud | Cache | Médiane avant → après |
| --- | --- | ---: |
| Contrôlé | Actif | 1,347 → 0,002 s |
| Contrôlé | Désactivé | 1,853 → 0,560 s |
| Généré | Actif | 2,372 → 2,303 s |
| Généré | Désactivé | 3,121 → 3,068 s |

Le résultat proche de zéro après texte dans le chemin contrôlé avec cache est
un résultat de traitement local, pas une réponse instantanée du téléphone.

### Dernière énergie estimée → premier WAV reçu

Contrôlé avec cache : médiane 3,471 → 2,118 s ; sans cache : 3,964 → 2,654 s.
Généré avec cache : 4,489 → 4,412 s ; sans cache : 5,248 → 5,187 s.
Les marges d'endpoint et de capture restent présentes. Ce repère énergétique
n'est pas la fin de parole entendue par une personne.

### Premiers tours de sessions neuves

| Premier cas apparié | Fin de tour → WAV avant → après |
| --- | ---: |
| Réponse contrôlée courte, cache actif | 4,142 → 0,760 s |
| Origine générée, cache désactivé | 4,692 → 3,611 s |

Une observation à froid par condition, pas une médiane reproductible du froid.
Le coût de chargement des modèles avant disponibilité est enregistré séparément
dans la preuve ; ses différences de disque/cache et d'ordre ne sont pas comptées
comme un gain démontré de démarrage. Les autres premières utilisations de
formulations ne sont pas présentées comme des redémarrages complets.

### Secondaire, annulations et reprise

Le français secondaire ne conditionne toujours pas `response_done` et ne modifie
pas le japonais prononcé. Le banc met immédiatement en pause après cette fin de
réponse, sans attendre une lecture : c'est un stress d'annulation, pas le rythme
d'un utilisateur qui écoute le WAV. Les accusés d'annulation observés vont de
11 à 183 ms. Le maximum survient avec audio en cache et annulation au début du
préremplissage ; la file Qwen du tour principal reste au plus à 1,1 ms après.
Il ne s'agit pas d'un gain d'annulation établi.

Le délai `start` → accusé serveur « listening » est enregistré. Il ne mesure
pas la remise en route du microphone natif. Les événements de lecture Android,
le premier son entendu et le microphone prêt restent **non mesurés**, champs
explicitement nuls dans la preuve. Une aide explicite conserve en outre sa
lecture française avant le modèle japonais ; le délai Vivienne n'est pas
qualifié par ces quatre cas.

## Qualité, régressions et limites

Les 24 paires ont **exactement le même objet tuteur** (japonais, romaji, français,
conseil et correction), ainsi que la même durée WAV totale. Le gain contrôlé ne
provient pas d'une réponse raccourcie ni d'un abandon du contexte. Les tests de
l'étape 1 et de protection de la mémoire vocale passent.

Cela ne certifie pas les quatre réponses sur le plan pédagogique. L'origine
générée conserve notamment son commentaire générique sur la France et sa relance
descriptive trop ouverte. Son français secondaire est annulé dans ce stress.
Ces défauts existants ne sont pas corrigés pendant l'étape 2. La revue par
l'auteur du code n'est pas une revue linguistique humaine indépendante.

Une série intermédiaire du prototype écarté montrait un ralentissement du cas
origine généré sans cache : médiane à chaud 3,440 s contre 2,712 s. Le code final
est remesuré sur les quatre mêmes entrées ; ce ralentissement n'est pas reproduit.
L'ancienne optimisation de partiels n'avait supprimé aucun snapshot dans ces
cas : on n'attribue donc pas cette variation à son retrait. Les séries
intermédiaires restent conservées localement. Aucun gain significatif n'est
revendiqué sur la génération ; les petits écarts finaux restent compatibles
avec la variabilité de cette mesure limitée et non exclusive.

L'alternance écoute/lecture et l'absence d'interruption de Mochi restent celles
du laboratoire actuel. Les hésitations, autocorrections, réponses courtes et
signaux faibles gardent les politiques de l'étape 1. Un bruit continu peut donc
encore prolonger l'écoute. L'ASR humain et le ressenti Android restent inconnus.

## Traçabilité préparée, sans nouvel écran

Le bilan numérique existant contient maintenant :

- `version.clientRelease` : lot du code JS embarqué, `2026-11-02.waits-2` ;
- `version.server.release`, `commit` (12 caractères publics), `sourceState` au
  chargement du serveur (`clean`, `modified` ou `unknown`) ;
- `version.releaseMatch` : comparaison de lots, nulle pour un serveur ancien ;
- la version du serveur attachée à chaque tour, conservée si la connexion tombe.

La comparaison de lots n'est pas une empreinte binaire de chaque Fast Refresh.
Avant le futur essai autorisé, le lot attendu doit correspondre, le commit
serveur doit être celui annoncé et ses sources doivent être propres. Un code
modifié, une révision inconnue ou un ancien serveur ne certifient pas la version.
La version est prise au chargement : elle ne suit pas silencieusement les
changements Git effectués pendant que le processus tourne.

L'information passe sur le WebSocket déjà authentifié. Aucun jeton, branche,
chemin, adresse personnelle, extrait audio ou transcription n'est ajouté à ces
champs. Le bilan garde uniquement les métadonnées de version et mesures autorisées.
La nouvelle version n'est pas annoncée comme chargée sur le téléphone : les
serveurs existants ont conservé leurs processus pendant ce lot.

## Vérifications et décision

190 tests Node, 186 tests Python, types, format, export Android et contrôle
spécialisé studio réussis sur le code final. Ces tests restent des vérifications
techniques ; aucun test de téléphone n'est inventé.
La preuve [step2.json](evidence/voice-waits/step2.json) contient les 48 traces,
médianes/maxima, échecs, comparaisons des sorties et empreintes des sources.
Le lanceur est `scripts/benchmark-voice-waits.ts` : il exige un lancement
explicite et un fichier neuf dans `.local/voice-lab`, n'accepte que ses quatre
fixtures publiques et ferme ses propres workers et transport à la fin.

**GO technique pour soumettre l'étape 3 à la revue de l'utilisateur.** Gain
récurrent d'environ 1,3 s démontré sur les réponses contrôlées étudiées, gain
à froid sur la synthèse, aucune régression technique constatée dans la
qualification finale. **Aucun GO d'expérience Android ou de production.**
La PR #1 reste en brouillon, aucune fusion. Aucun enregistrement personnel,
aucune progression ou mémoire modifiée. Arrêt après ce bilan : l'étape 3 et
l'unique futur essai Android libre restent soumis à l'autorisation suivante.
