// Rendu d'échiquier (pièces SVG) à partir d'un FEN, et images successives d'une
// ouverture. Feuille UI : ne dépend que de chess.js + DOM.
import { Chess } from './vendor/chess.js';

export const OPENING_MAX_PLIES = 16;

export function fenToPieceArray(fen) {
  const board = String(fen || '').split(' ')[0];
  const cells = [];
  for (const rankStr of board.split('/')) {
    for (const ch of rankStr) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i += 1) cells.push(null);
      } else {
        cells.push(ch);
      }
    }
  }
  return cells;
}

export function buildOpeningFrames(sans, maxPlies = OPENING_MAX_PLIES) {
  let chess;
  try {
    chess = new Chess();
  } catch {
    return null;
  }
  const frames = [{ fen: chess.fen(), from: null, to: null, san: null }];
  for (const san of (sans || []).slice(0, maxPlies)) {
    let mv = null;
    try {
      mv = chess.move(san);
    } catch {
      mv = null;
    }
    if (!mv) break;
    frames.push({ fen: chess.fen(), from: mv.from, to: mv.to, san: mv.san });
  }
  return frames.length >= 2 ? frames : null;
}

export function fillOpeningBoard(container, frame) {
  container.replaceChildren();
  const pieces = fenToPieceArray(frame.fen);
  const files = 'abcdefgh';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const sq = `${files[col]}${8 - row}`;
      const cell = document.createElement('div');
      cell.className = `opening-sq ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
      if (sq === frame.from || sq === frame.to) {
        cell.classList.add('is-move');
      }
      const pc = pieces[row * 8 + col];
      if (pc) {
        const img = document.createElement('img');
        img.src = `/pieces/merida/${pc === pc.toUpperCase() ? 'w' : 'b'}${pc.toUpperCase()}.svg`;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        cell.append(img);
      }
      container.append(cell);
    }
  }
}

export function getBoardSquareLabel(squareName, piece, isTarget) {
  const pieceLabel = piece
    ? `${piece === piece.toUpperCase() ? 'pièce blanche' : 'pièce noire'} ${piece.toUpperCase()}`
    : 'case vide';
  return isTarget ? `${squareName}, destination légale` : `${squareName}, ${pieceLabel}`;
}
