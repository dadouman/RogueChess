// Micro-helpers DOM partagés : écriture de texte / largeur par sélecteur.
// Utilisés un peu partout dans l'UI Aventure (et les modules qui en sont issus).
import { clamp } from './utils.js';

export function advSetText(selector, text) {
  const el = document.querySelector(selector);
  if (el) {
    el.textContent = text;
  }
}

export function advSetWidth(selector, pct) {
  const el = document.querySelector(selector);
  if (el) {
    el.style.width = `${clamp(pct, 0, 100)}%`;
  }
}
