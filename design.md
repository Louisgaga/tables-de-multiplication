# Design

Thème Hum de [Hallmark](https://github.com/nutlope/hallmark) : papier crème à grain, feuilles au bord déchiré, boutons en carton qui s'enfoncent.

## Jetons

Ils sont dans `src/index.css` (bloc `@theme`). Pas de couleur en dur, pas de classe de la palette Tailwind (`gray-*`…).

| Rôle | Classes |
| --- | --- |
| Papier | `bg-paper`, `bg-paper-2`, `bg-paper-3` |
| Carte | `bg-card` ou `sheet` |
| Texte | `text-ink`, `text-muted` (jamais sur un fond de couleur) |
| Action principale (poire) | `bg-accent`, `text-accent-ink` |
| Choix en cours (encre) | `bg-ink text-paper` |
| Réussite (menthe) | `bg-success`, `text-success-ink`, `bg-success-soft` |
| Erreur (corail) | `bg-error`, `text-error-ink`, `bg-error-soft` |
| « On travaille » (ambre, rapport seulement) | `bg-warn` |
| Effacer | `bg-danger text-white` |
| Liens et focus (bleu) | `text-info-ink` |
| Traits | `border-line`, `border-edge` |

Police : Chillax, deux graisses, 500 (`font-bold` et moins) et 600 (`font-black`). Pas de capitales dans les libellés.

## Classes

- `btn` : bouton en carton. `btn-primary` : l'action principale, une seule par écran. `btn-chosen` : le choix en cours. `btn-danger` : effacer.
- `field` : champ de saisie. `sticker` : autocollant, un seul par écran. `sheet` : carte posée à plat.
- `paper.tsx` : `<Sheet>` (feuille déchirée), `<Medal>`, `<Avatar>` (pastille de profil).

## Règles

- Pas d'emoji. La mascotte est le seul personnage dessiné.
- Pas de carte dans une carte.
- Cibles tactiles de 44 px au moins.
- Animations : `translate` et `opacity` seulement.
