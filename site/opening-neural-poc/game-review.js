// Revue d'une partie historique (écran) : échiquier rejouable (‹ ›, clic case,
// branches de variantes) + analyse a posteriori (verdicts par coup, précision,
// meilleure suite Stockfish à la demande). Opère sur state.gameReview ; lit les
// coups compacts enregistrés. renderBoard (échiquier partagé), ensureStockfishReady
// (moteur) et advFormatGameOpponent sont INJECTÉS (initGameReview) pour éviter un
// cycle avec app.js. Acyclique sinon.
import { state } from './state.js';
import { clamp, escapeHtml } from './utils.js';
import { advSetText } from './dom.js';
import { playUciOnChess } from './chess-utils.js';
import { formatEval } from './eval-commentary.js';
import { Chess } from './vendor/chess.js';
import { advOpeningDisplayLabel } from './graph.js';
import { advFormatRelativeTime } from './adventure-utils.js';
import { advFormatGameOpponent } from './adventure-history.js';
import {
  advStoredVerdict,
  advGameAccuracy,
  buildMoveStatsRow,
  buildStoredMoveComment
} from './move-verdict.js';

// Injectés par app.js (cf. initGameReview) : rendu de l'échiquier partagé et moteur
// Stockfish (renvoie l'évaluateur).
let renderBoard = () => {};
let ensureStockfishReady = async () => null;

export function initGameReview(deps) {
  renderBoard = deps.renderBoard ?? renderBoard;
  ensureStockfishReady = deps.ensureStockfishReady ?? ensureStockfishReady;
}

function openGameReview(game) {
  if (!game || !Array.isArray(game.moves) || !game.moves.length) {
    return;
  }
  const chess = new Chess();
  const positions = [{ fen: chess.fen(), from: '', to: '', san: 'Départ', moveIndex: -1 }];
  for (let i = 0; i < game.moves.length; i += 1) {
    let move = null;
    try {
      move = chess.move(game.moves[i].san);
    } catch {
      move = null;
    }
    if (!move) {
      break; // SAN illisible : on s'arrête là (sécurité)
    }
    positions.push({ fen: chess.fen(), from: move.from, to: move.to, san: move.san, moveIndex: i });
  }
  state.gameReview = {
    game,
    positions,
    index: positions.length - 1,
    branch: null, // sous-variante explorée (engine ou perso)
    sel: null, // case sélectionnée (clic 1) pour jouer une variante
    engine: null, // analyse Stockfish de la position affichée
    engineToken: 0
  };
  const overlay = document.querySelector('#advGameReview');
  if (overlay) {
    overlay.hidden = false;
  }
  renderGameReview();
  gameReviewAnalyze();
}

function closeGameReview() {
  if (state.gameReview) {
    state.gameReview.engineToken += 1; // invalide toute analyse en cours
  }
  state.gameReview = null;
  const overlay = document.querySelector('#advGameReview');
  if (overlay) {
    overlay.hidden = true;
  }
}

function gameReviewStep(delta) {
  const review = state.gameReview;
  if (!review) {
    return;
  }
  review.branch = null; // naviguer la ligne principale quitte la sous-variante
  review.sel = null;
  if (delta === 'first') {
    review.index = 0;
  } else if (delta === 'last') {
    review.index = review.positions.length - 1;
  } else {
    review.index = clamp(review.index + delta, 0, review.positions.length - 1);
  }
  renderGameReview();
  gameReviewAnalyze();
}

function gameReviewGoTo(positionIndex) {
  const review = state.gameReview;
  if (!review) {
    return;
  }
  review.branch = null;
  review.sel = null;
  review.index = clamp(positionIndex, 0, review.positions.length - 1);
  renderGameReview();
  gameReviewAnalyze();
}

// Position actuellement affichée : sous-variante (branche) si active, sinon ligne principale.
function gameReviewShownPosition() {
  const r = state.gameReview;
  if (!r) {
    return null;
  }
  if (r.branch) {
    if (r.branch.view < 0) {
      const base = r.positions[r.branch.baseIndex];
      return { fen: base.fen, from: '', to: '', san: base.san, inBranch: true, view: -1 };
    }
    const p = r.branch.plies[r.branch.view];
    return { fen: p.fen, from: p.from, to: p.to, san: p.san, inBranch: true, view: r.branch.view };
  }
  const p = r.positions[r.index];
  return { fen: p.fen, from: p.from, to: p.to, san: p.san, inBranch: false };
}

// Joue un coup (UCI) depuis la position affichée → l'ajoute à la sous-variante.
function gameReviewPlayUci(uci) {
  const r = state.gameReview;
  if (!r) {
    return false;
  }
  const shown = gameReviewShownPosition();
  const chess = new Chess(shown.fen);
  const move = playUciOnChess(chess, uci);
  if (!move) {
    return false;
  }
  const ply = { san: move.san, from: move.from, to: move.to, fen: chess.fen(), color: move.color };
  if (!r.branch) {
    r.branch = { baseIndex: r.index, plies: [ply], view: 0 };
  } else {
    // jouer depuis une position intermédiaire tronque la suite avant d'ajouter
    if (r.branch.view < r.branch.plies.length - 1) {
      r.branch.plies = r.branch.plies.slice(0, r.branch.view + 1);
    }
    r.branch.plies.push(ply);
    r.branch.view = r.branch.plies.length - 1;
  }
  r.sel = null;
  return true;
}

// Clic sur une case du plateau de revue : sélection puis jeu d'un coup (variante perso).
function gameReviewClickSquare(sq) {
  const r = state.gameReview;
  if (!r) {
    return;
  }
  const shown = gameReviewShownPosition();
  const chess = new Chess(shown.fen);
  const turn = chess.turn();
  const piece = chess.get(sq);
  if (r.sel) {
    if (sq === r.sel) {
      r.sel = null;
      renderGameReview();
      return;
    }
    const legal = chess.moves({ square: r.sel, verbose: true });
    const target = legal.find((m) => m.to === sq);
    if (target) {
      if (gameReviewPlayUci(`${r.sel}${sq}${target.promotion || ''}`)) {
        renderGameReview();
        gameReviewAnalyze();
      }
      return;
    }
    if (piece && piece.color === turn) {
      r.sel = sq;
    } else {
      r.sel = null;
    }
    renderGameReview();
    return;
  }
  if (piece && piece.color === turn) {
    r.sel = sq;
    renderGameReview();
  }
}

// Joue les `count` premiers coups de la meilleure suite de Stockfish dans la variante.
function gameReviewPlayEngineLine(count) {
  const r = state.gameReview;
  const line = r?.engine?.pvUci;
  if (!Array.isArray(line) || !line.length) {
    return;
  }
  let played = 0;
  for (let i = 0; i < count && i < line.length; i += 1) {
    if (!gameReviewPlayUci(line[i])) {
      break;
    }
    played += 1;
  }
  if (played) {
    renderGameReview();
    gameReviewAnalyze();
  }
}

function gameReviewSetBranchView(view) {
  const r = state.gameReview;
  if (!r?.branch) {
    return;
  }
  r.branch.view = clamp(view, -1, r.branch.plies.length - 1);
  r.sel = null;
  renderGameReview();
  gameReviewAnalyze();
}

function gameReviewExitBranch() {
  const r = state.gameReview;
  if (!r) {
    return;
  }
  r.branch = null;
  r.sel = null;
  renderGameReview();
  gameReviewAnalyze();
}

// Analyse Stockfish de la position affichée (meilleure suite). Asynchrone, anti-périmé.
async function gameReviewAnalyze() {
  const r = state.gameReview;
  if (!r) {
    return;
  }
  const shown = gameReviewShownPosition();
  const fen = shown.fen;
  if (r.engine && r.engine.fen === fen && !r.engine.loading) {
    renderReviewEngine();
    return;
  }
  const token = (r.engineToken += 1);
  r.engine = { fen, loading: true };
  renderReviewEngine();
  try {
    const evaluator = await ensureStockfishReady(false);
    const evaluation = await evaluator.evaluate(fen);
    if (state.gameReview !== r || token !== r.engineToken) {
      return; // position changée entre-temps : résultat périmé
    }
    r.engine = {
      fen,
      loading: false,
      cp: evaluation.cpWhite,
      pv: evaluation.pv || '',
      pvUci: evaluation.pvUci || []
    };
  } catch {
    if (state.gameReview === r && token === r.engineToken) {
      r.engine = { fen, loading: false, error: true };
    }
  }
  renderReviewEngine();
}

// Affiche la meilleure suite de Stockfish (coups cliquables) pour la position affichée.
function renderReviewEngine() {
  const host = document.querySelector('#advReviewEngine');
  if (!host) {
    return;
  }
  host.replaceChildren();
  const eng = state.gameReview?.engine;
  if (!eng) {
    return;
  }
  if (eng.loading) {
    host.textContent = 'Stockfish analyse la suite…';
    return;
  }
  if (eng.error || !Array.isArray(eng.pvUci) || !eng.pvUci.length) {
    return;
  }
  const label = document.createElement('span');
  label.className = 'game-review-engine-label';
  label.textContent = `Meilleure suite (${formatEval(eng.cp)}) :`;
  host.append(label);
  const chess = new Chess(eng.fen);
  let i = 0;
  for (const uci of eng.pvUci.slice(0, 8)) {
    const move = playUciOnChess(chess, uci);
    if (!move) {
      break;
    }
    const step = i;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'game-review-engine-move';
    chip.textContent = move.san;
    chip.title = 'Jouer cette suite dans la variante';
    chip.addEventListener('click', () => gameReviewPlayEngineLine(step + 1));
    host.append(chip);
    i += 1;
  }
}

// Fil d'Ariane de la sous-variante explorée (coups cliquables + retour ligne principale).
function renderReviewVariation() {
  const host = document.querySelector('#advReviewVariation');
  if (!host) {
    return;
  }
  const r = state.gameReview;
  if (!r?.branch) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  host.replaceChildren();
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'game-review-variation-exit';
  exit.textContent = '↩ Ligne principale';
  exit.addEventListener('click', gameReviewExitBranch);
  host.append(exit);
  const moves = document.createElement('div');
  moves.className = 'game-review-variation-moves';
  r.branch.plies.forEach((ply, idx) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `game-review-variation-move${idx === r.branch.view ? ' is-active' : ''}`;
    const moveNo = Math.floor((r.branch.baseIndex + idx) / 2) + 1;
    const prefix = ply.color === 'w' ? `${moveNo}.` : `${moveNo}…`;
    chip.textContent = `${prefix} ${ply.san}`;
    chip.addEventListener('click', () => gameReviewSetBranchView(idx));
    moves.append(chip);
  });
  host.append(moves);
}

function renderGameReview() {
  const review = state.gameReview;
  if (!review) {
    return;
  }
  const game = review.game;
  advSetText('#advReviewTitle', `${advFormatGameOpponent(game)} · ${advFormatRelativeTime(game.ts)}`);

  const resultEl = document.querySelector('#advReviewResult');
  if (resultEl) {
    resultEl.textContent =
      game.result === 'won' ? (game.mate ? 'Victoire (mat)' : 'Victoire') : 'Défaite';
    resultEl.className = game.result === 'won' ? 'is-won' : 'is-lost';
  }
  advSetText('#advReviewOpening', advOpeningDisplayLabel(game.lineSans, game.openingLabel));
  const accuracy = advGameAccuracy(game.moves);
  advSetText('#advReviewAccuracy', accuracy == null ? '—' : `${accuracy} %`);
  const analysisHost = document.querySelector('#advReviewAnalysis');
  if (analysisHost) {
    analysisHost.replaceChildren();
    const statsRow = buildMoveStatsRow(game.moves);
    if (statsRow) {
      analysisHost.append(statsRow);
    }
  }

  // Position affichée : sous-variante (branche) si active, sinon ligne principale.
  const shown = gameReviewShownPosition();
  const position = review.positions[review.index];
  const boardEl = document.querySelector('#advReviewBoard');
  if (boardEl && shown) {
    renderBoard(
      { id: 'review', fen: shown.fen, from: shown.from, to: shown.to, san: shown.san },
      boardEl
    );
    // Surbrillance de la sélection (clic 1) + cases légales, pour jouer une variante.
    if (review.sel) {
      const selEl = boardEl.querySelector(`.board-square[data-square="${review.sel}"]`);
      selEl?.classList.add('is-selected');
      const chess = new Chess(shown.fen);
      for (const m of chess.moves({ square: review.sel, verbose: true })) {
        boardEl.querySelector(`.board-square[data-square="${m.to}"]`)?.classList.add('is-target');
      }
    }
  }
  advSetText(
    '#advReviewPly',
    shown.inBranch ? `variante` : `${review.index} / ${review.positions.length - 1}`
  );

  const comment = document.querySelector('#advReviewComment');
  if (comment) {
    if (shown.inBranch) {
      comment.textContent = 'Sous-variante explorée — l\'analyse Stockfish s\'affiche ci-dessous.';
    } else {
      const move = position && position.moveIndex >= 0 ? game.moves[position.moveIndex] : null;
      comment.textContent = move ? buildStoredMoveComment(move) : 'Position de départ.';
    }
  }

  renderReviewEngine();
  renderReviewVariation();

  const list = document.querySelector('#advReviewMoves');
  if (list) {
    list.replaceChildren();
    game.moves.forEach((move, index) => {
      const li = document.createElement('li');
      const isActive = !shown.inBranch && position && position.moveIndex === index;
      li.className = `game-review-move${isActive ? ' is-active' : ''}`;
      const verdict = advStoredVerdict(move);
      const badge = verdict
        ? `<i class="move-verdict is-${verdict.cls}" title="${escapeHtml(verdict.label)}">${escapeHtml(
            verdict.short
          )}</i>`
        : '';
      const moveNo = Math.floor(index / 2) + 1;
      const prefix = move.color === 'w' ? `${moveNo}.` : `${moveNo}…`;
      const evalTxt = move.after != null ? formatEval(move.after) : '';
      li.innerHTML =
        `<span class="game-review-move-san">${escapeHtml(prefix)} ${escapeHtml(move.san)}${badge}</span>` +
        `<em>${escapeHtml(evalTxt)}</em>`;
      li.addEventListener('click', () => gameReviewGoTo(index + 1));
      list.append(li);
    });
    const activeEl = list.querySelector('.game-review-move.is-active');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }
}

export { openGameReview, closeGameReview, gameReviewStep, gameReviewClickSquare };
