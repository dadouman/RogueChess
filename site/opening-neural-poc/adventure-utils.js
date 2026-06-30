// Utilitaires purs du mode Aventure : aucune dépendance à l'état ni au DOM.
// Score de rapidité, mélange aléatoire, génération d'options de quiz (via chess.js),
// formatage de durée relative, étoiles textuelles, tirage pondéré d'un coup de livre.
import { clamp, randomUnit } from './utils.js';
import { Chess } from './vendor/chess.js';

function advScoreTimePoints(elapsedMs) {
  const sec = (Number(elapsedMs) || 30000) / 1000;
  if (sec <= 1) {
    return 100;
  }
  if (sec >= 30) {
    return 1;
  }
  return Math.round(100 - ((sec - 1) * 99) / 29);
}

function advShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomUnit() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Options d'un quiz : coup correct + 2 leurres légaux, à une position (leadSans).
function advQuizOptions(leadSans, correctUci) {
  let chess;
  try {
    chess = new Chess();
  } catch {
    return [];
  }
  for (const s of leadSans) {
    try {
      if (!chess.move(s)) return [];
    } catch {
      return [];
    }
  }
  const all = chess
    .moves({ verbose: true })
    .map((m) => ({ uci: m.from + m.to + (m.promotion || ''), san: m.san }));
  const correct = all.find((o) => o.uci === correctUci);
  if (!correct) {
    return [];
  }
  const decoys = advShuffle(all.filter((o) => o.uci !== correctUci)).slice(0, 2);
  return advShuffle([correct, ...decoys]);
}

// Date relative compacte pour l'historique.
function advFormatRelativeTime(ts) {
  const diff = Date.now() - (Number(ts) || 0);
  if (diff < 60_000) {
    return "à l'instant";
  }
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) {
    return `il y a ${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `il y a ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function advStarString(count) {
  const filled = clamp(Math.round(count), 0, 3);
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
}

// Tirage pondéré d'une arête de livre (par probabilité) pour l'ouverture simulée.
function advPickBookEdge(edges) {
  const total = edges.reduce((s, e) => s + (Number(e.probability) || 0), 0);
  if (total <= 0) {
    return edges[Math.floor(randomUnit() * edges.length)];
  }
  let roll = randomUnit() * total;
  for (const e of edges) {
    roll -= Number(e.probability) || 0;
    if (roll <= 0) {
      return e;
    }
  }
  return edges[edges.length - 1];
}

export {
  advScoreTimePoints,
  advShuffle,
  advQuizOptions,
  advFormatRelativeTime,
  advStarString,
  advPickBookEdge
};
