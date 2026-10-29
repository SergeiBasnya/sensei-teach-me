# Comparaison ASR avec une vraie voix

État : **pending-human**. Aucun corpus humain validé ni résultat comparatif de reconnaissance n’est livré avec ce document. Les tests du script utilisent uniquement des WAV artificiels pour vérifier les calculs et les refus d’entrées invalides. Ils ne mesurent pas la compréhension du japonais de l’utilisateur.

Ce document et les trois fichiers associés sont des ajouts. Ils ne changent ni la reconnaissance en production, ni les écrans, ni la mémoire pédagogique. La procédure demande une collecte volontaire puis une validation humaine des références ; elle ne remplit jamais cette validation à la place de l’utilisateur.

## Diagnostic établi dans le code actuel

Le parcours classique utilise `RecordingPresets.HIGH_QUALITY` puis envoie un fichier après la fin du tour. Le serveur décode avec ffmpeg vers du float32 mono à 16 kHz, avec une limite de 60 secondes. Il charge Whisper Small MLX local, emploie `language=None`, `temperature=0`, `condition_on_previous_text=False` et un court prompt bilingue. Les segments sont ensuite filtrés ; une reconnaissance jugée incertaine demande un nouvel essai au lieu de produire une correction. Sources locales : `src/lib/use-oral-session.ts`, `server/conversation_worker.py`, `scripts/setup-local-conversation.py`.

Ces faits n’établissent pas la cause des erreurs entendues sur Android. Il faut distinguer le son effectivement capturé, la conversion, le découpage, la reconnaissance et l’interprétation. Une hypothèse est que la détection automatique sur une réponse très courte choisisse mal la langue. Une autre est que le prompt ou le modèle normalise une phrase fautive. Ni l’une ni l’autre n’est démontrée sans les mêmes extraits humains rejoués dans plusieurs configurations.

## Collecte volontaire et fichiers privés

Dans le laboratoire vocal Expo Go, l’option **Garder mes extraits sur le Mac** doit rester désactivée par défaut. L’activer volontairement autorise la création locale des WAV et d’un manifeste à compléter ; cela ne valide pas les références. Sans cette option, aucune conservation d’extrait n’est nécessaire à l’essai interactif. Le collecteur est intégré séparément du présent outil : vérifier sa disponibilité effective dans la version testée.

Emplacement compatible : `.local/voice-lab/manifest-template.json` avec les WAV dans `.local/voice-lab/samples/`. Le dossier `.local/` est ignoré par Git. Un dossier privé extérieur au dépôt convient aussi. Le comparateur refuse les entrées et sorties situées dans un chemin Git publiable ou déjà suivi, même si ce dernier est ensuite ajouté à `.gitignore`. Il ne téléverse rien et n’imprime ni référence, ni hypothèse, ni chemin privé. Les sorties sont créées avec des droits `0600`, sans écraser un essai existant.

Le [modèle de manifeste](../tests/corpora/human-asr-template.json) ne contient aucun audio ni transcription réelle. Le copier dans le dossier privé si le collecteur n’a pas déjà fourni son manifeste. Les exemples de chemins du modèle sont des emplacements à remplacer, pas des enregistrements disponibles.

Pour chaque extrait :

1. Écouter le WAV réellement enregistré, sans lire une hypothèse ASR.
2. Écrire dans `reference` ce qui a été prononcé, avec hésitations, faux départs et faute volontaire. Ne pas écrire seulement ce que l’on voulait dire et ne pas réparer la grammaire.
3. Choisir `language` : `ja`, `fr`, `mixed` ou `none`. Pour un silence, employer `kind:"silence"`, `language:"none"` et une référence vide.
4. Si possible, relever `speechBounds:{startMs,endMs}` à l’écoute pour le début et la fin réels de parole. Sans relevé, garder `null` ; les mesures de bord restent alors des indices acoustiques, pas une preuve de coupure.
5. Mettre `humanValidated:true` sur cet extrait seulement après relecture. Retirer du manifeste de comparaison les lignes non enregistrées ou non validées.
6. Mettre `consentToLocalEvaluation:true`, `captureType:"human"` et `humanValidated:true` à la racine une fois le corpus prêt. Ces drapeaux sont une attestation de l’opérateur, pas une certification indépendante de la voix.

Employer des identifiants opaques et des situations fictives si cela évite d’enregistrer des détails personnels. Ne pas joindre les WAV, références ou hypothèses à un commit. Les rapports numériques restent privés par défaut ; relire tout extrait destiné à être partagé.

## Protocole de signal et de découpage

Enregistrer une vingtaine d’extraits courts dans les conditions réelles d’utilisation. Pour quelques phrases, faire deux ou trois prises naturelles plutôt que les réciter jusqu’à obtenir une reconnaissance parfaite. Garder les mêmes fichiers pour chaque profil ; une nouvelle prise n’est pas la même entrée.

| Groupe                              | Ce qu’il faut observer                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réponses japonaises très courtes    | Oui/non, un prénom, un pays, un choix chaud/glacé ; ne pas confondre brièveté et silence.                                                                        |
| Particule volontairement incorrecte | La référence garde la faute dite. Vérifier si l’ASR la répare avant que le professeur puisse l’évaluer.                                                          |
| Hésitation et recherche de mot      | Pause interne d’environ 1, 2 puis 3 secondes, avec reprise de la même phrase. Relever toute fin de tour prématurée.                                              |
| Autocorrection                      | Prononcer un faux départ puis sa réparation. La référence conserve les deux, dans l’ordre.                                                                       |
| Français et alternance de langue    | Demander de répéter ou expliquer, puis mêler un mot français à une phrase japonaise. Un profil japonais imposé doit aussi être jugé sur ces demandes françaises. |
| Silence et bruit ambiant            | Silence volontaire puis même type de phrase avec bruit ordinaire. Les insertions sur silence sont rapportées séparément.                                         |
| Début et fin                        | Commencer naturellement après l’ouverture du micro ; terminer par une syllabe peu sonore. Comparer le WAV à ce qui a été dit et aux bornes humaines.             |
| Placement du téléphone              | Même phrase à distance habituelle puis plus éloignée ; noter la condition dans un tag anonyme.                                                                   |

Le validateur accepte exclusivement un **WAV PCM signé 16 bits, mono, 16 000 Hz**, entre zéro exclu et 60 secondes. Il refuse les formats différents et les données tronquées ; il ne convertit, ne normalise le volume et ne découpe aucun enregistrement. Une conversion éventuelle doit être effectuée une seule fois sur une copie privée, avec conservation de l’original. Elle ne peut pas restaurer une syllabe déjà coupée par la capture.

Le rapport relève durée, RMS, pic, fraction d’échantillons proches de la saturation et énergie des dix premières/dernières millisecondes. Ces mesures décrivent le signal. Elles ne sont ni un score de prononciation, ni un diagnostic automatique de bruit, d’écho ou de coupure. La présence d’une syllabe manquante doit être confirmée en écoutant l’original et le WAV transmis. Le SHA-256 du PCM permet de vérifier que les profils ont reçu les mêmes échantillons.

## Configurations comparées sans nouveau modèle

Les quatre profils réutilisent **les mêmes poids Small déjà présents sur le Mac**. Les autres paramètres restent identiques à la configuration actuelle. La documentation MLX précise que `language=None` déclenche une détection et qu’un `initial_prompt` influence le contexte de transcription ; cela justifie de séparer ces deux facteurs. [API MLX Whisper](https://github.com/ml-explore/mlx-examples/blob/main/whisper/mlx_whisper/transcribe.py)

| Profil                 | Langue          | Prompt initial  | Question expérimentale                                                             |
| ---------------------- | --------------- | --------------- | ---------------------------------------------------------------------------------- |
| `small-auto-prompt`    | Automatique     | Bilingue actuel | Référence des réglages existants.                                                  |
| `small-ja-prompt`      | Japonais imposé | Bilingue actuel | L’imposition de la langue aide-t-elle le japonais court et nuit-elle au français ? |
| `small-auto-no-prompt` | Automatique     | Aucun           | Le prompt facilite-t-il la reconnaissance ou introduit-il un biais ?               |
| `small-ja-no-prompt`   | Japonais imposé | Aucun           | Effet combiné sur les mêmes entrées.                                               |

Le laboratoire décode également les silences pour observer les hallucinations brutes. Le champ `productionGateWouldSkip` indique les extraits que le précontrôle actuel aurait ignorés ; il ne faut donc pas appeler la transcription brute un résultat de bout en bout de la production. `candidateText` reproduit le filtrage des segments et du silence. Une incertitude impose encore un nouvel essai en production, signalé par `productionWouldAskRepeat`.

L’ordre des profils tourne entre répétitions pour limiter un biais d’ordre. Le modèle est chargé une fois. Le premier appel est identifié ; **cela ne constitue pas quatre mesures à froid indépendantes**. Le chargement est mesuré séparément. Pour une comparaison strictement à froid, exécuter un protocole isolé par processus et documenter l’état du cache système ; ne pas appeler ces résultats des mesures à froid par profil.

## Exécution locale

Sans corpus, cette commande ne charge aucun modèle et indique `pending-corpus` :

```sh
python3 -B scripts/compare-human-asr.py
```

Vérification d’un corpus privé, sans inférence :

```sh
python3 -B scripts/compare-human-asr.py \
  --manifest .local/voice-lab/manifest-validated.json \
  --report .local/voice-lab/preflight-01.json
```

Lancer les mesures seulement lorsque les autres travaux ASR, Qwen et synthèse sont arrêtés. Ne pas exécuter cette commande en parallèle d’un benchmark existant. Le drapeau explicite charge uniquement Whisper local ; aucun téléchargement, aucun serveur et aucun appel à Qwen ou VOICEVOX ne sont prévus par l’outil.

```sh
.venv/bin/python -B scripts/compare-human-asr.py \
  --manifest .local/voice-lab/manifest-validated.json \
  --run-models --repeats 3 \
  --observations-out .local/voice-lab/observations-01.json \
  --report .local/voice-lab/comparison-01.json
```

Le script exige un répertoire local contenant configuration et poids ; le chemin par défaut est celui de Small existant. Le mode hors ligne est imposé. Il n’installe aucune dépendance. Si MLX ou le modèle manque, conserver l’état incomplet plutôt que lancer une installation pendant les mesures.

Les observations privées contiennent les hypothèses nécessaires à la relecture. Elles ne recopient pas les références : celles-ci restent dans le manifeste privé. Le rapport agrégé ne contient ni référence ni hypothèse. Les empreintes des fichiers du modèle sont calculées après les mesures pour ne pas préchauffer ses fichiers avant le chargement.

## Trois erreurs distinctes à relever

**Transcription :** le script calcule une distance de Levenshtein par caractères et un CER strict après NFC, puis un CER après NFKC, retrait de la ponctuation/des espaces et mise en minuscules. Les particules, négations, hésitations, nombres et différences kana/kanji restent présents. Une différence purement orthographique peut donc augmenter le CER sans changer l’intention : elle exige une inspection. Pour une référence vide, le CER individuel est indéfini ; le nombre de caractères insérés reste visible. Le CER agrégé inclut ces insertions dans son numérateur.

**Intention :** une personne examine si l’information utile a changé : pays, nombre, boisson, négation, question ou demande d’aide. Le CER ne produit jamais ce verdict. Renseigner `intentError:true/false` seulement après examen de la sortie correspondante, sinon laisser `null`.

**Correction pédagogique :** une personne compare ce qui a réellement été prononcé, sa référence, l’hypothèse ASR et la réaction pédagogique effectivement obtenue dans un essai séparé. Vérifier notamment une fausse correction due à l’ASR et une faute grammaticale normalisée par l’ASR. Le présent script n’appelle pas le professeur, ne modifie pas la mémoire et ne déduit pas cette erreur du texte. Laisser `pedagogicalError:null` tant que cette réaction n’a pas été observée.

Dans une ligne privée d’observations, une annotation prend cette forme, après examen réel uniquement :

```json
"humanAnnotation": {
  "humanValidated": true,
  "intentError": null,
  "pedagogicalError": null
}
```

Chaque booléen renseigné est compté avec son propre dénominateur humain. Une absence d’annotation n’est jamais un succès. Conserver le fichier brut et enregistrer une copie annotée, puis recalculer sans modèle :

```sh
python3 -B scripts/compare-human-asr.py \
  --manifest .local/voice-lab/manifest-validated.json \
  --observations-in .local/voice-lab/observations-01-annotated.json \
  --report .local/voice-lab/comparison-01-reviewed.json
```

Comparer les mêmes extraits et le même nombre de répétitions. Examiner séparément japonais, français et mélange de langues. La médiane ASR est un temps mural d’inférence locale ; elle exclut capture, transport, génération pédagogique, synthèse et début réel de lecture. Le RSS est le maximum cumulé du processus, pas une allocation par profil, une mesure GPU ou une consommation énergétique. Les ressources non mesurées restent inconnues.

## Autres moteurs à considérer ensuite

État des sources primaires consultées le 28 octobre 2026 ; aucune installation ni comparaison locale de ces moteurs n’est revendiquée ici.

| Candidat                  | Intérêt documenté et limite de la comparaison                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whisper.cpp`             | Apple Silicon est pris en charge avec Metal et des options Core ML. Son exemple continu procède par fenêtres répétées et est décrit comme simple ; il ne prouve pas une bonne fin de tour pour débutant. Une comparaison demanderait ses poids au format adapté et des réglages identiques, sans confondre temps d’encodeur et transcription complète. [Dépôt officiel](https://github.com/ggml-org/whisper.cpp) |
| `faster-whisper`          | CTranslate2 permet un profil CPU quantifié. Les chiffres publiés ne sont pas des mesures sur ce Mac ni sur ce japonais. Le support matériel précompilé documente ARM64 CPU et NVIDIA GPU, sans promettre l’accélération Metal de MLX. [Projet officiel](https://github.com/SYSTRAN/faster-whisper), [support CTranslate2](https://opennmt.net/CTranslate2/hardware_support.html)                                 |
| Qwen3-ASR                 | Les modèles officiels 0.6B/1.7B incluent français et japonais. Leur documentation propose du streaming via vLLM ; cela ne démontre pas son fonctionnement ou ses ressources sur ce Mac. Les téléchargements et l’environnement supplémentaire seraient un changement à justifier après les premières mesures. [Projet officiel Qwen](https://github.com/QwenLM/Qwen3-ASR)                                        |
| Qwen3-ASR via `mlx-audio` | Le projet de portage MLX documente une exécution sur Apple Silicon et des variantes Qwen3-ASR. C’est une intégration distincte du projet officiel Qwen. Évaluer sa révision exacte, ses poids et son comportement progressif ; ne pas déduire une latence réelle de l’étiquette MLX. [Projet du portage](https://github.com/Blaizzy/mlx-audio)                                                                   |

## Décision à prendre après l’essai

**Recommandation actuelle : pending-human ; aucun profil promu et aucun remplacement en production.** Commencer par les quatre configurations du même Small pour isoler les effets de langue et de prompt sans changer les poids. Les commandes sont prêtes ; les résultats humains restent absents jusqu’à la collecte et à la relecture.

Choisir ensuite en considérant ensemble : erreurs d’intention, erreurs pédagogiques, CER, demandes de répétition, temps ASR, ressources et demandes françaises préservées. Un meilleur CER global ne suffit pas si les quantités ou les négations sont moins fiables. Une amélioration d’ASR n’établit pas à elle seule une conversation en moins de trois secondes. Si ces réglages restent insuffisants, comparer un autre moteur ou des poids plus grands dans un environnement séparé avec ce même corpus privé avant toute migration.
