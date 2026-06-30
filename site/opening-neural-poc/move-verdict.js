// Verdicts de qualité de coup (L), façon Lichess, sur les coups BLANCS (ceux du
// joueur), selon la perte d'évaluation par rapport au meilleur coup. Sert au retour
// en jeu (coloration du coup joué) et à l'analyse a posteriori d'une partie d'arène
// (précision, compteurs par verdict, commentaires). Données + un peu de DOM pour le
// bandeau de stats ; dépend de helpers feuilles. Acyclique, pas de DI.
import { isMateScore } from './chess-utils.js';
import { formatEval } from './eval-commentary.js';

const MOVE_VERDICTS = {
  brilliant: { label: 'Brillant', short: '✦', cls: 'brilliant' },
  good: { label: 'Bon', short: '✓', cls: 'good' },
  inaccuracy: { label: 'Imprécision', short: '?!', cls: 'inaccuracy' },
  mistake: { label: 'Erreur', short: '?', cls: 'mistake' },
  blunder: { label: 'Gaffe', short: '??', cls: 'blunder' },
  book: { label: 'Livre', short: '📖', cls: 'book' }
};
const MOVE_VERDICT_LOSS = { inaccuracy: 50, mistake: 100, blunder: 200 };
const MOVE_BRILLIANT_GAIN = 200; // gain d'éval (cp) pour un coup « brillant »
const MOVE_BRILLIANT_MIN_CP = 300; // position nettement gagnante après le coup

function advMoveVerdict(entry) {
  if (!entry || entry.color !== 'w') {
    return null;
  }
  if (entry.phase === 'opening') {
    return { key: 'book', ...MOVE_VERDICTS.book };
  }
  if (entry.phase !== 'free') {
    return null; // suite Stockfish / variantes d'analyse : pas de verdict joueur
  }
  if (!Number.isFinite(entry.beforeEvalCp) || !Number.isFinite(entry.afterEvalCp)) {
    return null;
  }
  const before = entry.beforeEvalCp;
  const after = entry.afterEvalCp;
  // Coup brillant : ton coup crée un mat forcé, ou gagne décisivement (gros gain
  // d'éval vers une position nettement gagnante).
  const createsMate = isMateScore(after) && after > 0 && !(isMateScore(before) && before > 0);
  const decisiveGain = after - before >= MOVE_BRILLIANT_GAIN && after >= MOVE_BRILLIANT_MIN_CP;
  if (createsMate || decisiveGain) {
    return { key: 'brilliant', loss: 0, ...MOVE_VERDICTS.brilliant };
  }
  const loss = before - after; // perte d'éval côté blanc
  let key = 'good';
  if (loss >= MOVE_VERDICT_LOSS.blunder) {
    key = 'blunder';
  } else if (loss >= MOVE_VERDICT_LOSS.mistake) {
    key = 'mistake';
  } else if (loss >= MOVE_VERDICT_LOSS.inaccuracy) {
    key = 'inaccuracy';
  }
  return { key, loss, ...MOVE_VERDICTS[key] };
}

function advStoredVerdict(move) {
  return advMoveVerdict({
    color: move.color,
    phase: move.phase,
    beforeEvalCp: move.before,
    afterEvalCp: move.after
  });
}

// Précision : part des coups BLANCS du joueur sans faute (bon / livre).
function advGameAccuracy(moves) {
  const whiteMoves = (moves || []).filter(
    (m) => m.color === 'w' && (m.phase === 'free' || m.phase === 'opening')
  );
  if (!whiteMoves.length) {
    return null;
  }
  let clean = 0;
  for (const m of whiteMoves) {
    const verdict = advStoredVerdict(m);
    if (verdict && ['good', 'book', 'brilliant'].includes(verdict.key)) {
      clean += 1;
    }
  }
  return Math.round((clean / whiteMoves.length) * 100);
}

// L — Compte les coups BLANCS par verdict (brillant/bon/imprécision/erreur/gaffe).
function advMoveStatsFromStored(moves) {
  const counts = { brilliant: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, book: 0 };
  let total = 0;
  for (const m of moves || []) {
    const verdict = advStoredVerdict(m);
    if (!verdict) {
      continue;
    }
    counts[verdict.key] = (counts[verdict.key] || 0) + 1;
    total += 1;
  }
  return { counts, total };
}

// Bandeau d'analyse de fin de partie : compteurs par verdict + précision.
function buildMoveStatsRow(moves) {
  const { counts, total } = advMoveStatsFromStored(moves);
  if (!total) {
    return null;
  }
  const wrap = document.createElement('div');
  wrap.className = 'adv-analysis';
  // « Bon coup » regroupe les coups solides + les coups de livre.
  const tiers = [
    { key: 'brilliant', n: counts.brilliant },
    { key: 'good', n: counts.good + counts.book },
    { key: 'inaccuracy', n: counts.inaccuracy },
    { key: 'mistake', n: counts.mistake },
    { key: 'blunder', n: counts.blunder }
  ];
  for (const tier of tiers) {
    const v = MOVE_VERDICTS[tier.key];
    const stat = document.createElement('span');
    stat.className = `adv-analysis-stat is-${v.cls}`;
    stat.innerHTML = `<i>${v.short}</i> ${tier.n}`;
    stat.title = `${v.label} : ${tier.n}`;
    wrap.append(stat);
  }
  const acc = advGameAccuracy(moves);
  const accEl = document.createElement('span');
  accEl.className = 'adv-analysis-accuracy';
  accEl.textContent = `Précision ${acc == null ? '—' : `${acc} %`}`;
  wrap.append(accEl);
  return wrap;
}

function buildStoredMoveComment(move) {
  const verdict = advStoredVerdict(move);
  const label =
    verdict && verdict.key !== 'good' && verdict.key !== 'book' ? `${verdict.label}. ` : '';
  const evalTxt =
    move.before != null && move.after != null
      ? `Éval ${formatEval(move.before)} → ${formatEval(move.after)}.`
      : '';
  const best =
    move.best && verdict && ['inaccuracy', 'mistake', 'blunder'].includes(verdict.key)
      ? ` Meilleur coup : ${move.best}.`
      : '';
  return `${label}${evalTxt}${best}`.trim() || 'Coup joué.';
}

export {
  advMoveVerdict,
  advStoredVerdict,
  advGameAccuracy,
  buildMoveStatsRow,
  buildStoredMoveComment
};
