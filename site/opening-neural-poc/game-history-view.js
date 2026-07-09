import { Chess } from './vendor/chess.js';
import { clamp } from './utils.js';

// Reconstruit la position après `game.historyView` demi-coups (rejoués depuis le départ).
export function makeHistoryBoardNode(game) {
  const history = game.chess.history({ verbose: true });
  const idx = clamp(game.historyView, 0, history.length);
  const probe = new Chess();
  let last = null;
  for (let i = 0; i < idx; i += 1) {
    last = probe.move(history[i]);
  }
  return {
    id: 'history',
    san: last?.san ?? 'Départ',
    fen: probe.fen(),
    from: last?.from ?? '',
    to: last?.to ?? '',
    sideToMove: probe.turn()
  };
}

// Libellé « N. san » / « N… san » du coup amenant à la position `idx`.
export function formatHistoryMoveLabel(game, idx) {
  const move = game.chess.history({ verbose: true })[idx - 1];
  if (!move) {
    return 'Départ';
  }
  const moveNumber = Math.ceil(idx / 2);
  return move.color === 'w' ? `${moveNumber}. ${move.san}` : `${moveNumber}… ${move.san}`;
}
