// Configuration ESLint (flat config, ESLint 9+).
// Objectif étape 0 : repérer le code mort et les vraies erreurs (variables/fonctions
// non définies) SANS imposer le style (Prettier s'en charge). Les fichiers tiers
// (vendor) et générés (dist) sont exclus.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'site/opening-neural-poc/vendor/**', // tiers : chess.js, stockfish
      'site/pieces/**',
    ],
  },
  js.configs.recommended,
  {
    // Code du jeu : module ES exécuté dans le navigateur (+ un Web Worker).
    files: ['site/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
    rules: {
      // Code mort : on le veut visible (warning), pas bloquant pour l'instant.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Vraies erreurs : référence à une fonction/variable inexistante (typo) → bloquant.
      'no-undef': 'error',
      // Bruit toléré le temps du nettoyage progressif (warnings, non bloquants).
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-extra-boolean-cast': 'warn',
    },
  },
  {
    // Scripts de build (Node).
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
