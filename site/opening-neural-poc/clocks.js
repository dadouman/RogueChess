// Runtime de la pendule Aventure : initialisation de l'horloge, ticker temps réel
// de l'horloge du joueur, décompte de Stockfish (échantillon loi normale) et rendu
// de l'affichage (#advClocks). Couplé à l'état (state.game.clock) et au DOM.
// La fin de partie au temps (finishGame) est INJECTÉE via initClocks pour éviter
// une dépendance circulaire avec app.js.
import { state } from './state.js';
import { getTimeControlConfig, sampleStockfishMoveTime, formatClock } from './time-control.js';
import { advSetText } from './dom.js';

// Fin de partie (au temps), injectée par app.js (cf. initClocks).
let finishGame = () => {};
let humanPlayerColor = () => 'w';
let opponentTurnColor = () => 'b';

export function initClocks(deps) {
  finishGame = deps.finishGame ?? finishGame;
  humanPlayerColor = deps.humanPlayerColor ?? humanPlayerColor;
  opponentTurnColor = deps.opponentTurnColor ?? opponentTurnColor;
}

export function makeInitialClock() {
  const tc = getTimeControlConfig(state.adventure?.timeControl);
  if (state.screen !== 'adventure' || tc.id === 'off') {
    return null;
  }
  return { control: tc.id, w: tc.baseMs, b: tc.baseMs, lastTickTs: null };
}

let clockTimer = null;

export function startClockTicker() {
  if (clockTimer) {
    return;
  }
  clockTimer = setInterval(tickClock, 200);
}

// Décompte temps réel de l'horloge du joueur quand c'est à lui de jouer.
// L'horloge de Stockfish, elle, est décrémentée d'un échantillon (loi normale)
// à chaque coup adverse (cf. deductStockfishClock).
function tickClock() {
  const game = state.game;
  if (!game?.clock) {
    return;
  }
  if (game.status !== 'playing') {
    game.clock.lastTickTs = null;
    return;
  }
  const playerToMove =
    game.chess.turn() === humanPlayerColor() &&
    !game.locked &&
    !game.cinematic &&
    game.historyView == null;
  if (playerToMove) {
    const now = performance.now();
    if (game.clock.lastTickTs != null) {
      const color = humanPlayerColor();
      game.clock[color] = Math.max(0, game.clock[color] - (now - game.clock.lastTickTs));
    }
    game.clock.lastTickTs = now;
    if (game.clock[humanPlayerColor()] <= 0) {
      game.clock[humanPlayerColor()] = 0;
      renderClocks();
      finishGame('lost', '⏰ Temps écoulé : tu perds au temps.');
      return;
    }
  } else {
    game.clock.lastTickTs = null; // horloge du joueur en pause hors de son tour
  }
  renderClocks();
}

// Décrémente l'horloge de Stockfish du temps « réfléchi » (loi normale). Renvoie
// true s'il tombe au temps (la partie est alors gagnée par le joueur).
export function deductStockfishClock(game) {
  if (!game?.clock) {
    return false;
  }
  const tc = getTimeControlConfig(game.clock.control);
  const opponentColor = opponentTurnColor();
  game.clock[opponentColor] = Math.max(0, game.clock[opponentColor] - sampleStockfishMoveTime(tc));
  if (game.clock[opponentColor] <= 0) {
    game.clock[opponentColor] = 0;
    renderClocks();
    finishGame('won', '⏰ Stockfish tombe au temps — tu gagnes !');
    return true;
  }
  renderClocks();
  return false;
}

export function renderClocks() {
  const wrap = document.querySelector('#advClocks');
  if (!wrap) {
    return;
  }
  const game = state.game;
  const clock = game?.clock;
  const show =
    Boolean(clock) &&
    state.screen === 'adventure' &&
    document.body.classList.contains('is-adv-board-view');
  wrap.hidden = !show;
  if (!show) {
    return;
  }
  const playing = game.status === 'playing';
  const whiteActive = playing && game.chess.turn() === 'w' && !game.locked && !game.cinematic;
  const blackActive = playing && game.chess.turn() === 'b';
  const whiteEl = document.querySelector('#advClockWhite');
  const blackEl = document.querySelector('#advClockBlack');
  advSetText('#advClockWhiteTime', formatClock(clock.w));
  advSetText('#advClockBlackTime', formatClock(clock.b));
  whiteEl?.classList.toggle('is-active', whiteActive);
  blackEl?.classList.toggle('is-active', blackActive);
  whiteEl?.classList.toggle('is-low', clock.w < 20000);
  blackEl?.classList.toggle('is-low', clock.b < 20000);
}
