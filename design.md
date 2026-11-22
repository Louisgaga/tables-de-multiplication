# Design : Mes tables de Multiplication

Les règles visuelles communes à tous les écrans. Pour en changer une, modifiez d'abord ce fichier, puis les écrans.

## Système
- Genre : playful. Écrans d'application (pas de page vitrine).
- Thème : Hum, de Hallmark (https://github.com/nutlope/hallmark). Du papier découpé à la main : papier crème à grain, feuilles au bord déchiré, carton qu'on enfonce, lumière venue d'en haut à gauche.
- Axes : light/rounded-sans/chromatic-yellow · posture : full-palette.
- Public : des enfants de 7 à 10 ans sur un iPad partagé, et leurs parents pour le rapport.

## Jetons
`src/index.css` (bloc `@theme`) est la source. Jamais de couleur ni de police en dur dans un composant, jamais de classe de la palette Tailwind (`gray-*`, `amber-*`, `rose-*`…).

| Rôle | Classes |
| --- | --- |
| Papier de la page (grain posé sur `body`) | `bg-paper`, plus foncé : `bg-paper-2`, `bg-paper-3` |
| Carte, carton | `bg-card` (ou la classe `sheet`) |
| Texte | `text-ink`, secondaire `text-muted` (jamais sur kraft, poire, menthe ou corail : là, `text-ink`) |
| Action principale et le seul champ poire d'un écran | `bg-accent`, texte `text-accent-ink` |
| Choix en cours | encre : `bg-ink text-paper` |
| Réussite, progrès (menthe) | `bg-success`, texte `text-success-ink`, fond pâle `bg-success-soft` |
| Erreur (corail), un seul moment fort par écran | `bg-error`, texte `text-error-ink`, fond pâle `bg-error-soft` |
| « On travaille » (ambre), seulement dans la grille et les cases « Par table » du rapport | `bg-warn`, texte `text-ink` |
| Effacer | `bg-danger text-white` |
| Liens et focus (bleu) | `text-info-ink`, anneau de focus global, ne pas le redéfinir |
| Papiers d'appoint | `bg-strip` (bande kraft claire), `bg-kraft`, `bg-sand`, `bg-sugar` |
| Traits | `border-line`, bord du carton `border-edge` |

Police : Chillax partout, deux graisses. `font-bold` et moins = 500, `font-black` / `font-extrabold` = 600. Titres en 600, une seule couleur par titre. Libellés en 500, un cran plus petit, jamais en capitales, jamais espacés. Plus petit texte : `text-xs` (13 px). Chiffres en colonnes : `tabular-nums`.

Rayons : feuilles `rounded-[28px]`, carton `rounded-2xl` (16 px), champs 14 px. Aucun coin carré.

## Contrôles (classes de `src/index.css`)
- `btn` : bouton en carton (bord plein de 5 px dessous, s'enfonce à l'appui, marge basse de 5 px comprise). On ajoute la hauteur et le remplissage : `btn h-12 px-4 text-sm`.
- `btn btn-primary` : l'action principale, poire. Une seule par écran.
- `btn btn-chosen` : le choix en cours d'un groupe (encre, texte papier, reste enfoncé).
- `btn btn-danger` : effacer.
- `field` : champ de saisie de 52 px.
- `hl` : surligneur poire derrière les mots qui comptent, jamais dans un titre.
- `sticker` : autocollant découpé, un seul par écran (ajouter le fond : `sticker bg-success text-ink`).
- `sheet` : carte posée à plat. `stock` : le grain du papier sur un fond de couleur.
- Cibles tactiles : 44 px au moins. Jamais de `scale` à l'appui, jamais de `transition-all`.

## Pièces partagées (`src/components/paper.tsx`)
- `<Sheet tone torn seed className>` : feuille au bord déchiré. `tone` : `card`, `pear`, `strip`, `kraft`, `ink`, `sugar`, `coral`, `mint`. `torn` : `bottom` (défaut), `top`, `both`, `none`. Le remplissage se met dans `className`. Deux feuilles voisines prennent deux `seed` différents.
- `<Medal medal size label>` : pastille de papier bronze, argent ou or ; rond en pointillés sans médaille.
- `<Avatar avatar name size>` : pastille de profil, un papier de couleur et l'initiale de l'enfant. `AVATAR_TONES` et `avatarTone()` donnent la couleur de chaque valeur de `AVATARS`.

## Règles
- Aucun emoji, nulle part. Les icônes `lucide-react` ne servent qu'aux contrôles sans texte (son, effacer, retour, fermer).
- La mascotte (`Mascot.tsx`) reste, seul personnage dessiné.
- Pas de carte dans une carte : les sections sont des feuilles posées côte à côte sur le papier, ou séparées par un trait dans une même feuille.
- Les chiffres du produit en grand (Chillax 600, `tabular-nums`), leur unité dessous en 500. Des tableaux avant des cartes pour les listes.
- Poire : un seul champ par écran, plus le bouton principal. Jamais de dégradé entre deux couleurs.
- Mouvement : `translate` et `opacity` seulement, 120 à 220 ms. Seul le bouton principal rebondit.

## Exports
`src/index.css`, bloc `@theme` (Tailwind 4).
