import { Chess } from './vendor/chess.js';
import { state } from './state.js';
import { playUciOnChess, isMateScore, mateMovesFromCp } from './chess-utils.js';
import { formatEval } from './eval-commentary.js';
import { advMateHandover, advMateTolerance } from './adventure-settings.js';
import { advRefreshRecordedMoves } from './adventure-history.js';
import { DEFEAT_LINE_MAX_PLIES, appendDefeatLineReview } from './free-review.js';
import { advInfluenceEnabled } from './opening-weight.js';

let ensureStockfishReady = async () => null;
let clearGameCinematic = () => {};
let setEngineThinking = () => {};
let renderGameDetails = () => {};
let renderGamePanel = () => {};
let advSkipDefeatCinematic = () => {};

export function initMateResolution(deps) {
  ensureStockfishReady = deps.ensureStockfishReady ?? ensureStockfishReady;
  clearGameCinematic = deps.clearGameCinematic ?? clearGameCinematic;
  setEngineThinking = deps.setEngineThinking ?? setEngineThinking;
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
  renderGamePanel = deps.renderGamePanel ?? renderGamePanel;
  advSkipDefeatCinematic = deps.advSkipDefeatCinematic ?? advSkipDefeatCinematic;
}

export const VICTORY_CINEMATIC_DEPTH = 10;

async function buildDefeatLineUci(fen, evaluation, stopAtMateX = null) {
  const chess = new Chess(fen);
  const line = [];
  const wantsHandover = Number.isFinite(stopAtMateX);
  const mateSearchDepth = Math.min(12, VICTORY_CINEMATIC_DEPTH);

  const checkHandover = async () => {
    // FIX côté Noir : la remise de main fonctionne quelle que soit la couleur du joueur.
    // Avant : seul chess.turn() === 'b' avec cpWhite < 0 était géré (joueur Blanc uniquement).
    // Maintenant : on détecte le mat forcé pour le camp qui a le trait, quelle que soit sa couleur.
    if (!wantsHandover || chess.isGameOver()) {
      return null;
    }
    const handoverEval = await ensureStockfishReady(false).then((evaluator) =>
      evaluator.evaluate(chess.fen(), mateSearchDepth)
    );
    const sideToMove = chess.turn(); // 'w' ou 'b'
    // Le mat est forcé pour le camp qui a le trait si :
    //   - Blancs au trait : cpWhite > 0 et score de mat (Blancs vont mater)
    //   - Noirs au trait  : cpWhite < 0 et score de mat (les Noirs vont mater)
    const mateIsForCurrentSide =
      sideToMove === 'w'
        ? isMateScore(handoverEval.cpWhite) && handoverEval.cpWhite > 0
        : isMateScore(handoverEval.cpWhite) && handoverEval.cpWhite < 0;
    if (
      mateIsForCurrentSide &&
      mateMovesFromCp(handoverEval.cpWhite) <= stopAtMateX
    ) {
      return handoverEval;
    }
    return null;
  };

  const initialHandover = await checkHandover();
  if (initialHandover) {
    return {
      line,
      handoverReached: true,
      handoverFen: chess.fen(),
      handoverEvaluation: initialHandover
    };
  }

  for (const uci of evaluation.pvUci || []) {
    if (line.length >= DEFEAT_LINE_MAX_PLIES) {
      return {
        line,
        handoverReached: false,
        handoverFen: null,
        handoverEvaluation: null
      };
    }
    if (!playUciOnChess(chess, uci)) {
      break;
    }
    line.push(uci);
    if (chess.isGameOver()) {
      return {
        line,
        handoverReached: false,
        handoverFen: null,
        handoverEvaluation: null
      };
    }
    const handoverEval = await checkHandover();
    if (handoverEval) {
      return {
        line,
        handoverReached: true,
        handoverFen: chess.fen(),
        handoverEvaluation: handoverEval
      };
    }
  }

  if (line.length >= DEFEAT_LINE_MAX_PLIES || chess.isGameOver()) {
    return {
      line,
      handoverReached: false,
      handoverFen: null,
      handoverEvaluation: null
    };
  }
  // La PV ne va pas jusqu'au bout : on prolonge avec Stockfish jusqu'au mat rée
  // (ou au plafond), des deux côtés, pour montrer la défaite consommée.
  try {
    const evaluator = await ensureStockfishReady(false);
    while (line.length < DEFEAT_LINE_MAX_PLIES && !chess.isGameOver()) {
      const res = await evaluator.evaluate(chess.fen());
      const best = res?.bestMove;
      if (!best || !playUciOnChess(chess, best)) {
        break;
      }
      line.push(best);
      const handoverEval = await checkHandover();
      if (handoverEval) {
        return {
          line,
          handoverReached: true,
          handoverFen: chess.fen(),
          handoverEvaluation: handoverEval
        };
      }
    }
  } catch {
    /* Moteur indisponible : on garde la PV récupérée. */
  }
  return {
    line,
    handoverReached: false,
    handoverFen: null,
    handoverEvaluation: null
  };
}

function cloneMateResolutionData(value) {
  if (value == null) {
    return value;
  }
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function captureMateResolutionSnapshot(game) {
  return {
    chess: game.chess,
    currentNodeId: game.currentNodeId,
    currentPathNodeIds: [...(game.currentPathNodeIds || [])],
    currentPathEdgeIds: [...(game.currentPathEdgeIds || [])],
    currentEvalCp: game.currentEvalCp,
    currentPv: game.currentPv,
    currentDepth: game.currentDepth,
    lastMove: cloneMateResolutionData(game.lastMove),
    moveLog: cloneMateResolutionData(game.moveLog),
    freeReviewMoves: cloneMateResolutionData(game.freeReviewMoves),
    freeReview: cloneMateResolutionData(game.freeReview),
    failureFen: game.failureFen,
    failureEvaluation: cloneMateResolutionData(game.failureEvaluation),
    defeatComment: game.defeatComment,
    expectedOpeningArrows: [...(game.expectedOpeningArrows || [])],
    defeatLineRecorded: game.defeatLineRecorded,
    phase: game.phase,
    status: game.status,
    message: game.message,
    locked: game.locked,
    historyView: game.historyView,
    selectedSquare: game.selectedSquare,
    premove: cloneMateResolutionData(game.premove),
    premoveSelect: game.premoveSelect,
    revealLegalDots: game.revealLegalDots,
    freeRoundPending: game.freeRoundPending,
    victoryCinematic: game.victoryCinematic,
    victoryConverted: game.victoryConverted,
    takebackLocked: game.takebackLocked,
    influence: cloneMateResolutionData(game.influence),
    influencePending: game.influencePending,
    influenceDone: game.influenceDone,
    defeatCinematicPending: game.defeatCinematicPending,
    skipDefeatCinematic: game.skipDefeatCinematic,
    mateExpected: game.mateExpected,
    finalMateLives: game.finalMateLives
  };
}

function restoreMateResolutionSnapshot(
  game,
  snapshot,
  { finalMateLives = 0, message = snapshot.message } = {}
) {
  game.chess = snapshot.chess;
  game.currentNodeId = snapshot.currentNodeId;
  game.currentPathNodeIds = [...snapshot.currentPathNodeIds];
  game.currentPathEdgeIds = [...snapshot.currentPathEdgeIds];
  game.currentEvalCp = snapshot.currentEvalCp;
  game.currentPv = snapshot.currentPv;
  game.currentDepth = snapshot.currentDepth;
  game.lastMove = cloneMateResolutionData(snapshot.lastMove);
  game.moveLog = cloneMateResolutionData(snapshot.moveLog);
  game.freeReviewMoves = cloneMateResolutionData(snapshot.freeReviewMoves);
  game.freeReview = cloneMateResolutionData(snapshot.freeReview);
  game.failureFen = snapshot.failureFen;
  game.failureEvaluation = cloneMateResolutionData(snapshot.failureEvaluation);
  game.defeatComment = snapshot.defeatComment;
  game.expectedOpeningArrows = [...snapshot.expectedOpeningArrows];
  game.defeatLineRecorded = snapshot.defeatLineRecorded;
  game.phase = snapshot.phase;
  game.status = 'lost';
  game.message = message;
  game.locked = false;
  game.historyView = snapshot.historyView;
  game.selectedSquare = snapshot.selectedSquare;
  game.premove = cloneMateResolutionData(snapshot.premove);
  game.premoveSelect = snapshot.premoveSelect;
  game.revealLegalDots = snapshot.revealLegalDots;
  game.freeRoundPending = snapshot.freeRoundPending;
  game.victoryCinematic = false;
  game.victoryConverted = snapshot.victoryConverted;
  game.takebackLocked = snapshot.takebackLocked;
  game.influence = cloneMateResolutionData(snapshot.influence);
  game.influencePending = snapshot.influencePending;
  game.influenceDone = snapshot.influenceDone;
  game.defeatCinematicPending = false;
  game.skipDefeatCinematic = false;
  game.mateExpected = snapshot.mateExpected;
  game.finalMateLives = finalMateLives;
}

export function beginMateResolution(
  game,
  handoverFen,
  handoverEvaluation,
  expectedX,
  originalSnapshot
) {
  clearGameCinematic();
  game.defeatCinematicPending = false;
  game.skipDefeatCinematic = false;
  const playerColor = new Chess(handoverFen).turn();
  game.mateResolution = {
    active: true,
    expectedX,
    originalSnapshot,
    handoverFen,
    handoverEvaluation: cloneMateResolutionData(handoverEvaluation),
    playerColor
  };
  game.mateResolved = false;
  game.mateResolutionFailed = false;
  game.status = 'playing';
  game.phase = 'free';
  game.locked = false;
  game.chess = new Chess(handoverFen);
  game.currentEvalCp = Number.isFinite(handoverEvaluation?.cpWhite)
    ? handoverEvaluation.cpWhite
    : game.currentEvalCp;
  game.currentPv = '';
  game.currentDepth = 0;
  game.finalMateLives = 3;
  if (Number.isFinite(expectedX)) {
    game.mateExpected = expectedX;
    game.message = `À toi de mater en ${expectedX}+${advMateTolerance()} — Stockfish défend.`;
  } else {
    game.message = `À toi de conclure côté ${
      playerColor === 'w' ? 'Blanc' : 'Noir'
    } : porte l'estocade ! Stockfish défend.`;
  }
  setEngineThinking(false);
  document.body.classList.remove('is-game-lost', 'is-game-over');
  renderGameDetails();
  renderGamePanel();
}

export function finishMateResolution(game, { success, message }) {
  const resolution = game.mateResolution;
  if (!resolution?.originalSnapshot) {
    return;
  }
  const snapshot = resolution.originalSnapshot;
  restoreMateResolutionSnapshot(game, snapshot, { finalMateLives: 0, message });
  game.mateResolution = {
    ...resolution,
    active: false
  };
  game.mateResolved = success;
  game.mateResolutionFailed = !success;
  document.body.classList.toggle('is-game-lost', true);
  document.body.classList.toggle('is-game-over', true);
  setEngineThinking(false);
  renderGameDetails();
  renderGamePanel();
}

export async function startDeficitCinematic(fen, evaluation, defeatComment = '') {
  clearGameCinematic();
  const game = state.game;
  if (!game) {
    return;
  }
  const wantsHandover =
    state.advRun?.kind === 'boss' && !state.advRun?.tournament && advInfluenceEnabled();
  const stopAtMateX = wantsHandover ? advMateHandover() : null;
  const result = await buildDefeatLineUci(fen, evaluation, stopAtMateX);
  if (state.game !== game) {
    return; // partie changée pendant le calcul de la prolongation
  }
  // B : on enregistre toute la suite dans l'historique (rejeu au ralenti) et on
  // réintègre ces coups auto dans la partie sauvegardée (revue d'historique).
  if (result.line.length) {
    appendDefeatLineReview(fen, evaluation, result.line);
    advRefreshRecordedMoves(game);
  }
  if (!result.line.length) {
    if (result.handoverReached && wantsHandover && result.handoverFen) {
      const snapshot = captureMateResolutionSnapshot(game);
      beginMateResolution(
        game,
        result.handoverFen,
        result.handoverEvaluation,
        stopAtMateX,
        snapshot
      );
      return;
    }
    // Pas de suite jouable : on rend simplement la main à la revue.
    game.defeatCinematicPending = false;
    if (game.freeReviewMoves.length) {
      game.freeReview.active = true;
      game.freeReview.index = game.freeReviewMoves.length - 1;
    }
    renderGameDetails();
    renderGamePanel();
    return;
  }
  const chess = new Chess(fen);
  game.cinematic = {
    active: true,
    chess,
    moves: result.line,
    index: 0,
    lastMove: null,
    mateResolution:
      result.handoverReached && wantsHandover && result.handoverFen
        ? {
            expectedX: stopAtMateX,
            handoverFen: result.handoverFen,
            handoverEvaluation: cloneMateResolutionData(result.handoverEvaluation),
            originalSnapshot: captureMateResolutionSnapshot(game)
          }
        : null
  };
  // ⏩ demandé pendant la construction de la suite : on saute directement à la fin.
  if (game.skipDefeatCinematic) {
    advSkipDefeatCinematic();
    return;
  }
  game.message = defeatComment
    ? `${defeatComment} La punition de Stockfish se déroule…`
    : `Déficit à ${formatEval(evaluation.cpWhite)}. La punition de Stockfish se déroule…`;
  renderGameDetails();
  renderGamePanel();
  game.cinematicTimer = setInterval(() => {
    const cinematic = state.game?.cinematic;
    if (!cinematic || cinematic.index >= cinematic.moves.length) {
      const mateResolution = cinematic?.mateResolution;
      const handoverFen = cinematic?.chess?.fen();
      clearGameCinematic();
      if (state.game) {
        state.game.defeatCinematicPending = false; // punition terminée → phase suivante
      }
      if (mateResolution?.originalSnapshot && handoverFen) {
        beginMateResolution(
          game,
          handoverFen,
          mateResolution.handoverEvaluation,
          mateResolution.expectedX,
          mateResolution.originalSnapshot
        );
        return;
      }
      if (state.game?.freeReviewMoves.length) {
        state.game.freeReview.active = true;
        state.game.freeReview.index = state.game.freeReviewMoves.length - 1;
      }
      renderGameDetails();
      renderGamePanel();
      return;
    }
    const move = playUciOnChess(cinematic.chess, cinematic.moves[cinematic.index]);
    cinematic.index += 1;
    cinematic.lastMove = move;
    renderGameDetails();
  }, 900);
}
