// Cadences & horloges Aventure : configuration des contrôles de temps, tirage du
// temps de réflexion de Stockfish (loi normale) et formatage de la pendule.
// Dépend de l'état (cadence perso), de clamp et de la table des cadences.
import { state } from './state.js';
import { clamp } from './utils.js';
import { TIME_CONTROLS } from './adventure-config.js';

// U — Cadences : pendule des deux côtés. baseMs = temps total par camp ;
// meanMs = temps moyen consommé par Stockfish à chaque coup. Le temps réel
// consommé par Stockfish suit une loi normale d'écart-type σ = meanMs × 2.
export function getTimeControlConfig(id) {
  // Cadence personnalisée : durée librement réglée par le joueur (en minutes).
  if (id === 'custom') {
    const minutes = clamp(Number(state.adventure?.customClockMinutes) || 10, 0.5, 180);
    const baseMs = Math.round(minutes * 60000);
    // Temps moyen de réflexion de Stockfish dérivé de la cadence (~0,6 s/minute,
    // cohérent avec bullet/blitz/rapide). σ = moyenne×2 comme partout.
    const meanMs = Math.max(300, Math.round(minutes * 600));
    return { id: 'custom', label: 'Perso', icon: '🎛️', baseMs, meanMs };
  }
  return TIME_CONTROLS.find((tc) => tc.id === id) || TIME_CONTROLS[0];
}

// Tirage gaussien (Box-Muller).
function gaussianRandom(mean, sd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Temps consommé par Stockfish pour un coup : loi normale (moyenne meanMs,
// σ = meanMs × 2), bornée à un minimum positif.
export function sampleStockfishMoveTime(tc) {
  if (!tc || tc.meanMs <= 0) {
    return 0;
  }
  return Math.max(150, gaussianRandom(tc.meanMs, tc.meanMs * 2));
}

// Format horloge : mm:ss au-dessus de 20 s, s.d en dessous (pression du temps).
export function formatClock(ms) {
  const clamped = Math.max(0, ms || 0);
  if (clamped >= 20000) {
    const totalSec = Math.ceil(clamped / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${(clamped / 1000).toFixed(1)}`;
}
