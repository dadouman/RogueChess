// Commentaire d'évaluation : transforme une position (FEN) et une évaluation
// moteur en phrases françaises lisibles (matériel, sécurité du roi, activité,
// pions passés…) pour les bandeaux d'analyse et les écrans de défaite. Pur :
// FEN/éval en entrée, texte en sortie. Dépend de chess.js et de helpers de bas
// niveau (constante de mat, libellé de camp, décodage du score de mat).
import { Chess } from './vendor/chess.js';
import { MATE_SCORE_CP } from './constants.js';
import { sideLabel } from './utils.js';
import { mateMovesFromCp } from './chess-utils.js';

const MATERIAL_VALUES_CP = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900
};
const PIECE_LABELS = {
  p: ['pion', 'pions'],
  n: ['cavalier', 'cavaliers'],
  b: ['fou', 'fous'],
  r: ['tour', 'tours'],
  q: ['dame', 'dames']
};

export function formatEval(cpWhite) {
  if (!Number.isFinite(cpWhite)) {
    return '-';
  }
  if (Math.abs(cpWhite) >= MATE_SCORE_CP - 1000) {
    const x = mateMovesFromCp(cpWhite);
    return cpWhite > 0 ? `Mat blanc en ${x}` : `Mat noir en ${x}`;
  }
  return `${cpWhite >= 0 ? '+' : ''}${(cpWhite / 100).toFixed(2)}`;
}

export function formatEvalDelta(deltaCp) {
  if (!Number.isFinite(deltaCp)) {
    return '-';
  }
  return `${deltaCp >= 0 ? '+' : ''}${(deltaCp / 100).toFixed(2)}`;
}

/** Convertit une éval (centipions, côté blanc) en pourcentage [0..100] pour la barre. */
export function evalToBarPct(cpWhite) {
  const v = Math.max(-1200, Math.min(1200, Number(cpWhite) || 0));
  return Math.round((Math.tanh(v / 400) + 1) * 50);
}

function formatPieceCount(piece, count) {
  const [singular, plural] = PIECE_LABELS[piece] ?? ['pièce', 'pièces'];
  if (count === 1) {
    const article = piece === 'b' || piece === 'n' || piece === 'p' ? 'un' : 'une';
    return `${article} ${singular}`;
  }
  if (count === 2) {
    return `deux ${plural}`;
  }
  return `${count} ${plural}`;
}

export function joinHumanList(items) {
  if (!items.length) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function summarizeMaterial(fen) {
  const counts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
  };
  const board = fen.split(/\s+/)[0] ?? '';

  for (const char of board) {
    const piece = char.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MATERIAL_VALUES_CP, piece)) {
      continue;
    }
    const color = char === char.toUpperCase() ? 'w' : 'b';
    counts[color][piece] += 1;
  }

  let cpWhite = 0;
  const deficits = [];
  const surpluses = [];
  for (const piece of Object.keys(MATERIAL_VALUES_CP)) {
    const delta = counts.w[piece] - counts.b[piece];
    cpWhite += delta * MATERIAL_VALUES_CP[piece];
    if (delta < 0) {
      deficits.push({ piece, count: Math.abs(delta) });
    } else if (delta > 0) {
      surpluses.push({ piece, count: delta });
    }
  }

  return { cpWhite, deficits, surpluses };
}

function materialEquivalent(absCp) {
  if (absCp < 80) {
    return 'moins d’un pion';
  }
  if (absCp < 180) {
    return 'environ un pion';
  }
  if (absCp < 290) {
    return 'environ deux pions';
  }
  if (absCp < 430) {
    return 'environ une pièce légère';
  }
  if (absCp < 680) {
    return 'environ une tour';
  }
  if (absCp < 950) {
    return 'environ une tour et une pièce légère';
  }
  return 'environ une dame ou plus';
}

function materialComment(fen) {
  const material = summarizeMaterial(fen);
  if (material.cpWhite < -70) {
    const missing = material.deficits.map(({ piece, count }) => formatPieceCount(piece, count));
    const detail = missing.length
      ? ` Il manque notamment ${joinHumanList(missing)} côté blanc.`
      : '';
    return `Matériellement, les Blancs accusent ${materialEquivalent(Math.abs(material.cpWhite))}.${detail}`;
  }
  if (material.cpWhite > 70) {
    const surplus = material.surpluses.map(({ piece, count }) => formatPieceCount(piece, count));
    const detail = surplus.length ? ` Les Blancs ont même ${joinHumanList(surplus)} de plus.` : '';
    return `Le matériel n'explique pas la défaite.${detail} Le problème vient surtout de la sécurité du roi, de l'activité ou d'une menace tactique.`;
  }
  return "Le matériel est presque égal: la défaite vient plutôt d'une faiblesse tactique, du roi exposé ou d'une suite forcée.";
}

function getAdvantageLevel(absCp) {
  if (absCp < 40) {
    return { level: 'équilibrée', danger: 0 };
  }
  if (absCp < 120) {
    return { level: 'léger avantage', danger: 1 };
  }
  if (absCp < 250) {
    return { level: 'avantage net', danger: 2 };
  }
  if (absCp < 500) {
    return { level: 'gros avantage', danger: 3 };
  }
  return { level: 'position probablement gagnante', danger: 3 };
}

function formatAdvantagePhrase(level) {
  return level === 'position probablement gagnante'
    ? 'une position probablement gagnante'
    : `un ${level}`;
}

function formatMaterialAdvantageAmount(absCp) {
  const equivalent = materialEquivalent(absCp);
  return equivalent.startsWith('environ') ? `d'${equivalent}` : `de ${equivalent}`;
}

function sideSubject(color) {
  return color === 'w' ? 'Les Blancs' : 'Les Noirs';
}

function sideAdjective(color) {
  return color === 'w' ? 'blanc' : 'noir';
}

function oppositeColor(color) {
  return color === 'w' ? 'b' : 'w';
}

function safeChess(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function findKingSquare(fen, color) {
  const chess = safeChess(fen);
  if (!chess) {
    return null;
  }

  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type === 'k' && piece.color === color) {
        return piece.square;
      }
    }
  }
  return null;
}

function adjacentSquares(square) {
  if (!square) {
    return [];
  }
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const squares = [];
  for (let fileDelta = -1; fileDelta <= 1; fileDelta += 1) {
    for (let rankDelta = -1; rankDelta <= 1; rankDelta += 1) {
      if (fileDelta === 0 && rankDelta === 0) {
        continue;
      }
      const nextFile = fileIndex + fileDelta;
      const nextRank = rank + rankDelta;
      if (nextFile >= 0 && nextFile < 8 && nextRank >= 1 && nextRank <= 8) {
        squares.push(`${'abcdefgh'[nextFile]}${nextRank}`);
      }
    }
  }
  return squares;
}

function hasKingDanger(fen, favoredColor, evaluation = {}) {
  const chess = safeChess(fen);
  const targetColor = oppositeColor(favoredColor);
  const kingSquare = findKingSquare(fen, targetColor);
  if (!chess || !kingSquare) {
    return false;
  }

  const pv = String(evaluation.pv ?? '');
  if (/[+#]/.test(pv.split(/\s+/).slice(0, 3).join(' '))) {
    return true;
  }

  if (chess.isAttacked(kingSquare, favoredColor)) {
    return true;
  }

  const attackedShelter = adjacentSquares(kingSquare).filter(
    (square) => chess.attackers(square, favoredColor).length > 0
  );
  return attackedShelter.length >= 3;
}

function hasTacticalThreat(evaluation = {}) {
  const candidateMoves = String(evaluation.pv ?? '')
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  return /[x+#]/.test(candidateMoves);
}

function hasPassedPawn(fen, color) {
  const chess = safeChess(fen);
  if (!chess) {
    return false;
  }

  const pawns = [];
  const enemyPawns = [];
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type !== 'p') {
        continue;
      }
      const target = piece.color === color ? pawns : enemyPawns;
      target.push({
        file: piece.square.charCodeAt(0) - 97,
        rank: Number(piece.square[1])
      });
    }
  }

  return pawns.some((pawn) => {
    const isAdvanced = color === 'w' ? pawn.rank >= 5 : pawn.rank <= 4;
    if (!isAdvanced) {
      return false;
    }
    return !enemyPawns.some((enemy) => {
      const sameCorridor = Math.abs(enemy.file - pawn.file) <= 1;
      const ahead = color === 'w' ? enemy.rank > pawn.rank : enemy.rank < pawn.rank;
      return sameCorridor && ahead;
    });
  });
}

function mobilityForColor(fen, color) {
  const parts = String(fen ?? '').split(/\s+/);
  if (parts.length < 6) {
    return 0;
  }
  parts[1] = color;
  const chess = safeChess(parts.join(' '));
  return chess ? chess.moves().length : 0;
}

function developedMinorCount(fen, color) {
  const chess = safeChess(fen);
  if (!chess) {
    return 0;
  }
  const homeSquares = color === 'w' ? ['b1', 'c1', 'f1', 'g1'] : ['b8', 'c8', 'f8', 'g8'];
  return homeSquares.filter((square) => {
    const piece = chess.get(square);
    return !piece || piece.color !== color || !['b', 'n'].includes(piece.type);
  }).length;
}

function buildHumanEvalReasons(fen, evaluation, favoredColor) {
  const material = summarizeMaterial(fen);
  const materialCp = favoredColor === 'w' ? material.cpWhite : -material.cpWhite;
  const reasons = [];

  if (hasKingDanger(fen, favoredColor, evaluation)) {
    reasons.push({
      type: 'kingDanger',
      text: `le roi ${sideAdjective(oppositeColor(favoredColor))} est sous pression`
    });
  }

  if (materialCp > 70) {
    reasons.push({
      type: 'material',
      text: `ils ont un avantage matériel ${formatMaterialAdvantageAmount(materialCp)}`
    });
  }

  if (hasTacticalThreat(evaluation)) {
    reasons.push({
      type: 'tacticalThreat',
      text: 'la ligne Stockfish commence par une menace tactique'
    });
  }

  if (hasPassedPawn(fen, favoredColor)) {
    reasons.push({
      type: 'passedPawn',
      text: 'un pion passé peut devenir dangereux'
    });
  }

  const favoredMobility = mobilityForColor(fen, favoredColor);
  const opponentMobility = mobilityForColor(fen, oppositeColor(favoredColor));
  if (favoredMobility >= opponentMobility + 8) {
    reasons.push({
      type: 'activity',
      text: 'leurs pièces ont nettement plus d’activité'
    });
  }

  if (
    developedMinorCount(fen, favoredColor) >=
    developedMinorCount(fen, oppositeColor(favoredColor)) + 2
  ) {
    reasons.push({
      type: 'development',
      text: 'ils sont plus rapides dans le développement'
    });
  }

  return reasons;
}

function buildHumanEvalAdvice(favoredColor, reasons) {
  if (favoredColor === 'w') {
    return "Plan: conserve l'initiative, simplifie quand c'est favorable et évite de rendre le contre-jeu.";
  }

  if (reasons.some((reason) => reason.type === 'kingDanger')) {
    return 'Priorité: sécuriser le roi blanc et neutraliser les menaces directes.';
  }
  if (reasons.some((reason) => reason.type === 'material')) {
    return 'Priorité: récupérer du matériel ou forcer une activité suffisante en compensation.';
  }
  if (reasons.some((reason) => reason.type === 'tacticalThreat')) {
    return 'Priorité: répondre à la menace immédiate avant de chercher du contre-jeu.';
  }
  if (reasons.some((reason) => reason.type === 'activity')) {
    return 'Priorité: activer une pièce passive et contester les cases clés.';
  }
  return 'Priorité: défendre sobrement, échanger une pièce active adverse et éviter une deuxième faiblesse.';
}

export function buildHumanEval(fen, evaluation = {}) {
  const cpWhite = evaluation.cpWhite;
  if (!Number.isFinite(cpWhite)) {
    return {
      side: 'Inconnu',
      level: 'incertain',
      danger: 2,
      sentence:
        'Stockfish ne donne pas un score stable, mais la ligne indique un problème concret.',
      advice: 'Priorité: suivre la ligne critique et trouver la première menace adverse.'
    };
  }

  if (Math.abs(cpWhite) >= MATE_SCORE_CP - 1000) {
    const favoredColor = cpWhite > 0 ? 'w' : 'b';
    const targetColor = oppositeColor(favoredColor);
    return {
      side: sideLabel(favoredColor),
      level: 'mat forcé',
      danger: 3,
      sentence: `${sideSubject(favoredColor)} ont une attaque décisive: le roi ${sideAdjective(targetColor)} ne peut plus éviter le mat dans la ligne.`,
      advice:
        favoredColor === 'b'
          ? 'Priorité: chercher le premier coup qui empêche le mat, même au prix de matériel.'
          : 'Plan: garder les pièces actives autour du roi noir et ne pas offrir de fuite.'
    };
  }

  const absCp = Math.abs(cpWhite);
  if (absCp < 40) {
    return {
      side: 'Égalité',
      level: 'équilibrée',
      danger: 0,
      sentence: 'La position est équilibrée: aucun camp n’a d’avantage clair.',
      advice: 'Plan: améliorer les pièces et éviter les faiblesses inutiles.'
    };
  }

  const favoredColor = cpWhite > 0 ? 'w' : 'b';
  const { level, danger } = getAdvantageLevel(absCp);
  const reasons = buildHumanEvalReasons(fen, evaluation, favoredColor);
  const reasonText = reasons.length
    ? `: ${joinHumanList(reasons.slice(0, 2).map((reason) => reason.text))}`
    : '';
  return {
    side: sideLabel(favoredColor),
    level,
    danger,
    reasons,
    sentence: `${sideSubject(favoredColor)} ont ${formatAdvantagePhrase(level)}${reasonText}.`,
    advice: buildHumanEvalAdvice(favoredColor, reasons)
  };
}

export function buildDefeatComment(fen, evaluation) {
  const evalText = formatEval(evaluation?.cpWhite);
  const humanEval = buildHumanEval(fen, evaluation);
  const material = materialComment(fen);
  const pv = evaluation?.pv ? ` Ligne critique: ${evaluation.pv}.` : '';
  return `Défaite en phase libre. ${humanEval.sentence} Score Stockfish: ${evalText}. ${humanEval.advice} ${material}${pv}`;
}
