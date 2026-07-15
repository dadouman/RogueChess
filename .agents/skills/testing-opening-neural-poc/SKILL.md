---
name: testing-opening-neural-poc
description: Smoke-test the RogueChess opening-neural-poc app (Mode Aventure + Mode Créatif graph) after refactors/module extractions. Use when verifying behavior-identical changes to site/opening-neural-poc/app.js and its extracted modules.
---

# Testing RogueChess opening-neural-poc

The game lives in `site/opening-neural-poc/`. `app.js` is being split into ES modules
(`utils.js`, `chess-utils.js`, `graph-view-model.js`, `board-arrows.js`, `svg.js`,
`level-objective.js`, `ui-settings.js`, `engine.js`, ...). Most PRs are mechanical
"move a helper into a module + import it back" — so testing = prove behavior is identical
and no `ReferenceError` was introduced by a bad import move.

## Build / lint / validate (always run first)
From repo root:
- `npm run lint`  (eslint; `no-undef` MUST stay 0 — this catches broken import moves)
- `npm run format:check`  (prettier; run `npx prettier --write <files>` if it flags)
- `npm run build`  (vite; the "Node 20.18.1 below 20.19+" warning is harmless, build still succeeds)

## Run locally for UI testing
- `npx vite preview --port 4173 --host` (after `npm run build`), open `http://localhost:4173/`.
- IMPORTANT: locally the app serves from root `/`, so relative fetches resolve.
  The deployed Cloudflare preview is at subpath `/opening-neural-poc/` — historically a
  `fetch('./opening-graph.json')` bug broke buttons there (fixed to absolute `/opening-graph.json`).
  If testing the deployed preview and buttons are dead, suspect subpath/asset-path issues.

## UI paths
- Home screen has two cards: **Mode Aventure** (Jouer ▸) and **Mode Créatif** (Ouvrir ▸).
- **Mode Créatif** is the full graph workspace: left panel = graph settings + PGN import,
  center = board, right = neural graph SVG. Stats (Nœuds/Arcs/Branches) are at the bottom
  of the left panel (scroll down).
- Default book = "Survie italienne" = **165 nodes / 165 arcs / 10 branches**.

## High-signal assertions (adversarial)
- **Graph render**: after opening Mode Créatif, `svg[aria-label="Graphe des coups d'ouverture"]`
  has many `circle` (~78) and `path` (~53) children; stats show 165/165. Verify via
  `browser_console`: `document.querySelector('svg[aria-label=...]').querySelectorAll('circle').length`.
- **cloneGraphData path** (great for testing graph helper moves): type a tiny PGN like
  `[Event "t"]\n\n1. e4 e5 2. Nf3 Nc6 *` into the Importer PGN textarea, click **Construire**
  (graph drops to ~5 nodes / 4 arcs), then click **Livre italien** → must restore to
  **165 nodes / 165 arcs**. A broken `cloneGraphData` import would throw and NOT restore.
- **Console must be clean**: check `browser_console` for `ReferenceError`/`is not defined`.
  This is the single most important check for import-move refactors.

## Notes
- The `computer` tool returns an annotated DOM alongside the screenshot; the home overlay
  can sit on top of the Créatif workspace — click "Ouvrir ▸" to bring the graph forward.
- Merges into `main` are blocked by policy for Devin; the user merges PRs manually.

## Devin Secrets Needed
- None. Everything runs locally with a plain `npm` toolchain; no credentials required.
