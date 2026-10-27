# Corrections pendant la conversation

Le moteur gratuit vérifie désormais chaque réponse japonaise avant de poursuivre. Auparavant, son instruction disait « Accept mistakes » et le résultat imposait `correction: null`.

En cas d’erreur claire de grammaire, de particule, de conjugaison ou de vocabulaire, Mochi montre la formulation corrigée, le romaji et la traduction selon les réglages, avec une courte explication française. Elle prononce le modèle japonais et invite à le réessayer. L’écoute reprend après la fin réelle de cette lecture, sans validation de texte. Une répétition acceptable relance le sujet précédent ; l’utilisateur peut aussi dire une autre phrase pour poursuivre librement.

La correction est au centre de l’écran et reste consultable dans l’historique. Je bloque reprend le modèle existant avec sa commande de relecture, sans générer une réponse à la place de l’élève. Le clavier suit le même contrat ; le mode guidé sans serveur ne prétend pas analyser les erreurs.

Le contrôle local est un passage supplémentaire de Qwen3-14B, à température zéro. Le dialogue et sa traduction ne sont générés que si la phrase est acceptable. Une correction utilise directement son modèle, sa traduction et une invitation fixe à réessayer. Les réponses brèves, familières ou avec sujet omis sont acceptées. Une sortie JSON invalide provoque un échec visible du tour, au lieu de masquer la vérification. Le serveur normalise aussi le fournisseur optionnel ; aucun appel payant n’est utilisé dans les essais.

La progression conserve sa signification : objectif pratiqué, sans déclaration de maîtrise. Aucun nouveau score ni minuteur.

## Limites observées

Le contrôle porte sur les mots transcrits. Whisper peut normaliser une erreur ou mal entendre ; l’application ne peut alors pas garantir la correction de ce qui a réellement été prononcé. Elle ne mesure ni accent, ni rythme, ni intonation. Le français et le romaji saisis restent acceptés pour démarrer, sans analyse grammaticale japonaise du texte latin. Une IA peut manquer une faute ou produire une explication imprécise ; les cas testés ne prouvent pas une correction parfaite de toute phrase.

Les tests audio utilisent une voix synthétique comme élève, sans micro humain. Les exports Android et iOS sont vérifiés, mais aucun téléphone Android physique n’a été utilisé dans cette vérification. La décision artistique sur le nouvel écran reste en attente de l’utilisateur.

Voir [les textes avant/après](CORRECTIONS-TEXTES-AVANT-APRES.md), les preuves `evidence/corrections-*.json` et la revue `corrections-technical-review.json`.
