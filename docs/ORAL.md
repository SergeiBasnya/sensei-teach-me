# Conversation orale locale

Demande humaine : parler à Mochi et entendre sa réponse sans valider une transcription, avec des solutions gratuites.

## Parcours livré

L’ouverture d’une situation connectée démarre la séance et demande la permission du micro si nécessaire. Mochi lit sa première question, puis le micro écoute après la fin réelle de la lecture. Une pause de 1,8 seconde après au moins 300 ms de signal vocal déclenche un tour automatiquement. Le serveur transcrit, génère une réponse japonaise et sa traduction française, puis synthétise la réponse. Le micro reprend après cette lecture. Aucun appui sur une icône son ni validation de texte n’est nécessaire.

Pause, sortie de séance, passage en arrière-plan et ouverture de Je bloque ou d’Historique interrompent la boucle. Le démarrage attend le retour au premier plan après une boîte de permission. Les arrêts sont sérialisés avant une reprise pour éviter qu’un ancien arrêt coupe le nouveau micro. Une reprise ne relit pas une question déjà entièrement entendue ; une lecture interrompue peut être reprise depuis son début. Un silence initial de 15 secondes met en pause avec le statut Besoin d’un coup de pouce ? ; 30 secondes bornent un tour. L’envoi repose sur la détection de fin de phrase.

L’écran principal montre Mochi, la question courante, le romaji et la traduction selon les préférences, puis une commande pause/reprise et un état court. L’historique complet et les corrections sont dans Historique. Je bloque explique comment construire une réponse à la question actuelle, avec un exemple à adapter, du romaji et une traduction française. L’élève peut écouter cet exemple ou écrire en français ce qu’il veut dire pour obtenir sa propre phrase japonaise. À moi de parler reprend l’écoute : l’aide ne soumet aucune réponse à sa place. La relecture de la question et le clavier restent accessibles dans ce panneau. Les objectifs, les séances, les séries et le carnet conservent leur fonctionnement.

## Moteurs et ressources

- Transcription : Whisper small MLX, révision `45f3915923c7a79a5a5b5a7d909d39aeb0e5630e`.
- Dialogue : Qwen3 14B en 4 bits MLX, révision `a4d9b2df59d2c150bef02fcbe0d91046b7ca33a4`, réflexion interne désactivée. Réponse japonaise puis traduction séparée : le modèle n’a pas à produire un format JSON pour poursuivre le dialogue.
- Synthèse : VOICEVOX CORE 0.17.1, style 10 雨晴はう, voix A validée auparavant. Vitesse et intonation 1, hauteur 0.
- Romaji oral : romanisation de la lecture kana utilisée par VOICEVOX, après retrait des marques d’accent. Cette lecture reflète la voix du moteur, sans prétendre à un diagnostic de la prononciation de l’élève.
- Décodage audio : binaire FFmpeg fourni dans le paquet Python imageio-ffmpeg, sans installation système.

Tous les composants de calcul tournent sur le serveur personnel. L’installation validée utilise le Mac Apple Silicon de développement, 48 Go de mémoire, Python 3.12. Aucun calcul de ces modèles n’est embarqué dans le téléphone. Les versions des modèles et des bibliothèques principales sont épinglées dans l’installateur ; les dépendances transitives suivent leur résolution pip.

Sources : [MLX LM](https://github.com/ml-explore/mlx-lm), [Whisper MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper), [modèle Qwen3 14B converti](https://huggingface.co/mlx-community/Qwen3-14B-4bit), [VOICEVOX CORE](https://github.com/VOICEVOX/voicevox_core). Conditions et crédit de la voix dans `assets/speech/NOTICE.md`.

## Transport et confidentialité

`POST /api/oral-turn` authentifié accepte audio, scénario et au plus 16 messages de contexte. Le serveur effectue transcription, dialogue et voix, puis renvoie la trace et le WAV dans une seule réponse. Une absence de parole détectée ne déclenche aucun appel de dialogue ni de synthèse. Les entrées et réponses sont validées avec Zod, le débit et la taille des requêtes sont limités.

Les moteurs sont persistants, avec délai maximal et file bornée. Le worker de dialogue charge les modèles depuis le disque en mode Hugging Face hors ligne. Aucun fichier audio ni conversation n’est journalisé ; les diagnostics d’échec ne contiennent que catégorie, opération et emplacement du code. Les temporaires de décodage et de lecture sont supprimés après usage. Le contexte courant et un cache borné de lectures phonétiques restent en mémoire du processus.

`npm run local` génère un code aléatoire dans un fichier local ignoré de Git, écoute exclusivement sur 127.0.0.1:8787 et sert l’export web. La connexion automatique exige une origine de développement autorisée et un pair en boucle locale. Un serveur exposé au réseau n’active pas cette route par défaut. Aucun secret n’est inclus dans le bundle. Le fournisseur OpenAI historique exige désormais `SENSEI_PROVIDER=openai` ; aucun repli payant n’est effectué.

## Vérification et limites

Vingt-deux tests automatisés couvrent les tours oraux, l’absence de validation, le silence, les pauses de niveau sonore, les entrées invalides, les contrôles d’accès, la restauration de connexion, l’invalidation des anciens démarrages, la reprise sans relecture et le contrat d’aide contextuelle (authentification, limites, absence d’effet sur le dialogue, erreur et indisponibilité). `npm run oral:check` permet de vérifier deux tours HTTP avec les trois moteurs. Le contrôle initial du 26 octobre vérifiait deux tours audio. Le contrôle du nouvel export vérifie l’ouverture automatique, un tour audio, l’aide liée à sa nouvelle question, la traduction d’une intention française, la lecture de la réponse, le cache et la reprise sans faux tour d’élève ; il utilise un flux synthétique et les vrais moteurs. Les détails et limites sont dans [COACH.md](COACH.md).

La recette navigateur utilise des phrases enregistrées injectées dans un flux Web Audio de test, avec le vrai enregistreur MediaRecorder, le vrai niveau sonore, les appels HTTP et la lecture effective. Aucune réponse IA n’est simulée. Ce test n’emploie pas le micro réel du Mac et ne certifie pas la reconnaissance d’une voix humaine, son accent ou le bruit ambiant. Le périphérique virtuel basé sur un fichier de Chrome est resté silencieux dans cet environnement ; le flux Web Audio contrôlé constitue donc la preuve du parcours automatisé.

Le dialogue reste par tours, avec quelques secondes de calcul entre parole et réponse. L’élève ne peut pas couper Mochi en parlant simultanément ; le bouton pause reste disponible. La transcription est configurée pour le japonais. Le modèle peut encore formuler une question redondante ou une traduction maladroite ; aucune correction phonétique ni note de prononciation n’est produite. Le modèle de conversation ne remplit pas encore automatiquement le carnet avec des nouveaux mots.

Exports web, iOS et Android vérifiés ; appareil iOS/Android physique, signature native, accès hors de l’ordinateur et qualité avec voix humaine restent à valider. Aucun compte, service système, tunnel réseau, déploiement ou nouvelle CI générale n’a été ajouté. Sans remote Git, le commit est local.

Résultat final navigateur (modèle 14B) : deux réponses HTTP 200 en 5 451 ms puis 3 320 ms, hors attente de silence et lecture. Le bouton pause ramène l’état au démarrage ; aucun champ de saisie ni de confirmation n’est présent pendant la boucle. Les captures sont dans `docs/evidence/oral-*.png`.
