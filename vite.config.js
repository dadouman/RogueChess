import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// L'app vit dans site/opening-neural-poc. Vite la sert à la racine ('/') : les
// assets non bundlés (moteur Stockfish, pièces, livre d'ouverture) sont dans
// public/ et restent servis tels quels (/engine, /pieces, /opening-graph.json).
export default defineConfig({
  root: path.join(repoRoot, 'site/opening-neural-poc'),
  base: '/',
  build: {
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
    // Le .wasm de Stockfish (7 Mo) vit dans public/, pas dans le bundle.
    chunkSizeWarningLimit: 1200
  }
});
