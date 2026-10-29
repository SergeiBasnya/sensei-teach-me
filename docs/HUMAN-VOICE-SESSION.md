# Ta séance de validation vocale

Ajout du 29 octobre 2026. **Résultat humain en attente : les prises seront faites plus tard.** Ce parcours utilise le laboratoire existant ; il ne change ni les leçons, ni le modèle Whisper, ni le vocal classique. Les exemples ci-dessous sont fictifs. Ils ne deviennent jamais automatiquement des transcriptions de référence.

## Préparer les prises sur Android

Le Mac et le téléphone doivent être sur le même Wi-Fi. Recharge Sensei dans Expo Go, puis ouvre **Réglages → Ouvrir le laboratoire vocal**. Le serveur Mac doit avoir été lancé avec `npm run local:lab`. Si son adresse Wi-Fi a changé, conserve le code personnel actuel et corrige seulement l’adresse du serveur dans les réglages. N’envoie pas ce code avec ton retour.

Pour constituer des entrées comparables :

- Choisis **Japonais et français**, sans imposer le japonais pour les demandes françaises.
- Désactive **Réponse japonaise de Mochi** et **Reprendre l’écoute après Mochi** pendant la collecte.
- Désactive **Fin de phrase automatique expérimentale** pour cette première série. Cela permet de comparer les quatre profils avec les mêmes enregistrements sans changer la fin de tour entre profils.
- **Active toi-même Garder mes extraits sur le Mac** si tu acceptes de conserver ces prises. Cette option reste désactivée par défaut ; sans ton activation, aucun corpus audio n’est constitué.
- Démarre une prise, parle naturellement, laisse une courte marge après la dernière syllabe, puis touche **Terminer ma phrase**. Attends l’identifiant « Dernier extrait privé sur le Mac ». **Mettre en pause** annule la prise en cours ; ce n’est pas le bouton d’enregistrement d’un extrait.

Fais une prise par ligne ci-dessous. Note localement le numéro de ligne et l’identifiant affiché, ou garde simplement l’ordre de capture. Si une phrase est difficile, utilise tes propres mots : ce qui compte est ta voix réelle. Ne recommence pas jusqu’à obtenir une transcription parfaite. Évite de lire le partiel à l’écran comme s’il était la bonne réponse ; les références seront écrites après écoute du WAV.

Les WAV restent dans `.local/voice-lab/samples/`, avec leur manifeste privé `.local/voice-lab/manifest-template.json`. Le bilan partagé n’inclut pas ces fichiers. Le collecteur ne prouve pas que l’extrait est complet ou que sa langue est bien étiquetée ; cela fait partie de la relecture.

## Vingt prises représentatives

Les mentions entre crochets indiquent une action silencieuse ; **ne prononce pas « pause »**. Le rōmaji est une aide de lecture, pas une référence de ce que tu auras réellement dit. Une durée de silence approximative suffit.

| N°  | Situation                         | Exemple possible                                         | Lecture / intention                                                                                                    |
| --- | --------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Réponse très courte               | はい。                                                   | **Hai.** — Oui.                                                                                                        |
| 2   | Réponse très courte               | いいえ。                                                 | **Īe.** — Non.                                                                                                         |
| 3   | Fragment naturel                  | フランスです。                                           | **Furansu desu.** — France.                                                                                            |
| 4   | Prénom fictif                     | アレックスです。                                         | **Arekkusu desu.** — Je m’appelle Alex.                                                                                |
| 5   | Choix court                       | ホットでお願いします。                                   | **Hotto de onegai shimasu.** — Chaud, s’il vous plaît.                                                                 |
| 6   | Phrase complète                   | フランスから来ました。                                   | **Furansu kara kimashita.** — Je viens de France.                                                                      |
| 7   | Phrase complète                   | パリに住んでいます。                                     | **Pari ni sunde imasu.** — J’habite à Paris.                                                                           |
| 8   | Commande                          | コーヒーを一つください。                                 | **Kōhī o hitotsu kudasai.** — Un café, s’il vous plaît.                                                                |
| 9   | Goûts                             | 日本語が好きです。                                       | **Nihongo ga suki desu.** — J’aime le japonais.                                                                        |
| 10  | Hésitation d’environ 1 s          | あの… [1 s] フランスから来ました。                       | **Ano… Furansu kara kimashita.**                                                                                       |
| 11  | Hésitation d’environ 2 s          | パリに… [2 s] 住んでいます。                             | **Pari ni… sunde imasu.**                                                                                              |
| 12  | Hésitation d’environ 3 s          | コーヒーを… [3 s] 一つください。                         | **Kōhī o… hitotsu kudasai.**                                                                                           |
| 13  | Autocorrection                    | フランスを…いや、フランスから来ました。                  | **Furansu o… iya, Furansu kara kimashita.** — Faux départ puis réparation.                                             |
| 14  | Changement de choix               | ホット…じゃなくて、アイスでお願いします。                | **Hotto… ja nakute, aisu de onegai shimasu.** — Finalement glacé.                                                      |
| 15  | **Faute volontaire de particule** | 私はフランスを来ました。                                 | **Watashi wa Furansu o kimashita.** — Construction incorrecte dite exprès ; vérifier si l’ASR la répare.               |
| 16  | **Faute volontaire de particule** | 日本語を好きです。                                       | **Nihongo o suki desu.** — Construction incorrecte dite exprès ; vérifier si le `o` réellement prononcé reste présent. |
| 17  | Demande en français               | « Répète la question, s’il te plaît. »                   | Vérifier l’intention de répétition.                                                                                    |
| 18  | Aide en français                  | « Je ne sais pas. Aide-moi à répondre. »                 | Vérifier l’intention d’aide.                                                                                           |
| 19  | Mélange de langues                | « Je voudrais コーヒー, s’il te plaît. »                 | **Kōhī** dans une phrase française ; ne pas traduire la référence à la place du locuteur.                              |
| 20  | Bruit ordinaire                   | Reprends la phrase 6 avec le bruit habituel de ta pièce. | Même phrase, autre condition. Pas besoin d’ajouter un bruit fort.                                                      |

Les lignes 15 et 16 sont des entrées de diagnostic incorrectes, pas des modèles à apprendre. Dans les références, conserve la faute si elle est bien dans le son. Pour les autres lignes, une omission, un faux départ ou une autre formulation restent des données utiles.

Facultatif : une 21e prise de silence de quelques secondes, terminée manuellement, aide à repérer les insertions de mots. Sa référence doit être vide, `kind:"silence"` et `language:"none"`, uniquement après écoute. Ne transforme pas un fichier inaudible contenant une tentative de parole en silence certain.

## Écrire les références depuis le son

Le nouvel outil de revue **n’enregistre rien, ne lit pas l’audio, ne lance pas de modèle et n’ouvre pas d’application**. Sans option interactive, il affiche uniquement un inventaire numérique :

```sh
python3 -B scripts/review-human-voice.py
```

Pour la revue, lance toi-même un terminal local. Le script refuse une validation envoyée par un pipe ou un terminal non interactif. Choisis un nouveau nom de sortie ; le manifeste créé par la capture reste inchangé :

```sh
python3 -B scripts/review-human-voice.py \
  --manifest .local/voice-lab/manifest-template.json \
  --review --output .local/voice-lab/references-review-01.json
```

Pour chaque extrait, il indique une commande `open` que **tu peux exécuter toi-même** pour écouter le WAV local. Il ne l’exécute jamais. Il n’affiche pas d’hypothèse Whisper pendant l’écriture de la référence. Si tu as regardé les partiels pendant la prise, réécoute le son seul : la séparation des écrans ne garantit pas l’absence de biais de mémoire.

Écris exactement ce qui est audible, avec les hésitations et autocorrections. N’ajoute ni la suite coupée, ni une particule correcte non prononcée. N’inscris pas les consignes `[2 s]` comme des mots. Tu peux adopter une graphie kana ou kanji raisonnable ; le CER actuel ne les confond pas automatiquement, donc une différence de graphie devra être examinée séparément.

Choisis ensuite la langue réellement parlée (`ja`, `fr`, `mixed`, `none`), des tags anonymes facultatifs et, si tu les as relevés à l’écoute, les bornes `début,fin` en millisecondes. Laisse ces bornes vides si tu ne sais pas. L’énergie du fichier ne les valide pas à ta place.

Une **coupure observée** demande une observation réelle pendant la prise ou une comparaison permettant de constater la syllabe perdue. Un WAV seul peut commencer au milieu d’un mot sans prouver ce qui précédait : réponds `?` si tu ne peux pas conclure. Une prise incompréhensible peut rester en attente ; l’option d’exclusion la retire de la comparaison mais ne supprime jamais son WAV.

Chaque référence n’est sauvegardée qu’après **JE CONFIRME**. L’attestation globale demande ensuite une autorisation de comparaison locale et la saisie **VALIDER LE CORPUS**. Le script ne remplit jamais ces réponses pour toi. Les checkpoints contiennent seulement les validations déjà confirmées ; une interruption laisse les autres références en attente. Pour reprendre sans écraser un fichier :

```sh
python3 -B scripts/review-human-voice.py \
  --manifest .local/voice-lab/references-review-01.json \
  --review --output .local/voice-lab/references-review-02.json
```

Un `--case identifiant` permet de revoir un extrait précis. Les sorties restent privées, avec droits `0600`, hors des chemins Git publiables. Une modification extérieure d’un checkpoint interrompt l’écriture plutôt que de l’écraser.

## Rejouer les quatre profils Small

La comparaison reprend les quatre configurations déjà préparées : langue automatique ou japonais imposé, avec ou sans le prompt bilingue. **Aucun nouveau modèle n’est choisi.** Les mêmes WAV validés sont utilisés pour chaque profil.

Effectue les mesures quand aucune autre séance ou mesure Qwen/ASR n’est en cours. Ferme les autres essais avant la comparaison. Exemple, lorsque les références du fichier choisi sont toutes validées :

```sh
.venv/bin/python -B scripts/compare-human-asr.py \
  --manifest .local/voice-lab/references-review-02.json \
  --run-models --repeats 3 \
  --observations-out .local/voice-lab/observations-01.json \
  --report .local/voice-lab/comparison-01.json
```

Ce calcul garde les hypothèses privées. Le [protocole ASR détaillé](VOICE-LAB-HUMAN-CORPUS.md) explique le CER, les filtres et les limites de temps/RSS. Un meilleur CER ne prouve ni une meilleure intention, ni une meilleure conversation. Les résultats français doivent être examinés même si le japonais imposé améliore certains exemples japonais.

## Séparer les cinq observations humaines

La référence étant déjà validée, un second mode peut afficher les hypothèses pour les annoter. Il ne génère aucune réaction pédagogique et ne change pas une référence :

```sh
python3 -B scripts/review-human-voice.py \
  --manifest .local/voice-lab/references-review-02.json \
  --annotate-observations .local/voice-lab/observations-01.json \
  --repeat 0 --output .local/voice-lab/observations-01-reviewed.json
```

`--profile small-auto-prompt` et `--case identifiant` permettent de limiter cette relecture. Par défaut, seule la première répétition est proposée pour éviter de compter trois fois une même inspection. Les autres restent en attente.

| Champ                   | Ce qu’une personne doit constater                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intentError`           | Le sens utile a changé : quantité, pays, négation, choix ou demande d’aide.                                                                                         |
| `normalizedSpokenError` | Une faute réellement audible a été réparée par l’ASR avant le correcteur. Laisse `null` en l’absence de faute pertinente ou sans examen.                            |
| `cutoffObserved`        | Une coupure a été réellement constatée ; elle n’est pas inférée du CER ou de l’énergie.                                                                             |
| `unjustifiedRepeat`     | Une demande de répétition est jugée injustifiée alors que la parole était utilisable. Laisse `null` si la demande ou son contexte n’a pas été observé suffisamment. |
| `pedagogicalError`      | La réaction pédagogique effectivement obtenue était erronée. Laisse `null` tant que la réaction n’a pas été testée.                                                 |

Les réponses sont `oui`, `non` ou `?`. Chaque ligne demande une confirmation humaine explicite. Chaque champ possède son propre dénominateur : une absence de jugement ou un cas non pertinent ne devient pas une réussite. Une coupure commune aux quatre profils ne constitue pas quatre événements indépendants de capture.

Recalculer le rapport annoté ne charge aucun modèle :

```sh
python3 -B scripts/compare-human-asr.py \
  --manifest .local/voice-lab/references-review-02.json \
  --observations-in .local/voice-lab/observations-01-reviewed.json \
  --report .local/voice-lab/comparison-01-reviewed.json
```

Les nombres de répétitions demandées par le filtre sont des sorties calculées sur le replay ; ils ne prouvent pas que l’application les a toutes demandées pendant une conversation. Les annotations humaines restent distinctes de ce compteur.

## Essayer ensuite la sensation de conversation

Désactive **Garder mes extraits sur le Mac** après la collecte si tu ne souhaites pas conserver la conversation. Active les réponses de Mochi, la reprise d’écoute et la fin automatique expérimentale. Essaie plusieurs minutes avec des phrases courtes, une pause interne de 1 à 3 secondes, une autocorrection, une demande française, puis un peu de conversation libre.

Observe la coupure éventuelle d’une hésitation, les demandes de répétition, la reprise du micro, le lien entre tes réponses et la suite, une pause/reprise et une perte/reprise du Wi-Fi. Pour les erreurs pédagogiques, distingue ce que tu as dit de ce que Whisper a transmis. Une transcription incertaine ne doit produire aucune faute mémorisée ; le laboratoire reste hors progression.

Le bilan technique contient des durées et compteurs. `firstJapaneseAfterDetectedVoiceMs` est une estimation depuis la dernière énergie vocale détectée ; ce n’est pas ta fin de phrase sémantique. `firstJapaneseAfterFinishMs` part de la fermeture du tour. Le premier événement du lecteur n’est pas une mesure acoustique au haut-parleur.

`captureWallMs` va du démarrage effectif de capture à sa fermeture. `lastJapaneseEndedAfterFinishMs` décrit la fin du dernier son japonais et `responseDoneAfterFinishMs` la fin de traitement annoncée, toutes deux après fermeture du tour. `nextCaptureAfterJapaneseEndedMs` n’existe que pour une reprise automatique d’écoute. Ces valeurs reposent sur les événements JavaScript ou natifs ; elles ne remplacent pas ton écoute.

La borne humaine `speechBounds.endMs`, relevée après écoute du WAV, reste distincte de la détection d’énergie. L’alignement du WAV avec les événements JavaScript est approximatif et non calibré : ne présente pas leur différence comme un délai exact depuis ta fin réelle de parole. Les identifiants d’extraits ne sont pas reliés automatiquement aux tours d’un bilan ; après des pauses ou plusieurs sessions, une association demande une vérification manuelle ultérieure. Aucune observation humaine n’est inventée depuis le JSON.

Un retour utile peut rester numérique et qualitatif, sans audio ou phrases personnelles :

```text
Nombre de prises réellement faites :
Références réécoutées et confirmées :
Durée approximative de conversation :
Sensation : agréable / acceptable / frustrante
Hésitations coupées : nombre approximatif
Répétitions injustifiées observées : nombre approximatif
Reprise d’écoute : rapide / lente / irrégulière
Réponses contextualisées : souvent / parfois / rarement
Pause, reprise et réseau : incidents éventuels
Priorité ressentie : compréhension / attente / interruptions / autre
```

Partage le bilan numérique seulement après l’avoir relu. Les fichiers audio, références et hypothèses n’ont pas à être envoyés ni publiés. La collecte, la comparaison ASR et l’essai conversationnel restent **en attente de ton intervention réelle** ; aucune des commandes de préparation ne les déclare accomplis.
