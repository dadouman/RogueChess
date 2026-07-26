import { Chess } from './vendor/chess.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { STARTING_LIVES } from './adventure-status.js';
import { renderAdventureHud } from './adventure-hud.js';
import { advScoreArmTimer } from './adventure-scoring.js';
import {
  getActiveFreeReviewEntry,
  getReviewPath,
  isPostGameReviewPlayable,
  renderFreeReviewPanel
} from './free-review.js';
import { getNode } from './graph.js';
import { formatEval, formatEvalDelta, evalToBarPct } from './eval-commentary.js';
import { formatSourceList, formatGamePhase, formatFreeRemaining } from './game-format.js';
import { isMateObjective } from './level-objective.js';
import { renderClocks } from './clocks.js';
import { escapeHtml, formatPercent, sideLabel } from './utils.js';
import { STOCKFISH_DEPTH, formatStockfishLevel } from './engine.js';
import { renderAdvLives } from './adventure-progress-hud.js';

let makeGameBoardNode = () => null;
let getGameNode = () => null;
let getGameInfoAnalysis = () => '';
let formatGamePanelMessage = () => '';
let renderBoard = () => {};
let renderZoomBoard = () => {};
let renderSegmentExplorer = () => {};
let setInfoAnalysis = () => {};
let applyAdvBoardHints = () => {};
let updateAdvBoardFeedback = () => {};
let applyAdvInfluenceArrows = () => {};
let isExplorationMode = () => false;
let getExpectedWhiteBookEdges = () => [];
let buildLiveBookEdgesForNode = () => [];
let getOpponentBookEdgesForRun = () => [];
let buildOpponentBookCandidates = () => [];
let submitHumanMove = () => {};

export function initGamePanelRender(deps = {}) {
  makeGameBoardNode = deps.makeGameBoardNode ?? makeGameBoardNode;
  getGameNode = deps.getGameNode ?? getGameNode;
  getGameInfoAnalysis = deps.getGameInfoAnalysis ?? getGameInfoAnalysis;
  formatGamePanelMessage = deps.formatGamePanelMessage ?? formatGamePanelMessage;
  renderBoard = deps.renderBoard ?? renderBoard;
  renderZoomBoard = deps.renderZoomBoard ?? renderZoomBoard;
  renderSegmentExplorer = deps.renderSegmentExplorer ?? renderSegmentExplorer;
  setInfoAnalysis = deps.setInfoAnalysis ?? setInfoAnalysis;
  applyAdvBoardHints = deps.applyAdvBoardHints ?? applyAdvBoardHints;
  updateAdvBoardFeedback = deps.updateAdvBoardFeedback ?? updateAdvBoardFeedback;
  applyAdvInfluenceArrows = deps.applyAdvInfluenceArrows ?? applyAdvInfluenceArrows;
  isExplorationMode = deps.isExplorationMode ?? isExplorationMode;
  getExpectedWhiteBookEdges = deps.getExpectedWhiteBookEdges ?? getExpectedWhiteBookEdges;
  buildLiveBookEdgesForNode = deps.buildLiveBookEdgesForNode ?? buildLiveBookEdgesForNode;
  getOpponentBookEdgesForRun = deps.getOpponentBookEdgesForRun ?? getOpponentBookEdgesForRun;
  buildOpponentBookCandidates = deps.buildOpponentBookCandidates ?? buildOpponentBookCandidates;
  submitHumanMove = deps.submitHumanMove ?? submitHumanMove;
}

export function renderGameDetails() {
  const game = state.game;
  if (!game) {
    return;
  }
  renderClocks();

  const boardNode = makeGameBoardNode();
  const reviewEntry = getActiveFreeReviewEntry();
  const currentNode = getGameNode();
  const phaseLabel = formatGamePhase(game);
  elements.nodeTitle.textContent = reviewEntry
    ? 'Revue de partie'
    : game.status === 'won'
      ? game.finalVictory
        ? 'Campagne terminée'
        : 'Niveau réussi'
      : game.status === 'lost'
        ? 'Partie perdue'
        : game.mateResolution?.active
          ? game.chess.turn() === game.mateResolution.playerColor
            ? 'À toi de mater'
            : 'Stockfish défend'
          : game.chess.turn() === 'w'
            ? 'Aux Blancs'
            : 'Réponse noire';
  elements.nodeSubtitle.textContent = reviewEntry
    ? `${reviewEntry.text} · ${reviewEntry.label} · ${reviewEntry.index + 1}/${game.freeReviewMoves.length}`
    : game.mateResolution?.active
      ? game.message
      : game.phase === 'opening'
        ? "Reste dans les coups d'ouverture attendus."
        : isExplorationMode()
          ? 'Exploration libre: teste la position contre Stockfish.'
          : isMateObjective(game)
            ? `Objectif final: mater sans passer sous ${formatEval(state.survivalLimitCp)}.`
            : `Survie Stockfish: ${game.freeRemaining}/${game.objective.target} coups complets restants.`;
  elements.nodeEval.textContent = reviewEntry
    ? formatEval(reviewEntry.afterEvalCp)
    : formatEval(game.currentEvalCp);
  elements.nodeFuture.textContent = reviewEntry
    ? formatEvalDelta(reviewEntry.afterEvalCp - reviewEntry.beforeEvalCp)
    : game.phase === 'free'
      ? formatFreeRemaining(game)
      : formatEval(currentNode?.futureMeanCp);
  elements.nodeTurn.textContent = sideLabel(reviewEntry ? boardNode.sideToMove : game.chess.turn());
  setInfoAnalysis(
    reviewEntry ? reviewEntry.analysis : getGameInfoAnalysis(game, currentNode),
    reviewEntry
      ? reviewEntry.phase === 'opening'
        ? 'Livre d’ouverture + évaluation pré-calculée'
        : reviewEntry.phase === 'start'
          ? 'Position initiale'
          : reviewEntry.phase === 'engine-line'
            ? `Suite Stockfish d${reviewEntry.depth || STOCKFISH_DEPTH}`
            : `Stockfish d${reviewEntry.depth || STOCKFISH_DEPTH}`
      : formatSourceList(currentNode?.sources ?? [])
  );
  state.currentPreviewNode = boardNode;

  renderBoard(boardNode);
  renderZoomBoard(boardNode);
  renderSegmentExplorer(null);
  renderGameChoices();
  renderGamePanel(phaseLabel);
  updateLiveEvalBar(reviewEntry ? reviewEntry.afterEvalCp : game.currentEvalCp);
  renderRailMoveLog();
  applyAdvBoardHints();
  updateAdvBoardFeedback();
  renderAdvLives();
  advScoreArmTimer();
  applyAdvInfluenceArrows();
  document.body.classList.toggle('is-influence-review', Boolean(game.influence));
  document.body.classList.toggle('is-victory-cinematic', Boolean(game.victoryCinematic));
}

export function renderGamePanel(phaseLabel = null) {
  const game = state.game;
  if (!game) {
    return;
  }

  const reviewEntry = getActiveFreeReviewEntry();
  const phase = phaseLabel ?? formatGamePhase(game);
  elements.gameLevelLabel.textContent = isExplorationMode()
    ? 'Exploration'
    : `Niveau ${game.level}`;
  elements.gameTitle.textContent =
    game.status === 'won'
      ? game.finalVictory
        ? 'Campagne terminée'
        : 'Niveau réussi'
      : game.status === 'lost'
        ? 'Fin de partie'
        : isExplorationMode()
          ? 'Mode exploration'
          : game.phase === 'opening'
            ? "Livre d'ouverture"
            : isMateObjective(game)
              ? 'Objectif mat'
              : 'Survie contre Stockfish';
  elements.gamePhase.textContent = phase;
  elements.gameFreeRemaining.textContent = formatFreeRemaining(game);
  elements.gameEval.textContent = formatEval(reviewEntry?.afterEvalCp ?? game.currentEvalCp);
  elements.gameTurn.textContent = sideLabel(
    reviewEntry ? reviewEntry.afterFen.split(/\s+/)[1] : game.chess.turn()
  );
  elements.gameMessage.textContent = formatGamePanelMessage(game, reviewEntry);
  const reviewPlayable = isPostGameReviewPlayable();
  elements.playMoveButton.disabled =
    game.locked || !(reviewPlayable || (game.status === 'playing' && game.chess.turn() === 'w'));
  elements.moveInput.disabled = elements.playMoveButton.disabled;
  const inputSide = reviewPlayable ? sideLabel(reviewEntry.afterFen.split(/\s+/)[1]) : 'Blancs';
  elements.moveInputLabel.textContent = reviewPlayable ? `Coup des ${inputSide}` : 'Coup blanc';
  elements.moveInput.placeholder = reviewPlayable ? `${inputSide}: SAN ou UCI` : 'ex. Nf3 ou g1f3';
  elements.newGameButton.textContent =
    game.status === 'playing'
      ? isExplorationMode()
        ? 'Réinitialiser'
        : 'Recommencer'
      : game.status === 'won' && !game.finalVictory && !isExplorationMode()
        ? 'Niveau suivant'
        : game.status === 'lost' && !isExplorationMode()
          ? 'Réessayer'
          : 'Nouvelle partie';

  elements.lifeRow.replaceChildren();
  if (isExplorationMode()) {
    const pip = document.createElement('span');
    pip.className = 'life-pip is-live is-exploration';
    pip.textContent = 'Sans perte de vie';
    elements.lifeRow.append(pip);
  } else if (game.phase === 'free') {
    const pip = document.createElement('span');
    pip.className = 'life-pip is-live is-sudden-death';
    pip.textContent = 'Mort subite';
    elements.lifeRow.append(pip);
  } else {
    for (let index = 0; index < STARTING_LIVES; index += 1) {
      const pip = document.createElement('span');
      pip.className = `life-pip ${index < game.lives ? 'is-live' : 'is-empty'}`;
      pip.textContent = `Vie ${index + 1}`;
      elements.lifeRow.append(pip);
    }
  }

  renderExpectedMoveList();
  renderOpponentGraphMini();
  renderMoveLog();
  renderFreeReviewPanel();
  if (state.screen === 'adventure') {
    renderAdventureHud();
  }
}

function renderExpectedMoveList() {
  const game = state.game;
  elements.expectedMoveList.replaceChildren();
  if (isPostGameReviewPlayable()) {
    const reviewEntry = getActiveFreeReviewEntry();
    const chess = new Chess(reviewEntry.afterFen);
    const free = document.createElement('span');
    free.className = 'expected-pill is-free';
    free.textContent = `Analyse ${sideLabel(chess.turn())}`;
    elements.expectedMoveList.append(free);
    for (const san of chess.moves().slice(0, 6)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'expected-pill';
      button.textContent = san;
      button.addEventListener('click', () => submitHumanMove(san));
      elements.expectedMoveList.append(button);
    }
    return;
  }

  if (!game || game.status !== 'playing') {
    return;
  }

  if (game.locked) {
    const pill = document.createElement('span');
    pill.className = 'expected-pill is-muted';
    pill.textContent = 'Stockfish calcule';
    elements.expectedMoveList.append(pill);
    return;
  }

  const playerColorForPanel = game.mateResolution?.active ? game.mateResolution.playerColor : 'w';
  if (game.chess.turn() !== playerColorForPanel) {
    const pill = document.createElement('span');
    pill.className = 'expected-pill is-muted';
    pill.textContent = game.mateResolution?.active ? 'Défense de Stockfish' : 'Réponse noire';
    elements.expectedMoveList.append(pill);
    return;
  }

  const expected = getExpectedWhiteBookEdges();
  if (game.phase === 'opening' && expected.length) {
    if (isExplorationMode()) {
      const free = document.createElement('span');
      free.className = 'expected-pill is-free';
      free.textContent = 'Livre conseillé';
      elements.expectedMoveList.append(free);
    }
    for (const edge of expected) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'expected-pill';
      button.textContent = edge.san;
      button.addEventListener('click', () => submitHumanMove(edge.san));
      elements.expectedMoveList.append(button);
    }
    return;
  }

  const free = document.createElement('span');
  free.className = 'expected-pill is-free';
  free.textContent = isExplorationMode()
    ? `Coup libre: seuil indicatif ${formatEval(state.survivalLimitCp)}`
    : isMateObjective(game)
      ? `Objectif mat: reste >= ${formatEval(state.survivalLimitCp)}`
      : `Coup libre: reste >= ${formatEval(state.survivalLimitCp)}`;
  elements.expectedMoveList.append(free);
  for (const san of game.chess.moves().slice(0, 6)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expected-pill';
    button.textContent = san;
    button.addEventListener('click', () => submitHumanMove(san));
    elements.expectedMoveList.append(button);
  }
}

function renderOpponentGraphMini() {
  const game = state.game;
  elements.opponentGraphMini.replaceChildren();
  if (!game) {
    return;
  }

  const title = document.createElement('strong');
  title.textContent = 'Plan adverse';
  elements.opponentGraphMini.append(title);

  let rows = [];
  if (game.phase === 'opening' && game.chess.turn() === 'b') {
    rows = buildOpponentBookCandidates(getOpponentBookEdgesForRun()).map((candidate) => ({
      label: candidate.type === 'free' ? candidate.label : candidate.edge.san,
      value: formatPercent(candidate.probability)
    }));
  } else if (game.phase === 'opening') {
    rows = getExpectedWhiteBookEdges()
      .flatMap((whiteEdge) => {
        const childEdges = buildLiveBookEdgesForNode(whiteEdge.to, 'b');
        const childPly = game.chess.history().length + 1;
        return buildOpponentBookCandidates(childEdges, childPly).map((candidate) => ({
          label:
            candidate.type === 'free'
              ? `${whiteEdge.san} → Stockfish`
              : `${whiteEdge.san} → ${candidate.edge.san}`,
          value: formatPercent(candidate.probability)
        }));
      })
      .slice(0, 4);
  } else {
    rows = [
      {
        label: 'Stockfish libre',
        value: formatStockfishLevel()
      }
    ];
  }

  if (!rows.length) {
    rows.push({ label: 'Fin de branche', value: 'Stockfish' });
  }

  for (const row of rows.slice(0, 5)) {
    const item = document.createElement('span');
    item.innerHTML = `<span>${escapeHtml(row.label)}</span><em>${escapeHtml(row.value)}</em>`;
    elements.opponentGraphMini.append(item);
  }
}

function renderMoveLog() {
  elements.moveLogList.replaceChildren();
  const reviewEntry = getActiveFreeReviewEntry();
  const moves = reviewEntry
    ? getReviewPath(reviewEntry)
        .filter((entry) => entry.phase !== 'start')
        .slice(-8)
        .reverse()
        .map((entry) => ({
          text: entry.text,
          label: entry.branchLabel ? `${entry.label} · ${entry.branchLabel}` : entry.label,
          color: entry.color
        }))
    : (state.game?.moveLog ?? []);
  for (const item of moves) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.label)}</span>`;
    elements.moveLogList.append(row);
  }
}

function updateLiveEvalBar(cpWhite) {
  const fill = elements.liveEvalBarFill;
  if (!fill) {
    return;
  }
  fill.style.width = `${evalToBarPct(cpWhite)}%`;
}

function renderRailMoveLog() {
  const list = elements.liveMoveLog;
  if (!list) {
    return;
  }
  list.replaceChildren();
  const moves = state.game?.moveLog ?? [];
  for (const item of moves) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.label)}</span>`;
    list.append(row);
  }
}

function renderGameChoices() {
  const game = state.game;
  elements.choiceList.replaceChildren();
  if (!game) {
    return;
  }

  if (isPostGameReviewPlayable()) {
    const reviewEntry = getActiveFreeReviewEntry();
    const chess = new Chess(reviewEntry.afterFen);
    const intro = document.createElement('p');
    intro.textContent = `Créer une variante depuis ${reviewEntry.text}.`;
    elements.choiceList.append(intro);
    for (const san of chess.moves().slice(0, 10)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'choice-row';
      row.innerHTML = `
        <strong>${escapeHtml(san)}</strong>
        <span>Créer une variante depuis cette position</span>
        <em>${escapeHtml(sideLabel(chess.turn()))}</em>
      `;
      row.addEventListener('click', () => submitHumanMove(san));
      elements.choiceList.append(row);
    }
    return;
  }

  if (game.status !== 'playing') {
    const summary = document.createElement('p');
    summary.textContent =
      game.freeReviewMoves.length > 1
        ? `${game.message} Utilise la revue de partie pour revenir sur chaque position jouée.`
        : game.message;
    elements.choiceList.append(summary);
    return;
  }

  if (game.chess.turn() !== 'w' || game.locked) {
    const waiting = document.createElement('p');
    waiting.textContent = 'Les Noirs réfléchissent.';
    elements.choiceList.append(waiting);
    return;
  }

  const expected = getExpectedWhiteBookEdges();
  if (game.phase === 'opening' && expected.length) {
    if (isExplorationMode()) {
      const free = document.createElement('p');
      free.textContent =
        'Exploration: les coups du livre sont proposés, mais tu peux aussi jouer directement sur l’échiquier pour sortir de la ligne.';
      elements.choiceList.append(free);
    }
    for (const edge of expected) {
      const child = getNode(edge.to);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'choice-row';
      row.innerHTML = `
        <strong>${escapeHtml(edge.san)}</strong>
        <span>${escapeHtml(edge.comments[0] ?? child?.comments[0] ?? "Coup d'ouverture attendu")}</span>
        <em>livre</em>
      `;
      row.addEventListener('click', () => submitHumanMove(edge.san));
      elements.choiceList.append(row);
    }
    return;
  }

  const free = document.createElement('p');
  free.textContent = isExplorationMode()
    ? `Exploration libre: joue n’importe quel coup légal, le seuil ${formatEval(state.survivalLimitCp)} sert seulement de repère.`
    : isMateObjective(game)
      ? `Objectif mat: joue un coup légal qui garde l’évaluation à ${formatEval(state.survivalLimitCp)} ou mieux jusqu’au mat.`
      : `Coup libre: joue un coup légal qui garde l’évaluation à ${formatEval(state.survivalLimitCp)} ou mieux.`;
  elements.choiceList.append(free);
  for (const san of game.chess.moves().slice(0, 10)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'choice-row';
    row.innerHTML = `
      <strong>${escapeHtml(san)}</strong>
      <span>Coup légal disponible en phase libre</span>
      <em>libre</em>
    `;
    row.addEventListener('click', () => submitHumanMove(san));
    elements.choiceList.append(row);
  }
}
