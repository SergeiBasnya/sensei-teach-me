# Mochi illustré et aide pendant la conversation

Demande du 26 octobre 2026 : une vraie mascotte illustrée et un accompagnement quand l’élève ne sait pas répondre. La voix VOICEVOX sélectionnée reste identique.

## Utilisation

Pendant une conversation, **Je bloque** met le micro en pause et ouvre une aide liée à la question courante. Mochi explique une construction simple, propose un **Exemple à adapter**, affiche le romaji selon la préférence et sa traduction française. **Écouter cette réponse** lit l’exemple avec la voix déjà choisie.

Si l’exemple ne correspond pas à ce que l’élève souhaite dire, **Ta réponse, en français** reçoit son intention ; **M’aider à le dire** la traduit en une courte phrase japonaise. Par exemple, « Je viens de Belgique » devient « ベルギーから来ました。 ». **À moi de parler** revient à l’écoute pour que l’élève essaie lui-même. Aucun exemple n’est envoyé automatiquement comme sa réponse.

L’aide est disponible après le premier échange et à chaque nouvelle question. Après quinze secondes sans parole, l’écoute se met en pause avec **Besoin d’un coup de pouce ?** et le bouton Je bloque est mis en évidence. La relecture de la question, le clavier et l’historique restent disponibles.

## Implémentation

`POST /api/help` reçoit scénario, question, au plus seize messages et une intention française facultative de 500 caractères maximum. La route utilise les protections existantes : code personnel, origines autorisées, limite de débit et `Cache-Control: no-store`. Elle ne transcrit pas d’audio et ne joue pas le tour de l’élève.

En mode local, Qwen traduit l’intention seule pour éviter que le prénom ou la présentation de Mochi se glisse dans la réponse. Sans intention, il reçoit la question actuelle et propose une réponse du point de vue de l’élève ; une nouvelle question générée est refusée. La traduction française est séparée. Les conseils sur l’origine, le prénom et les goûts utilisent des constructions préparées ; les autres conseils sont générés. Pykakasi produit le romaji. Une erreur ou un moteur indisponible donne un message et un bouton de réessai.

Le panneau annule ses requêtes devenues inutiles et garde un cache de vingt aides maximum, dans la mémoire de la conversation. Il n’enregistre ni l’intention française ni les exemples dans le carnet ou la progression. La durée de séance existante inclut le temps au premier plan, y compris une pause d’aide ; elle ne mesure pas la durée de parole.

Le mode local ne fait aucun appel payant. Le fournisseur OpenAI historique, activable uniquement explicitement, possède le même contrat d’aide ; il n’a pas été appelé pendant ces vérifications et ne sert jamais de repli automatique.

## Illustration

Une illustration PNG transparente remplace les formes SVG du compagnon. Elle est embarquée dans l’application et partagée entre accueil, scènes, conversation et progression. Le téléphone n’appelle aucun générateur d’images. Fichier, mode intégré `image_gen` et prompt exact dans [la provenance de la mascotte](../assets/mascot/README.md). L’illustration est fixe ; la proposition artistique attend le retour du propriétaire.

## Vérifications

Vingt-deux tests passent, ainsi que les types, le formatage, la compilation Python et les exports web, Android et iOS. Les tests de contrat couvrent notamment les accès refusés, les limites d’entrée, l’indisponibilité, une réponse invalide et l’absence d’effet de l’aide sur le dialogue.

Sur le navigateur isolé, un seul appui sur Parler lance la question puis l’enregistrement après la fin réelle de la lecture. Un flux audio synthétique est transcrit par les vrais moteurs ; l’aide reçoit la nouvelle question et l’historique actualisé. La transformation « Je viens de Belgique », sa lecture effective, la réouverture sans nouvelle requête, la reprise sans relecture et le silence prolongé ont été contrôlés. Le tour oral a répondu en 4 098 ms ; les trois aides HTTP directes sur l’origine et les goûts ont répondu en 853 à 1 193 ms sur ce Mac. Ces durées excluent attente de silence et lecture audio et ne constituent pas une garantie de latence.

Une indisponibilité HTTP 503 a été simulée uniquement pour observer le message d’erreur ; le réessai a ensuite utilisé le vrai moteur. Le rendu a été observé à 320×568, 390×844, 844×390 et 1440×1000, avec défilement des contenus longs, survol, focus et familles de police calculées. Le bundle Expo Android servi contient le nouvel asset et les commandes d’aide, sans le code personnel.

Résultats détaillés : [coach-checks.json](evidence/coach-checks.json). Les captures `evidence/coach-*.png` portent sur l’export identifié par la revue technique. Le contrôle PRISMA couvre les observations déclarées ; il n’approuve pas la proposition artistique. Le garde OFA reste raccordé et `doctor` indique `ready` ; aucune nouvelle CI ni protection distante n’est revendiquée.

Les moteurs peuvent encore produire des formulations maladroites ; un exemple est une proposition à adapter, sans connaissance présumée du pays de l’élève. La conversation reste par tours et ne mesure pas la prononciation. Aucun micro humain ni appareil Android/iOS physique n’a été utilisé pour cette vérification ; le clavier système et les permissions natives restent à essayer sur téléphone. Les calculs gratuits requièrent toujours le Mac actif. Aucun APK autonome signé, déploiement ou push distant n’a été réalisé.

Comparatif des textes complets : [avant / après](COACH-TEXTES-AVANT-APRES.md).
