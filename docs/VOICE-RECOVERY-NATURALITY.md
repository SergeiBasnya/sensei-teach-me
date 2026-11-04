# Reprise vocale — diagnostic du dialogue et proposition bornée

30 octobre 2026. Étape A, lecture seule du produit. Référence humaine : échec Android au commit `50dff54`, communiqué par l’utilisateur sur la reconnaissance, l’attente et la conversation trop scriptée. Code inspecté : `ce89fce`, dont les quatre modules de dialogue ciblés et le corpus historique sont identiques à `50dff54`. Aucun modèle lancé, aucune donnée humaine inventée, aucun audio conservé, aucune modification de code dans ce sous-lot.

**Décision de ce diagnostic : conserver le laboratoire hybride comme repli, ne pas le promouvoir et ne pas libérer la génération sans renforcer les validations critiques.** Le ressenti de dialogue scripté a une cause architecturale plausible et plusieurs rigidités reproductibles. Il n’est pas attribuable avec certitude à cette seule cause : une mauvaise transcription et une fin de tour mal adaptée peuvent aussi donner l’impression de ne pas être écouté. ASR puis latence restent prioritaires avant l’expérimentation de naturalité.

## 1. Ce qui choisit aujourd’hui la prochaine réplique

Sources : `server/conversation_worker.py:155`, `server/beginner_dialogue.py:70`, `server/lab_conversation.py:61`, `server/lab_generation.py:13`, `server/conversation_feedback.py:27`, `shared/tutor-feedback.ts:17`.

Le worker suit cet ordre :

1. Pour du texte japonais non reconnu comme une réponse contextuelle déjà acceptable, demander un contrôle grammatical au même Qwen. Une correction retenue devient la réponse, suivie de la demande de répétition commune. Aucun échange de service n’est généré à ce tour.
2. Sinon, appeler `controlled_dialogue`. Une reconnaissance de patron choisit alors directement japonais, français et éventuel conseil rédigés, avec les slots extraits. Cela ne passe pas par une génération de dialogue.
3. Sinon, générer suivant le contrat structuré, compact ou japonais d’abord ; ajouter rôle, objectif éventuel, consignes et snapshot de faits ; fournir les douze derniers messages.
4. Après génération, `constrain_preference_question` peut encore remplacer une question ouverte reconnue par une question rédigée sur la pratique ou la consommation quotidienne.
5. Valider, romaniser et seulement ensuite autoriser la synthèse. Les détails français tardifs ne doivent modifier ni japonais ni correction ni conseil primaire.

Point d’intégration important : `controlled_dialogue`, `constrain_preference_question` et la validation contextuelle sont actuellement appelés depuis la branche `turn` commune, sans condition `labStreaming` à leur point d’appel. Le choix `labGeneration=ja-first` change le format de génération, **pas** cette politique hybride. Un futur comparateur de naturalité devra avoir un choix expérimental distinct, strictement réservé au laboratoire ; changer le classique serait une extension de périmètre.

Le contrôleur possède quinze étiquettes d’intention associées à des familles de répliques : identité IA, trois étapes de présentation, trois étapes de billet, quai connu/inconnu, addition, prix connu/inconnu et trois étapes de boisson. Ce nombre décrit le code, pas une couverture de quinze situations humaines indépendantes.

## 2. Ce que les vingt entrées démontrent réellement

Source complète retenue : `docs/evidence/stabilization/paired-after.json`, soit quarante réponses complètes sur vingt mêmes entrées et deux profils. La série privée `stabilization-release-paired.json` interrompue n’est pas utilisée comme résultat final. Les chaînes finales complémentaires figurent dans `docs/evidence/stabilization/chains-after.json` et `new-chains-after.json` ; cette note ne revendique pas une nouvelle relecture intégrale de leurs cinquante-six sorties.

| Chemin des vingt entrées | Structuré | Japonais d’abord | Portée |
| --- | ---: | ---: | --- |
| Contrôlé avant génération | 14 | 14 | Les réponses utilisent les mêmes familles rédigées. |
| Correction | 1 | 1 | Réponse pédagogique commune ; aucune conversation libre à ce tour. |
| Pratique aidée | 2 | 2 | Modèles d’aide protégés. |
| Répétition partagée | 1 | 1 | Répète une question déjà fournie. |
| Étiqueté `generated` | 2 | 2 | Ne signifie pas nécessairement sortie modèle inchangée. |

Dans le profil japonais d’abord, `help-and-preferences/assisted-response` est étiqueté `generated`, mais sa métrique `controlled_question=1` confirme le remplacement final par `日本語を毎日勉強しますか？` / « Étudies-tu le japonais tous les jours ? ». Il ne reste donc qu’une des vingt sorties japonaises de ce profil sans sélection contrôlée de sa réplique finale : `self-correction`, qui demande chaud ou glacé après une préférence pour le thé. Celle-ci illustre justement une préférence transformée en choix de commande dans la traduction française.

Le bilan précédent annonçait 1,75 s jusqu’au premier WAV japonais d’abord après texte reconnu, contre 3,74 s avant stabilisation. C’est un gain sur ce mélange de chemins, dominé par le travail de génération évité. Ce résultat n’est ni la vitesse d’une conversation générative ouverte, ni la fin de parole jusqu’au son Android. Les deux entrées classées génératives sont insuffisantes pour généraliser ; l’une est même réécrite après génération. Le nombre de réponses acceptées ne mesure pas la spontanéité.

## 3. Rigidités concrètes et limites de preuve

| Observation | Cause dans le code | Conséquence possible |
| --- | --- | --- |
| Après prénom : origine ; après pays : résidence ; après ville : goûts du japonais. | `beginner_dialogue.py:83-100` décide à partir de la présence des slots et de quelques expressions. | Une présentation rapide ressemble à un questionnaire. L’information nouvelle hors de ces slots peut disparaître de la réponse. |
| Identité : toujours `私はAIです。日本語を話しましょう。` | `beginner_dialogue.py:78-82`. | La vérité sur l’identité est conservée, mais l’invitation générique ne rebondit pas sur la curiosité de l’élève. |
| Questions de service : prochain slot manquant ou simple confirmation finale. | Billets `:101-128`, boissons `:146-170`. | Fiabilité locale utile, mais aucune réaction à la motivation, à une remarque personnelle ou à un autre détail non représenté. Une confirmation complète reste légitime ; ajouter une question partout ne corrigerait pas le problème. |
| Question ouverte sur un goût remplacée par « tous les jours ? ». | `beginner_dialogue.py:173-199`. | Le niveau devient plus simple, mais la relance peut devenir répétitive. Le même sujet lexical ne suffit pas à prouver la pertinence. |
| Le prompt demande un prochain pas « dans la même situation », privilégie une question oui/non et interdit certaines descriptions. | `lab_generation.py:16`, plus objectif focalisé `conversation_worker.py:187-188`. | Réduit certains échecs débutants, mais peut décourager une bifurcation volontaire. Conversation libre et leçon guidée partagent trop de contraintes. |
| Une correction retenue remplace le tour entier et demande de réessayer. | `conversation_worker.py:172-175`, `shared/tutor-feedback.ts`. | La pédagogie interrompt le contenu de l’échange. C’est actuellement une protection assumée ; supprimer le contrôle ou inventer une correction discrète libre serait une régression. |

Ces effets sont des mécanismes observables et des interprétations d’agent. Ils ne constituent ni un score de naturel ni une certification linguistique. Le retour humain établit l’échec de l’expérience ; il ne fournit pas encore une attribution tour par tour à l’ASR, au contrôleur ou au générateur.

### Reproductions sans modèle

Commandes Python en mémoire, imports des seuls helpers existants, avec `-B`. Historiques et phrases fictifs rédigés pour le diagnostic ; aucune phrase personnelle issue de l’essai Android.

| Entrée et historique | Résultat actuel vérifié | Lecture du défaut |
| --- | --- | --- |
| Historique : l’élève vient de Belgique ; Mochi demande où il habite. Entrée : `ベルギーから来ました。今日は映画の話をしたいです。` | Contrôleur : `どこに住んでいますか？`, accepté par le garde. | Le souhait explicite de parler de cinéma est ignoré ; l’ancien questionnaire reprend. |
| Historique : destination Kyoto, question aller simple/retour. Entrée : `京都までお願いします。でも、今日は行きません。` | Contrôleur : `京都までですね。片道ですか、往復ですか？`, accepté. | « Pas aujourd’hui » n’est pas traité. La destination peut rester Kyoto, mais la restriction temporelle est perdue ; ce n’est pas nécessairement une annulation du voyage. |
| Historique : un café. Entrée : `お茶を一つください。トイレはどこですか？` | Pas de réplique contrôlée ; snapshot conserve l’ancien café et ignore la nouvelle commande de thé. | À `lab_conversation.py:87`, une question n’importe où dans le message fait sauter tout l’examen des assertions élève. La génération reçoit donc un snapshot contradictoire avec le texte complet. Aucun résultat génératif n’est prétendu ici. |

Le texte complet reste transmis à Qwen dans le dernier cas : il pourrait compenser le snapshot. Cela ne supprime pas le défaut du contexte structuré et de ses validations en aval.

## 4. Gardes indispensables, couverture actuelle insuffisante

Le chemin contrôlé lie explicitement un prix à sa boisson ou un quai à sa destination via `_service_value`. Il ne calcule ni total, ni disponibilité, ni horaire réel. Les commandes additives/multiples déclenchent une sortie du contrôleur, qui reste active dans l’historique observé : c’est une **abstention de représentation**, pas une maîtrise des commandes complexes par le générateur.

En revanche, la validation d’une réponse générée est plus faible que cette réalisation contrôlée. Les candidats ci-dessous ont été **injectés directement dans les fonctions de validation**. Ils n’ont pas été produits par un modèle ou prononcés à l’utilisateur pendant ce diagnostic.

| Contexte et candidat volontairement contradictoire | Résultat du garde actuel | Cause étroite |
| --- | --- | --- |
| Demande deux thés → `お茶三つですね。` | Accepté. | Pas de comparaison générale de quantité café. |
| Demande deux thés → `コーヒー二つですね。` | Accepté. | Le motif de confirmation boisson reconnaît certaines formes avec `を`, mais manque la forme nominale avec compteur. |
| Kyoto, aller simple, deux billets → `京都まで、往復で二枚ですね。` | Accepté. | Quantité et certaines destinations sont contrôlées, pas le choix aller simple/retour. |
| Thé 350, café 500 déjà déclarés → `お茶は五百円です。` | Accepté. | Le garde stocke un ensemble de montants connus, sans lien produit/montant, contrairement au contrôleur de prix. |
| `コーヒーはいりません。` → `コーヒー一つですね。` | Accepté. | La négation efface le choix positif mais ne fournit pas d’interdit explicite à comparer au candidat. |
| Japonais `コーヒーは好きじゃないです。` → français « J’aime le café. » | Accepté par `validate_lab_translation`. | Le contrôle du nom de boisson ne vérifie pas la polarité. Le catalogue peut protéger certaines phrases exactes dans le pipeline ; ce helper n’est pas un validateur général de négation. |
| Japonais `切符は二枚です。` → français « Il y a trois billets. » | Accepté par `validate_lab_translation`. | Les quantités autres que montants explicites ne sont pas comparées. |

Ces contre-exemples n’invalident pas les couples rédigés déjà protégés. Ils interdisent de présenter les mêmes gardes comme une preuve suffisante pour remplacer ces couples par des sorties libres. Le contrôle de vocabulaire, l’absence d’exception et la validité du JSON sont des preuves différentes de la fidélité du sens.

## 5. Architecture proposée pour l’étape D, après ASR et latence

**Proposition, non implémentée.** Garder `hybrid` comme valeur actuelle et repli. Ajouter seulement un chemin laboratoire explicitement sélectionné par le serveur, orthogonal au choix du contrat de génération. Un champ ressemblant à une option de laboratoire ne devra rien activer hors `labStreaming=true`. Ni classique, ni progression, ni mémoire, ni nouvelle interface ne sont concernés par cette proposition.

| Responsabilité | Hybride actuel | Comparateur « intentions guidées » proposé |
| --- | --- | --- |
| Faits et négations | Slots positifs, certains effacements, valeurs de service partiellement liées. | Assertions par proposition, provenance et objet, valeurs abandonnées/niées distinctes des inconnues ; si ambiguïté, ne pas la transformer en fait. |
| Prochaine action | Prénom/pays/ville et cases de service choisissent souvent la réplique entière. | Définir rôle, contraintes, intention et détail utile manquant ; laisser le même générateur réaliser la réponse à la dernière intervention. Aucune nouvelle génération de plan préalable. |
| Changement de sujet | Consignes générales de même situation ; aucun événement explicite de bifurcation. | En `free`/présentation, répondre à une bifurcation explicite. En leçon, traiter la question puis proposer le retour ; en service, conserver la commande sans la confondre avec une digression. Une hésitation seule n’est pas un changement de sujet. |
| Faits de service sensibles | Réponse rédigée exacte quand reconnue. | Garder les réponses exactes connues de prix/quai et les abstentions ; ne pas gagner en variété en inventant des données. |
| Aide/correction | Patrons fiables et correction bornée. | Même couverture fiable, même séparation modèle aidé/fait élève, mêmes règles de mémoire. Ne pas comparer la naturalité en retirant les protections pédagogiques. |
| Validation avant son | JSON puis gardes étroits. | JSON entier et gardes critiques renforcés avant tout TTS ; si une assertion est hors couverture, abstention ou repli sûr déclaré, pas étiquette « correct ». |
| Français tardif | Ne change pas le japonais déjà émis. | Même immutabilité, conservation des conseils validés et annulation coopérative. Une traduction incertaine ne doit pas devenir une nouvelle explication. |

Pour les corrections, cette première comparaison conserve l’interruption actuelle afin d’isoler l’effet du dialogue. On mesurera les interruptions et leurs causes. Une correction plus discrète ne peut être envisagée qu’avec le même couple correction/traduction/explication validé, après diagnostic de l’ASR, sans fausse compétence ni mémoire automatique. Ce n’est pas une fonctionnalité ajoutée dans ce diagnostic.

### Préconditions techniques avant comparaison générative

1. Corriger le tour mixte déclaration/question et la capture des restrictions/négations sans transformer un exemple d’aide en fait.
2. Lier prix/quai/quantité/choix à leur objet et provenance ; couvrir explicitement les contradictions café et aller simple/retour ci-dessus. Une liste de nombres autorisés n’est pas suffisante.
3. Vérifier la polarité et les quantités traduites sur la couverture déclarée ; garder une abstention explicite hors couverture, sans prétendre à une validation universelle du japonais.
4. Tester les rejets avant TTS et le repli sur entrée identique. Un candidat rejeté ne doit être ni prononcé, ni persisté, ni transformé en faute élève. Un repli ne compte pas comme réussite générative.

## 6. Comparaison bornée proposée

Conserver les vingt replays historiques pour la non-régression et leur mélange de chemins. Ajouter **six chaînes de quatre tours**, dont des bifurcations intentionnelles, et ne pas les agrandir à chaque défaut observé. Réserver leur génération effective au pilote coordonné après les travaux ASR/latence.

| Chaîne | Quatre interventions à préparer avec historique identique au départ | Assertions critiques |
| --- | --- | --- |
| Présentation → cinéma | Origine ; souhait explicite de parler cinéma ; film préféré ; réponse courte oui/non à la question réellement posée. | Pas de retour automatique à la résidence ; réagir au film cité sans inventer le goût de Mochi ou celui de l’élève. |
| Café + demande inattendue | Deux thés ; choix chaud et question sur un lieu non documenté dans le même tour ; réduction à un ; prix fictif connu avec autre produit d’un autre prix dans l’historique. | Thé/quantité/température conservés ; ne pas inventer l’emplacement demandé ni emprunter le prix du café. |
| Gare + changement de plan | Kyoto aller simple deux ; « pas aujourd’hui, demain » ; Osaka à la place de Kyoto ; demande du quai explicitement connu pour Osaka. | Pas d’annulation inventée ; destination actualisée ; pas de retour automatique ni confusion de quai. |
| Négation et aide | Préférence négative ; question pourquoi/comment dire une autre idée ; modèle d’aide ; reprise personnelle différente du modèle. | Pas de positivisation, pas de goût mémorisé à partir du modèle ; un écart au modèle n’est pas automatiquement une faute. |
| Commande multiple hors slots | Eau et thé ; quantité portant sur l’un ; suppression de l’autre ; nouvelle question. | Déclarer le hors-couverture ou demander une précision, sans réduire arbitrairement la commande à un seul produit ni prétendre l’avoir comprise. |
| Réparation puis sujet nouveau | Erreur `を→から` connue ; réparation ; question imprévue sur une activité du quotidien ; hésitation transcrite puis réponse courte. | Même correction fiable ; pas de nouvelle correction de la réparation ; aide liée à la question courante ; aucune note de prononciation. |

Les replays appariés utilisent les mêmes textes **et historiques**, cache identique et ordre alterné. Les rollouts réinjectent leurs propres sorties : ils évaluent les chaînes, mais ne sont pas des paires causales de latence après divergence. Il faut lire chaque sortie avec son historique réel et ne pas sanctionner une répétition lorsque le script élève a laissé la question précédente sans réponse.

Mesures : chemin exact (`controlled`, généré intact, généré remplacé, correction, aide, abstention, repli, rejet), générations réellement exécutées, premier WAV, fin de réponse et fin de travail ; sur Android seulement, chronologie fin d’énergie estimée → transcription finale → premier événement de lecture → reprise du micro. Les contrefactuels de validation restent séparés des sorties de Qwen. Les médianes globales, génératives et de repli doivent être publiées séparément.

Lecture d’agent, sans score humain : réponse à la dernière intention, conservation des faits/négations, relance utile/non répétée, changement de sujet admis, phrase adaptée au débutant, fidélité français/japonais. La sensation d’échange, la compréhension de la voix et le son réellement entendu restent en attente du mini-test puis du nouvel essai Android de cinq à dix minutes.

## 7. Vérifications de ce sous-lot et statut

- Lecture des quatre modules demandés, des helpers linguistiques et de correction, du corpus historique, de la qualification appariée finale et des bilans de stabilisation.
- `.venv/bin/python -B -m unittest discover -s tests -p 'test_beginner_dialogue.py'` : **14 tests réussis**.
- `.venv/bin/python -B -m unittest discover -s tests -p 'test_lab_conversation.py'` : **24 tests réussis**.
- Onze sondes supplémentaires en mémoire : quatre observations de contrôleur/snapshot, cinq candidats japonais de garde et deux traductions. Elles démontrent la portée insuffisante de certains contrôles ; elles ne sont pas des mesures de langue ou d’ASR et aucun test existant n’a été modifié pour les faire passer.
- Sources et prompts laissés inchangés. Cette note est entièrement nouvelle : aucun texte de produit ou prompt existant n’est remplacé. Pas de modèle, service, dépendance, CI, commit ou push dans ce sous-lot.

**Statut : diagnostic P2 terminé ; implémentation et preuve de naturalité non réalisées. NO-GO pour promouvoir le laboratoire.** L’étape suivante appartient d’abord au diagnostic et à la correction démontrée de la reconnaissance, puis à la chronologie de latence réelle. Une comparaison de naturalité pourra ensuite isoler le contrôle d’intentions, avec protections renforcées et repli hybride conservé. Aucune validation de la voix humaine n’est revendiquée.

## 8. Prototype autorisé après le diagnostic — état du 30 octobre

Cette section décrit l’implémentation suivante, sans réécrire les observations de l’étape A ci-dessus. La proposition initiale de six chaînes n’est **pas** retenue pour le pilote : le lot est limité aux vingt replays existants et aux **huit nouvelles interventions** décrites ci-dessous. Aucun modèle n’a été lancé par cet agent ; la comparaison mesurée reste à effectuer par l’intégration.

### Contrats et isolation réellement implémentés

- `lab_generation.dialogue_mode(request)` retourne `hybrid` hors `labStreaming is True`, en ignorant le drapeau. Dans le laboratoire, seules les valeurs `hybrid` et `generative` sont acceptées ; absence = `hybrid`, valeur invalide = rejet avant appel au modèle.
- `dialogue_instructions(profile, mode='hybrid')` garde les consignes hybrides inchangées. `generative` ajoute la politique ci-dessous aux contrats `ja-first` ou `compact`. Le worker peut aussi l’ajouter au structuré expérimental ; le pilote prévu porte seulement sur japonais d’abord.
- `lab_conversation.lab_turn_observation(request, path)` retourne `{intent, path, facts:[{name,value}]}` : au plus huit faits, valeur au plus quatre-vingts caractères. Ce sont les assertions/préférences du snapshot éphémère fourni au professeur, sans raisonnement interne, note, audio ni sauvegarde. Le worker ne joint ce champ que si **les deux** booléens `labStreaming` et `labDiagnostics` valent `True`.
- Chemins observés : `controlled`, `generated`, `fallback`, `correction`. En génératif, les deux sélecteurs de répliques `controlled_dialogue` et `constrain_preference_question` sont sautés. Une correction validée garde exactement son chemin existant.
- `beginner_dialogue.safe_controlled_fallback(request)` n’est appelé qu’après un `ValueError` de lecture/validation du candidat généré. Il ne réalise que des intentions atomiques café/gare complètement reconnues, après nouvelle validation de la paire rédigée. Il refuse les présentations, questions de sujet/méta, tours mixtes, changements ambigus, aide et commandes multiples. Une panne de génération/réseau ou de romanisation ne déclenche pas ce repli. Le candidat rejeté n’est pas envoyé à la synthèse.

Le classique garde ses consignes, son ancien snapshot et ses validations contextuelles antérieures. Le ledger enrichi, ses préférences et les gardes critiques nouveaux sont conditionnés à `labStreaming is True`. Cela conserve aussi les limites classiques décrites dans le diagnostic ; cette isolation n’est pas présentée comme une correction de leur expérience actuelle. Aucun rattachement à la mémoire ou à la progression n’est ajouté.

### Contrôles mécaniques ajoutés

Les contre-exemples injectés de l’étape A sont maintenant rejetés **dans le laboratoire** : boisson et quantité nominales, quantité de billets, aller simple/retour, destination de la confirmation, boisson refusée, montant lié à sa boisson et quai lié à sa destination. Le tour mixte commande + question conserve sa commande. Une préférence explicitement négative n’est pas transformée en préférence positive ; un nouveau choix explicite peut remplacer le précédent. Les modèles d’aide cités ne deviennent pas des préférences.

La question sur le quai d’une autre destination explicitement nommée peut recevoir sa réponse connue sans changer le trajet de l’élève. Une alternative de quantité inconnue « deux ou trois ? » reste admise. Une valeur connue pour un autre produit ne suffit plus à autoriser un nouveau prix pour un produit inconnu dans cette couverture.

La traduction rejette certaines contradictions explicites de quantité et de polarité sur une préférence simple complète. Elle ne certifie ni les paraphrases, ni la portée de toutes les négations, ni le français naturel ou le tutoiement. Les valeurs de service reconnues exigent des déclarations précises ; les formulations inconnues, commandes multiples, calculs de totaux et autres faits restent hors couverture. Ne pas transformer le silence d’un garde en preuve de compréhension.

### Huit nouvelles interventions proposées au pilote

Les noms, prix et scènes sont fictifs. Ce tableau définit des intentions et contraintes, **aucune réplique cible à recopier**. Pour un replay apparié, l’intégration prépare un historique de référence commun ; pour les chaînes, elle réinjecte les sorties effectives et déclare la divergence.

| Chaîne et départ | Intervention élève | Attente à vérifier en contexte |
| --- | --- | --- |
| `topic-cinema`, présentation ; Mochi vient de demander l’origine. | 1. `ベルギーから来ました。今日は映画の話をしたいです。` | Garder la Belgique et accepter le cinéma ; ne pas reprendre automatiquement le questionnaire de résidence. |
| Même chaîne | 2. `アニメが好きです。モチさんは映画を見ますか？` | Répondre à la question personnelle en restant une IA, sans prétendre regarder des films, puis rebondir sur l’animation citée. |
| Même chaîne | 3. `えっと…映画館じゃなくて、家で見ます。` | Accepter l’hésitation/autocorrection et la précision « à la maison » ; ne pas corriger le faux départ abandonné. |
| Même chaîne | 4. `はい、家で見ます。音楽も好きです。` | Traiter la musique comme une information nouvelle ; une réponse courte ne force pas le retour à l’origine ou à « tous les jours ? ». |
| `cafe-aside`, café fictif ; thé 350 yens, café 500 yens déjà déclarés séparément, puis question de commande. | 1. `お茶を二つください。トイレはどこですか？` | Garder deux thés et répondre honnêtement à la demande de lieu inconnu ; ne pas inventer l’emplacement ni perdre la commande. |
| Même chaîne | 2. `トイレはもういいです。お茶は一つにします。` | Abandonner la question du lieu et réduire à un thé, sans garder deux ou substituer le café. |
| Même chaîne | 3. `このお茶はいくらですか？` | Donner 350 yens à partir de la fiction ; ne pas emprunter les 500 yens du café ou calculer un total non fourni. |
| Même chaîne | 4. `ありがとう。今日は映画の話をしたいです。` | Distinguer le remerciement d’une clôture : accepter l’aside explicite sans nouvelle commande inventée. La scène de service et le choix précédent ne sont pas effacés. |

Il faut relire surtout l’identité/expérience personnelle, la pertinence des questions et le niveau. Ces propriétés ne sont pas entièrement couvertes par des expressions régulières. Le diagnostic de reconnaissance de la voix humaine reste séparé et attendu ; ces textes ne remplacent pas les prises réelles.

### Ajout de consigne, avant/après complet

Les blocs hybrides `LAB_DIALOGUE_RULES`, `LAB_JAPANESE_FIRST_INSTRUCTIONS`, `LAB_COMPACT_INSTRUCTIONS` et `LAB_DETAILS_INSTRUCTIONS` ne sont pas remplacés dans ce lot. **Avant :** ce bloc additionnel est absent. **Après :** le texte complet suivant est ajouté uniquement dans le mode génératif explicite. Aucun paragraphe antérieur supprimé ou déplacé.

```text
Experimental intent-guided conversation: the learner's latest communicative intention takes priority over completing a fixed sequence of slots. The snapshot constrains facts; it is not a questionnaire or a script of replies.
Respond to a new detail or an unexpected question before choosing one relevant next step. In free conversation or introductions, accept an explicit change of topic and follow the new subject instead of returning to origin, residence or daily habits. In a guided lesson, answer a brief aside first, then offer a return to the objective without pretending the aside answered the lesson question. In service roleplay, retain the order or journey while answering an aside; never invent missing facilities, prices, availability or timetables.
Reuse the learner's actual new information in a short, concrete reply. Ask a question only if it serves the present intention; do not mechanically ask whether they do something every day. A short relevant question can be open when the learner can answer with a familiar word; do not ask for an unexplained description. Keep simple desu/masu, one or two short sentences, and at most one question. Do not invent your own human experiences, preferences or biography.
If an assertion is absent or ambiguous in the snapshot, inspect the actual latest text rather than completing the slot from a template. Preserve explicit negations, replacements and restrictions such as not today. Unknown values remain unknown. Do not produce or explain a correction: the separate checked correction path owns that decision.
```

Seule la ligne d’objectif reçoit une alternative dans ce mode. La concaténation et ses passages complets sont conservés ci-dessous ; la branche hybride/classique garde la colonne avant.

| Avant complet | Après complet, génératif laboratoire seulement |
| --- | --- |
| `\nCurrent beginner practice objective: ` + objectif fourni + ` Keep your follow-up questions focused on this objective.` | `\nGuided practice objective: ` + objectif fourni + ` Answer an unexpected question or explicit aside first; then offer a return to this objective when useful. Do not treat an aside as a completed exercise answer.` |

### Vérification locale du prototype

`test_lab_intentions.py` contrôle la sélection explicite, le snapshot, les contre-exemples, les cas voisins admis et les replis refusés. Les tests de dispatch exécutent le véritable worker avec faux modules MLX, sans chargement de modèle : génération intacte, contrôle sauté, erreurs parse/validation avec repli, refus de repli pour erreur de modèle/romanisation, correction conservée, diagnostic volontaire et non-fuite vers le classique. Ces contrôles portent sur le comportement du code, pas sur la qualité d’un Qwen effectivement exécuté.

**Statut du prototype : code prêt pour comparaison synthétique bornée, désactivé par défaut ; naturalité et latence non encore mesurées par ce sous-lot.** Le NO-GO de promotion après l’échec humain demeure. La décision du lot intégré devra tenir compte des nouvelles mesures et du nouvel essai Android, sans qualifier l’expérience de naturelle sur la seule réussite des tests.
