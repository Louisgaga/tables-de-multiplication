# Mes tables de Multiplication

Une app web pour réviser les tables de multiplication, pour les enfants de 7 à 10 ans, sur iPad, téléphone ou ordinateur.

En ligne : https://mes-tables-de-multiplication.web.app

## Lancer l'app

Il faut Node.js.

```bash
npm install
cp firebase-applet-config.example.json firebase-applet-config.json
npm run dev
```

L'app s'ouvre sur http://localhost:3000. Avec la configuration d'exemple, seul le jeu sans compte fonctionne. Pour la police, voir `public/fonts/chillax/LISEZMOI.md`.

## Installer votre propre version

L'app tourne sur Firebase (Hosting, Authentication, Firestore). L'offre gratuite suffit.

1. Dans la console Firebase, créez un projet et une application Web.
2. Copiez sa configuration dans `firebase-applet-config.json`.
3. Activez la connexion Google dans Authentication.
4. Créez la base Firestore. Renseignez la base et le site dans `firebase.json`, le projet dans `.firebaserc`.
5. Publiez :

   ```bash
   npx firebase-tools deploy --only firestore:rules
   npx firebase-tools deploy --only hosting
   ```

6. Dans la console Google Cloud, ajoutez `https://<adresse du site>/__/auth/handler` aux « URI de redirection autorisés » du client OAuth Web.

## Tester

```bash
npm run lint        # types
npm test            # tests
npm run test:rules  # règles Firestore (il faut Java)
```

Pour tester les comptes sans toucher à la vraie base :

```bash
npm run emulators   # il faut Java
npm run dev:test    # http://localhost:3001
```

Puis, dans la console du navigateur : `__signInAs("Famille Test")`.

## Code

- `src/App.tsx` : enchaînement des écrans.
- `src/components/` : un fichier par écran, plus le pavé, les graphiques et les pièces du thème (`paper.tsx`).
- `src/utils/stats.ts` : tirage des questions, maîtrise, médailles.
- `src/utils/report.ts` : calculs du rapport.
- `src/utils/history.ts` et `profiles.ts` : les seuls fichiers qui parlent à la base.
- `firestore.rules` : chaque compte ne lit que ses propres données. À modifier avec `tests/firestore.rules.test.ts`.

La mise en page de l'iPad est la référence. Le téléphone a ses propres variantes Tailwind (`max-sm:`, `short:`, `phone-land:`), qui ne touchent pas l'iPad.

Le design est décrit dans `design.md`.

## Règles du jeu

- Un calcul est **maîtrisé** quand ses 3 dernières réponses sont justes, en 10 secondes en moyenne au plus. 7 × 8 et 8 × 7 sont deux calculs.
- **Médailles** : bronze, argent et or quand 5, 8 ou 10 calculs de la table sont maîtrisés dans les deux sens.
- **Mes points faibles** : 60 % de calculs à travailler, 20 % de nouveaux, 20 % de révisions.
- **Erreur** : l'enfant recopie la bonne réponse, et le calcul revient 3 questions plus tard.
- **Évaluation** : 30 calculs, 15 secondes chacun, sans seconde chance.

## Licence

Code sous licence MIT. La police Chillax (Indian Type Foundry) n'est pas dans le dépôt : sa licence en interdit la redistribution.
