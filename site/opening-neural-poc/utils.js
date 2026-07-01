// Helpers purs (sans état, sans DOM) — feuilles du graphe de dépendances.
// Importés par app.js et les modules de logique (engine…).

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatPercent(value) {
  const percent = Math.round(value * 100);
  if (value > 0 && percent === 0) {
    return '<1%';
  }
  return `${percent}%`;
}

export function sideLabel(side) {
  if (side === 'w') {
    return 'Blancs';
  }
  if (side === 'b') {
    return 'Noirs';
  }
  return '-';
}

export function sanPieceLetter(san) {
  const s = String(san ?? '');
  if (/^O-O/.test(s)) {
    return 'K';
  }
  const m = s.match(/^([NBRQK])/);
  return m ? m[1] : 'P';
}

// Couleur qui joue le i-ème coup d'une séquence compressée (alternance depuis edge.color).
export function moveColorAt(edge, index) {
  const first = edge.color === 'b' ? 'b' : 'w';
  return index % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function pause(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function randomThinkMs(minMs, maxMs) {
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

export function randomUnit() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }
  return Math.random();
}

export function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function cloneGraphData(data) {
  return JSON.parse(JSON.stringify(data));
}
