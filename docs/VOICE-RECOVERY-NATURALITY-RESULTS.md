# Reprise vocale — lecture des réponses du pilote

**Mise à jour finale : le rejeu 02 est terminé et relu ; ses résultats figurent en fin de document. Les résultats 01 ci-dessous restent conservés comme état avant. Décision maintenue : NO-GO promotion, génératif à retravailler. Un mini-test Android de diagnostic de reconnaissance reste pertinent, sans présenter le professeur comme validé.**

30 octobre 2026. Source : `recovery-01.json`, statut `complete`, trente-deux réponses. Les scènes, textes et prix sont fictifs ; aucun enregistrement humain ni résultat ASR personnel n’est utilisé. La sélection porte sur `ja-first`, comparé avec les politiques `hybrid` et `generative`.

**Décision issue du pilote 01 : à retravailler, NO-GO pour promouvoir le génératif ou déclarer une amélioration de naturalité.** Le changement de sujet est possible, mais également dans l’hybride. Le génératif ne démontre pas de supériorité sur les chaînes de cinéma, prend davantage de temps après texte reconnu et invente un lieu de toilettes. Les trois correctifs bornés décrits plus bas sont testés localement ; leur rejeu mesuré reste **en attente** au moment de cette note. Les résultats du pilote 01 ne sont pas remplacés par les tests du code corrigé.

## Portée réellement lue et indépendance

Les seize replays appariés ont été lus avec leurs huit textes/historiques communs : huit réponses par politique. Les seize sorties de chaînes ont également été lues avec leurs historiques effectifs : deux chaînes de quatre tours par politique. Tous les appels ont abouti techniquement, avec une traduction française présente. Cela ne constitue pas trente-deux évaluations humaines indépendantes, ni trente-deux preuves de justesse linguistique.

L’agent de cette revue a aussi écrit les consignes et gardes du prototype. Cette lecture explicite les défauts, mais n’est donc ni une revue indépendante de son auteur, ni une certification native ou humaine. Les passages de langue et de niveau ci-dessous sont des jugements d’agent contextualisés. Les tests mécaniques portent sur des propriétés plus étroites.

Le corpus du pilote final diffère de la proposition initiale : cinéma et préférences en conversation `free`, puis commande, choix chaud accompagné d’une question imprévue, réduction de quantité et prix lié au thé. Il ne contient pas de question personnelle adressée à Mochi, de véritable faute grammaticale volontaire ou de demande d’aide française. Ces comportements ne sont pas validés par ce pilote.

## Comparaison de comportement sur historiques identiques

| Cas apparié | Hybride, japonais et français réellement produits | Génératif, japonais et français réellement produits | Lecture en contexte |
| --- | --- | --- | --- |
| Origine belge | `ベルギーはいいところですね。どんなところが好きですか？` — « La Belgique, c'est un bon endroit. Qu'est-ce qui vous plaît ? » | Même japonais et même français. | L’origine est gardée, sans biographie inventée. Le commentaire général sur le pays n’est pas demandé ; la relance descriptive est plus ouverte que le besoin débutant annoncé. Le français perd la précision « quel genre d’endroit » et conserve `vous`. Aucun avantage de politique observé ici. |
| « Aujourd’hui, je veux parler de cinéma. » | `映画ですね。最近、何を見ましたか？` — « Un film, hein. Récemment, as-tu vu quelque chose ? » | `映画ですね。最近、どんな映画を見ましたか？` — « Un film, hein. Récemment, quel film as-tu vu ? » | Les deux suivent le cinéma sans redemander la résidence. Le génératif rend le sujet de la question plus concret. Le français hybride change une question ouverte « qu’as-tu regardé ? » en oui/non « as-tu vu quelque chose ? ». « Un film, hein » reste une traduction lourde du sujet cinéma. |
| Goût pour les films de chats | `猫の映画が好きなんですね。どんな猫の映画が好きですか？` — « Tu aimes les films sur les chats, hein ? Quel genre de film sur les chats aimes-tu ? » | `猫の映画が好きなんですね。おすすめの映画ありますか？` — « Tu aimes les films sur les chats. Tu as des films recommandés ? » | Le génératif cherche une recommandation plutôt que de redemander un sous-genre déjà très précis. C’est pertinent, mais `おすすめ` demande du vocabulaire non expliqué ; le français est peu idiomatique. Une variation de relance n’établit pas une meilleure pédagogie. |
| Musique aimée, café non aimé | `音楽が好きなんですね。どんな音楽が好きですか？` — « Tu aimes la musique, hein. Quelle musique aimes-tu ? » | `音楽が好きなんですね。コーヒーは好きじゃないんですね。` — « Tu aimes la musique, hein. Tu n’aimes pas le café, hein. » | L’hybride rebondit sur la musique sans inverser la négation du café. Le génératif conserve explicitement les deux polarités, mais se limite à les répéter. Ce n’est pas une obligation d’ajouter une question partout : ici l’écho n’apporte simplement aucun nouveau pas dans la conversation. |
| Deux thés | `お茶二つですね。ホットですか、アイスですか？` — « 2 thés, d’accord. Chaud ou glacé ? » | `お茶を二つですね。ホットですか、アイスですか？` — « Deux thés, hein. Vous voulez du chaud ou du froid ? » | Produit et quantité sont conservés. La question est utile et adaptée à une réponse courte. Le génératif n’apporte pas de meilleur contenu et réintroduit `hein`/`vous`, que la paire rédigée évite. |
| Réduire à un thé, chaud déjà choisi | `お茶一つですね。ホットですか、アイスですか？` — « Un thé, d’accord. Chaud ou glacé ? » | `一つのお茶ですね。ホットでよろしいですか？` — « Un thé, c'est ça. Vous le voulez chaud ? » | Un est bien retenu, mais les deux redemandent une préférence fournie. `一つのお茶` sonne davantage comme une construction littérale que la confirmation de comptoir attendue. La cause mécanique de la répétition est identifiable dans le snapshot, voir ci-dessous. |
| Prix du thé fourni dans la scène | `すみません。値段はわかりません。` — « Désolée. Je ne connais pas le prix. » | `お茶は350円です。` — « Le thé coûte 350 yens. » | Le génératif utilise ici correctement le texte brut de la scène. L’hybride s’abstient, alors que le renseignement était disponible. C’est un défaut de disponibilité/contextualisation, plus prudent qu’un faux montant, mais frustrant. |

## Inventions de lieu : défaut bloquant réel

La scène donne deux prix et ne donne **aucun emplacement de toilettes**. Après `ホットでお願いします。トイレはどこですか？`, les quatre réponses suivantes ont été acceptées puis mises en audio dans le pilote logiciel :

| Série et politique | Japonais réel | Français réel |
| --- | --- | --- |
| Apparié, hybride | `ホットですね。トイレは、カフェの奥にあるので、そちらへどうぞ。` | « C’est chaud, hein. Les toilettes sont à l’arrière du café, allez-y. » |
| Apparié, génératif | `トイレは右手のほうにあります。お茶のホットは大丈夫です。` | « Les toilettes sont à droite. Le thé chaud est possible. » |
| Chaîne, hybride | `トイレは右手のほうにあります。お茶のホットは350円です。よろしいですか？` | « Les toilettes sont à droite. Le thé chaud coûte 350 yens. D'accord ? » |
| Chaîne, génératif | `トイレは右手の奥にあります。お茶のホットは350円です。何か他にご希望はありますか？` | « Les toilettes sont à l'extrémité à droite. Le thé chaud coûte 350 yens. Souhaitez-vous autre chose ? » |

Ces lieux sont inventés. La traduction reflète globalement l’invention japonaise ; une traduction fidèle n’en fait pas un renseignement fiable. La dernière réponse ajoute aussi trois phrases, une formule plus élaborée `ご希望`, et une relance générale, malgré les consignes de simplicité. Les gardes du pilote 01 ne couvraient pas ce type de fait. Ce sont des sorties réelles, distinctes des candidats volontairement erronés injectés dans les tests du diagnostic.

## Continuité des chaînes et limites du contexte

La chaîne cinéma produit **les mêmes quatre objets tuteur complets dans les deux politiques**, avec les mêmes historiques à chaque tour. Les deux quittent la question descriptive sur la Belgique pour le cinéma. Après « je veux parler de cinéma », elles affirment néanmoins `映画が好きなんですね` (« tu aimes les films »), alors que ce goût n’a pas encore été donné. Vouloir parler d’un sujet ne suffit pas à en déduire une préférence. Elles demandent ensuite le genre de films, rebondissent sur les chats par une recommandation, puis sur la musique. Cette continuité existe, mais ne démontre aucun bénéfice du nouveau mode sur ces chaînes.

Les chaînes café divergent après la première réponse. Les deux conservent le thé, passent de deux à un et donnent du texte français. Elles inventent toutes deux les toilettes. Le génératif ajoute spontanément le prix et une question de satisfaction dès le tour mixte, puis confirme de nouveau le chaud. Son dernier `ホットでよろしいですか？` est traduit « C'est bien chaud ? » : cela évoque la température constatée plutôt qu’un choix de commande à confirmer. L’hybride continue de proposer chaud/glacé et ne retrouve pas le prix connu. Les mesures de ces chaînes ne sont pas des comparaisons de latence sur historiques identiques après divergence.

Deux limites de ledger sont également visibles dans les observations transmises :

- Après `やっぱり、お茶は一つでお願いします。`, le snapshot contient thé/un mais a perdu `ホット`. L’ancien traitement du marqueur de changement efface le produit et sa température dès que son nom est répété, même si seul le nombre change. Cela explique la préférence redemandée ; ce n’est pas seulement un manque de variété de texte.
- Après `音楽も好きです。でも、コーヒーは好きじゃないです。`, le snapshot ne contient ni la préférence musique ni la négation du café. Il reste limité à l’origine et aux films de chats. Les motifs actuels ne couvrent pas `も` et le préfixe `でも、`. Le texte complet permet ici au modèle de répondre sans inversion, mais cette réussite ne prouve pas que la négation est protégée par le ledger. Cette limite est conservée et déclarée ; aucun élargissement de préférences n’est inclus dans les trois correctifs bornés.

## Disponibilité technique et temps observés

Dans les replays appariés : hybride = cinq sorties générées et trois contrôlées ; génératif = huit sorties générées. Aucune correction ou repli n’est émis dans ce pilote. Les huit replays par politique aboutissent, mais l’absence de rejet n’a pas empêché les inventions ci-dessus.

| Mesure appariée depuis texte reconnu | Hybride | Génératif |
| --- | ---: | ---: |
| Médiane du premier WAV émis | 2 842,1 ms | 4 150,2 ms |
| Médiane de fin de réponse | 3 576,8 ms | 4 907,1 ms |
| Médiane de fin de tout travail observé | 4 180,0 ms | 5 421,4 ms |

Le mélange de chemins change ; ces écarts ne sont pas une vitesse intrinsèque du modèle. Ils ne mesurent ni l’ASR, ni le réseau téléphone, ni le premier son entendu. Les replays sont huit entrées, sans réplications indépendantes suffisantes pour une généralisation statistique. Aucun objectif de trois secondes Android n’est démontré. La question centrale reste la fiabilité et l’agrément de l’échange humain.

## Trois correctifs après 01 — qualification mesurée en attente

Les résultats précédents appartiennent au code du pilote 01. Les modifications suivantes ont ensuite été autorisées et appliquées, sans changement de modèle, de consigne, de corpus, de niveau ou de préférences :

| Défaut réel avant | Comportement corrigé vérifié en CPU |
| --- | --- |
| Quatre assertions inventent un emplacement de toilettes. | Les assertions de lieu de toilettes reconnues sans déclaration explicite de scène sont rejetées avant résultat tuteur, pour hybride et génératif. Une phrase disant ne pas connaître le lieu est acceptée. Une localisation explicitement donnée dans la scène reste utilisable. Le tour mixte ne peut pas utiliser le repli atomique : une erreur contrôlée vaut mieux qu’une fausse information prononcée. |
| `お茶は三百五十円、コーヒーは五百円です。` ne produit aucun lien prix/produit dans le parseur étroit. | Les déclarations coordonnées sont liées séparément : thé/350 et café/500. Le contrôleur laboratoire peut retrouver 350 ; un candidat qui attribue 500 au thé est rejeté. Le classique conserve son ancien traitement. |
| Le changement de quantité du même thé efface `ホット`. | Une mise à jour positive explicite du nombre conserve la température du même produit ; le passage à une autre boisson réinitialise toujours la température. |

Les sorties réelles du pilote servent de cas de régression. **83 tests ciblés réussissent** : dix-neuf tests d’intentions, vingt-six de génération/dispatch sans MLX, vingt-quatre de contexte et quatorze du contrôleur débutant. `git diff --check` réussit. Ces tests ne prouvent pas que Qwen choisira désormais de dire « lieu inconnu » : il peut refaire une invention, qui sera alors rejetée. Le nombre de tours effectivement disponibles après ce rejet reste précisément à mesurer au rejeu.

**Conclusion actuelle : NO-GO promotion et avantage de naturalité non démontré.** Le rejeu borné devra conserver les échecs/rejets dans ses dénominateurs et distinguer une information absente d’une information fausse. La reconnaissance humaine et la sensation Android restent en attente d’un nouvel essai. Les vérifications de code ne remplacent pas cet essai.

## Rejeu 02 terminé — qualification après les trois correctifs

Source : `recovery-02.json`, statut `complete`, vingt-huit tentatives enregistrées. Tous les tuteurs disponibles, leurs historiques et les quatre tours échoués ont été lus. Les **seize empreintes des replays appariés** sont identiques à 01 : les huit entrées sont donc comparables dans chaque politique. Il n’y a ni nouveau corpus, ni nouvelle consigne, ni nouveau modèle dans ce rejeu.

### Dénominateurs et disponibilité

| Série 02 | Hybride | Génératif |
| --- | ---: | ---: |
| Replays appariés | 7 complets / 8 tentatives ; 1 rejet | 7 complets / 8 tentatives ; 1 rejet |
| Chaîne cinéma | 4 complets / 4 tentatives | 4 complets / 4 tentatives |
| Chaîne café | 1 complet / 2 tentatives ; arrêt au deuxième tour | 1 complet / 2 tentatives ; arrêt au deuxième tour |

Cela représente vingt-quatre tours complets et quatre échoués sur vingt-huit tentatives. Les quatre derniers tours de café prévus après les arrêts — réduction et prix dans chaque politique — **ne sont pas exécutés**, et ne comptent pas comme réussis ou comme sorties linguistiques lues. La vérification de réduction/prix après correction provient donc des replays appariés indépendants, pas d’une chaîne café devenue fluide.

Pour les deux replays et les deux chaînes, le tour mixte chaud + toilettes échoue désormais sans tuteur ni audio : `tutor=null`, `events=[]`, durée WAV nulle. L’export classe cet échec comme `inference-or-contract-failed` et ne conserve pas le candidat rejeté ; cette revue ne prétend pas relire ce japonais absent. Les tests CPU des sorties exactes de 01 attestent le rejet par le nouveau garde de lieu. La protection empêche la fausse information d’être prononcée, **mais le professeur ne sait pas encore produire systématiquement une réponse utile « lieu inconnu »**. Les deux chaînes café s’arrêtent : c’est une limite d’expérience réelle du prototype, pas un succès conversationnel à compter pour le garde.

### Avant/après des réponses disponibles

| Replay apparié | 01, avant complet | 02, après complet | Conclusion limitée aux observations |
| --- | --- | --- | --- |
| Hybride : réduction à un thé | `お茶一つですね。ホットですか、アイスですか？` — « Un thé, d’accord. Chaud ou glacé ? » | `ホットのお茶一つですね。` — « Un thé chaud, d’accord. » | Le chaud est conservé dans le snapshot et réutilisé ; la question répétée et son conseil devenu inutile disparaissent. Amélioration concrète de continuité sur ce replay. |
| Génératif : réduction à un thé | `一つのお茶ですね。ホットでよろしいですか？` — « Un thé, c'est ça. Vous le voulez chaud ? » | Même japonais et même français. | Le snapshot conserve désormais chaud, mais le modèle redemande quand même confirmation. La correction du contexte ne démontre pas une correction de cette rigidité générative. |
| Hybride : prix lié au thé | `すみません。値段はわかりません。` — « Désolée. Je ne connais pas le prix. » | `350円です。` — « C’est 350 yens. » | Le prix déjà fourni est retrouvé et correspond au thé, sans emprunter les 500 yens du café. |
| Génératif : prix lié au thé | `お茶は350円です。` — « Le thé coûte 350 yens. » | `お茶は三百五十円です。` — « Le thé coûte 350 yens. » | Le montant et le sens restent corrects ; seul le nombre japonais passe des chiffres aux kanji. Ce n’est pas un nouveau gain linguistique. |

Les huit réponses de cinéma appariées restent identiques à 01, de même que les deux premières commandes de thé. Les réserves sur les relances ouvertes, le français `hein`/`vous`, l’écho final des préférences et la préférence déduite du souhait de parler cinéma restent donc présentes. Les quatre tuteurs de la chaîne cinéma restent également identiques entre politiques et à 01. Aucune supériorité de naturalité n’est démontrée dans cette chaîne après correction.

### Latence et décision finale

Sur les **sept replays complets** par politique, 02 mesure les médianes suivantes depuis le texte reconnu :

| Mesure 02, sous-ensemble complet uniquement | Hybride | Génératif |
| --- | ---: | ---: |
| Premier WAV émis | 2 591,1 ms | 4 629,3 ms |
| Fin de réponse | 3 416,6 ms | 5 381,2 ms |
| Fin de tout travail observé | 4 037,3 ms | 5 744,7 ms |

Les rejets restent dans les dénominateurs de disponibilité ci-dessus et n’ont pas de premier audio à inclure dans une médiane. La série 01 comprenait huit tours sonores par politique : comparer ses médianes globales à celles de sept survivants en 02 comme un gain avant/après serait trompeur. La comparaison entre politiques dans 02 reste défavorable au génératif sur les mêmes sept entrées complètes, avec des chemins et longueurs de réponse différents. Ces mesures serveur excluent toujours reconnaissance, transport téléphone et événement de lecture Android.

**Décision finale de ce sous-lot : NO-GO pour promouvoir le laboratoire ; mode génératif à retravailler.** Les trois correctifs bornés améliorent la sécurité et deux réponses hybrides concrètes. Ils ne rendent pas l’échange plus naturel de bout en bout : un tour inattendu peut encore arrêter la conversation, le modèle répète une préférence connue et l’avantage de naturel n’est pas observé face au coût temporel supplémentaire. Le classique et l’hybride restent des possibilités de repli ; aucun nouveau correctif ou corpus n’est ajouté après cette qualification.

**GO pour un mini-test Android de diagnostic de reconnaissance**, en le présentant comme tel : vérifier ce qui est réellement prononcé, transcrit puis interprété, et relever la chronologie de lecture. Ce GO n’atteste ni que la voix de l’utilisateur est comprise, ni que Mochi est un professeur linguistiquement certifié, ni que dix minutes de conversation sont désormais satisfaisantes. La nouvelle intervention humaine doit départager ces points ; les séries synthétiques ne les remplissent pas à sa place.
