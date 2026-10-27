# Mémoire pédagogique — textes avant/après

Version du 27 octobre 2026. Les passages existants sont reproduits intégralement ci-dessous. Les nouveaux états et contenus sont signalés comme ajouts. Aucun déplacement ni suppression autonome de texte.

## README — sauvegarde

Remplacement du paragraphe complet.

| Avant | Après |
|---|---|
| Le carnet, les expressions acquises, les objectifs, les séances et les séries de jours sont sauvegardés sur cet appareil. Le temps mesuré correspond à la séance au premier plan, pas à une mesure du temps de parole. Les réglages permettent de masquer romaji et traduction. | Le carnet, les expressions acquises, les objectifs, les séances, les séries de jours et les erreurs corrigées sont sauvegardés sur cet appareil. Mochi programme des révisions espacées et ajuste son aide d’après les rappels réussis sans modèle. Le temps mesuré correspond à la séance au premier plan, pas à une mesure du temps de parole. Les réglages permettent de masquer romaji et traduction. [Mémoire et révisions](docs/LEARNING-MEMORY.md). |

## README — moteurs

Remplacement du paragraphe complet.

| Avant | Après |
|---|---|
| La conversation utilise trois moteurs installés sur le serveur personnel : [Whisper small via MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper) pour la transcription japonaise, [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) pour le dialogue et [VOICEVOX](https://github.com/VOICEVOX/voicevox_core) pour la voix A choisie. Aucun compte, abonnement ou appel IA payant. Cette installation nécessite un Mac Apple Silicon ; les moteurs restent sur l’ordinateur, les applications iOS/Android s’y connectent. | La conversation utilise trois moteurs installés sur le serveur personnel : [Whisper small via MLX](https://github.com/ml-explore/mlx-examples/tree/main/whisper) pour la transcription française et japonaise, [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) pour le dialogue, les corrections et le contrôle des révisions, et [VOICEVOX](https://github.com/VOICEVOX/voicevox_core) pour la voix A choisie. Les explications françaises utilisent la voix Amélie déjà disponible sur le Mac, convertie en WAV pour le téléphone. Aucun compte, abonnement ou appel IA payant. Cette installation nécessite un Mac Apple Silicon ; les moteurs restent sur l’ordinateur, les applications iOS/Android s’y connectent. |

## README — échange oral

Remplacement du paragraphe complet.

| Avant | Après |
|---|---|
| Mochi lit sa première question dès l’ouverture d’une situation connectée. Le micro écoute ensuite ; une pause d’environ 1,8 seconde après ta voix envoie ta phrase. Sa réponse est lue automatiquement et le micro reprend. Aucun texte à confirmer. Le bouton central met en pause ou reprend l’écoute sans relire une question déjà entendue. Je bloque et Historique mettent en pause et ouvrent leur panneau. Je bloque explique comment répondre à la question actuelle, propose un exemple à adapter et permet d’écouter sa réponse. Une intention écrite en français devient une phrase japonaise avec romaji et traduction ; À moi de parler reprend l’écoute pour que l’élève la prononce. Le clavier et la relecture restent accessibles dans ce panneau. Après 15 secondes sans voix, le micro se met en pause et propose un coup de pouce ; un tour est limité à 30 secondes. | Mochi commence un nouvel objectif par une courte explication française parlée et un modèle japonais, puis pose sa question. Un point déjà retrouvé seul plusieurs fois peut commencer directement en japonais. Le micro écoute ensuite ; une pause d’environ 1,8 seconde après ta voix envoie ta phrase. Sa réponse est lue automatiquement et le micro reprend. Aucun texte à confirmer. Le bouton central met en pause ou reprend l’écoute sans relire une question déjà entendue. Je bloque et Historique mettent en pause et ouvrent leur panneau. Je bloque explique comment répondre à la question actuelle, propose un exemple à adapter et permet d’écouter sa réponse. Une intention écrite en français devient une phrase japonaise avec romaji et traduction ; À moi de parler reprend l’écoute pour que l’élève la prononce. Le clavier et la relecture restent accessibles dans ce panneau. Après environ 15 secondes sans voix, Mochi propose une aide orale une fois ; un nouveau silence met l’échange en pause. Un tour est limité à 30 secondes. Une révision commence sans montrer la réponse, puis se termine après une réponse correcte. Les demandes d’aide restent possibles à tout moment. |

## README — limites et conservation

Remplacement du paragraphe complet.

| Avant | Après |
|---|---|
| Le japonais, le romaji et la traduction restent consultables. La transcription vise le japonais ; la reconnaissance d’une demande orale en français n’est pas garantie. Le modèle local peut se tromper : aucune note de prononciation ni correction phonétique n’est calculée. Le temps de pratique mesure la séance au premier plan. Les expressions du carnet et la progression restent sur l’appareil ; la conversation courante reste en mémoire. | Le japonais, le romaji et la traduction restent consultables. Whisper détecte le français et le japonais automatiquement, mais peut mal transcrire ou normaliser une faute. Le modèle local peut se tromper : aucune note de prononciation ni correction phonétique n’est calculée. Le temps de pratique mesure la séance au premier plan. Les expressions du carnet et la progression restent sur l’appareil ; la conversation courante reste en mémoire pendant la séance. Les corrections et leurs dates sont conservées localement entre les séances pour préparer les révisions. Il n’y a pas de synchronisation entre navigateur et téléphone. |

## Enseignement — limites

Remplacement du paragraphe complet.

| Avant | Après |
|---|---|
| Les neuf leçons ont des introductions et suites préparées ; les explications du dialogue libre sont générées et peuvent rester imprécises. Les réponses courtes sont acceptées. Whisper peut mal reconnaître ou normaliser une erreur. L’accent, l’intonation et le rythme ne sont pas notés. La progression indique un objectif pratiqué, sans déclaration de maîtrise. La mémoire détaillée des erreurs entre séances et leur révision espacée ne sont pas encore développées. | Les neuf leçons ont des introductions et suites préparées ; les explications du dialogue libre sont générées et peuvent rester imprécises. Les réponses courtes sont acceptées. Whisper peut mal reconnaître ou normaliser une erreur. L’accent, l’intonation et le rythme ne sont pas notés. La progression indique un objectif pratiqué, sans déclaration de maîtrise. La [mémoire des erreurs et les révisions espacées](LEARNING-MEMORY.md) sont désormais conservées sur cet appareil ; l’aide s’adapte d’après des rappels indépendants, sans attribution automatique d’un niveau JLPT. |

## Conversation — fin

Ajout d’une variante conditionnelle ; libellé de leçon conservé.

| Avant | Après |
|---|---|
| Terminer la séance | Terminer la révision pour une révision ; Terminer la séance pour une leçon. |

## Conversation — relecture

Extension d’un état existant ; les deux libellés restent identiques.

| Avant | Après |
|---|---|
| Réécouter la phrase si une correction est affichée ; Réécouter la question sinon. | Réécouter la phrase si une révision ou une correction est affichée ; Réécouter la question sinon. |

## Ajouts — navigation et mémoire

Ces textes n’avaient pas d’équivalent existant :

- « Révisions », « Mes révisions », « Révision ciblée ».
- « [nombre] point[s] à reprendre », « Tes prochains rappels ».
- « Accompagnement : [Accompagné / Guidé / Plus autonome] ».
- « Mochi adapte son aide d’après tes révisions sans modèle. »
- « Les corrections et les objectifs pratiqués seront gardés ici pour les revoir plus tard. »
- « À revoir aujourd’hui » ou « Prochain rappel : [jour et mois] », suivi de « [nombre] erreur[s] corrigée[s] » ou « Point pratiqué ».
- « Réviser ce point » ou « S’entraîner ».
- « Voir la correction » / « Masquer la correction ».
- « Tu avais dit : [transcription] », suivi de la correction, du romaji, de la traduction et de l’explication enregistrés.
- « Modèle consulté : ce point sera repris sans aide plus tard. »
- « Retirer ce point ».

## Ajouts — consignes et réponses parlées

La question commune est « 日本語で言ってみましょう。 » / « Nihongo de itte mimashō. » / « Essayons de le dire en japonais. » Elle ne révèle pas la construction attendue.

L’introduction française est « Petite révision, sans modèle pour commencer. » ou « On s’entraîne après le modèle. », suivie de la tâche du tableau ci-dessous. Pour une reformulation spécifique : « Exprime cette idée en japonais : [traduction conservée] ». Si l’ensemble dépasse la limite du contrat, le préfixe est omis avant de réduire la consigne à la traduction complète.

| Point | Titre ajouté | Tâche française ajoutée | Aide ajoutée |
|---|---|---|---|
| identity | Te présenter | Présente-toi en japonais avec une phrase. | Pour te présenter, donne ton prénom suivi de desu. |
| origin | Dire d’où tu viens | Dis d’où tu viens avec une phrase complète. | Pour dire d’où tu viens, donne ton pays ou ta ville, puis ajoute kara kimashita. |
| likes | Parler de tes goûts | Dis une chose que tu aimes, avec une phrase complète. | Pour dire ce que tu aimes, nomme cette chose puis ajoute ga suki desu. |
| past | Parler d’hier | Raconte une chose que tu as faite hier, à la forme polie. | Pour une action passée, utilise la forme polie du verbe en mashita. |
| topic | Construire une phrase avec un sujet | Dis quelque chose sur toi avec un sujet exprimé et une phrase complète. | Annonce le sujet de ta phrase avec wa, puis dis quelque chose à son propos. |
| object | Exprimer une action | Dis ce que tu fais à quelque chose : manger, boire ou regarder, par exemple. | Place la particule o après ce sur quoi porte ton action, avant le verbe. |
| order | Demander poliment | Commande une chose poliment. | Nomme ce que tu demandes et termine par kudasai ou onegaishimasu pour demander poliment. |
| choice | Faire un choix poliment | Choisis chaud ou glacé en le demandant poliment. | Donne ton choix, puis ajoute de onegaishimasu pour le demander poliment. |
| destination | Indiquer ta destination | Indique une destination avec une phrase polie. | Nomme la destination, puis ajoute made onegaishimasu. |
| ticket | Demander un billet | Demande un aller simple pour une personne. | Katamichi désigne un aller simple. Pour un billet, ajoute o ichimai kudasai. |
| thanks | Remercier poliment | Remercie poliment la personne qui vient de t’aider. | Pour remercier poliment, utilise arigatō gozaimasu ou arigatō gozaimashita. |
| sentence | Reformuler une phrase | Essayons de le dire en japonais. | Écoute la phrase modèle, puis essaie de la reformuler. |

Après réussite : « いいですね！お疲れさまでした。 » / « Ii desu ne! Otsukaresama deshita. » / « Bien joué ! Merci pour ton effort. »

- Sans modèle : « C’est juste. Tu as retrouvé la construction sans modèle. On reverra ce point plus tard. »
- Après aide : « Cette répétition est juste. On reprendra ce point sans modèle une autre fois. »
- Construction non démontrée : « On reprend ce point. [explication conservée] Écoute ce modèle, puis réessaie. »
- Serveur incompatible : « Le contrôle des révisions est indisponible sur ce serveur. »

Les corrections générées reprennent le contrat déjà existant ; leur texte varie selon l’énoncé. Le bouton Je bloque conserve ses libellés, mais présente le modèle du point révisé. Le message d’échec de sauvegarde existant est maintenant aussi visible dans la conversation. L’historique affiche le titre réel de la révision. Le CTA d’accueil reste « Commencer ma leçon ».

Les instructions techniques du contrôle et des trois modes d’aide sont de nouveaux contenus internes, conservés intégralement dans `shared/review-prompt.ts` et `shared/learner-guidance.ts`. Elles ne remplacent pas les textes de l’interface.
