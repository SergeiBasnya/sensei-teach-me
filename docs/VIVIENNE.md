# Voix française Vivienne

Le 27 octobre 2026, l’utilisateur a choisi l’extrait F2 et demandé son intégration. La voix française par défaut est désormais `fr-FR-VivienneMultilingualNeural`, avec le débit `+0%` et la hauteur `+0Hz` de cet extrait. Le japonais continue d’utiliser VOICEVOX style 10, 雨晴はう.

## Fonctionnement

Le lecteur de l’app reçoit toujours un WAV mono PCM 16 bits à 24 kHz. Le serveur appelle le service en ligne Microsoft Edge via le client communautaire `edge-tts==7.3.1`, puis convertit le MP3 reçu avec `imageio-ffmpeg==0.6.0`. Les introductions, invitations, explications, corrections et révisions passent par ce même chemin français. L’animation continue de suivre l’énergie du WAV réellement lu. Le téléphone n’a pas à installer de voix française système.

Les fichiers de conversion sont supprimés en quittant le dossier temporaire. Les textes ne sont pas placés dans les arguments d’un programme ni journalisés. Seul le texte à lire en français est transmis à Microsoft ; cette intégration ne lui transmet ni le micro de l’élève, ni l’historique complet, ni la mémoire locale. Le dialogue, la transcription et le japonais restent locaux avec la configuration actuelle. Ce fonctionnement nécessite Internet sur le serveur.

Aucun compte Azure ni clé payante n’a été utilisé pour les essais. `edge-tts` est un client communautaire du service Edge ; sa disponibilité future dépend du service. Ce choix ne constitue pas une API officielle auto-hébergée. Sources : [client edge-tts](https://github.com/rany2/edge-tts), [voix disponibles chez Microsoft](https://learn.microsoft.com/fr-fr/azure/ai-services/speech-service/language-support?tabs=tts).

## Installation et activation

L’installateur VOICEVOX installe aussi les deux dépendances françaises épinglées dans `server/speech-requirements.txt`. Pour une installation existante sur le Mac :

```sh
.venv/bin/python -m pip install -r server/speech-requirements.txt
npm run voice:check
npm run local:lan
```

Arrêter le précédent serveur du projet avant de le relancer sur le même port. Les dépendances restent dans `.venv/` ; aucun paquet global, service système ni réglage du Mac n’est ajouté. `npm run voice:check` appelle réellement les deux synthèses via HTTP et vérifie que les WAV sont utilisables par l’analyse d’énergie du visage.

Le serveur de cette session a été redémarré pour activer la modification. Expo reste sur la même adresse et utilise le même code personnel. Recharger le projet dans Expo Go, puis ouvrir une leçon : la première explication française doit utiliser Vivienne.

## Échec et reprise

La connexion est limitée à cinq secondes, l’attente de réception à quinze secondes et la génération complète à vingt-cinq secondes, avant une conversion limitée à dix secondes. Les flux vides ou trop volumineux sont rejetés. Une erreur française renvoie un code contrôlé, transformé en message lisible ; les diagnostics bruts ne sont pas exposés. Il n’y a aucun repli sur Amélie ni sur une API payante. L’échec ne ferme pas le worker japonais. La lecture interrompue ne doit pas ouvrir le micro automatiquement.

Les réglages expliquent le besoin d’Internet et la transmission des textes français. La conversation donne priorité à une erreur du lecteur vocal sur son message générique d’interruption, pour que le problème soit identifiable.

## Vérifications et limites

Les tests hors réseau couvrent le rejet d’entrée avant appel, le choix exact de Vivienne, la collecte audio sans métadonnées, les limites de taille, l’annulation après délai et la reprise japonaise après erreur française. Le contrat HTTP vérifie le message d’indisponibilité. Les deux vrais moteurs sont exercés par `npm run voice:check`.

La lecture dans le navigateur isolé est vérifiée avec un flux de micro synthétique silencieux : le français puis le japonais doivent réellement terminer avant le premier enregistrement. Un échec français simulé doit rester visible et empêcher le micro de démarrer ; le nouvel essai utilise ensuite le vrai service. Les exports Android et iOS et le bundle Android servi par Expo sont contrôlés. Aucun microphone humain ni téléphone Android physique n’est utilisé pour ces vérifications.

Le choix humain porte sur l’extrait F2 conservé dans `assets/voice-proposals/`. Les paramètres de la voix sont repris ; le contenu généré au fil d’une conversation et sa prosodie peuvent varier. Ce choix ne vaut pas approbation artistique de tous les écrans ou de tous les futurs énoncés. Les preuves sont dans `evidence/vivienne-*` et les [textes complets avant/après](VIVIENNE-TEXTES-AVANT-APRES.md).
