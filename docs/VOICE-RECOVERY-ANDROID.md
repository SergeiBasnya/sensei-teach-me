# Reprise vocale — essai Android ciblé

Le premier retour Android au commit `50dff54` est un échec humain reconnu. Ce lot ne transforme pas des contrôles techniques en validation de la voix. Le classique reste disponible ; le laboratoire reste expérimental, sans progression ni mémorisation de nouvelles erreurs.

## Préparer le téléphone

1. Mac allumé, téléphone et Mac sur le même Wi-Fi. Ouvrir Sensei dans Expo Go avec le lien du serveur Expo actif.
2. Dans les réglages, vérifier l’adresse du Mac et connecter le serveur avec le code personnel conservé localement. Ne jamais envoyer ce code dans un rapport ou Git.
3. Ouvrir **Laboratoire vocal**. Choisir **Japonais et français**, **Hybride actuel**. Garder réponse japonaise, reprise d’écoute et fin automatique activées.
4. Activer **Afficher le diagnostic temporaire**. Laisser **Garder mes extraits sur le Mac** désactivé pour commencer : le diagnostic ne nécessite pas de fichier audio.

Les quatre étapes affichées sont Écoute, Reconnaissance, Préparation de la réponse et Mochi parle. Parler normalement, sans valider de texte entre les tours. Mettre en pause seulement pour examiner un problème ; une note facultative permet alors de déclarer la phrase réellement prononcée. Cette note est vierge par défaut, jamais remplie à partir du texte attendu ou de Whisper. Elle n’est ni une référence acoustique certifiée ni un message envoyé au professeur.

## Huit interventions, pas vingt prises

Ce sont des propositions, **pas des transcriptions de référence**. Si la question réellement posée diffère, adapter la réponse et noter ce qui a réellement été dit. Commencer par les trois premières ; inutile de poursuivre si le micro ne démarre pas ou si le début/la fin disparaît.

| Situation | Intervention proposée | Ce qu’on cherche |
| --- | --- | --- |
| Question oui/non réelle | `はい。` puis éventuellement `いいえ。` | Réponse très courte captée et tour terminé automatiquement. |
| Présentation/origine | `フランスから来ました。` | Début et fin complets ; pays conservé dans la réponse. |
| Café, après choix chaud/glacé | `ホットで。` | Réponse contextuelle acceptée, sans faute de phrase incomplète inventée. |
| Café | `えっと…` pause d’environ deux secondes, puis `お茶を一つください。` | Hésitation conservée sans couper la demande. |
| Café | `コーヒーを…いや、お茶を一つください。` | Autocorrection conservée ; commande finale thé, pas café. |
| Présentation/origine | `日本を来ました。` volontairement | Particule réellement dite conservée par l’ASR ; distinguer normalisation par Whisper et correction du professeur. |
| Demande d’aide | « Je ne sais pas répondre. Aide-moi. » | Français reconnu, aide pertinente, pas erreur japonaise mémorisée. |
| Café, bruit ambiant ordinaire | « Un thé, お茶を一つください。 » | Alternance français/japonais et effet du bruit. Pas de musique ni bruit artificiellement fort requis. |

Pour chaque échec, comparer dans le panneau : déclaration humaine, sortie brute Whisper et texte final retenu, aiguillage/faits transmis au professeur, réponse japonaise. Les faits extraits et l’intention affichée sont des données du pipeline, à vérifier ; ce n’est pas une lecture du raisonnement interne de Qwen. Noter si une répétition était injustifiée, si une syllabe a disparu, si le sens a changé ou si une erreur volontaire a été normalisée.

## Comparer les quatre profils sur une même voix

Cette étape reste **en attente** tant qu’aucun audio volontaire et aucune référence humaine exacte n’existent. Le mini-test peut se faire sans conservation, mais une comparaison ASR reproductible exige le même fichier pour chaque profil.

Si tu souhaites conserver seulement quelques échecs, active toi-même **Garder mes extraits sur le Mac** avant ces prises, puis désactive-le. Le dispositif existant écrit un WAV privé et une référence initialement vide dans `.local/voice-lab/human/`, hors Git. Réécouter l’extrait avant de valider la référence avec `scripts/review-human-voice.py` ; garder hésitations, erreurs, mélange de langues et autocorrections réellement audibles. Ne jamais remplir la référence avec la phrase proposée ci-dessus sans écoute.

`scripts/compare-human-asr.py` compare déjà Small auto/ja × prompt bilingue/aucun, avec les mêmes fichiers. Son lancement d’inférence reste volontaire et exclusif. Examiner séparément sortie brute, sortie filtrée et incertitude : son gate de compatibilité historique reflète le classique, pas le nouveau gate par fenêtres du laboratoire. Les jugements de sens, de normalisation et de répétition injustifiée demandent une revue humaine. Aucun autre modèle n’est sélectionné avant cette comparaison.

## Chronologie et sensation

Après chaque tour, le panneau sépare énergie estimée → fin du tour → texte final → première réception WAV → demande de lecture → événement lecteur → fin de lecture → micro de nouveau prêt. Les durées serveur de contrôle, génération et synthèse complètent cette chronologie. Le résidu de transport inclut les deux sens réseau et la distribution logicielle ; il ne mesure pas un trajet aller simple. La fin acoustique estimée et l’événement du lecteur ne certifient ni la vraie fin de ta parole ni le premier son à ton oreille.

Le bouton **Partager les mesures** transmet uniquement des nombres et des étiquettes techniques fixes, sans audio, transcription, faits extraits, note personnelle, code serveur ou identifiant d’extrait. Le panneau texte est limité au dernier tour et disparaît à sa désactivation/fermeture. Il n’existe pas de sauvegarde automatique de ces notes.

Après le mini-test, un échange de cinq à dix minutes peut servir à observer les limites restantes ; il n’a pas reçu de GO conversationnel. Commencer en **Hybride actuel**. Le choix **Plus génératif · à comparer** reste un prototype à retravailler : ses temps sont plus longs et un fait inventé peut provoquer un arrêt. Son activation volontaire n’est pas une recommandation de l’utiliser comme professeur principal. Le changement redémarre le contexte pour éviter de mélanger les historiques. Observer la réponse à un sujet inattendu, une correction de commande, une demande d’aide et une réponse courte. Comparaison subjective, pas essai causal apparié après divergence des conversations.

Noter aussi les coupures pendant une hésitation, répétitions, reprise d’écoute, interruptions, pertes réseau et impression d’être écouté. Retour attendu en termes simples : phrase dite, texte retenu, réponse obtenue, attente ressentie. **Aucun objectif de trois secondes n’est annoncé comme atteint avant cet essai Android.**
