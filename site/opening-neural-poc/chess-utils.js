// Helpers d'échecs purs (au-dessus de chess.js) : application de coups UCI,
// parsing de la sortie moteur, évaluation terminale. Partagés par app.js et
// engine.js. Dépendent seulement de chess.js et d'une constante.
import { Chess } from './vendor/chess.js';
import { MATE_SCORE_CP } from './constants.js';

export function parseWhiteCentipawn(line, fen) {
  const match = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  if (!match) {
    return null;
  }

  const [, scoreType, rawScore] = match;
  const scoreValue = Number(rawScore);
  const sideToMove = fen.split(/\s+/)[1] ?? 'w';

  if (scoreType === 'mate') {
    const distancePenalty = Math.min(900, Math.abs(scoreValue) * 12);
    const winningColor = scoreValue >= 0 ? sideToMove : sideToMove === 'w' ? 'b' : 'w';
    return (winningColor === 'w' ? 1 : -1) * (MATE_SCORE_CP - distancePenalty);
  }

  return sideToMove === 'w' ? scoreValue : -scoreValue;
}

export function parsePv(line) {
  return line.match(/\bpv\s+(.+)$/)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
}

export function playUciOnChess(chess, uci) {
  if (!uci || uci.length < 4) {
    return null;
  }
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined
    });
  } catch {
    return null;
  }
}

export function formatPvFromFen(fen, pvMoves, limit = 7) {
  const chess = new Chess(fen);
  const sanMoves = [];
  const uciMoves = [];
  for (const uci of pvMoves.slice(0, limit)) {
    const move = playUciOnChess(chess, uci);
    if (!move) {
      break;
    }
    sanMoves.push(move.san);
    uciMoves.push(uci);
  }
  return {
    san: sanMoves.join(' '),
    uci: uciMoves
  };
}

export function terminalEvaluation(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return {
      cpWhite: chess.turn() === 'w' ? -MATE_SCORE_CP : MATE_SCORE_CP,
      bestMove: null,
      pv: '',
      pvUci: [],
      depth: 0,
      source: 'terminal'
    };
  }

  if (chess.isDraw()) {
    return {
      cpWhite: 0,
      bestMove: null,
      pv: '',
      pvUci: [],
      depth: 0,
      source: 'terminal'
    };
  }

  return null;
}
