# Vivienne — textes avant/après

Choix humain du 27 octobre 2026 : remplacer la voix française par F2, Vivienne. Comparatif complet des paragraphes modifiés ; aucun texte pédagogique de leçon n’est réécrit. Les quatre variantes du paragraphe des réglages sont reproduites intégralement.

## README — moteurs et voix française

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| La conversation utilise trois moteurs installés sur le serveur personnel : [Whisper small via MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper) pour la transcription française et japonaise, [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) pour le dialogue, les corrections et le contrôle des révisions, et [VOICEVOX](https://github.com/VOICEVOX/voicevox_core) pour la voix A choisie. Les explications françaises utilisent la voix Amélie déjà disponible sur le Mac, convertie en WAV pour le téléphone. Aucun compte, abonnement ou appel IA payant. Cette installation nécessite un Mac Apple Silicon ; les moteurs restent sur l’ordinateur, les applications iOS/Android s’y connectent. | La conversation utilise trois moteurs installés sur le serveur personnel : [Whisper small via MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper) pour la transcription française et japonaise, [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) pour le dialogue, les corrections et le contrôle des révisions, et [VOICEVOX](https://github.com/VOICEVOX/voicevox_core) pour la voix A choisie. Les explications françaises utilisent **Vivienne**, choisie après écoute de F2, via le service Microsoft Edge et le client communautaire [edge-tts](https://github.com/rany2/edge-tts). Elles nécessitent Internet sur le serveur. Aucun compte ni clé OpenAI n’est nécessaire pour ce fonctionnement actuel. Cette installation nécessite un Mac Apple Silicon ; le dialogue, la transcription et la voix japonaise restent sur l’ordinateur, les applications iOS/Android s’y connectent. [Installation et limites de Vivienne](docs/VIVIENNE.md). |

## README — traitement des données

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| Les messages et l’audio sont traités sur le serveur personnel, sans envoi à un fournisseur IA en mode local. Les fichiers temporaires de transcription sont supprimés après décodage ; les audios de lecture temporaires sont supprimés après lecture/interruption. Le serveur ne journalise pas les paroles. La transcription, le dialogue et la synthèse sont effectués successivement : une attente de quelques secondes est normale. Les conditions réelles de bruit et d’accent doivent encore être testées avec l’utilisateur. | Le dialogue, la transcription et la voix japonaise sont traités sur le serveur personnel en mode local. Les textes des explications françaises sont transmis au service Microsoft pour produire la voix Vivienne ; le microphone et l’historique complet ne lui sont pas transmis par cette intégration. Les fichiers temporaires de transcription sont supprimés après décodage ; les fichiers de synthèse sont supprimés après conversion et les audios temporaires du téléphone après lecture/interruption. Le serveur ne journalise pas les paroles. La transcription, le dialogue et la synthèse sont effectués successivement : une attente de quelques secondes est normale. Les conditions réelles de bruit et d’accent doivent encore être testées avec l’utilisateur. |

## README — route de synthèse

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| `POST /api/speech`, protégé par le même code personnel que les autres routes, génère un WAV avec VOICEVOX. Il fonctionne sans clé OpenAI. La conversation utilise désormais le fournisseur local de dialogue et de transcription par défaut ; la voix fonctionne aussi indépendamment de lui. Aucun modèle vocal ni texte n’est envoyé à un fournisseur pour la synthèse. | `POST /api/speech`, protégé par le même code personnel que les autres routes, génère un WAV : VOICEVOX pour le japonais, Vivienne en ligne pour le français. Il fonctionne sans clé OpenAI. Le dialogue et la transcription utilisent le fournisseur local par défaut ; la voix fonctionne aussi indépendamment de lui. Le texte français est envoyé à Microsoft pour sa synthèse ; le texte japonais reste sur le serveur personnel. |

## Enseignement — voix française

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| Le japonais garde la voix A de VOICEVOX. Le français est généré sur le serveur Mac par la voix Amélie déjà disponible, via un processus de synthèse vers un fichier temporaire, puis conversion WAV. Aucun réglage système ni téléchargement de voix n’est effectué. Il s’agit d’une voix française distincte, à écouter et ajuster selon le retour utilisateur. Ce chemin français nécessite le serveur macOS actuel ; il ne constitue pas un moteur autonome installé sur Android. | Le japonais garde la voix A de VOICEVOX. Le français utilise désormais Vivienne (`fr-FR-VivienneMultilingualNeural`), retenue par l’utilisateur après écoute de F2, avec les mêmes paramètres de débit et hauteur. Le serveur interroge le service Microsoft Edge via `edge-tts`, puis convertit le MP3 en WAV mono PCM 16 bits à 24 kHz dans un dossier temporaire supprimé après conversion. Cette synthèse française nécessite Internet sur le serveur et transmet uniquement son texte à Microsoft. Aucun compte Azure ni clé payante n’a été utilisé lors des essais ; le client communautaire dépend de la disponibilité de ce service en ligne. Aucun réglage ni installation de voix système n’est effectué. Voir [le fonctionnement de Vivienne](VIVIENNE.md). |

## Mémoire — traitement des textes

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| Aucun enregistrement audio n’est ajouté à cette mémoire. Les corrections textuelles restent sur l’appareil et le point révisé est traité par le serveur personnel. Le chemin gratuit conserve Whisper, Qwen et VOICEVOX locaux et la voix française Amélie du serveur Mac. Aucune API payante n’a été appelée pour ce développement. Le fournisseur OpenAI optionnel possède le contrat de contrôle, mais ses réponses réelles et l’adaptation de son dialogue n’ont pas été validées dans cette livraison ; le chemin local reste la référence testée. | Aucun enregistrement audio n’est ajouté à cette mémoire. Les corrections textuelles restent sur l’appareil et le point révisé est traité par le serveur personnel. Le dialogue, la transcription et le japonais conservent Whisper, Qwen et VOICEVOX locaux. Les explications françaises utilisent maintenant [Vivienne en ligne](VIVIENNE.md), choisie après comparaison ; leur texte est transmis à Microsoft pour la synthèse. Aucune API payante n’a été appelée pour ces essais. Le fournisseur OpenAI optionnel possède le contrat de contrôle, mais ses réponses réelles et l’adaptation de son dialogue n’ont pas été validées dans cette livraison ; le chemin de dialogue local reste la référence testée. |

## Réglages — local, Android/iOS

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| La conversation utilise des moteurs gratuits sur ton Mac, qui doit rester allumé. Aucun compte ni clé OpenAI nécessaire. La connexion est conservée dans le stockage sécurisé de ton téléphone. | Le dialogue et la reconnaissance restent sur ton Mac, qui doit rester allumé. La voix française Vivienne utilise Internet : ses textes sont transmis à Microsoft. Aucun compte ni clé OpenAI nécessaire. La connexion est conservée dans le stockage sécurisé de ton téléphone. |

## Réglages — local, Aperçu web

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| La conversation utilise des moteurs gratuits sur ton Mac, qui doit rester allumé. Aucun compte ni clé OpenAI nécessaire. L’aperçu sur ce Mac se reconnecte automatiquement au serveur local. | Le dialogue et la reconnaissance restent sur ton Mac, qui doit rester allumé. La voix française Vivienne utilise Internet : ses textes sont transmis à Microsoft. Aucun compte ni clé OpenAI nécessaire. L’aperçu sur ce Mac se reconnecte automatiquement au serveur local. |

## Réglages — OpenAI optionnel, Android/iOS

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| Ce serveur utilise OpenAI : audio et messages lui sont transmis. La connexion est conservée dans le stockage sécurisé de ton téléphone. | Ce serveur utilise OpenAI : audio et messages lui sont transmis. Les explications françaises sont aussi envoyées à Microsoft pour la voix Vivienne. La connexion est conservée dans le stockage sécurisé de ton téléphone. |

## Réglages — OpenAI optionnel, Aperçu web

Remplacement du paragraphe complet ; aucun déplacement.

| Avant | Après |
|---|---|
| Ce serveur utilise OpenAI : audio et messages lui sont transmis. L’aperçu sur ce Mac se reconnecte automatiquement au serveur local. | Ce serveur utilise OpenAI : audio et messages lui sont transmis. Les explications françaises sont aussi envoyées à Microsoft pour la voix Vivienne. L’aperçu sur ce Mac se reconnecte automatiquement au serveur local. |

## Ajout — erreur de synthèse française

Nouveau message : « La voix française Vivienne est indisponible. Vérifie la connexion Internet du serveur, puis réessaie. »

La conversation affiche ce message de synthèse en priorité sur son message générique d’interruption. Les autres messages restent identiques. Aucun repli silencieux sur la voix Amélie.

## Ajouts documentaires

`VIVIENNE.md` est un nouveau document technique décrivant le choix F2, l’installation dans le projet, le besoin d’Internet, les données transmises, les erreurs et les vérifications. Il ne remplace aucun document existant. Les anciennes preuves et la planche d’extraits restent historiques.
