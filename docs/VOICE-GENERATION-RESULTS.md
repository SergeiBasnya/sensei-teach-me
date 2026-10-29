# Diagnostic vocal — génération et charge locale

29 octobre 2026, suite du laboratoire `34e9ef6`. **Le gain technique observé justifie de poursuivre le prototype, pas de remplacer le vocal classique.** Les prises Android ont été reportées par l’utilisateur. Aucun extrait de sa voix, aucune référence humaine validée et aucun avis sur la sensation réelle d’appel ne sont disponibles pour cette mission. Aucun nouveau modèle ASR n’a été installé ou choisi.

## Ce qui est prêt pour la voix humaine

Le [guide de séance](HUMAN-VOICE-SESSION.md) propose vingt prises : réponses courtes, phrases complètes, hésitations de 1 à 3 secondes, autocorrections, particules incorrectes volontaires, français, mélange de langues et bruit habituel. La conservation reste désactivée tant que l’utilisateur n’active pas lui-même l’option du laboratoire. Aucun enregistrement n’a été lancé par l’agent. L’inventaire final indique zéro prise et zéro référence validée.

Le CLI `scripts/review-human-voice.py` prépare la référence verbatim sans afficher d’hypothèse Whisper, puis exige une attestation explicite par extrait et pour le corpus. Il ne répare pas les fautes prononcées et laisse les références incertaines en attente. Le manifeste de capture et les WAV restent intacts ; les sorties neuves demeurent privées et ignorées par Git.

Le comparateur conserve les quatre profils Small existants. Il sépare désormais les annotations de sens changé, faute prononcée normalisée, coupure observée, répétition injustifiée et réaction pédagogique incorrecte. Chaque champ inconnu reste `null`, avec son propre dénominateur humain. Le CER et l’énergie audio ne remplissent jamais ces jugements. **La comparaison ASR sur cette voix et le diagnostic Android réel restent à faire après les prises.**

## Comparaison contrôlée des contrats

La [méthode complète](VOICE-GENERATION-METHOD.md) décrit les six situations, deux passes, l’ordre contrebalancé, les empreintes de sources, les versions, les limites et les commandes. Les mêmes textes synthétiques rédigés sont envoyés aux trois contrats. Un seul moteur Qwen est actif ; cache TTS désactivé. La série finale contient 36 réponses, dont 12 par contrat. Tous les contrats complets sont acceptés mécaniquement dans cette série. Cela ne certifie pas la justesse linguistique ou la qualité pédagogique.

**Le délai mesuré part d’un texte déjà reconnu et finit à l’émission du premier WAV validé.** Il exclut capture, attente de silence, ASR initial, transport et lecteur Android. Il ne se compare pas directement aux anciennes médianes 4,73 s / 4,70 s de la chaîne complète.

Deuxième passe, six situations par profil :

| Contrat                           | Premier WAV, médiane |            Étendue | Fin du traitement, médiane |
| --------------------------------- | -------------------: | -----------------: | -------------------------: |
| Structuré actuel                  |           4 889,7 ms | 4 487,5–5 514,2 ms |                 4 889,7 ms |
| Compact japonais/français         |           3 763,4 ms | 3 439,0–4 104,9 ms |                 3 864,2 ms |
| Japonais d’abord, détails ensuite |           3 221,6 ms | 2 939,8–3 548,9 ms |                 3 973,6 ms |

La différence des médianes est de 1 126,3 ms pour le compact et de 1 668,1 ms pour le japonais d’abord. Le gain apparié médian par situation est respectivement 1 160,2 ms et 1 465,0 ms : ce sont deux calculs différents. Les réponses peuvent changer de contenu et de longueur. Le gain ne mesure donc pas exclusivement le format JSON. Dans le cas « température », le japonais est identique dans les trois profils (`サイズはどれにしますか？`) : 4 681,3 ms, 3 439,0 ms et 3 200,4 ms. Ce cas réduit ce biais sans suffire à une généralisation statistique.

Les premières versions du prompt japonais ont aussi été testées. Sans préfixe JSON, la série initiale complète rejette les 12 sorties `ja-first` avant tout son. Le diagnostic synthétique a montré une réponse brute hors JSON, évoquant à tort l’apprentissage du français. L’ajout de deux exemples seul laisse encore des rejets ; la deuxième série est volontairement interrompue et conservée comme incomplète. La version finale préremplit seulement `{"japanese":`, exige ensuite la valeur et la fermeture complètes, et refuse toujours les doublons, champs inconnus, textes corrompus et sorties tronquées. Aucun échec n’est converti en zéro milliseconde ou supprimé pour embellir la moyenne.

Preuves publiques synthétiques : [première série rejetée](evidence/voice-generation/format-rejections.json), [série avec exemples interrompue](evidence/voice-generation/examples-interrupted.json), [comparaison finale complète](evidence/voice-generation/contracts.json). Leurs empreintes diffèrent selon la version réellement exécutée. Aucun corpus humain ni son base64 n’y figure.

## Pourquoi les partiels ne suffisaient pas

La capture progressive avance l’obtention d’hypothèses ASR, mais elle ne lance aucune réponse pédagogique sur un partiel. À la fermeture du tour, le laboratoire demande encore une reconnaissance finale, attend son éventuelle file, puis effectue le contrôle grammatical. La génération du dialogue commence ensuite. Dans le mode actuel, un champ japonais déjà fermé reste interdit à la lecture jusqu’à la fin et à la validation du JSON entier. La synthèse commence seulement après ces étapes.

Médianes de phases sur les six essais chauds finaux :

| Phase                                        |  Structuré |    Compact | Japonais d’abord |
| -------------------------------------------- | ---------: | ---------: | ---------------: |
| Contrôle grammatical                         | 1 165,4 ms | 1 194,1 ms |       1 203,3 ms |
| Génération complète du dialogue              | 2 687,2 ms | 1 540,5 ms |       1 075,0 ms |
| Premier token dans cette génération          |   877,0 ms |   607,5 ms |         724,1 ms |
| Champ japonais complet dans cette génération | 1 335,4 ms | 1 026,6 ms |       1 033,5 ms |
| Attente après le champ jusqu’au JSON complet | 1 370,9 ms |   521,7 ms |          40,8 ms |
| Première synthèse japonaise                  | 1 002,6 ms | 1 061,5 ms |         903,0 ms |
| Calcul secondaire total, après premier WAV   |          — |          — |         803,4 ms |

Ces phases sont imbriquées : il ne faut pas les additionner comme des coûts indépendants, ni additionner leurs médianes pour reconstruire un tour. La conversion de lecture supplémentaire côté Node représente environ 0,2 ms ici ; le chronomètre a été corrigé pour inclure réellement cette conversion. Le premier token n’est ni une réponse complète ni une autorisation de synthèse. Le gain principal du japonais d’abord provient du raccourcissement de la génération obligatoire avant le son, sans supprimer le contrôle grammatical.

Le prototype commence les détails après le premier WAV et attend encore leur fin avant `response_done`. L’attente restante côté serveur vaut 803,2 ms en médiane, entre 691,1 et 1 163,0 ms. **Ce n’est pas un délai de micro supplémentaire mesuré** : la lecture du WAV peut couvrir ce calcul. Les durées de lecture et la reprise effective Android ne sont pas mesurées dans ce benchmark. Une traduction exceptionnellement lente pourrait encore retarder l’écoute. Sur pause, l’attente Node est libérée et aucune publication tardive n’est acceptée ; l’inférence Qwen déjà commencée n’est pas annulable par ce worker séquentiel et peut encore retarder le travail suivant.

## Whisper et Qwen se gênent-ils sur le Mac ?

Le benchmark distinct contient 18 cellules : trois situations, deux passes, Qwen seul / ASR visant un départ par seconde / ASR continu sans attente. Un worker Small dédié reconnaît les mêmes PCM synthétiques déjà échauffés. Aucune requête ASR ne s’empile ; les appels sont bornés et le dernier est attendu avant la cellule suivante.

Deuxième passe, trois situations par condition :

| Charge pendant Qwen | Génération complète médiane, sans TTS | Chevauchement des requêtes |
| ------------------- | ------------------------------------: | -------------------------: |
| Aucune              |                            3 419,8 ms |                        0 % |
| ASR cadencé à 1 s   |                            3 653,0 ms |                23,9–47,8 % |
| ASR continu, stress |                            4 181,7 ms |                      100 % |

L’allongement apparié par situation vaut 233,2–381,7 ms avec la cadence d’une seconde (médiane 274,0 ms) et 702,1–1 128,5 ms sous stress continu (médiane 761,9 ms). Les ASR chevauchants sont eux-mêmes plus lents : médianes groupées de 286,4 ms (13 appels cadencés) et 285,0 ms (39 appels continus), contre 90,6 et 89,9 ms dans leurs contrôles ASR seuls effectués après chaque cellule. Ces appels répétés ne sont pas des locuteurs ou observations humaines indépendants. L’ordre du contrôle, les caches et les effets thermiques restent des limites.

**Il existe une contention mesurée dans ce montage forcé. Elle n’explique pas à elle seule le délai du laboratoire actuel.** Le drain global de `server/voice-lab.ts` englobe déjà la reconnaissance finale puis `respond()`. Les ASR suivants attendent la réponse ; un test WebSocket à deux sessions vérifie cet ordre avec des moteurs simulés. Le micro du même client reste fermé pendant Mochi. Le chevauchement ASR/Qwen mesuré ici est donc un stress volontaire par appels directs, pas une concurrence observée dans l’essai Android réel. Ces fenêtres ne prouvent pas une simultanéité de noyaux GPU. La mémoire GPU, l’énergie et la RSS des workers n’ont pas été mesurées.

Preuve : [traces de charge et fenêtres temporelles](evidence/voice-generation/contention.json). La première passe et tous les appels appariés restent disponibles.

## Protections et limites conversationnelles

Le correcteur existant s’exécute avant les variantes ; sa validation de structure et ses gardes contre les changements de faits restent actives. Une correction retenue garde le chemin pédagogique existant. Les nouveaux contrats ne génèrent pas de règle grammaticale secondaire : seuls les conseils déjà rédigés du projet sont admissibles. Les détails ne peuvent changer ni japonais, ni correction, ni rōmaji. Le transport refuse un détail avant le premier audio ou visant une autre phrase. Le laboratoire ne produit aucun événement d’apprentissage ou d’écriture dans la mémoire d’erreurs.

L’inspection des textes synthétiques montre des limites qui empêchent une promotion automatique : dans la scène de gare, Mochi demande au client le quai du train, alors qu’elle doit l’aider ; cette inversion est présente dans plusieurs contrats, y compris le mode structuré. Le japonais d’abord peut aussi se contenter de saluer après un prénom, sans relancer. Le compact donne certaines traductions françaises maladroites. La validation mécanique du contrat n’est pas une certification linguistique. La revue humaine/spécialisée demeure en attente ; aucun score de justesse inventé n’est donné.

Les politiques de fin de tour existantes (1,8 / 3,2 / 5 secondes selon stabilité et hésitation) ne sont pas retouchées sans voix réelle : les réduire maintenant pourrait couper les hésitations demandées. Le barge-in reste désactivé. Les coupures, répétitions injustifiées, interruptions, erreurs réseau et contextualisation sur un véritable échange Android restent à observer.

## Décision et suite

Conserver le vocal classique et le contrat `structured` par défaut. Garder les deux variantes derrière le choix explicite côté serveur `SENSEI_LAB_GENERATION=compact` ou `ja-first`, associé à `npm run local:lab`. Le serveur remis en route pour le téléphone utilise `structured`. Aucune nouvelle option ni refonte d’interface n’est ajoutée.

Le raccourcissement du contrat offre un gain local tangible sur le premier fichier, mais la fiabilité conversationnelle et la compréhension de la voix de l’utilisateur ne sont pas encore démontrées. La prochaine décision dépend des vingt prises, des références verbatim, des quatre profils Small et d’une écoute Android de plusieurs minutes. Les nouvelles mesures client séparent fermeture du tour, première lecture, fin du dernier segment, fin de traitement et reprise automatique du micro ; les estimations d’énergie restent distinctes des observations humaines. L’alignement du WAV avec les événements n’est pas calibré et leurs identifiants ne sont pas automatiquement associés.

Aucune migration ASR, nouvelle fonction pédagogique ou refonte visuelle ne découle de ce rapport. Le [comparatif des ajouts textuels](voice-generation-copy-before-after.md) documente les consignes expérimentales et le paragraphe de README ajoutés.

## Vérifications techniques

125 tests TypeScript et 80 tests Python passent, ainsi que types, formatage et exports web/Android/iOS. Les tests couvrent notamment la validation complète avant audio, l’immutabilité des détails, le rejet du JSON tronqué prérempli, la protection du correcteur, les annulations et la distinction reprise automatique/pause manuelle. Les exports mobiles ne constituent pas une compilation APK ni une observation sur téléphone physique. Aucune dépendance, CI générale, leçon ou ressource d’avatar n’a été ajoutée.
