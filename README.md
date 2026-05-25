# RogueChess

Prototype web statique du mode solo d'ouverture italienne.
Le site peut aussi importer un PGN depuis le navigateur pour générer un nouveau graphe jouable sans backend.

## Lancer en local

```powershell
npm run dev
```

Puis ouvrir `http://127.0.0.1:5173/opening-neural-poc/`.

## Build statique

```powershell
npm run build
```

Le dossier `dist/` peut être déployé tel quel sur Cloudflare Pages, Vercel, Netlify ou GitHub Pages.

## Déploiement conseillé

- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Path: `/`
- Entry point: `/opening-neural-poc/`

Le POC embarque `chess.js`, Stockfish Lite WASM, le graphe d'ouverture généré et les pièces Merida nécessaires à l'échiquier.
