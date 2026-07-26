import { Chess } from './vendor/chess.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { FIRST_LEVEL_NUMBER } from './constants.js';
import { clamp, escapeHtml } from './utils.js';
import { formatEval, formatEvalDelta, buildHumanEval } from './eval-commentary.js';
import { advMoveVerdict } from './move-verdict.js';
import {
  terminalEvaluation,
  playUciOnChess,
  moveToUci,
  getMoveText,
  fenPositionKey
} from './chess-utils.js';
import { advAwardPlayerXp } from './adventure-progress.js';
import { advRefreshRecordedMoves } from './adventure-history.js';
import { getLevelObjective } from './level-objective.js';

export const DEFEAT_LINE_MAX_PLIES = 30;

let ensureStockfishReady = async () => null;
let renderGameDetails = () => {};
let renderGamePanel = () => {};
let clearGameCinematic = () => {};
let syncPlayModeButtons = () => {};
let setGameGraphPathToNode = () => {};
let renderGraph = () => {};
let setGameLocked = () => {};
let advanceOpponentTurn = async () => {};
let tryMoveInput = () => null;
let humanPlayerColor = () => 'w';
let opponentTurnColor = () => 'b';

export function initFreeReview(deps) {
  ensureStockfishReady = deps.ensureStockfishReady ?? ensureStockfishReady;
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
  renderGamePanel = deps.renderGamePanel ?? renderGamePanel;
  clearGameCinematic = deps.clearGameCinematic ?? clearGameCinematic;
  syncPlayModeButtons = deps.syncPlayModeButtons ?? syncPlayModeButtons;
  setGameGraphPathToNode = deps.setGameGraphPathToNode ?? setGameGraphPathToNode;
  renderGraph = deps.renderGraph ?? renderGraph;
  setGameLocked = deps.setGameLocked ?? setGameLocked;
  advanceOpponentTurn = deps.advanceOpponentTurn ?? advanceOpponentTurn;
  tryMoveInput = deps.tryMoveInput ?? tryMoveInput;
  humanPlayerColor = deps.humanPlayerColor ?? humanPlayerColor;
  opponentTurnColor = deps.opponentTurnColor ?? opponentTurnColor;
}

function createInitialReviewEntry(chess, evaluation) {
  const cpWhite = evaluation?.cpWhite ?? 0;
  return {
    index: 0,
    text: 'Départ',
    san: 'Départ',
    uci: '',
    color: chess.turn(),
    label: 'Position initiale',
    phase: 'start',
    beforeFen: chess.fen(),
    afterFen: chess.fen(),
    from: '',
    to: '',
    beforeEvalCp: cpWhite,
    afterEvalCp: cpWhite,
    parentIndex: null,
    branchLabel: 'Partie',
    depth: evaluation?.depth ?? 0,
    pv: evaluation?.pv ?? '',
    pvUci: evaluation?.pvUci ?? [],
    status: 'start',
    analysis: `Position initiale. Éval ${formatEval(cpWhite)}. La revue permet de rejouer mentalement toute la partie, livre et survie compris.`
  };
}

function advReviewBestAlternative(entry) {
  const parent = getReviewParent(entry);
  const pv = parent?.pv;
  if (!pv) {
    return '';
  }
  return String(pv).trim().split(/\s+/)[0] || '';
}

function buildReviewMoveAnalysis(entry) {
  if (entry.phase === 'start') {
    return entry.analysis;
  }

  const perspective = humanPlayerColor() === 'w' ? 1 : -1;
  const delta = (entry.afterEvalCp - entry.beforeEvalCp) * perspective;
  const evalText = `Éval ${formatEval(entry.beforeEvalCp)} → ${formatEval(entry.afterEvalCp)} (${formatEvalDelta(delta)}).`;
  const playerSide = humanPlayerColor() === 'w' ? 'blanc' : 'noir';
  const opponentSide = humanPlayerColor() === 'w' ? 'noir' : 'blanc';
  let verdict;
  if (entry.phase === 'opening') {
    verdict =
      entry.color === humanPlayerColor()
        ? `Coup du livre ${playerSide}: la partie reste dans l'arbre d'ouverture attendu.`
        : "Réponse du livre adverse: l'adversaire suit encore une branche préparée.";
  } else if (entry.phase === 'engine-line') {
    verdict =
      entry.color === humanPlayerColor()
        ? `Suite Stockfish côté ${playerSide}: la ligne forcée montre pourquoi la position reste difficile à sauver.`
        : `Suite Stockfish côté ${opponentSide}: la punition se précise dans la variante calculée.`;
  } else if (entry.color === humanPlayerColor()) {
    if (delta >= 45) {
      verdict = 'Très bon coup libre: tu améliores nettement la position.';
    } else if (delta >= 12) {
      verdict = 'Bon coup libre: la position progresse sans prendre de risque majeur.';
    } else if (delta > -15) {
      verdict = 'Coup stable: la position reste dans la même zone.';
    } else if (delta > -55) {
      verdict = 'Petite concession: la position baisse, mais reste encore jouable.';
    } else {
      verdict = `Coup coûteux: Stockfish voit une chute claire de la position ${playerSide}.`;
    }
  } else if (delta <= -45) {
    verdict = `Réponse ${opponentSide} forte: Stockfish creuse le déficit côté ${playerSide}.`;
  } else if (delta <= -12) {
    verdict = `Réponse ${opponentSide} utile: la pression augmente contre les ${playerSide === 'blanc' ? 'Blancs' : 'Noirs'}.`;
  } else if (delta < 15) {
    verdict = `Réponse ${opponentSide} neutre: l’équilibre d’évaluation bouge peu.`;
  } else {
    verdict = `Stockfish relâche un peu: l’évaluation remonte pour les ${playerSide === 'blanc' ? 'Blancs' : 'Noirs'}.`;
  }

  const thresholdText =
    entry.phase === 'free' &&
    entry.color === humanPlayerColor() &&
    entry.afterEvalCp < state.survivalLimitCp
      ? ` Le coup passe sous le seuil ${formatEval(state.survivalLimitCp)}.`
      : '';
  const statusText =
    entry.status === 'returned'
      ? ' Retour consommé: cette tentative a été annulée sur l’échiquier de partie.'
      : entry.status === 'losing'
        ? ' Coup de défaite immédiate: le seuil de survie est franchi.'
        : entry.status === 'evaluating'
          ? ' Évaluation détaillée en cours: le score affiché est provisoire.'
          : '';
  const pvText = entry.phase !== 'opening' && entry.pv ? ` Ligne Stockfish: ${entry.pv}.` : '';
  const humanEval =
    entry.phase !== 'opening' && Math.abs(entry.afterEvalCp) >= 80
      ? buildHumanEval(entry.afterFen, {
          cpWhite: entry.afterEvalCp,
          pv: entry.pv,
          pvUci: entry.pvUci
        })
      : null;
  const adviceText =
    humanEval && (entry.status === 'losing' || entry.phase === 'engine-line')
      ? ` ${humanEval.advice}`
      : '';
  const humanEvalText = humanEval ? ` Lecture humaine: ${humanEval.sentence}${adviceText}` : '';
  // L : préfixe catégoriel (Lichess) + meilleur coup disponible sur une faute.
  const moveVerdict = advMoveVerdict(entry);
  const verdictPrefix =
    moveVerdict && moveVerdict.key !== 'book' && moveVerdict.key !== 'good'
      ? `${moveVerdict.label}. `
      : '';
  const bestAlt =
    moveVerdict && ['inaccuracy', 'mistake', 'blunder'].includes(moveVerdict.key)
      ? advReviewBestAlternative(entry)
      : '';
  const bestAltText = bestAlt ? ` Meilleur coup : ${bestAlt}.` : '';
  return `${verdictPrefix}${verdict} ${evalText}${thresholdText}${statusText}${humanEvalText}${pvText}${bestAltText}`;
}

function ensureReviewTree(game = state.game) {
  if (!game?.freeReviewMoves?.length) {
    return;
  }

  if (!game.freeReview.preferredChildByParent) {
    game.freeReview.preferredChildByParent = {};
  }

  game.freeReviewMoves.forEach((entry, index) => {
    entry.index = index;
    if (index === 0) {
      entry.parentIndex = null;
      entry.branchLabel = entry.branchLabel || 'Partie';
      return;
    }

    if (
      !Number.isFinite(entry.parentIndex) ||
      entry.parentIndex < 0 ||
      entry.parentIndex >= index
    ) {
      entry.parentIndex = index - 1;
    }
  });
}

function getReviewChildren(parentIndex) {
  const game = state.game;
  if (!game?.freeReviewMoves?.length || !Number.isFinite(parentIndex)) {
    return [];
  }
  ensureReviewTree(game);
  return game.freeReviewMoves.filter((entry) => entry.parentIndex === parentIndex);
}

function getReviewParent(entry) {
  const game = state.game;
  if (!game || !entry || !Number.isFinite(entry.parentIndex)) {
    return null;
  }
  ensureReviewTree(game);
  return game.freeReviewMoves[entry.parentIndex] ?? null;
}

function getPreferredReviewChild(entry) {
  const game = state.game;
  if (!game || !entry) {
    return null;
  }

  const children = getReviewChildren(entry.index);
  if (!children.length) {
    return null;
  }

  const preferredIndex = game.freeReview.preferredChildByParent?.[entry.index];
  return children.find((child) => child.index === preferredIndex) ?? children[0];
}

function rememberReviewChild(entry) {
  const game = state.game;
  if (!game || !entry || !Number.isFinite(entry.parentIndex)) {
    return;
  }

  if (!game.freeReview.preferredChildByParent) {
    game.freeReview.preferredChildByParent = {};
  }
  game.freeReview.preferredChildByParent[entry.parentIndex] = entry.index;
}

function getReviewPath(entry) {
  const game = state.game;
  if (!game || !entry) {
    return [];
  }

  ensureReviewTree(game);
  const path = [];
  const seen = new Set();
  let current = entry;
  while (current && !seen.has(current.index)) {
    path.unshift(current);
    seen.add(current.index);
    current = getReviewParent(current);
  }
  return path;
}

function inferReviewBranchLabel(parentIndex) {
  const siblings = getReviewChildren(parentIndex);
  if (!siblings.length) {
    return '';
  }
  return `Variante ${siblings.length + 1}`;
}

function recordFreeReviewMove({
  move,
  label,
  beforeFen,
  beforeEvalCp,
  evaluation,
  phase = 'free',
  status = 'played',
  parentIndex = null,
  branchLabel = ''
}) {
  const game = state.game;
  if (!game || !move || !Number.isFinite(beforeEvalCp) || !evaluation) {
    return null;
  }

  // XP joueur : seuls les VRAIS coups blancs du joueur comptent, pondérés par
  // leur qualité. On exclut la suite de défaite (engine-line) et l'exploration
  // post-partie (analysis), qui ne sont pas des coups joués par l'humain.
  if (
    move.color === humanPlayerColor() &&
    Number.isFinite(evaluation.cpWhite) &&
    (phase === 'free' || phase === 'opening')
  ) {
    const perspective = humanPlayerColor() === 'w' ? 1 : -1;
    advAwardPlayerXp((evaluation.cpWhite - beforeEvalCp) * perspective);
  }

  ensureReviewTree(game);
  const safeParentIndex = Number.isFinite(parentIndex)
    ? clamp(Math.round(parentIndex), 0, Math.max(0, game.freeReviewMoves.length - 1))
    : game.freeReviewMoves.length
      ? game.freeReviewMoves.length - 1
      : null;
  const entry = {
    index: game.freeReviewMoves.length,
    text: getMoveText(move),
    san: move.san,
    uci: moveToUci(move),
    color: move.color,
    label,
    phase,
    beforeFen,
    afterFen: move.after ?? game.chess.fen(),
    from: move.from,
    to: move.to,
    beforeEvalCp,
    afterEvalCp: evaluation.cpWhite,
    parentIndex: safeParentIndex,
    branchLabel: branchLabel || inferReviewBranchLabel(safeParentIndex),
    depth: evaluation.depth,
    pv: evaluation.pv,
    pvUci: evaluation.pvUci ?? [],
    status
  };
  entry.analysis = buildReviewMoveAnalysis(entry);
  game.freeReviewMoves.push(entry);
  rememberReviewChild(entry);
  if (game.status !== 'playing') {
    game.freeReview.index = entry.index;
  }
  return entry;
}

function appendDefeatLineReview(fen, evaluation, lineUci = null) {
  const game = state.game;
  if (!game || game.defeatLineRecorded || !evaluation?.pvUci?.length) {
    return;
  }

  game.defeatLineRecorded = true;
  const chess = new Chess(fen);
  let beforeEvalCp = evaluation.cpWhite;
  const addedEntries = [];

  // B : on enregistre toute la suite de défaite (prolongée jusqu'au mat ou
  // au minimum de demi-coups) pour pouvoir la rejouer au ralenti. À défaut de
  // ligne explicite, on retombe sur la PV brute (compat).
  const recordedLine =
    lineUci && lineUci.length ? lineUci : evaluation.pvUci.slice(0, DEFEAT_LINE_MAX_PLIES);
  for (const uci of recordedLine) {
    const beforeFen = chess.fen();
    const move = playUciOnChess(chess, uci);
    if (!move) {
      break;
    }

    const terminal = terminalEvaluation(chess.fen());
    const provisionalEvaluation = terminal ?? {
      cpWhite: beforeEvalCp,
      depth: evaluation.depth,
      pv: '',
      pvUci: [],
      source: 'stockfish-line'
    };
    const entry = recordFreeReviewMove({
      move,
      label: 'Suite Stockfish',
      phase: 'engine-line',
      beforeFen,
      beforeEvalCp,
      evaluation: provisionalEvaluation,
      status: terminal ? 'engine-line' : 'evaluating'
    });

    if (entry) {
      entry.analysis = buildReviewMoveAnalysis(entry);
      addedEntries.push(entry);
      beforeEvalCp = entry.afterEvalCp;
    }
  }

  if (addedEntries.length) {
    hydrateDefeatLineEvaluations(game, addedEntries, evaluation.cpWhite);
  }
}

async function hydrateDefeatLineEvaluations(game, entries, initialCpWhite) {
  try {
    const evaluator = await ensureStockfishReady(false);
    let beforeEvalCp = initialCpWhite;
    for (const entry of entries) {
      if (state.game !== game || game.status === 'playing') {
        return;
      }
      entry.beforeEvalCp = beforeEvalCp;
      const evaluation = await evaluator.evaluate(entry.afterFen);
      entry.afterEvalCp = evaluation.cpWhite;
      entry.depth = evaluation.depth;
      entry.pv = evaluation.pv;
      entry.pvUci = evaluation.pvUci;
      entry.status = 'engine-line';
      entry.analysis = buildReviewMoveAnalysis(entry);
      beforeEvalCp = entry.afterEvalCp;
      if (game.freeReview.active) {
        renderGameDetails();
      } else {
        renderFreeReviewPanel();
      }
    }
    advRefreshRecordedMoves(game); // évals finales → maj de la partie sauvegardée
  } catch (error) {
    for (const entry of entries) {
      if (entry.status === 'evaluating') {
        entry.status = 'engine-line';
        entry.analysis = `${entry.analysis} Évaluation détaillée indisponible: ${error.message}`;
      }
    }
    if (state.game === game && game.status !== 'playing') {
      renderFreeReviewPanel();
    }
  }
}

function hasPostGameFreeReview() {
  return Boolean(
    state.game && state.game.status !== 'playing' && state.game.freeReviewMoves.length
  );
}

function isPostGameReviewPlayable() {
  const game = state.game;
  return Boolean(
    game &&
    game.status !== 'playing' &&
    game.freeReview?.active &&
    getActiveFreeReviewEntry() &&
    !game.locked &&
    !game.cinematic?.active
  );
}

function getActiveFreeReviewEntry() {
  const game = state.game;
  if (!game?.freeReview?.active || !game.freeReviewMoves.length) {
    return null;
  }
  ensureReviewTree(game);
  const index = clamp(game.freeReview.index, 0, game.freeReviewMoves.length - 1);
  return game.freeReviewMoves[index] ?? null;
}

function setFreeReviewIndex(index) {
  const game = state.game;
  if (!game?.freeReviewMoves.length) {
    return;
  }
  clearGameCinematic();
  ensureReviewTree(game);
  game.freeReview.active = true;
  game.freeReview.index = clamp(index, 0, game.freeReviewMoves.length - 1);
  game.selectedSquare = null;
  rememberReviewChild(game.freeReviewMoves[game.freeReview.index]);
  renderGameDetails();
}

function stopFreeReview() {
  if (!state.game) {
    return;
  }
  state.game.freeReview.active = false;
  renderGameDetails();
}

async function launchPostGameFreeAnalysis() {
  const game = state.game;
  if (!game || game.status === 'playing' || !game.freeReviewMoves.length) {
    return;
  }

  clearGameCinematic();
  const originEntry =
    getActiveFreeReviewEntry() ?? game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const chess = new Chess(originEntry.afterFen);
  const originEntries = game.freeReviewMoves
    .slice(0, originEntry.index + 1)
    .map((entry, index) => ({ ...entry, index }));
  const originNode =
    state.nodesByFen.get(chess.fen()) ?? state.nodesByPositionKey.get(fenPositionKey(chess.fen()));

  state.playMode = 'exploration';
  syncPlayModeButtons();
  game.mode = 'exploration';
  game.status = 'playing';
  game.phase = 'free';
  game.locked = false;
  game.chess = chess;
  game.currentNodeId = originNode?.id ?? game.currentNodeId ?? 'root';
  setGameGraphPathToNode(game.currentNodeId);
  game.objective = getLevelObjective(FIRST_LEVEL_NUMBER);
  game.freeRemaining = Number.POSITIVE_INFINITY;
  game.freeRoundPending = false;
  game.currentEvalCp = originEntry.afterEvalCp;
  game.currentPv = originEntry.pv ?? '';
  game.currentDepth = originEntry.depth ?? 0;
  game.lastMove = originEntry.uci
    ? {
        san: originEntry.san,
        from: originEntry.from,
        to: originEntry.to,
        color: originEntry.color,
        before: originEntry.beforeFen,
        after: originEntry.afterFen,
        promotion: originEntry.uci.length > 4 ? originEntry.uci.slice(4) : undefined
      }
    : null;
  game.freeReviewMoves = originEntries;
  game.freeReview.active = false;
  game.freeReview.index = -1;
  game.failureFen = null;
  game.failureEvaluation = null;
  game.defeatComment = '';
  game.expectedOpeningArrows = [];
  game.defeatLineRecorded = false;
  game.moveLog = originEntries
    .filter((entry) => entry.phase !== 'start')
    .slice(-8)
    .reverse()
    .map((entry) => ({
      text: entry.text,
      label: entry.label,
      color: entry.color
    }));
  game.message = `Analyse libre depuis ${originEntry.text}: joue n'importe quel coup légal, Stockfish répondra sans pénalité.`;

  renderGraph();
  renderGameDetails();

  if (game.chess.turn() === opponentTurnColor()) {
    setGameLocked(true);
    try {
      await advanceOpponentTurn();
    } catch (error) {
      game.message = `Analyse libre lancée, mais Stockfish n'a pas pu répondre: ${error.message}`;
    } finally {
      setGameLocked(false);
      renderGraph();
      renderGameDetails();
    }
  }
}

async function submitReviewVariationMove(rawInput = elements.moveInput.value) {
  const game = state.game;
  const parentEntry = getActiveFreeReviewEntry();
  if (!game || !parentEntry) {
    return;
  }

  const input = String(rawInput ?? '').trim();
  if (!input) {
    game.message = 'Entre un coup légal pour créer une variante.';
    renderGamePanel();
    return;
  }

  const chess = new Chess(parentEntry.afterFen);
  const beforeFen = chess.fen();
  const move = tryMoveInput(chess, input);
  if (!move) {
    game.message = `Coup illégal depuis ${parentEntry.text}.`;
    renderGameDetails();
    return;
  }

  game.selectedSquare = null;
  setGameLocked(true);
  try {
    const evaluator = await ensureStockfishReady(false);
    const evaluation = await evaluator.evaluate(chess.fen());
    const entry = recordFreeReviewMove({
      move,
      label: 'Analyse variante',
      phase: 'analysis',
      beforeFen,
      beforeEvalCp: parentEntry.afterEvalCp,
      evaluation,
      parentIndex: parentEntry.index
    });

    if (entry) {
      game.freeReview.active = true;
      game.freeReview.index = entry.index;
      game.message = `Variante créée depuis ${parentEntry.text}: ${move.san}.`;
      renderGameDetails();
    }
  } catch (error) {
    game.message = `Impossible de créer la variante: ${error.message}`;
    renderGameDetails();
  } finally {
    setGameLocked(false);
    renderGameDetails();
  }
}

function renderFreeReviewPanel() {
  const game = state.game;
  const inAdventure = state.screen === 'adventure';
  const host = inAdventure ? document.querySelector('#advReviewPanel') : elements.freeReviewPanel;
  // Masque le panneau de l'autre mode pour éviter tout doublon.
  const idle = inAdventure ? elements.freeReviewPanel : document.querySelector('#advReviewPanel');
  if (idle) {
    idle.replaceChildren();
    idle.hidden = true;
  }
  if (!host) {
    return;
  }
  host.replaceChildren();
  // Pendant la phase d'influence (revue ‹ › du choix d'ouverture), on masque
  // l'analyse rapide pour ne pas afficher une position différente de l'échiquier.
  if (game?.influence) {
    host.hidden = true;
    return;
  }
  // En aventure, on n'ouvre l'analyse rapide qu'après une vraie partie
  // (au-delà de la simple position de départ).
  const reviewReady = hasPostGameFreeReview() && (!inAdventure || game.freeReviewMoves.length > 1);
  if (!reviewReady) {
    host.hidden = true;
    return;
  }

  host.hidden = false;
  ensureReviewTree(game);
  const activeEntry =
    getActiveFreeReviewEntry() ?? game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const parentEntry = getReviewParent(activeEntry);
  const nextEntry = getPreferredReviewChild(activeEntry);
  const childEntries = getReviewChildren(activeEntry.index);
  const header = document.createElement('div');
  header.className = 'free-review-header';
  header.innerHTML = `
    <div>
      <span class="kicker">${inAdventure ? 'Analyse rapide' : isPostGameReviewPlayable() ? 'Analyse libre' : 'Revue de partie'}</span>
      <strong>${escapeHtml(activeEntry.text)}</strong>
    </div>
    <em>${activeEntry.index + 1}/${game.freeReviewMoves.length}</em>
  `;

  const controls = document.createElement('div');
  controls.className = 'free-review-controls';
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.textContent = '‹';
  prevButton.setAttribute('aria-label', 'Position précédente');
  prevButton.disabled = !parentEntry;
  prevButton.addEventListener('click', () => {
    if (parentEntry) {
      setFreeReviewIndex(parentEntry.index);
    }
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '›';
  nextButton.setAttribute('aria-label', 'Position suivante');
  nextButton.disabled = !nextEntry;
  nextButton.addEventListener('click', () => {
    if (nextEntry) {
      setFreeReviewIndex(nextEntry.index);
    }
  });

  const finalButton = document.createElement('button');
  finalButton.type = 'button';
  finalButton.textContent = game.freeReview.active ? 'Finale' : 'Revoir';
  finalButton.addEventListener('click', () => {
    if (game.freeReview.active) {
      stopFreeReview();
      return;
    }
    setFreeReviewIndex(activeEntry.index);
  });
  controls.append(prevButton, finalButton, nextButton);

  const branches = document.createElement('div');
  branches.className = 'free-review-branches';
  if (childEntries.length) {
    const label = document.createElement('strong');
    label.textContent = 'Suites depuis ici';
    branches.append(label);
    for (const child of childEntries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = nextEntry?.index === child.index ? 'is-active' : '';
      button.innerHTML = `
        <span>${escapeHtml(child.san || child.text)}</span>
        <em>${escapeHtml(child.branchLabel || 'suite')}</em>
      `;
      button.addEventListener('click', () => setFreeReviewIndex(child.index));
      branches.append(button);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'free-review-actions';
  const analysisButton = document.createElement('button');
  analysisButton.type = 'button';
  analysisButton.className = 'free-review-analysis-button';
  analysisButton.textContent = 'Jouer contre Stockfish depuis ici';
  analysisButton.addEventListener('click', () => {
    launchPostGameFreeAnalysis().catch((error) => {
      if (state.game) {
        state.game.message = `Impossible de lancer l'analyse libre: ${error.message}`;
        renderGamePanel();
      }
    });
  });
  actions.append(analysisButton);

  const list = document.createElement('div');
  list.className = 'free-review-list';
  for (const entry of game.freeReviewMoves) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = entry.index === activeEntry.index ? 'is-active' : '';
    // L : badge de verdict (bon/imprécision/erreur/gaffe) sur les coups du joueur.
    const verdict = advMoveVerdict(entry);
    const badge = verdict
      ? `<i class="move-verdict is-${verdict.cls}" title="${escapeHtml(verdict.label)}">${escapeHtml(
          verdict.short
        )}</i>`
      : '';
    button.innerHTML = `
      <span>${escapeHtml(entry.text)}${badge}</span>
      <em>${escapeHtml(entry.branchLabel || formatEval(entry.afterEvalCp))}</em>
    `;
    button.addEventListener('click', () => setFreeReviewIndex(entry.index));
    list.append(button);
  }

  host.append(header, controls);
  if (childEntries.length) {
    host.append(branches);
  }
  // Le bouton « Jouer contre Stockfish depuis ici » s'appuie sur le mode
  // exploration, lequel masque le plateau dans la vue cerveau de l'aventure.
  // On l'omet en aventure et on conserve la navigation pas-à-pas + variantes
  // jouables sur l'échiquier comme analyse rapide.
  if (!inAdventure) {
    host.append(actions);
  }
  host.append(list);
}

export {
  createInitialReviewEntry,
  advReviewBestAlternative,
  buildReviewMoveAnalysis,
  ensureReviewTree,
  getReviewChildren,
  getReviewParent,
  getPreferredReviewChild,
  rememberReviewChild,
  getReviewPath,
  inferReviewBranchLabel,
  recordFreeReviewMove,
  appendDefeatLineReview,
  hydrateDefeatLineEvaluations,
  hasPostGameFreeReview,
  isPostGameReviewPlayable,
  getActiveFreeReviewEntry,
  setFreeReviewIndex,
  stopFreeReview,
  launchPostGameFreeAnalysis,
  submitReviewVariationMove,
  renderFreeReviewPanel
};
