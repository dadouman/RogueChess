import { elements } from './elements.js';
import { state } from './state.js';
import { advAids } from './adventure-aids.js';

// Injectés par app.js (cf. initBoardInteraction) : accès au jeu interactif,
// au rendu et aux chemins de déplacement/inspection définis dans l'application.
let getInteractiveChess = () => null;
let getPlayableBoardColor = () => null;
let getBookTargetsFromSquare = () => new Set();
let isOpeningBookChoiceActive = () => false;
let submitHumanMove = () => {};
let renderGameDetails = () => {};
let isBoardInteractive = () => false;
let getActiveFreeReviewEntry = () => null;

export function initBoardInteraction(deps) {
  getInteractiveChess = deps.getInteractiveChess ?? getInteractiveChess;
  getPlayableBoardColor = deps.getPlayableBoardColor ?? getPlayableBoardColor;
  getBookTargetsFromSquare = deps.getBookTargetsFromSquare ?? getBookTargetsFromSquare;
  isOpeningBookChoiceActive = deps.isOpeningBookChoiceActive ?? isOpeningBookChoiceActive;
  submitHumanMove = deps.submitHumanMove ?? submitHumanMove;
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
  isBoardInteractive = deps.isBoardInteractive ?? isBoardInteractive;
  getActiveFreeReviewEntry = deps.getActiveFreeReviewEntry ?? getActiveFreeReviewEntry;
}

// Joue le coup from→to s'il est légal (auto-promotion en dame). Renvoie true si joué.
function attemptBoardMove(from, to) {
  const chess = getInteractiveChess();
  if (!chess) {
    return false;
  }
  const legalMoves = chess.moves({ square: from, verbose: true });
  const move =
    legalMoves.find((c) => c.to === to && (!c.promotion || c.promotion === 'q')) ??
    legalMoves.find((c) => c.to === to);
  if (!move) {
    return false;
  }
  submitHumanMove(`${from}${to}${move.promotion ?? ''}`);
  return true;
}

function handleBoardSquareClick(squareName) {
  // Ignore le clic synthétique qui suit un glisser-déposer.
  if (suppressNextBoardClick) {
    suppressNextBoardClick = false;
    return;
  }
  const game = state.game;
  const chess = getInteractiveChess();
  const playableColor = getPlayableBoardColor();
  if (!game || !chess || game.locked || !playableColor) {
    return;
  }

  const piece = chess.get(squareName);
  const selected = game.selectedSquare;

  if (!selected) {
    if (piece?.color === playableColor) {
      selectBoardSquare(squareName);
      return;
    }
    game.message = `Sélectionne une pièce ${playableColor === 'w' ? 'blanche' : 'noire'} pour jouer.`;
    renderGameDetails();
    return;
  }

  if (selected === squareName) {
    game.selectedSquare = null;
    game.message = 'Sélection annulée.';
    renderGameDetails();
    return;
  }

  if (attemptBoardMove(selected, squareName)) {
    return;
  }

  if (piece?.color === playableColor) {
    selectBoardSquare(squareName);
    return;
  }

  game.message = 'Cette destination n’est pas légale pour la pièce sélectionnée.';
  renderGameDetails();
}

// T — On peut armer un prémouvement pendant que l'adversaire (Noirs) réfléchit :
// partie en cours, plateau visible, pas en revue, et c'est au trait noir.
function isPremoveContext() {
  const game = state.game;
  // Le prémouvement s'arme justement pendant la réflexion adverse : la partie est
  // alors « verrouillée » (game.locked) — on ne teste donc PAS le verrou ici, sinon
  // le drag ne s'activerait jamais (et la page scrollerait au toucher). On vérifie
  // simplement qu'on est bien dans une partie en cours, au tour des Noirs.
  return Boolean(
    game &&
    game.status === 'playing' &&
    !game.cinematic &&
    !game.revision && // pas de prémouvement pendant une révision scriptée
    game.historyView == null &&
    !getActiveFreeReviewEntry() &&
    !game.mateResolution?.active &&
    game.chess.turn() === 'b'
  );
}

function clearPremove() {
  if (!state.game) {
    return;
  }
  state.game.premove = null;
  state.game.premoveSelect = null;
}

// Clic sur l'échiquier pendant le tour adverse : on arme/désarme le prémouvement.
function handlePremoveClick(squareName) {
  if (suppressNextBoardClick) {
    suppressNextBoardClick = false;
    return;
  }
  const game = state.game;
  if (!game || !isPremoveContext()) {
    return;
  }
  const piece = game.chess.get(squareName); // position courante (avant coup adverse)
  const sel = game.premoveSelect;
  if (!sel) {
    if (piece && piece.color === 'w') {
      game.premoveSelect = squareName;
      game.premove = null;
      game.message = `⚡ Prémouvement : choisis la destination de ${squareName}.`;
      renderGameDetails();
    }
    return;
  }
  if (sel === squareName) {
    // reclic sur la source → annule la sélection
    game.premoveSelect = null;
    game.message = '⚡ Prémouvement annulé.';
    renderGameDetails();
    return;
  }
  if (piece && piece.color === 'w') {
    // on change de pièce source
    game.premoveSelect = squareName;
    game.premove = null;
    game.message = `⚡ Prémouvement : choisis la destination de ${squareName}.`;
    renderGameDetails();
    return;
  }
  // destination choisie : on arme (la légalité sera vérifiée au moment de jouer).
  game.premove = { from: sel, to: squareName };
  game.premoveSelect = null;
  game.message = `⚡ Prémouvement armé : ${sel} → ${squareName}.`;
  renderGameDetails();
}

// Exécute le prémouvement armé dès que c'est au tour du joueur. Annulé s'il est
// devenu illégal dans la nouvelle position.
function tryExecutePremove() {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.locked || game.chess.turn() !== 'w') {
    return;
  }
  const premove = game.premove;
  if (!premove) {
    return;
  }
  game.premove = null;
  game.premoveSelect = null;
  const legal = game.chess
    .moves({ square: premove.from, verbose: true })
    .some((move) => move.to === premove.to);
  if (!legal) {
    game.message = '⚡ Prémouvement annulé : il est devenu illégal.';
    renderGameDetails();
    return;
  }
  submitHumanMove(`${premove.from}${premove.to}`);
}

function selectBoardSquare(squareName) {
  state.game.selectedSquare = squareName;
  const chess = getInteractiveChess();
  const legalMoves = chess?.moves({ square: squareName, verbose: true }) ?? [];
  const bookTargets = getBookTargetsFromSquare(squareName);
  if (!legalMoves.length) {
    state.game.message = `La pièce en ${squareName} n'a pas de coup légal.`;
  } else if (isOpeningBookChoiceActive() && bookTargets.size) {
    state.game.message =
      `Pièce sélectionnée en ${squareName}: les points dorés sont les coups de livre, ` +
      'les points gris sont légaux mais hors ligne.';
  } else if (isOpeningBookChoiceActive()) {
    state.game.message =
      `La pièce en ${squareName} n'a pas de coup de livre dans cette position. ` +
      'Les points gris sont légaux, mais ils sortent de la ligne actuelle.';
  } else {
    state.game.message = `Pièce sélectionnée en ${squareName}: choisis une destination.`;
  }
  renderGameDetails();
}

// --- Glisser-déposer des pièces (souris + tactile, via Pointer Events) ---

let boardDrag = null;
let suppressNextBoardClick = false;
let skipNextMoveAnim = false; // coup joué par glisser-déposer : on saute l'animation de glissade

function bindBoardDragEvents() {
  const board = elements.boardPreview;
  if (board) {
    board.addEventListener('pointerdown', onBoardPointerDown);
  }
}

function onBoardPointerDown(event) {
  if (event.button > 0) {
    return; // bouton gauche / tactile uniquement
  }
  const board = elements.boardPreview;
  const interactive = isBoardInteractive(board);
  // T : pendant la réflexion adverse, on peut glisser une pièce blanche pour
  // armer un prémouvement (même si le plateau n'est pas « jouable »).
  const premovable = !interactive && board === elements.boardPreview && isPremoveContext();
  if (!interactive && !premovable) {
    return;
  }
  const squareEl = event.target.closest?.('.board-square');
  if (!squareEl || !board.contains(squareEl)) {
    return;
  }
  const from = squareEl.dataset.square;
  if (interactive) {
    const chess = getInteractiveChess();
    const playableColor = getPlayableBoardColor();
    const piece = chess?.get(from);
    if (!chess || !playableColor || piece?.color !== playableColor) {
      return; // on ne glisse que ses propres pièces
    }
  } else {
    const piece = state.game?.chess?.get(from);
    if (!piece || piece.color !== 'w') {
      return; // prémouvement : on ne glisse que ses propres pièces (Blanches)
    }
  }
  boardDrag = {
    from,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    started: false,
    premove: premovable
  };
  window.addEventListener('pointermove', onBoardPointerMove);
  window.addEventListener('pointerup', onBoardPointerUp);
  window.addEventListener('pointercancel', onBoardPointerUp);
}

function onBoardPointerMove(event) {
  if (!boardDrag || event.pointerId !== boardDrag.pointerId) {
    return;
  }
  if (!boardDrag.started) {
    if (Math.hypot(event.clientX - boardDrag.startX, event.clientY - boardDrag.startY) < 6) {
      return; // pas encore assez de mouvement : reste un clic potentiel
    }
    boardDrag.started = true;
    startBoardDragVisual(boardDrag.from);
    const liveImg = elements.boardPreview.querySelector(`[data-square="${boardDrag.from}"] img`);
    if (liveImg) {
      const rect = liveImg.getBoundingClientRect();
      const ghost = liveImg.cloneNode(true);
      ghost.className = 'board-drag-ghost';
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.append(ghost);
      liveImg.style.opacity = '0';
      boardDrag.ghost = ghost;
      boardDrag.liveImg = liveImg;
    }
  }
  if (boardDrag.ghost) {
    event.preventDefault();
    boardDrag.ghost.style.left = `${event.clientX}px`;
    boardDrag.ghost.style.top = `${event.clientY}px`;
    highlightDropTarget(event.clientX, event.clientY);
  }
}

function onBoardPointerUp(event) {
  if (!boardDrag || event.pointerId !== boardDrag.pointerId) {
    return;
  }
  const drag = boardDrag;
  boardDrag = null;
  window.removeEventListener('pointermove', onBoardPointerMove);
  window.removeEventListener('pointerup', onBoardPointerUp);
  window.removeEventListener('pointercancel', onBoardPointerUp);

  if (!drag.started) {
    return; // simple tap : le gestionnaire de clic gère la sélection
  }

  drag.ghost?.remove();
  if (drag.liveImg) {
    drag.liveImg.style.opacity = '';
  }
  // Empêche le clic synthétique qui suit le drag de re-sélectionner.
  suppressNextBoardClick = true;
  setTimeout(() => {
    suppressNextBoardClick = false;
  }, 60);

  const targetEl = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest?.('.board-square');
  const to = targetEl && elements.boardPreview.contains(targetEl) ? targetEl.dataset.square : null;

  if (to && to !== drag.from) {
    if (drag.premove) {
      setPremoveFromDrag(drag.from, to); // T : drop pendant le tour adverse → prémouvement armé
      return;
    }
    skipNextMoveAnim = true; // la pièce a déjà glissé à la main : pas de ré-animation
    if (attemptBoardMove(drag.from, to)) {
      return; // coup joué : le re-rendu efface les surbrillances
    }
    skipNextMoveAnim = false; // coup refusé : rien n'a bougé
  }
  clearDragTargets(); // drop annulé : nettoie sans re-rendre
}

// T — Arme un prémouvement glissé (drop d'une pièce blanche pendant le tour adverse).
function setPremoveFromDrag(from, to) {
  const game = state.game;
  if (!game || !isPremoveContext()) {
    clearDragTargets();
    return;
  }
  game.premove = { from, to };
  game.premoveSelect = null;
  game.message = `⚡ Prémouvement armé : ${from} → ${to}. Il se jouera dès ton tour.`;
  renderGameDetails();
}

// Surbrillances de sélection/cibles posées directement sur les cases (sans re-rendu,
// pour préserver la capture du pointeur tactile pendant le glissement).
function startBoardDragVisual(from) {
  const board = elements.boardPreview;
  if (!board) {
    return;
  }
  if (state.game) {
    state.game.selectedSquare = null;
  }
  clearDragTargets();
  const chess = getInteractiveChess();
  board.querySelector(`[data-square="${from}"]`)?.classList.add('is-selected');
  // Mêmes indicateurs qu'au clic : en ouverture, points dorés (coup de livre) vs gris
  // (légal mais hors livre), anneau pour les captures.
  const aids = advAids();
  const bookTargets = getBookTargetsFromSquare(from);
  const openingBookMode = isOpeningBookChoiceActive();
  for (const mv of chess?.moves({ square: from, verbose: true }) ?? []) {
    const el = board.querySelector(`[data-square="${mv.to}"]`);
    if (!el || !aids.legalDots) {
      continue; // « point vert » désactivé : aucun indicateur (le coup reste jouable)
    }
    el.classList.add('is-target');
    if (aids.moveChoices && bookTargets.has(mv.to)) {
      el.classList.add('is-book-target');
    } else if (aids.moveChoices && openingBookMode) {
      el.classList.add('is-offbook-target');
    }
    if (mv.captured) {
      el.classList.add('is-capture-target');
    }
  }
}

function clearDragTargets() {
  for (const el of elements.boardPreview?.querySelectorAll(
    '.is-selected, .is-target, .is-capture-target, .is-book-target, .is-offbook-target, .is-drop-hover'
  ) ?? []) {
    el.classList.remove(
      'is-selected',
      'is-target',
      'is-capture-target',
      'is-book-target',
      'is-offbook-target',
      'is-drop-hover'
    );
  }
}

function highlightDropTarget(x, y) {
  for (const el of elements.boardPreview?.querySelectorAll('.is-drop-hover') ?? []) {
    el.classList.remove('is-drop-hover');
  }
  const el = document.elementFromPoint(x, y)?.closest?.('.board-square');
  if (el && elements.boardPreview.contains(el)) {
    el.classList.add('is-drop-hover');
  }
}

export function consumeSkipNextMoveAnim() {
  if (!skipNextMoveAnim) {
    return false;
  }
  skipNextMoveAnim = false; // glisser-déposer : la pièce est déjà à destination
  return true;
}

export {
  attemptBoardMove,
  handleBoardSquareClick,
  isPremoveContext,
  clearPremove,
  handlePremoveClick,
  tryExecutePremove,
  selectBoardSquare,
  bindBoardDragEvents,
  onBoardPointerDown,
  onBoardPointerMove,
  onBoardPointerUp,
  setPremoveFromDrag,
  startBoardDragVisual,
  clearDragTargets,
  highlightDropTarget
};
