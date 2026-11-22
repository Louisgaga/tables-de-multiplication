# Mes tables de Multiplication

Une application web pour réviser les tables de multiplication, pensée pour les enfants de 7 à 10 ans sur un iPad
partagé, et utilisable aussi sur téléphone et sur ordinateur.

- Des parties courtes, chronométrées ou non, sur les tables choisies ou sur les « points faibles » de l'enfant.
- Après une erreur, l'enfant recopie la bonne réponse, et le calcul revient un peu plus tard.
- Une mascotte qui réagit à chaque réponse et nomme la cause probable d'une erreur.
- Un rapport pour les parents : progrès, temps de jeu, calculs maîtrisés et médailles par table.
- Un compte Google par famille, un profil par enfant. On peut aussi jouer sans compte : tout reste alors sur l'appareil.

En ligne : https://mes-tables-de-multiplication.web.app

Le code est sous licence MIT (voir `LICENSE`). La police Chillax n'est pas dans le dépôt (voir « Licence »).

## Lancer l'app sur son ordinateur

Il faut Node.js.

```bash
npm install
cp firebase-applet-config.example.json firebase-applet-config.json
npm run dev
```

L'app s'ouvre sur http://localhost:3000. Avec la configuration d'exemple, seul le jeu sans compte fonctionne :
pour les comptes, il faut votre propre projet Firebase (ci-dessous).

Pour la police, voir `public/fonts/chillax/LISEZMOI.md`.

## Installer votre propre version

L'app tourne sur Firebase : Hosting pour le site, Authentication pour la connexion Google, Firestore pour les
parties. L'offre gratuite de Firebase suffit pour quelques familles.

1. Créez un projet dans la console Firebase, puis une application Web dans ce projet.
2. Copiez sa configuration dans `firebase-applet-config.json` (modèle : `firebase-applet-config.example.json`).
   `firestoreDatabaseId` vaut `(default)` pour la base par défaut, ou le nom d'une base nommée.
3. Dans Authentication, activez la connexion Google.
4. Créez la base Firestore. Dans `firebase.json`, mettez le nom de la base (`database`) et celui de votre site
   Hosting (`site`) ; dans `.firebaserc`, l'identifiant de votre projet.
5. Publiez les règles de sécurité, puis le site :

   ```bash
   npx firebase-tools deploy --only firestore:rules
   npx firebase-tools deploy --only hosting
   ```

6. Ajoutez chaque adresse du site aux « URI de redirection autorisés » du client OAuth Web, dans la console
   Google Cloud (voir « Connexion Google » plus bas).
7. Conseillé : dans la console Google Cloud, limitez la clé d'API Web aux adresses de votre site.

N'importe qui peut lire la configuration Web de Firebase dans le site publié. Les données sont protégées par les
règles de sécurité (`firestore.rules`).

## Vérifier avant de publier

```bash
npm run lint        # vérification des types
npm test            # tests automatiques
npm run test:rules  # règles de sécurité Firestore, sur l'émulateur (il faut Java)
npm run build       # construction de la version publiée
```

### Essayer avec de faux comptes

Pour tester les comptes et les profils sans toucher à la vraie base (les émulateurs prennent le projet de
`.firebaserc`, qui doit être celui de `firebase-applet-config.json`) :

```bash
npm run emulators   # émulateurs Firebase (connexion et base) sur l'ordinateur ; il faut Java
npm run dev:test    # l'app sur http://localhost:3001, branchée sur ces émulateurs
```

Dans la console du navigateur, `__signInAs("Famille Test")` connecte un faux compte Google.
Ce mode n'existe pas dans la version publiée.

## Publier

```bash
npx firebase-tools deploy --only firestore:rules   # règles de sécurité, si elles ont changé (toujours en premier)
npx firebase-tools deploy --only hosting
```

La branche `main` correspond à ce qui est en ligne sur https://mes-tables-de-multiplication.web.app. Chaque évolution passe
par une branche et une pull request.

## Organisation du code

- `src/App.tsx` : enchaînement des écrans, compte connecté, enfant qui joue, historique en mémoire. Le rapport et les records sont chargés à part.
- `src/components/` : un fichier par écran (accueil, compte à rebours, jeu, résultats, records, rapport, « Qui joue ? » dans `ProfilePicker.tsx`), plus les formulaires des profils (`ProfileForm.tsx`), le pavé numérique (`Numpad.tsx`), les chronomètres (`GameClock.tsx`), les graphiques (`charts/`) et le papier découpé du thème (`paper.tsx` : feuilles déchirées, médailles, pastilles de profil).
- `src/utils/history.ts` : lecture et écriture de l'historique, en ligne et dans le navigateur.
- `src/utils/profiles.ts` : profils des enfants (création, modification, suppression) et répartition de l'historique par enfant. Avec `history.ts`, les seuls fichiers qui parlent à la base de données.
- `src/utils/stats.ts` : tirage des questions, calculs à trous, maîtrise, médailles, session rapide. Fonctions pures, testées.
- `src/utils/report.ts` : calculs du rapport (périodes, utilisation, progrès, découpage par jour, semaine ou mois). Fonctions pures, testées.
- `src/utils/firebase.ts` : connexion à Firebase et connexion Google (fenêtre surgissante sur iPad et ordinateur, redirection sur téléphone et depuis l'icône de l'écran d'accueil), et mode test avec les émulateurs.
- `src/utils/audio.ts` : sons.

## Tailles d'écran

La mise en page de l'iPad est la référence. Les réglages pour téléphone passent uniquement par des
variantes qui ne touchent jamais l'iPad :

- `max-sm:` : écran de moins de 640 px de large (téléphone tenu droit) ;
- `short:` : téléphone de moins de 660 px de haut (iPhone SE dans Safari), sans la mascotte du jeu ;
- `phone-land:` : écran de moins de 500 px de haut à l'horizontale (téléphone couché), jeu sur deux colonnes ;
- `wide:` : grand écran à l'horizontale (iPad en paysage).

Sur téléphone, la hauteur des touches du pavé est calculée dans `src/index.css` (`--key-h`) pour que
l'écran de jeu remplisse l'écran sans défiler. Si on ajoute un élément à l'écran de jeu, il faut
ajuster la hauteur fixe utilisée dans ce calcul.

## Design

L'app suit le thème Hum (du papier découpé à la main) : papier crème à grain, feuilles au bord déchiré, boutons en carton
qui s'enfoncent, police Chillax servie par l'app (`public/fonts/chillax`, à installer soi-même). Le système est décrit dans `design.md` :
lisez-le avant de toucher à un écran. Les règles principales :

- les couleurs, les rayons et les ombres sont des jetons de `src/index.css` (`@theme`), jamais une couleur en dur ;
- les boutons utilisent les classes `btn`, `btn-primary` (poire, une seule action principale par écran), `btn-chosen`
  (choix en cours, à l'encre), `btn-ink` et `btn-danger` ;
- aucun emoji, et la mascotte est le seul personnage dessiné ;
- chaque couleur a un rôle : poire pour l'action, encre pour le choix en cours, menthe pour la réussite, corail pour
  l'erreur, bleu pour les liens et le focus.

Règle de contraste (WCAG AA) : sur poire, menthe, corail et kraft, le texte est à l'encre (`text-ink`) ; le texte clair ne
va que sur l'encre et sur `danger`. Pour un texte « juste » ou « faux » sur fond clair, utiliser `success-ink` et
`error-ink`.

## Règles du jeu et détails à connaître

- Un calcul est **maîtrisé** quand ses 3 dernières réponses sont justes et rapides (10 secondes en moyenne au plus). 7 × 8 et 8 × 7 sont deux calculs différents : 100 calculs en tout.
- **Médailles** : dans la table de 7, le calcul 7 × 8 compte quand il est maîtrisé dans les deux sens (7 × 8 et 8 × 7). Bronze à 5 calculs sur 10, argent à 8, or à 10 : une table d'or est entièrement maîtrisée, dans les deux sens.
- **Accueil en deux questions** : quels calculs (Mes points faibles, ou Mes tables choisies à la main) et comment jouer (Entraînement ou Évaluation), puis 10, 20 ou 30 calculs.
- **Mes points faibles** (`buildFocusSession`) : l'app choisit dans toutes les tables. 60 % de calculs à travailler (ratés la dernière fois d'abord, puis « on travaille », puis en bonne voie), 20 % de nouveaux (tables 1, 2, 5, 10, puis 3, 4, 9, puis 6, 7, 8), 20 % de révisions de calculs maîtrisés (les moins revus d'abord), posées à trous. Si une catégorie manque, les autres complètent.
- **Session rapide** : raccourci « points faibles + Entraînement + 20 calculs ».
- **Mes tables + Entraînement** : tirage dans les tables choisies, qui favorise les calculs ratés la dernière fois.
- **Évaluation** : toujours sur des tables choisies, 30 calculs, 15 secondes chacun, sans seconde chance.
- **Erreur** (sauf en Évaluation) : l'enfant recopie la bonne réponse, et le calcul revient 3 questions plus tard, une seule fois.
  Ce calcul revu s'affiche « En plus » : le compteur reste à « x / 10 » et la partie ne s'allonge pas à l'écran.
- **Score** : il porte sur les calculs choisis, à la première réponse (« 9 / 10 du premier coup »), dans les résultats comme dans
  les records. Les calculs revus sont comptés à part ; leurs réponses entrent quand même dans la maîtrise.
- **Grille du rapport** : chaque calcul est « maîtrisé », « en bonne voie » (aucune erreur dans les 3 dernières réponses), « on travaille » (dernière réponse juste, mais une erreur dans les 3 dernières), « à revoir » (dernière réponse fausse) ou « pas encore vu ». Dans « Par table », chaque case est coupée en deux, un sens de chaque côté, avec ces couleurs.
- **Mascotte** (`src/utils/mascot.ts`) : seize bouilles (dont une avec sa part de pizza) et des phrases selon le moment. Elle fête les séries (3, 5, 7, 10 d'affilée), les réponses éclair (3 s au plus) et les calculs revus réussis. Après une erreur, elle nomme la cause probable : addition au lieu de multiplication, une fois de trop ou de moins, chiffres inversés, résultat donné à la place du nombre caché. Elle dit parfois le prénom de l'enfant.
- **Partage du lien** : `public/og-image.jpg` (1200 × 630) sert d'aperçu sur WhatsApp et ailleurs, les icônes sont l'encre et le × poire de l'en-tête. Leurs sources sont dans `design/` (`og.html`, `icon.html`) : on les rend avec Chrome sans fenêtre (`--headless=new --screenshot --window-size=1200,630`).
- **iPad** : pas de zoom par pincement ni de page qui rebondit (`index.html`, `main.tsx`, `index.css`). En portrait, la correction s'affiche au-dessus du calcul, pour que le calcul reste collé au pavé. Les résultats d'une partie mènent directement au rapport.
- **Mode libre** : retiré, car ses réponses n'entraient pas dans les statistiques. Les anciennes parties jouées dans ce mode restent dans le rapport (utilisation, journal), mais pas dans les records.

## Données

Connexion par Firebase Authentication (Google). Données dans Firestore (la base de `firestoreDatabaseId`), trois collections :

- `profiles` : un document par enfant d'un compte (prénom, pastille). Le champ `avatar` garde l'une des 12 valeurs de `AVATARS` (d'anciens emojis d'animaux) : l'app n'affiche plus l'emoji, mais une pastille de papier de couleur avec l'initiale de l'enfant (`Avatar` dans `src/components/paper.tsx`).
- `highscores` : un document par partie (tables, mode, score, temps moyen).
- `operation_responses` : un document par réponse (calcul, réponse donnée, juste ou faux, temps).

### Comptes et profils

Un compte Google est une famille : un parent se connecte, puis chaque enfant choisit son profil (« Qui joue ? », à chaque ouverture dès qu'il y a plusieurs enfants, et après 15 minutes en arrière-plan). Les parties et réponses portent le profil de l'enfant (`profileId`).

Celles enregistrées avant l'arrivée des profils n'en ont pas : elles appartiennent au profil marqué `legacy`, le premier créé sur le compte. Au premier passage, l'app demande à quel enfant elles reviennent. Rien n'est réécrit en ligne.

Dans « Gérer les profils », on peut aussi remettre un enfant à zéro (ses parties et réponses sont effacées, son profil reste) ou supprimer son profil. Dans les deux cas, il faut écrire son prénom pour confirmer. Ce sont les seuls boutons d'effacement pour un compte : le rapport et les records n'en ont pas. Sans compte, le rapport garde un bouton « Réinitialiser » qui efface tout ce que l'invité a joué sur l'appareil.

### Règles de sécurité

Elles sont dans `firestore.rules` : chaque compte ne lit et ne supprime que ses propres documents, parties et réponses ne se modifient jamais, et chaque champ est contrôlé. Seuls le prénom et la pastille (`avatar`) d'un profil peuvent changer. Si vous changez la forme d'un document, modifiez aussi ces règles et `tests/firestore.rules.test.ts`.

### Dans le navigateur

Un tiroir par compte (`mm:v2:ops:<compte>`, `mm:v2:scores:<compte>`) garde les parties d'un invité, ou celles d'un compte connecté qui n'ont pas encore pu être envoyées en ligne. Les profils (`mm:v2:profiles:<compte>`), les réglages de l'accueil par enfant (`mm:v2:prefs:<compte>:<profil>`) et le son (`mm:v2:muted`) y sont aussi mémorisés.

## Connexion Google

Sur ses adresses Firebase Hosting (`web.app` et `firebaseapp.com`), l'app se connecte en passant par sa propre adresse
(`/__/auth/handler`, servi par Firebase Hosting) et non par le domaine `authDomain` de la configuration :
Safari et Chrome sur iPhone isolent les données d'un autre domaine, et la connexion échouait.
Sur téléphone et depuis l'icône de l'écran d'accueil, la connexion se fait par redirection ;
sur iPad dans Safari et sur ordinateur, dans une fenêtre surgissante.

Chaque adresse utilisée doit figurer dans les « URI de redirection autorisés » du client OAuth « Web client (auto created by Google Service) » de la console Google Cloud, sous la forme `https://<adresse>/__/auth/handler`.

## Licence

Le code de l'app est sous licence MIT (`LICENSE`). La police Chillax appartient à Indian Type Foundry : elle est
sous ITF Free Font License, qui permet de l'héberger sur son propre site mais pas de la redistribuer. Elle n'est
donc pas dans ce dépôt.
