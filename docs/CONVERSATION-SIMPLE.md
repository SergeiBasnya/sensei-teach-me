# Parler à Mochi — parcours simplifié

Demande du 26 octobre 2026 : démarrage vocal dès l’entrée, interface mobile plus simple inspirée de Pingo, progression quotidienne conservée.

Le bouton Parler ou une situation ouvre l’échange. Une permission de micro peut être demandée par le téléphone. Mochi lit sa première question, l’écoute commence après sa fin, puis le silence après la réponse déclenche l’envoi. Le micro reprend après chaque lecture. La commande centrale met en pause ou reprend ; une question entièrement entendue n’est pas relue lors de la reprise.

L’écran garde le compagnon, la question courante, le romaji et le français selon les préférences, une durée de séance et trois contrôles : historique, pause/reprise et aide. Le fil complet, les corrections et la relecture restent disponibles dans les panneaux. Leur ouverture met la conversation en pause. Le clavier est dans Aide. Les contenus japonais préparés et la voix A sont conservés.

La référence Pingo porte sur l’organisation autour de la conversation orale et l’accès aux aides : [fiche officielle](https://apps.apple.com/us/app/language-learning-pingo-ai/id6738882620), [illustrations du parcours sur le site Pingo](https://pingo.ai/blog/best-ai-language-learning-apps-for-chinese-learners-in-2025). L’identité, le personnage et les composants de Mochi restent propres au projet. Aucun actif de Pingo n’est intégré.

Les objectifs, séries de jours, séances et carnet conservent leurs données et leur calcul. La durée mesure le temps de séance au premier plan, y compris la consultation des aides ; elle ne mesure pas la durée exacte de parole. Aucun avancement, score de prononciation ou résultat d’apprentissage n’est inventé.

La boîte de permission ne doit pas annuler le démarrage. Après sa fermeture, le démarrage attend le premier plan avant lecture ou enregistrement. Les arrêts sont sérialisés avant une nouvelle capture ; les anciens résultats asynchrones ne peuvent pas réactiver une session arrêtée. Le vrai passage en arrière-plan met en pause et ne relance pas le micro sans geste de reprise.

Les vingt tests automatisés et les exports web/iOS/Android passent. Le navigateur isolé vérifie deux tours sur les vrais moteurs, l’ordre lecture puis capture, et une reprise sans relecture. Les audios sont synthétiques ; aucun microphone humain n’est utilisé par ces contrôles. Les états de permission et de visibilité sont aussi simulés dans ce navigateur pour vérifier l’interface. Les preuves du rendu sont dans la revue `simple-technical-review.json` et `evidence/simple-*.png`.

Le serveur gratuit reste sur le Mac, qui doit rester allumé. La reconnaissance vise le japonais et le dialogue fonctionne par tours ; l’utilisateur ne peut pas interrompre Mochi en parlant simultanément. Aucun APK signé ni essai sur Android physique n’est revendiqué par ces contrôles. La décision artistique sur l’export exact reste en attente d’un retour humain.
