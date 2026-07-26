import { Chess } from './vendor/chess.js';
import { state } from './state.js';
import { FIRST_LEVEL_NUMBER } from './constants.js';
import { getRawOutgoingEdges } from './graph.js';
import { advShuffle, advQuizOptions, advPickBookEdge } from './adventure-utils.js';
import { advCurrentDifficulty } from './adventure-progress.js';
import { advAids } from './adventure-aids.js';
import { advAddXp } from './adventure-status.js';
import { advScoreInit, advScoreRegisterMove } from './adventure-scoring.js';
import { advFormatGameOpponent } from './adventure-history.js';
import { closeAdventureMap } from './adventure-map.js';
import { showAdventureToast } from './toast.js';

let advXpBookMove = 4;
let setViewMode = () => {};
let setAdvViewMode = () => {};
let startNewGame = () => {};
let setGameLocked = () => {};
let renderAdventureHud = () => {};
let renderGameDetails = () => {};
let renderGamePanel = () => {};
let flashAdvBoard = () => {};
let tryMoveInput = () => null;
let finishGame = () => {};
let humanPlayerColor = () => 'w';

export function initAdventureRevision(deps = {}) {
  advXpBookMove = deps.advXpBookMove ?? advXpBookMove;
  setViewMode = deps.setViewMode ?? setViewMode;
  setAdvViewMode = deps.setAdvViewMode ?? setAdvViewMode;
  startNewGame = deps.startNewGame ?? startNewGame;
  setGameLocked = deps.setGameLocked ?? setGameLocked;
  renderAdventureHud = deps.renderAdventureHud ?? renderAdventureHud;
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
  renderGamePanel = deps.renderGamePanel ?? renderGamePanel;
  flashAdvBoard = deps.flashAdvBoard ?? flashAdvBoard;
  tryMoveInput = deps.tryMoveInput ?? tryMoveInput;
  finishGame = deps.finishGame ?? finishGame;
  humanPlayerColor = deps.humanPlayerColor ?? humanPlayerColor;
}

export function advBuildQuizSteps() {
  const lineSans = [];
  const lineUcis = [];
  const lineColors = [];
  let nodeId = 'root';
  const visited = new Set();
  for (let i = 0; i < 16; i += 1) {
    if (visited.has(nodeId)) break;
    visited.add(nodeId);
    const outs = getRawOutgoingEdges(nodeId);
    if (!outs.length) break;
    const blackToMove = outs[0].color === 'b';
    const edge = blackToMove
      ? advPickBookEdge(outs)
      : outs.slice().sort((a, b) => (b.probability || 0) - (a.probability || 0))[0];
    if (!edge) break;
    lineSans.push(edge.san);
    lineUcis.push(edge.uci);
    lineColors.push(edge.color);
    nodeId = edge.to;
  }
  const playerIdx = [];
  for (let idx = 0; idx < lineSans.length; idx += 1) {
    if (lineColors[idx] === humanPlayerColor() && (humanPlayerColor() === 'b' || idx >= 2)) {
      playerIdx.push(idx);
    }
  }
  const chosen = advShuffle(playerIdx)
    .slice(0, 3)
    .sort((a, b) => a - b);
  const steps = [];
  for (const idx of chosen) {
    const options = advQuizOptions(lineSans.slice(0, idx), lineUcis[idx]);
    if (options.length >= 2) {
      steps.push({
        lead: lineSans.slice(0, idx),
        correctUci: lineUcis[idx],
        correctSan: lineSans[idx],
        options
      });
    }
  }
  return steps;
}

export function advBuildMateSteps() {
  const games = (state.adventure?.games || []).filter(
    (game) => game.result === 'won' && Array.isArray(game.moves) && game.moves.length >= 6
  );
  if (!games.length) {
    return { steps: [], label: null };
  }
  const game = games[0];
  const sans = game.moves
    .map((move) => move.san || move.move?.san)
    .filter((san) => typeof san === 'string');
  const colors = game.moves
    .map((move) => move.color || move.move?.color)
    .filter((color) => typeof color === 'string');
  let chess;
  try {
    chess = new Chess();
  } catch {
    return { steps: [], label: null };
  }
  const ucis = [];
  const playedSans = [];
  for (const san of sans) {
    let move = null;
    try {
      move = chess.move(san);
    } catch {
      move = null;
    }
    if (!move) break;
    ucis.push(move.from + move.to + (move.promotion || ''));
    playedSans.push(move.san);
  }
  const count = Math.min(playedSans.length, ucis.length);
  const steps = [];
  for (let idx = count - 1; idx >= 0 && steps.length < 2; idx -= 1) {
    if (colors[idx] !== humanPlayerColor()) continue;
    const options = advQuizOptions(playedSans.slice(0, idx), ucis[idx]);
    if (options.length >= 2) {
      steps.unshift({
        lead: playedSans.slice(0, idx),
        correctUci: ucis[idx],
        correctSan: playedSans[idx],
        options
      });
    }
  }
  return { steps, label: advFormatGameOpponent(game) };
}

export function launchRevision(mode) {
  let steps = [];
  let label = null;
  if (mode === 'mate') {
    const built = advBuildMateSteps();
    steps = built.steps;
    label = built.label;
    if (!steps.length) {
      showAdventureToast({
        icon: '🏆',
        title: 'Pas encore de mat à rejouer',
        text: 'Gagne d’abord une partie d’arène par mat, puis reviens la rejouer.',
        kind: null
      });
      return;
    }
  } else {
    steps = advBuildQuizSteps();
    if (!steps.length) {
      showAdventureToast({
        icon: '⚡',
        title: 'Quiz indisponible',
        text: 'Le livre est trop court.',
        kind: null
      });
      return;
    }
  }
  state.advRun = {
    kind: 'lesson',
    revisionMode: mode,
    revisionLabel: label,
    steps,
    stepIndex: 0,
    correctCount: 0,
    streak: 0,
    wrongMoves: 0,
    bookMoves: 0,
    completed: false
  };
  advScoreInit(state.advRun, steps.length);
  state.playMode = 'challenge';
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.clock = null;
    state.game.revision = { phase: 'replay', step: null, answerUci: null };
    setGameLocked(true);
  }
  renderAdventureHud();
  advRevisionPlayStep();
}

export function advRevisionKeysRevealableOnError() {
  return Boolean(advCurrentDifficulty().legalDotsRevealable);
}

export function advRevisionPlayStep() {
  const run = state.advRun;
  const game = state.game;
  if (!run?.revisionMode || !game) {
    return;
  }
  const step = run.steps[run.stepIndex];
  if (!step) {
    advRevisionFinish();
    return;
  }
  setGameLocked(true);
  game.revision = {
    phase: 'replay',
    step,
    answerUci: null,
    keysRevealed: advAids().moveChoices,
    attempted: false
  };
  game.message = 'Rejeu accéléré de la ligne…';
  renderGameDetails();
  renderGamePanel();
  const timer = setInterval(() => {
    if (state.game !== game || state.advRun !== run || game.status !== 'playing') {
      clearInterval(timer);
      return;
    }
    const played = game.chess.history().length;
    if (played >= step.lead.length) {
      clearInterval(timer);
      game.revision.phase = 'question';
      game.message = game.revision.keysRevealed
        ? `Quel est le bon coup des ${humanPlayerColor() === 'w' ? 'Blancs' : 'Noirs'} ? Réponds avec les touches du bas.`
        : `Joue le bon coup des ${humanPlayerColor() === 'w' ? 'Blancs' : 'Noirs'} directement sur l’échiquier.`;
      run.scoreMoveStart = Date.now();
      run.scoreMoveErrors = 0;
      setGameLocked(false);
      renderGameDetails();
      renderGamePanel();
      return;
    }
    let move = null;
    try {
      move = game.chess.move(step.lead[played]);
    } catch {
      move = null;
    }
    if (!move) {
      clearInterval(timer);
      advRevisionFinish();
      return;
    }
    game.lastMove = move;
    renderGameDetails();
  }, 420);
}

export function advRevisionAnswer(uci) {
  const run = state.advRun;
  const game = state.game;
  const rev = game?.revision;
  if (!run?.revisionMode || !rev || rev.phase !== 'question') {
    return;
  }
  const step = rev.step;
  const correct = uci === step.correctUci;
  if (!rev.attempted) {
    rev.attempted = true;
    run.scoreElapsedMs = run.scoreMoveStart ? Date.now() - run.scoreMoveStart : null;
    if (correct) {
      run.correctCount += 1;
    }
  }
  if (!correct) {
    run.scoreMoveErrors = (run.scoreMoveErrors || 0) + 1;
  }
  if (!correct && !rev.keysRevealed && advRevisionKeysRevealableOnError()) {
    rev.keysRevealed = true;
    rev.errorHint = true;
    game.selectedSquare = null;
    game.message = '❌ Pas celui-là. Les propositions apparaissent : choisis le bon coup.';
    flashAdvBoard('bad');
    renderGameDetails();
    renderGamePanel();
    return;
  }
  rev.phase = 'feedback';
  rev.answerUci = uci;
  advScoreRegisterMove(run, run.scoreElapsedMs);
  game.selectedSquare = null;
  setGameLocked(true);
  let move = null;
  try {
    move = game.chess.move(step.correctSan);
  } catch {
    move = null;
  }
  if (move) {
    game.lastMove = move;
  }
  game.message = correct
    ? `✅ Bravo : ${step.correctSan} !`
    : `❌ Le bon coup était ${step.correctSan}.`;
  flashAdvBoard(correct ? 'good' : 'bad');
  renderGameDetails();
  renderGamePanel();
  setTimeout(() => {
    if (state.game !== game || state.advRun !== run) {
      return;
    }
    run.stepIndex += 1;
    if (run.stepIndex >= run.steps.length) {
      advRevisionFinish();
    } else {
      advRevisionPlayStep();
    }
  }, 1500);
}

export function advRevisionAnswerInput(input) {
  const game = state.game;
  const step = game?.revision?.step;
  if (!step) {
    return;
  }
  let probe;
  try {
    probe = new Chess(game.chess.fen());
  } catch {
    return;
  }
  const move = tryMoveInput(probe, input);
  if (!move) {
    game.message = 'Coup illégal ou illisible.';
    renderGamePanel();
    return;
  }
  advRevisionAnswer(`${move.from}${move.to}${move.promotion ?? ''}`);
}

export function advRevisionFinish() {
  const run = state.advRun;
  const game = state.game;
  if (!run?.revisionMode || !game || run.completed) {
    return;
  }
  run.completed = true;
  game.revision = { phase: 'done', step: null, answerUci: null };
  advAddXp(advXpBookMove * Math.max(1, run.correctCount));
  finishGame('won', `Révision terminée : ${run.correctCount}/${run.steps.length}.`);
  renderGameDetails();
  renderGamePanel();
}
