# Étape 0 — Hygiène / outillage (POC → produit)

Branche `chore/step0-tooling`. **Objectif : aucun changement de comportement**, uniquement
de l'outillage **additif** (nouveaux fichiers + `package.json`). Aucune modification de
`app.js` / `styles.css` / `index.html` pour ne pas entrer en conflit avec le travail en
cours sur `main`.

## Fait dans cette branche

| Outil | Fichier | Rôle |
|---|---|---|
| **ESLint 9** (flat config) | `eslint.config.js` | Repère le code mort + les références cassées (`no-undef`). Globals navigateur + worker. Vendor/dist exclus. |
| **Prettier 3** | `.prettierrc.json`, `.prettierignore` | Fige le style (single quotes, 2 espaces, printWidth 100). **Pas encore appliqué** (voir ci-dessous). |
| **CI GitHub Actions** | `.github/workflows/ci.yml` | `npm ci` → lint → format:check (non bloquant) → build, sur push `main` et PR. |
| **Scripts npm** | `package.json` | `lint`, `lint:fix`, `format`, `format:check`. devDeps ajoutées. |

### Vérifié
- `npm run lint` → **exit 0** (8 warnings, 0 erreur) → CI verte.
- `npm run build` → OK (copie statique vers `dist/`).

### Code mort remonté par ESLint (à supprimer au prochain passage sur `app.js`)
À nettoyer quand le travail parallèle se calme (évite les conflits) :

- `hashString` (l.307)
- `graphNearestNode` (l.2294)
- `renderAdvOpeningCarousel` (l.8368) — ancien carrousel boutique remplacé
- `SHOP_LINE_BOOST_COST` (l.9525), `OPENING_DECK_SIZE` (l.9562) — constantes orphelines
- `advFormatOpponentGroup` (l.10491)
- `launchBrainLesson` (l.12804)
- `err` non utilisé (l.6450) ; `Boolean()` redondant (l.12264)

## Reporté volontairement (à faire pendant un gel du code)

Ces deux chantiers touchent massivement les 3 gros fichiers → **conflits catastrophiques**
avec le travail parallèle. À planifier quand `main` est stable.

### 1. Passage à Prettier (reformat unique)
`npm run format` reformatera tout le code en une fois. À faire **en un seul commit dédié**,
quand personne d'autre n'édite, puis retirer `continue-on-error` du job `format:check` de
la CI pour le rendre bloquant.

### 2. Découpage de `app.js` (13 000 lignes → ~20 modules ES)
Découpage mécanique par domaine (couper/coller + `import`/`export`), comportement identique :

```
engine/stockfish.js        book/graph.js          game/rules.js
adventure/lives.js         adventure/shop.js      adventure/influence.js
adventure/revision.js      adventure/tournament.js adventure/history.js
ui/board.js  ui/strip.js   ui/hud.js  ui/map.js   persistence.js  state.js
```

### 3. (Étape 0 bis) Vite — non fait, à évaluer
Le setup est déjà en modules ES (`import { Chess }`, worker via `new URL(..., import.meta.url)`
= pattern natif Vite). Vite supprimerait le cache-busting manuel `?v=N`. **Point de
vigilance** : Stockfish charge son `.wasm` (7,3 Mo) lui-même — vérifier que le bundling ne
casse pas ce chargement (spike + test moteur requis avant migration).

## Pourquoi pas tout maintenant
Le travail produit parallèle continue sur `main` (features de jeu, `?v=` ~51). Cette branche
reste donc **100 % additive et mergeable à tout moment** : configs + CI seulement. Les
chantiers à fort risque de conflit (reformat, split, Vite) sont documentés ici pour être
exécutés lors d'un gel du code.
