# Mesh Avatar avec le visage B

Intégration demandée le 27 octobre 2026 pour rendre Mochi plus vivante pendant les conversations sur Android avec Expo.

## Fonctionnement

Le visage B original `assets/avatar/manga-b.png` est conservé. Mesh Avatar 0.3.0 déforme un maillage préparé autour de ses yeux, de sa bouche, de son visage et de ses mèches. Le personnage reste une illustration 2D. Les yeux clignent, la tête et les cheveux bougent doucement, les regards d’écoute et de réflexion suivent l’état de la conversation. Les mouvements automatiques complexes du modèle de démonstration sont désactivés ; aucun asset Miko n’est intégré.

La bouche reçoit un niveau continu de 0 à 1 calculé sur le WAV de Mochi et la position réelle du lecteur Expo Audio, toutes les 80 ms. Il s’agit d’un suivi d’intensité, pas d’une synchronisation phonétique. L’audio continue d’être lu par l’application ; la WebView ne prend ni micro ni sortie sonore. Les voix préparées et les réponses VOICEVOX utilisent le même raccord. La voix système ou un format non analysable gardent la cadence de secours existante.

La fin de lecture et la pause ferment la bouche. Le changement d’état au premier plan suspend la boucle graphique et le micro reste soumis au contrôle oral existant. Le réglage de réduction des mouvements conserve une pose fixe, avec une petite ouverture stable pendant la parole. Les panneaux de l’accueil arrêtent aussi le compagnon masqué. Le rendu est limité à environ 30 images par seconde dans la boucle ; ce plafond n’est pas une mesure de performance sur téléphone.

## Android et Expo Go

`react-native-webview` 14.0.1 est la version déclarée par le SDK Expo 58 installé et disponible dans Expo Go. La page HTML est un asset Metro chargé par Expo Asset, téléchargé dans le cache local puis lu avec Expo FileSystem. Elle est transmise avec `source.html` à la WebView ; cette source reste stable pendant les changements de volume. Le moteur, les calques et le rig sont inclus dans cette page de 2,2 Mio environ. Aucun CDN ni serveur d’avatar n’est nécessaire. Lors d’un essai Expo Go, le premier chargement des assets utilise le serveur Metro du Mac.

Sur le web, la même page s’exécute dans une iframe isolée avec `sandbox="allow-scripts"`. Le pont vérifie l’origine de la fenêtre émettrice et valide ses messages. La version Android accepte uniquement la navigation locale initiale et désactive l’accès aux fichiers depuis la WebView. La politique CSP n’autorise que le code inclus et les images/JSON data ou blob. Aucun transcript, code personnel ou enregistrement de l’élève n’est transmis à l’avatar, seulement son état et le volume de la voix de Mochi.

Si WebGL2 manque, si le chargement échoue, si le processus graphique s’arrête ou si l’initialisation dépasse quinze secondes au premier plan, le composant revient à l’atlas B existant. Ce secours conserve le fonctionnement de la conversation. Les délais ne décomptent pas le temps passé en arrière-plan après chargement de la page.

Pour essayer : ouvrir le projet dans Expo Go, le recharger, puis toucher Commencer ma leçon. Le serveur vocal local et Metro doivent rester actifs. Il n’est pas nécessaire d’installer Mesh Avatar Studio sur le téléphone. Aucun APK autonome signé n’est produit par cette intégration.

## Assets et reconstruction

- `assets/avatar/mesh-b/rig.draft.json` : points placés sur B et maillage allégé.
- `assets/avatar/mesh-b/rig.json` et `built/` : rig final, courbes des yeux et textures préparées.
- `assets/avatar/mesh-b/mochi-b.mavatar` : archive autonome importable dans Mesh Avatar Studio, avec le dessin B original pour édition.
- `assets/avatar/mochi-mesh.html` : page réellement embarquée par Expo.
- `scripts/mesh-avatar-player.ts` : lecteur, expressions, boucle limitée et pont de messages.
- `scripts/build-mesh-avatar.ts` : validation de l’archive et construction locale de la page, raccordées aux exports web et mobiles.

```sh
npm ci
npm run avatar:build
npm run build:mobile
```

La préparation initiale utilise les outils officiels de Mesh Avatar Studio, commit `e203ac7107aade770fdcb95db5a5ce90980c0864` : grilles, overlays et `build-layers.py`. Les images des yeux et le masque des cheveux ont été inspectés, ainsi que les poses dans le moteur. Environnement local de préparation : Python 3.12, NumPy 2.2.6, Pillow 11.3.0, OpenCV headless 4.12.0.88, isolés sous `output/`. Un essai Python 3.14 n’a pas produit de calques utilisables ; il n’est pas la source livrée. La reconstruction des textures à partir du brouillon nécessite cet outil amont ; `avatar:build` réassemble les textures déjà présentes sans Python.

Le fond blanc du dessin original est conservé. Les cheveux clairs et le fond ne peuvent pas toujours être séparés par couleur ; le masque a été observé et le mouvement est volontairement faible. Le rig ne crée pas une nouvelle vue du visage : les rotations restent modérées pour ce dessin de trois quarts. La bouche est celle du moteur sans nouvelles variantes générées ; aucune nouvelle génération d’image n’a été faite pour cette intégration.

## Vérifications et limites

Les types, le formatage, 34 tests et les exports web/iOS/Android sont contrôlés. Les nouveaux tests vérifient le signal continu, les pauses et états inactifs, les messages invalides, les navigations externes et la présence exacte du visage B dans une archive autonome valide. Le contrôle des liserés et sa CI spécialisée sont conservés ; aucune CI générale n’est ajoutée. La doctrine actualisée pendant la mission exclut aussi sauge et olive : le fond du bilan et les anciennes teintes de l’illustration de train passent à des lavandes.

La revue technique et les captures finales sont dans `mesh-technical-review.json` et `evidence/mesh-checks.json`. Les contrôles du navigateur isolé utilisent un flux audio synthétique avec les vrais moteurs de dialogue, transcription et voix. Aucun micro humain, téléphone Android physique, GPU mobile, consommation batterie ou clavier système n’a été testé. Un export Android réussi et la présence de WebView dans Expo Go ne constituent pas un essai sur appareil. La décision artistique de cette version reste pending-human.

## Sources et licences

[Mesh Avatar Studio](https://github.com/shinshin86/mesh-avatar-studio), [moteur 0.3.0](https://github.com/shinshin86/mesh-avatar-studio/tree/main/packages/runtime), [format des avatars](https://github.com/shinshin86/mesh-avatar-studio/blob/main/docs/format.md), [WebView dans Expo](https://docs.expo.dev/versions/latest/sdk/webview/).

Le moteur est sous licence MIT, © 2026 Yuki Shindo. Sa licence et celle de fflate sont conservées dans la page livrée et dans les notices du dossier d’avatar. Le dessin B et sa provenance restent décrits dans `assets/avatar/README.md`. Les conditions particulières de Miko ne sont pas utilisées pour ce personnage original.
