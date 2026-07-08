// Helpers d'échecs purs (au-dessus de chess.js) : application de coups UCI,
// parsing de la sortie moteur, encodage/décodage du score de mat, évaluation
// terminale. Partagés par app.js et engine.js. Dépendent seulement de chess.js
// et d'une constante.
import { Chess, validateFen } from './vendor/chess.js';
import { MATE_SCORE_CP } from './constants.js';

// FEN de la position initiale standard, calculée une fois via chess.js.
export const STANDARD_START_FEN = new Chess().fen();

// Score vu du camp au trait (les scores moteur sont stockés côté blanc).
export function scoreForSide(cpWhite, sideToMove) {
  return sideToMove === 'w' ? cpWhite : -cpWhite;
}

// Coup chess.js → notation UCI (ex. { from:'e2', to:'e4' } → 'e2e4').
export function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

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

export function isMateScore(cpWhite) {
  return Number.isFinite(cpWhite) && Math.abs(cpWhite) >= MATE_SCORE_CP - 1000;
}

// Reconstruit le « mat en X » à partir du score encodé (cf. parseWhiteCentipawn).
export function mateMovesFromCp(cpWhite) {
  const penalty = MATE_SCORE_CP - Math.abs(cpWhite);
  return Math.max(1, Math.round(penalty / 12));
}

export function parsePv(line) {
  return (
    line
      .match(/\bpv\s+(.+)$/)?.[1]
      ?.trim()
      .split(/\s+/)
      .filter(Boolean) ?? []
  );
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

export function mirrorFen(fen) {
  const parts = String(fen).trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error('FEN invalide à mirroring');
  }

  const [placement, turn, castling, enPassant, halfmove = '0', fullmove = '1'] = parts;
  const board = placement.split('/').map((rank) => {
    const squares = [];
    for (const token of rank) {
      if (/\d/.test(token)) {
        squares.push(...Array(Number(token)).fill(null));
      } else {
        squares.push(token);
      }
    }
    if (squares.length !== 8) {
      throw new Error('FEN invalide à mirroring');
    }
    return squares;
  });

  const mirroredPlacement = board
    .reverse()
    .map((rank) =>
      [...rank].reverse().map((piece) => {
        if (!piece) {
          return null;
        }
        return piece === piece.toLowerCase() ? piece.toUpperCase() : piece.toLowerCase();
      })
    )
    .map((rank) => {
      let out = '';
      let empty = 0;
      for (const piece of rank) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += piece;
      }
      if (empty > 0) {
        out += String(empty);
      }
      return out;
    })
    .join('/');

  const mirroredCastling =
    castling === '-'
      ? '-'
      : [...castling]
          .map((flag) => {
            switch (flag) {
              case 'K':
                return 'q';
              case 'Q':
                return 'k';
              case 'k':
                return 'Q';
              case 'q':
                return 'K';
              default:
                return '';
            }
          })
          .filter(Boolean)
          .join('') || '-';

  const mirroredEnPassant =
    enPassant === '-'
      ? '-'
      : (() => {
          const file = 9 - (enPassant.charCodeAt(0) - 96);
          const rank = 9 - Number(enPassant[1]);
          return String.fromCharCode(96 + file) + String(rank);
        })();

  const mirroredFen = [
    mirroredPlacement,
    turn === 'w' ? 'b' : 'w',
    mirroredCastling,
    mirroredEnPassant,
    halfmove,
    fullmove
  ].join(' ');

  const validation = validateFen(mirroredFen);
  if (!validation.ok) {
    throw new Error(`FEN miroir invalide: ${validation.error}`);
  }

  return mirroredFen;
}

// Case du roi en échec (le camp au trait), ou null. Marche pour les deux couleurs.
export function kingInCheckSquare(fen) {
  try {
    const probe = new Chess(fen);
    if (!probe.isCheck()) {
      return null;
    }
    const turn = probe.turn();
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
  } catch {
    /* FEN invalide : pas de surbrillance d'échec */
  }
  return null;
}

// Case du roi maté (uniquement si la position est un échec et mat), pour l'animation
// de fin de partie : le roi vaincu se renverse. Renvoie null si pas de mat.
export function matedKingSquare(fen) {
  try {
    const probe = new Chess(fen);
    if (!probe.isCheckmate()) {
      return null;
    }
    const turn = probe.turn(); // le camp maté est celui au trait
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
  } catch {
    /* FEN invalide : pas d'animation de mat */
  }
  return null;
}

// R (boutique) — Cases des pièces blanches attaquées par les Noirs (menaces),
// affichées seulement quand c'est au joueur de jouer.
export function threatenedWhiteSquares(fen) {
  const set = new Set();
  try {
    const probe = new Chess(fen);
    if (probe.turn() !== 'w') {
      return set;
    }
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.color === 'w' && probe.isAttacked(cell.square, 'b')) {
          set.add(cell.square);
        }
      }
    }
  } catch {
    /* FEN invalide : pas de menaces */
  }
  return set;
}

export function fenPositionKey(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}

export function normalizeSanForCompare(san) {
  return String(san ?? '')
    .replace(/[!?]+$/g, '')
    .replace(/[+#]+$/g, '')
    .trim();
}

export function getMoveText(move) {
  const parsedMoveNumber = Number(move.before?.split(/\s+/)[5] ?? 1);
  const moveNumber = Number.isFinite(parsedMoveNumber) ? parsedMoveNumber : 1;
  const prefix = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
  return `${prefix} ${move.san}`;
}
