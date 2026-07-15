import { Chess } from './vendor/chess.js';
import { elements } from './elements.js';
import { state } from './state.js';
import {
  FIRST_LEVEL_NUMBER,
  DISPLAY_DEFAULT_FLOOR_MASS,
  MATE_SCORE_CP,
  PROBABILITY_TEMPERATURE_CP
} from './constants.js';
import {
  clamp,
  formatPercent,
  sideLabel,
  sanPieceLetter,
  escapeHtml,
  pause,
  randomThinkMs,
  randomUnit,
  yieldToBrowser,
  cloneGraphData
} from './utils.js';
import {
  playUciOnChess,
  isMateScore,
  mateMovesFromCp,
  uciToBoardVec,
  STANDARD_START_FEN,
  scoreForSide,
  moveToUci,
  kingInCheckSquare,
  matedKingSquare,
  threatenedWhiteSquares,
  fenPositionKey,
  normalizeSanForCompare
} from './chess-utils.js';
import {
  formatEval,
  formatEvalDelta,
  evalToBarPct,
  joinHumanList,
  buildDefeatComment
} from './eval-commentary.js';
import { makeHistoryBoardNode, formatHistoryMoveLabel } from './game-history-view.js';
import {
  splitPgnGames,
  parsePgnGame,
  makeLineEventsUnique,
  buildGraphFromPgnLines,
  summarizeImportedGraph
} from './pgn-import.js';
import {
  getNode,
  getEdge,
  getRawOutgoingEdges,
  normalizeWeightedCandidates,
  pickWeightedCandidate
} from './graph.js';
import { DEFAULT_MATE_TOLERANCE } from './adventure-config.js';
import { createAdventureState, loadAdventure, saveAdventure } from './adventure-state.js';
import { showAdventureToast } from './toast.js';
import { clampPanelWidths, bindPanelResizeHandles } from './panels.js';
import {
  initClocks,
  makeInitialClock,
  startClockTicker,
  deductStockfishClock,
  renderClocks
} from './clocks.js';
import {
  getBranchValue,
  branchEventuallyEndsInMate,
  applyMinimumProbabilities,
  normalizeScoredProbabilities,
  computeGraphFutureMeans,
  assignGraphProbabilities,
  recomputeViewProbabilities,
  createCompressedView,
  projectRawPathToView,
  findCurrentViewSegment
} from './graph-view-model.js';
import { initBrainScrub, bindBrainScrubEvents, showBrainScrub } from './brain-scrub.js';
import { initGraphRenderer, renderGraph } from './graph-render.js';
import { advBrainProgress, advPlayerLevel, advCurrentDifficulty } from './adventure-progress.js';
import {
  initAdventureProgressHud,
  renderAdvLives,
  renderAdvTakeBack,
  renderAdvPlayerBadge,
  triggerBrainSurge,
  adventureLightEdge
} from './adventure-progress-hud.js';
import {
  FULL_AIDS,
  advAids,
  resetLegalDotsReveal,
  revealLegalDotsNow,
  maybeArmLegalDotsTimer,
  applyDifficultyClasses,
  initAdventureAids
} from './adventure-aids.js';
import {
  handleBoardSquareClick,
  isPremoveContext,
  clearPremove,
  handlePremoveClick,
  tryExecutePremove,
  bindBoardDragEvents,
  consumeSkipNextMoveAnim,
  initBoardInteraction
} from './board-interaction.js';
import {
  ADV_BOSS_STARS,
  advCoveragePct,
  advBossXp,
  advBossRecord,
  advBossStreakCount,
  advBossUnlocked,
  isAdventureRun,
  advRunDeficitThresholdCp,
  isAdventureLesson,
  isAdventureEdgeMastered,
  advAddXp,
  STARTING_LIVES
} from './adventure-status.js';
import { advShuffle, advQuizOptions, advPickBookEdge } from './adventure-utils.js';
import {
  advCanFightBots,
  advSyncGlobalLives,
  advConsumeGlobalLife,
  advRefillGlobalLivesFromLearning,
  advNotifyNoLives
} from './adventure-lives.js';
import {
  ADV_SCORE_MOVE_COUNT,
  advScoreInit,
  advScoreRegisterMove,
  advScoreArmTimer,
  advScoreKey
} from './adventure-scoring.js';
import { advWinCoinReward, advAwardCoins, advThreatsActive } from './adventure-shop.js';
import { initAdventureHistory, advRecordGame, advFormatGameOpponent } from './adventure-history.js';
import {
  advInfluenceableNodes,
  advOverweightMove,
  advInfluenceEnabled,
  advBlackChoiceWeight,
  advOpeningWeightOf,
  advResetOpeningInfluence
} from './opening-weight.js';
import { initOpeningViewer } from './opening-viewer.js';
import {
  openAdventureMap,
  closeAdventureMap,
  setAdvMapView,
  renderAdventureMap,
  initAdventureMap
} from './adventure-map.js';
import {
  advOpenOrStartTournament,
  closeAdvTournament,
  initAdventureTournament
} from './adventure-tournament.js';
import {
  closeGameReview,
  gameReviewStep,
  gameReviewClickSquare,
  initGameReview
} from './game-review.js';
import { renderAdventureHud, initAdventureHud } from './adventure-hud.js';
import {
  renderAdvDifficulty,
  renderAdvTimeControl,
  renderAdvInfluenceSetting,
  advMateHandover,
  renderAdvMateHandover,
  advMateTolerance,
  renderAdvMateTolerance,
  renderAdvShop,
  advToggleInfluenceFeature,
  advToggleThreats,
  advInfluenceMode,
  setAdvCustomClock,
  initAdventureSettings
} from './adventure-settings.js';
import {
  createInitialReviewEntry,
  getActiveFreeReviewEntry,
  isPostGameReviewPlayable,
  recordFreeReviewMove,
  getReviewPath,
  submitReviewVariationMove,
  renderFreeReviewPanel,
  getReviewParent,
  initFreeReview
} from './free-review.js';
import {
  VICTORY_CINEMATIC_DEPTH,
  beginMateResolution,
  finishMateResolution,
  startDeficitCinematic,
  initMateResolution
} from './mate-resolution.js';
import {
  STOCKFISH_DEPTH,
  getStockfishLevelProfile,
  formatStockfishLevel,
  BrowserStockfishEvaluator
} from './engine.js';
import { renderBoardArrows } from './board-arrows.js';
import { getBoardSquareLabel } from './board-render.js';
import {
  formatSourceList,
  drawKindLabel,
  formatGamePhase,
  formatFreeRemaining
} from './game-format.js';
import { getLevelObjective, isMateObjective, formatLevelObjective } from './level-objective.js';
import { updateStockfishLevelUi, updateSurvivalLimitUi } from './ui-settings.js';

const IMPORT_STOCKFISH_DEPTH = 5;
const OPENING_FREE_BREAK_PLY = 14;
const OPENING_FREE_BREAK_PROBABILITY = 0.25;
// Conversion automatique « cinématique » de la phase libre : dès que les Blancs
// dépassent +2, on avance la partie seul (meilleurs coups blancs vs défense Stockfish)
// jusqu'à voir un mat forcé, puis on rend la main au joueur pour conclure.
const VICTORY_CINEMATIC_TRIGGER_CP = 200; // +2.00 : seuil de déclenchement
const VICTORY_CINEMATIC_KEEP_CP = 150; // si l'avantage retombe sous +1.50, on rend la main
const VICTORY_CINEMATIC_MAX_PLIES = 36; // garde-fou : ~18 coups complets max
const VICTORY_CINEMATIC_STEP_MS = 650; // tempo entre deux coups
async function ensureStockfishReady(showMessage = true) {
  if (!state.stockfish) {
    state.stockfish = new BrowserStockfishEvaluator();
  }
  if (showMessage && state.game) {
    state.game.message = 'Stockfish démarre sa table de calcul...';
    renderGamePanel();
  }
  await state.stockfish.init();
  return state.stockfish;
}

// Lettre de pièce (Merida) à partir d'un SAN : O-O→roi, sinon N/B/R/Q/K, défaut pion.
// Couleur qui joue le i-ème coup d'une séquence compressée (alternance depuis edge.color).
function selectEdge(edge) {
  state.highlightedEdges = new Set([edge.id]);
  state.highlightedNodes = new Set([edge.from, edge.to]);
  state.selectedNodeId = edge.to;
  state.selectedSegment = edge;
  state.segmentStepIndex = edge.isCompressed ? 0 : edge.pathNodeIds.length - 1;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent = edge.isCompressed
    ? `Segment: ${edge.sequenceLabel} (${formatPercent(edge.probability)})`
    : `Arc sélectionné: ${edge.san} (${formatPercent(edge.probability)})`;
  renderGraph();
}

function getCompressedIncomingSegment(nodeId) {
  const viewNode = state.view?.nodesById.get(nodeId);
  if (!viewNode || viewNode.incoming.length !== 1) {
    return null;
  }
  const edge = state.view.edgesById.get(viewNode.incoming[0]);
  return edge?.isCompressed ? edge : null;
}

function selectNode(nodeId, options = {}) {
  state.selectedNodeId = nodeId;
  const incomingSegment = getCompressedIncomingSegment(nodeId);
  if (incomingSegment && options.openCompressed !== false) {
    state.selectedSegment = incomingSegment;
    state.segmentStepIndex = incomingSegment.pathNodeIds.length - 1;
    state.segmentExpanded = false;
    state.highlightedEdges = new Set([incomingSegment.id]);
    state.highlightedNodes = new Set([incomingSegment.from, incomingSegment.to]);
    elements.selectedPathLabel.textContent = `Noeud compressé: ${incomingSegment.sequenceLabel}`;
  } else {
    state.selectedSegment = null;
    state.segmentStepIndex = 0;
    state.segmentExpanded = false;
  }
  if (options.clearPath !== false && !incomingSegment) {
    state.highlightedEdges.clear();
    state.highlightedNodes = new Set([nodeId]);
    elements.selectedPathLabel.textContent =
      nodeId === 'root'
        ? 'Départ sélectionné'
        : `Noeud sélectionné: ${getNode(nodeId)?.san ?? nodeId}`;
  }
  renderGraph();
}

function setInfoAnalysis(text, source = '') {
  elements.nodeComment.textContent = text || 'Aucune analyse pour cette position.';
  const sourceText = source && source !== '-' ? `Source: ${source}` : '';
  elements.nodeSources.textContent = sourceText;
  elements.nodeSources.hidden = !sourceText;
}

function renderDetails() {
  if (shouldRenderGameDetails()) {
    renderGameDetails();
    return;
  }

  const node = getNode(state.selectedNodeId) ?? getNode('root');
  if (!node) {
    return;
  }
  const incomingEdge = node.incoming.map(getEdge).find(Boolean);
  const selectedSegment = state.selectedSegment?.to === node.id ? state.selectedSegment : null;
  const previewNode = selectedSegment ? getSegmentPreviewNode(selectedSegment) : node;
  elements.nodeTitle.textContent = selectedSegment
    ? (previewNode?.san ?? selectedSegment.san)
    : node.id === 'root'
      ? 'Départ'
      : node.san;
  elements.nodeSubtitle.textContent = selectedSegment?.isCompressed
    ? `Segment vers ${node.san} · étape ${state.segmentStepIndex + 1}/${selectedSegment.pathNodeIds.length}.`
    : node.id === 'root'
      ? 'Position initiale avant de choisir une ligne.'
      : `${sideLabel(node.color)} vient de jouer ${node.from}-${node.to}.`;
  elements.nodeEval.textContent = formatEval(previewNode?.evaluation?.cpWhite);
  elements.nodeFuture.textContent = formatEval(previewNode?.futureMeanCp);
  elements.nodeTurn.textContent = sideLabel(previewNode?.sideToMove);
  setInfoAnalysis(
    previewNode?.comments?.[0] ??
      selectedSegment?.comments[0] ??
      node.comments[0] ??
      incomingEdge?.comments[0] ??
      'Aucune note pour cette position.',
    formatSourceList(selectedSegment?.sources ?? node.sources)
  );
  state.currentPreviewNode = previewNode ?? node;

  renderBoard(state.currentPreviewNode);
  renderZoomBoard(state.currentPreviewNode);
  renderSegmentExplorer(selectedSegment);
  renderChoices(node, selectedSegment);
}

function getSegmentPreviewNode(segment) {
  if (!segment?.pathNodeIds?.length) {
    return null;
  }
  const stepIndex = clamp(state.segmentStepIndex, 0, segment.pathNodeIds.length - 1);
  return getNode(segment.pathNodeIds[stepIndex]);
}

function renderSegmentExplorer(segment) {
  if (!segment?.isCompressed) {
    elements.segmentExplorer.hidden = true;
    elements.segmentStepList.replaceChildren();
    return;
  }

  const maxIndex = segment.pathNodeIds.length - 1;
  state.segmentStepIndex = clamp(state.segmentStepIndex, 0, maxIndex);
  elements.segmentExplorer.hidden = false;
  elements.segmentExplorer.classList.toggle('is-expanded', state.segmentExpanded);
  elements.segmentProgress.textContent = `${state.segmentStepIndex + 1}/${segment.pathNodeIds.length} · ${segment.collapsedPlyCount} coups`;
  elements.segmentToggleButton.textContent = state.segmentExpanded ? 'Compact' : 'Tous';
  elements.segmentToggleButton.setAttribute(
    'aria-label',
    state.segmentExpanded ? 'Afficher seulement le coup actif' : 'Afficher tous les coups'
  );
  elements.segmentPrevButton.disabled = state.segmentStepIndex <= 0;
  elements.segmentNextButton.disabled = state.segmentStepIndex >= maxIndex;
  elements.segmentStepList.replaceChildren();

  segment.pathNodeIds.forEach((nodeId, index) => {
    const stepNode = getNode(nodeId);
    const stepButton = document.createElement('button');
    stepButton.type = 'button';
    stepButton.className = `segment-step ${index === state.segmentStepIndex ? 'is-active' : ''}`;
    stepButton.innerHTML = `
      <strong>${index + 1}</strong>
      <span>${escapeHtml(stepNode?.san ?? segment.sequence[index] ?? '-')}</span>
      <em>${formatEval(stepNode?.evaluation?.cpWhite)}</em>
    `;
    stepButton.addEventListener('click', () => {
      state.segmentStepIndex = index;
      renderDetails();
    });
    elements.segmentStepList.append(stepButton);
  });
}

function renderChoices(node, selectedSegment = null) {
  if (
    selectedSegment?.isCompressed &&
    state.segmentStepIndex < selectedSegment.pathNodeIds.length - 1
  ) {
    renderInternalSegmentChoice(selectedSegment);
    return;
  }

  const outgoing = (state.view?.nodesById.get(node.id)?.outgoing ?? [])
    .map((edgeId) => state.view?.edgesById.get(edgeId))
    .filter(Boolean)
    .sort((a, b) => b.probability - a.probability);
  elements.choiceList.replaceChildren();

  if (!outgoing.length) {
    const empty = document.createElement('p');
    empty.textContent = node.terminal
      ? 'Fin de ligne: aucune suite légale.'
      : 'Fin du livre PGN pour cette branche.';
    elements.choiceList.append(empty);
    return;
  }

  for (const edge of outgoing) {
    const child = getNode(edge.to);
    const detail = edge.isCompressed
      ? `${edge.collapsedPlyCount} coups: ${edge.sequenceLabel}`
      : (edge.comments[0] ?? child?.comments[0] ?? 'Suite sans commentaire');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'choice-row';
    row.innerHTML = `
      <strong>${escapeHtml(edge.san)}</strong>
      <span>${escapeHtml(detail)}${edge.endsInMate ? ' · mat min. 1%' : ''}</span>
      <em>${formatPercent(edge.probability)}</em>
    `;
    row.addEventListener('click', () => selectEdge(edge));
    elements.choiceList.append(row);
  }
}

function renderInternalSegmentChoice(segment) {
  elements.choiceList.replaceChildren();

  const nextIndex = state.segmentStepIndex + 1;
  const nextNode = getNode(segment.pathNodeIds[nextIndex]);
  const nextRow = document.createElement('button');
  nextRow.type = 'button';
  nextRow.className = 'choice-row';
  nextRow.innerHTML = `
    <strong>${escapeHtml(nextNode?.san ?? segment.sequence[nextIndex] ?? '-')}</strong>
    <span>Coup suivant dans ce noeud compressé</span>
    <em>${nextIndex + 1}/${segment.pathNodeIds.length}</em>
  `;
  nextRow.addEventListener('click', () => {
    state.segmentStepIndex = nextIndex;
    renderDetails();
  });
  elements.choiceList.append(nextRow);

  const finishRow = document.createElement('button');
  finishRow.type = 'button';
  finishRow.className = 'choice-row';
  finishRow.innerHTML = `
    <strong>${escapeHtml(getNode(segment.to)?.san ?? 'Fin')}</strong>
    <span>Aller directement au point de décision</span>
    <em>fin</em>
  `;
  finishRow.addEventListener('click', () => {
    state.segmentStepIndex = segment.pathNodeIds.length - 1;
    renderDetails();
  });
  elements.choiceList.append(finishRow);
}

function renderBoard(node, container = elements.boardPreview) {
  const [boardPart] = node.fen.split(' ');
  const rows = boardPart.split('/');
  const from = node.from;
  const to = node.to;
  const interactive = isBoardInteractive(container);
  // Les flèches d'ouverture (liées à la partie en cours) ne s'affichent que sur
  // le plateau de jeu principal — pas sur les aperçus (scrub, revue de partie).
  const openingArrows = container === elements.boardPreview ? getOpeningBoardArrows() : [];
  const selectedSquare = interactive ? state.game.selectedSquare : null;
  const legalTargets = selectedSquare ? getLegalTargetsFromSquare(selectedSquare) : new Set();
  const playableColor = interactive ? getPlayableBoardColor() : null;
  const openingBookMode = interactive && isOpeningBookChoiceActive();
  const bookTargets =
    selectedSquare && openingBookMode ? getBookTargetsFromSquare(selectedSquare) : new Set();
  const wonBookTargets =
    selectedSquare && openingBookMode ? getWonBookTargetsFromSquare(selectedSquare) : new Set();
  const checkSquare = kingInCheckSquare(node.fen);
  const matedSquare = matedKingSquare(node.fen);
  // Le camp maté est celui au trait dans la FEN. Le joueur joue les Blancs : roi
  // noir maté = victoire (flash doré), roi blanc maté = défaite (flash rouge).
  const matedSide = matedSquare ? node.fen.split(' ')[1] : null;
  // T : prémouvement — le plateau accepte des clics pendant le tour adverse pour
  // armer un coup ; les cases armées sont surlignées (orange).
  const premovable = container === elements.boardPreview && isPremoveContext();
  const premoveFrom = state.game?.premove?.from ?? state.game?.premoveSelect ?? null;
  const premoveTo = state.game?.premove?.to ?? null;
  // R : surbrillance des pièces blanches menacées (aide boutique débloquée).
  const threatSquares =
    interactive && advThreatsActive() ? threatenedWhiteSquares(node.fen) : new Set();
  container.replaceChildren();
  container.classList.toggle('is-game-board', interactive);
  container.classList.toggle('is-premovable', premovable); // T : drag de prémouvement (touch-action)
  container.classList.toggle('has-opening-arrows', openingArrows.length > 0);
  // L'échiquier qui affiche un mat porte la classe pour le flash de fin de partie.
  container.classList.toggle('is-checkmate-board', Boolean(matedSquare));
  container.classList.toggle('is-mate-win', matedSide === 'b');
  container.classList.toggle('is-mate-loss', matedSide === 'w');

  const squareOptions = {
    interactive,
    selectedSquare,
    playableColor,
    legalTargets,
    bookTargets,
    wonBookTargets,
    openingBookMode,
    checkSquare,
    matedSquare,
    premovable,
    premoveFrom,
    premoveTo,
    threatSquares,
    aids: advAids()
  };
  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        const empty = Number(char);
        for (let index = 0; index < empty; index += 1) {
          appendSquare(container, rankIndex, fileIndex, null, from, to, squareOptions);
          fileIndex += 1;
        }
      } else {
        appendSquare(container, rankIndex, fileIndex, char, from, to, squareOptions);
        fileIndex += 1;
      }
    }
  });

  renderBoardArrows(container, openingArrows);

  // Q : sur le plateau de jeu interactif, arme le minuteur 5 s de révélation des
  // cases légales (Normal). Les gardes internes évitent de le relancer en boucle.
  if (interactive) {
    maybeArmLegalDotsTimer();
  }

  // Anime le glissement de la pièce du dernier coup (plateau de jeu uniquement).
  maybeAnimateGameMove(container, node);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// Pause (Promise) de `ms` millisecondes.
// Durée de « réflexion » simulée de l'adversaire, tirée aléatoirement dans une fourchette (ms).
// Active/désactive l'état visuel « Stockfish réfléchit » (badge sur l'échiquier, halo,
// pulsation du cerveau). Piloté par la classe body pour cibler tout le tableau en CSS.
function setEngineThinking(isThinking) {
  document.body.classList.toggle('is-engine-thinking', Boolean(isThinking));
}

// Animation en cours du dernier coup (un seul fantôme à la fois sur le plateau).
let boardMoveAnim = null;

// Déclenche l'animation du dernier coup, mais seulement sur le plateau de jeu interactif
// (pas sur les aperçus du graphe) et seulement quand le coup change vraiment — sinon chaque
// re-rendu (sélection d'une case, mise à jour d'éval, repli d'une section) la relancerait.
function maybeAnimateGameMove(container, node) {
  if (container !== elements.boardPreview) {
    return;
  }
  const isGameNode = node.id === 'game' || node.id === 'cinematic' || node.id === 'free-review';
  if (!isGameNode) {
    cancelBoardMoveAnim();
    delete container.dataset.lastMoveKey;
    return;
  }
  const { from, to, fen } = node;
  if (!from || !to) {
    cancelBoardMoveAnim();
    container.dataset.lastMoveKey = `start-${fen}`;
    return;
  }
  const moveKey = `${from}-${to}-${fen}`;
  if (container.dataset.lastMoveKey === moveKey) {
    // Même position re-rendue (message « calcule… », sélection, éval) : le replaceChildren
    // a recréé une pièce d'arrivée visible. Si le fantôme glisse encore, on la re-masque
    // pour éviter de voir la pièce en double le temps du trajet.
    if (boardMoveAnim && boardMoveAnim.toSquare === to) {
      const img = container.querySelector(`[data-square="${to}"] img`);
      if (img) {
        img.style.opacity = '0';
      }
    }
    return;
  }
  container.dataset.lastMoveKey = moveKey;
  if (consumeSkipNextMoveAnim()) {
    return;
  }
  animateBoardMove(container, from, to);
}

function cancelBoardMoveAnim() {
  boardMoveAnim?.cleanup();
}

// Technique du « fantôme superposé » : on fait glisser une copie de la pièce de sa case
// d'origine vers sa case d'arrivée, pendant que la vraie pièce (déjà rendue à l'arrivée)
// reste masquée le temps du trajet. Le fantôme est posé sur .board-shell (parent du plateau)
// pour survivre aux re-rendus du plateau (replaceChildren) sans être coupé en plein vol.
function animateBoardMove(container, fromSquare, toSquare) {
  cancelBoardMoveAnim();
  if (prefersReducedMotion()) {
    return;
  }
  const anchor = container.parentElement;
  const fromEl = container.querySelector(`[data-square="${fromSquare}"]`);
  const toEl = container.querySelector(`[data-square="${toSquare}"]`);
  const pieceImg = toEl?.querySelector('img');
  if (!anchor || !fromEl || !toEl || !pieceImg) {
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const fromRect = fromEl.getBoundingClientRect();
  const imgRect = pieceImg.getBoundingClientRect();
  if (!anchorRect.width || !imgRect.width) {
    return;
  }

  // Point de départ = centre de la pièce sur la case d'origine ; arrivée = position réelle.
  const startLeft = fromRect.left - anchorRect.left + (fromRect.width - imgRect.width) / 2;
  const startTop = fromRect.top - anchorRect.top + (fromRect.height - imgRect.height) / 2;
  const endLeft = imgRect.left - anchorRect.left;
  const endTop = imgRect.top - anchorRect.top;
  const dx = endLeft - startLeft;
  const dy = endTop - startTop;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return;
  }

  const ghost = pieceImg.cloneNode(true);
  ghost.classList.add('board-move-ghost');
  ghost.style.left = `${startLeft}px`;
  ghost.style.top = `${startTop}px`;
  ghost.style.width = `${imgRect.width}px`;
  ghost.style.height = `${imgRect.height}px`;
  ghost.style.transform = 'translate(0, 0)';
  pieceImg.style.opacity = '0';
  anchor.append(ghost);

  const token = Symbol('board-move');
  let done = false;
  const cleanup = () => {
    if (done) {
      return;
    }
    done = true;
    ghost.remove();
    // Ré-afficher la pièce d'arrivée du plateau courant (recréée à chaque re-rendu).
    const liveImg = elements.boardPreview.querySelector(`[data-square="${toSquare}"] img`);
    if (liveImg) {
      liveImg.style.opacity = '';
    }
    if (boardMoveAnim?.token === token) {
      boardMoveAnim = null;
    }
  };
  boardMoveAnim = { token, toSquare, cleanup };

  // Forcer un reflow pour valider la position initiale, puis lancer la transition.
  ghost.getBoundingClientRect();
  ghost.style.transition = 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)';
  ghost.style.transform = `translate(${dx}px, ${dy}px)`;
  ghost.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, 380); // Filet de sécurité si transitionend ne se déclenche pas.
}

function getOpeningBoardArrows() {
  const game = state.game;
  const reviewEntry = getActiveFreeReviewEntry();
  if (
    !game ||
    game.status !== 'lost' ||
    game.phase !== 'opening' ||
    !game.expectedOpeningArrows.length ||
    (reviewEntry && reviewEntry.afterFen !== game.chess.fen())
  ) {
    return [];
  }
  return game.expectedOpeningArrows;
}

function appendSquare(container, rankIndex, fileIndex, piece, from, to, options = {}) {
  const squareName = `${'abcdefgh'[fileIndex]}${8 - rankIndex}`;
  const pieceColor = piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null;
  const selectable = options.interactive && pieceColor === options.playableColor;
  const aids = options.aids ?? FULL_AIDS;
  // « point vert » : on n'affiche les cases légales que si l'aide est active.
  const target = Boolean(options.legalTargets?.has(squareName)) && aids.legalDots;
  // « choix du coup » : l'indice doré du bon coup (et le gris hors-livre) n'apparaît
  // que si l'aide est active ; sinon toutes les cases légales sont des points neutres.
  const bookTarget = target && aids.moveChoices && options.bookTargets?.has(squareName);
  const offbookTarget = target && aids.moveChoices && options.openingBookMode && !bookTarget;
  // N : coup du livre menant à une ligne déjà gagnée → badge « ✓ gagné ».
  const wonBookTarget = bookTarget && options.wonBookTargets?.has(squareName);
  const square = document.createElement('div');
  square.className = [
    'board-square',
    (rankIndex + fileIndex) % 2 === 0 ? 'light' : 'dark',
    squareName === from ? 'is-from' : '',
    squareName === to ? 'is-to' : '',
    options.interactive ? 'is-playable' : '',
    selectable ? 'is-selectable' : '',
    target ? 'is-target' : '',
    bookTarget ? 'is-book-target' : '',
    wonBookTarget ? 'is-won-book-target' : '',
    offbookTarget ? 'is-offbook-target' : '',
    target && piece ? 'is-capture-target' : '',
    squareName === options.checkSquare ? 'is-check' : '',
    squareName === options.matedSquare ? 'is-mated' : '',
    squareName === options.premoveFrom ? 'is-premove-from' : '',
    squareName === options.premoveTo ? 'is-premove-to' : '',
    options.threatSquares?.has(squareName) ? 'is-threat' : '',
    squareName === options.selectedSquare ? 'is-selected' : ''
  ]
    .filter(Boolean)
    .join(' ');
  square.dataset.square = squareName;
  if (options.interactive) {
    square.setAttribute('role', 'button');
    square.setAttribute('tabindex', '0');
    square.setAttribute('aria-label', getBoardSquareLabel(squareName, piece, target));
    square.addEventListener('click', () => handleBoardSquareClick(squareName));
    square.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleBoardSquareClick(squareName);
      }
    });
  } else if (options.premovable) {
    // T : pendant le tour adverse, le clic arme un prémouvement.
    square.setAttribute('role', 'button');
    square.setAttribute('tabindex', '0');
    square.addEventListener('click', () => handlePremoveClick(squareName));
    square.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handlePremoveClick(squareName);
      }
    });
  }

  if (piece) {
    const image = document.createElement('img');
    image.alt = `${pieceColor === 'w' ? 'Blanc' : 'Noir'} ${piece.toUpperCase()}`;
    image.src = `/pieces/merida/${pieceColor}${piece.toUpperCase()}.svg`;
    image.draggable = false; // évite le glisser-image natif (surbrillance parasite)
    square.append(image);
  }

  container.append(square);
}

function isBoardInteractive(container) {
  return Boolean(
    container === elements.boardPreview &&
    shouldRenderGameDetails() &&
    state.game?.active &&
    !state.game.locked &&
    state.game.historyView == null &&
    getPlayableBoardColor()
  );
}

function getInteractiveChess() {
  const reviewEntry = getActiveFreeReviewEntry();
  if (isPostGameReviewPlayable() && reviewEntry) {
    return new Chess(reviewEntry.afterFen);
  }
  return state.game?.chess ?? null;
}

function getPlayableBoardColor() {
  const game = state.game;
  if (!game) {
    return null;
  }
  const reviewEntry = getActiveFreeReviewEntry();
  if (isPostGameReviewPlayable() && reviewEntry) {
    return reviewEntry.afterFen.split(/\s+/)[1] ?? 'w';
  }
  if (game.status === 'playing' && !game.locked && game.chess.turn() === 'w') {
    return 'w';
  }
  return null;
}

function getLegalTargetsFromSquare(square) {
  const chess = getInteractiveChess();
  if (!chess || !square) {
    return new Set();
  }
  return new Set(chess.moves({ square, verbose: true }).map((move) => move.to));
}

function isOpeningBookChoiceActive() {
  return Boolean(
    state.game?.phase === 'opening' &&
    state.game.status === 'playing' &&
    getExpectedWhiteBookEdges().length
  );
}

function getBookTargetsFromSquare(square) {
  if (!state.game || !square || !isOpeningBookChoiceActive()) {
    return new Set();
  }
  return new Set(
    getExpectedWhiteBookEdges()
      .filter((edge) => edge.uci.slice(0, 2) === square)
      .map((edge) => edge.uci.slice(2, 4))
  );
}

// N — Cases destination des coups blancs d'ouverture menant à une ligne déjà
// gagnée (vs boss) : on les badge « ✓ gagné » sans les masquer (le joueur garde
// le choix de rejouer cette ligne).
function getWonBookTargetsFromSquare(square) {
  if (
    !state.game ||
    !square ||
    !isOpeningBookChoiceActive() ||
    !isAdventureRun() ||
    state.advRun?.kind !== 'boss' ||
    !advWonBossLines().length
  ) {
    return new Set();
  }
  return new Set(
    getExpectedWhiteBookEdges()
      .filter((edge) => edge.uci.slice(0, 2) === square && advNextSanLeadsToWonLine(edge.san))
      .map((edge) => edge.uci.slice(2, 4))
  );
}

function renderZoomBoard(node = state.currentPreviewNode) {
  elements.boardZoomLayer.hidden = !state.boardZoomed;
  document.body.classList.toggle('is-board-zoomed', state.boardZoomed);
  elements.boardZoomButton.textContent = state.boardZoomed ? 'Réduire' : 'Agrandir';
  elements.boardZoomButton.setAttribute(
    'aria-label',
    state.boardZoomed ? "Réduire l'échiquier" : "Agrandir l'échiquier"
  );

  if (!state.boardZoomed || !node) {
    elements.boardZoomPreview.replaceChildren();
    return;
  }

  elements.boardZoomTitle.textContent = node.id === 'root' ? 'Position initiale' : node.san;
  renderBoard(node, elements.boardZoomPreview);
}

function setBoardZoomed(isZoomed) {
  state.boardZoomed = isZoomed;
  renderZoomBoard();
}

function syncDetailInfoPlacement() {
  if (!elements.detailInfoContent || !elements.graphInfoContent || !elements.graphInfoDrawer) {
    return;
  }

  if (state.viewMode === 'human') {
    elements.graphInfoDrawer.hidden = false;
    if (elements.detailInfoContent.parentElement !== elements.graphInfoContent) {
      elements.graphInfoContent.append(elements.detailInfoContent);
    }
    return;
  }

  elements.graphInfoDrawer.hidden = true;
  if (elements.detailInfoContent.parentElement !== document.querySelector('.detail-panel')) {
    document.querySelector('.detail-panel')?.append(elements.detailInfoContent);
  }
}

function setViewMode(mode) {
  state.viewMode = mode === 'brain' ? 'brain' : 'human';
  if (state.viewMode === 'human' && state.boardZoomed) {
    setBoardZoomed(false);
  }
  document.body.classList.toggle('is-human-view', state.viewMode === 'human');
  document.body.classList.toggle('is-brain-view', state.viewMode === 'brain');
  syncDetailInfoPlacement();
  elements.viewModeButton.textContent = state.viewMode === 'human' ? 'Vue cerveau' : 'Vue joueur';
  elements.viewModeButton.setAttribute(
    'aria-label',
    state.viewMode === 'human' ? 'Basculer vers la vue cerveau' : 'Basculer vers la vue joueur'
  );
  window.requestAnimationFrame(() => renderGraph());
}

function toggleViewMode() {
  setViewMode(state.viewMode === 'human' ? 'brain' : 'human');
}

// --- Vue aventure : bascule échiquier ↔ cerveau ---

function setAdvViewMode(mode) {
  state.advViewMode = mode === 'board' ? 'board' : 'brain';
  showBrainScrub(false); // l'aperçu au doigt ne persiste pas d'une vue à l'autre
  state.brainFocus = null; // le zoom du cerveau ne persiste pas d'une vue à l'autre
  document.body.classList.toggle('is-adv-board-view', state.advViewMode === 'board');
  const btn = document.querySelector('#advViewToggle');
  if (btn) {
    btn.textContent = state.advViewMode === 'board' ? '🧠 Vue cerveau' : '🎮 Vue joueur';
    btn.setAttribute(
      'aria-label',
      state.advViewMode === 'board'
        ? 'Basculer vers la vue cerveau'
        : 'Basculer vers la vue échiquier'
    );
  }
  updateAdvMobileBar();
  window.requestAnimationFrame(() => {
    renderGraph();
    if (state.game?.active) {
      renderGameDetails();
    }
  });
}

function toggleAdvViewMode() {
  setAdvViewMode(state.advViewMode === 'board' ? 'brain' : 'board');
}

// --- Retours visuels en vue échiquier ---

/** Fait réagir l'échiquier : vert (bon coup), rouge + secousse (mauvais),
 *  ou halo doré « apprentissage » quand le joueur illumine un nouveau neurone. */
function flashAdvBoard(type) {
  if (state.advViewMode !== 'board') {
    return;
  }
  const board = document.querySelector('#boardPreview');
  if (!board) {
    return;
  }
  const classByType = {
    good: 'is-flash-good',
    bad: 'is-flash-bad',
    learn: 'is-flash-learn'
  };
  const cls = classByType[type] ?? 'is-flash-good';
  board.classList.remove(...Object.values(classByType));
  void board.offsetWidth; // force reflow pour redémarrer l'animation
  board.classList.add(cls);
  setTimeout(() => board.classList.remove(cls), type === 'learn' ? 900 : 650);
}

/** Ajoute des points de suivi verts sur les cases-cibles des coups du livre.
 *  Q — Ces indices « avant de jouer » suivent la même règle que les cases légales
 *  (aide « point vert ») : visibles aux niveaux faciles, masqués en Normal jusqu'à
 *  5 s ou une erreur, jamais en Difficile. */
function applyAdvBoardHints() {
  if (!isAdventureRun() || state.advViewMode !== 'board') {
    return;
  }
  const game = state.game;
  const board = document.querySelector('#boardPreview');
  if (!board) {
    return;
  }
  const inOpening =
    game &&
    !game.revision &&
    game.status === 'playing' &&
    game.chess.turn() === 'w' &&
    game.phase === 'opening';
  // L'indice n'apparaît que si l'aide « point vert » est active (révélée).
  const edges = inOpening && advAids().legalDots ? getExpectedWhiteBookEdges() : [];
  const toSquares = new Set(edges.map((e) => e.uci.slice(2, 4)));
  const fromSquares = new Set(edges.map((e) => e.uci.slice(0, 2)));
  for (const sq of board.querySelectorAll('.board-square')) {
    const name = sq.dataset.square;
    sq.classList.toggle('is-book-hint', toSquares.has(name));
    sq.classList.toggle('is-book-from', fromSquares.has(name));
  }
}

/** Met à jour l'aura de phase (ouverture / libre) et la légende flottante du board. */
function updateAdvBoardFeedback() {
  if (!isAdventureRun() || state.advViewMode !== 'board') {
    return;
  }
  const game = state.game;
  const board = document.querySelector('#boardPreview');
  const caption = document.querySelector('#advBoardCaption');
  if (!game || !board) {
    return;
  }
  // Bandeau au-dessus de l'échiquier : contexte de la partie en cours.
  renderAdvBoardTop();
  // Aura coral en phase libre (mode boss : trouve l'échec et mat)
  board.classList.toggle('is-free-phase', game.phase === 'free' && game.status === 'playing');
  if (!caption) {
    return;
  }
  if (game.status !== 'playing') {
    caption.textContent = '';
    return;
  }
  // Révision : la légende suit le rejeu / la question / le feedback.
  const rev = state.advRun?.revisionMode ? game.revision : null;
  if (rev) {
    caption.textContent =
      rev.phase === 'replay'
        ? '⏩ Rejeu accéléré…'
        : rev.phase === 'question'
          ? rev.keysRevealed
            ? rev.errorHint
              ? '❌ Pas celui-là — choisis parmi les propositions'
              : '🧠 Quel est le bon coup des Blancs ?'
            : '🧠 Joue le bon coup sur l’échiquier'
          : rev.phase === 'feedback'
            ? rev.answerUci === rev.step?.correctUci
              ? `✅ Bravo : ${rev.step?.correctSan} !`
              : `❌ Le bon coup était ${rev.step?.correctSan}.`
            : '';
    return;
  }
  if (game.phase === 'opening') {
    caption.textContent = game.chess.turn() === 'w' ? '⬜ Ton coup' : '⬛ Stockfish réfléchit…';
  } else {
    // Phase libre : objectif visuel
    const isMate = isAdventureRun() && state.advRun?.kind === 'boss';
    caption.textContent = isMate ? "⚔️ Trouve l'échec et mat" : '⚡ Phase libre';
  }
}

/** Profondeur (en demi-coups) de la plus longue ligne de livre restant à partir
 *  du noeud courant — sert à annoncer « encore N coups à découvrir ». */
function advRemainingBookPlies() {
  const startId = state.game?.currentNodeId;
  if (!startId) {
    return 0;
  }
  const memo = new Map();
  const visiting = new Set();
  const depthFrom = (nodeId) => {
    if (memo.has(nodeId)) {
      return memo.get(nodeId);
    }
    if (visiting.has(nodeId)) {
      return 0; // garde-fou contre les transpositions cycliques
    }
    visiting.add(nodeId);
    const node = getNode(nodeId);
    let best = 0;
    for (const edgeId of node?.outgoing ?? []) {
      const edge = getEdge(edgeId);
      if (edge) {
        best = Math.max(best, 1 + depthFrom(edge.to));
      }
    }
    visiting.delete(nodeId);
    memo.set(nodeId, best);
    return best;
  };
  return depthFrom(startId);
}

/** Texte du bandeau au-dessus de l'échiquier (vue joueur aventure) :
 *  ouverture → nom de la ligne / coups restants ; sinon → Stockfish affronté. */
function advBoardTopText() {
  const game = state.game;
  if (!game) {
    return '';
  }
  // Influence (partie finie) : guide la navigation ‹ › vers un embranchement.
  if (game.influence) {
    if (state.advRun?.overweightUsed) {
      return '✓ Pondération réglée pour la revanche';
    }
    return advInfluenceViewedNode()
      ? '🎚️ Choisis le coup des Noirs à pousser (+5 %)'
      : '🎚️ Reviens avec ‹ › sur un choix des Noirs';
  }
  if (game.status !== 'playing') {
    return '';
  }
  // Révision : le bandeau suit le rejeu / la question / le feedback.
  const rev = state.advRun?.revisionMode ? game.revision : null;
  if (rev) {
    return rev.phase === 'replay'
      ? '⏩ Révision · rejeu accéléré de la ligne…'
      : rev.phase === 'question'
        ? rev.keysRevealed
          ? '🧠 Quel est le bon coup des Blancs ?'
          : '🧠 Joue le bon coup sur l’échiquier'
        : rev.phase === 'feedback'
          ? rev.answerUci === rev.step?.correctUci
            ? `✅ Bravo : ${rev.step?.correctSan} !`
            : `❌ Le bon coup était ${rev.step?.correctSan}.`
          : '';
  }
  // Conversion automatique en cours : bandeau dédié au-dessus de l'échiquier.
  if (game.victoryCinematic) {
    return '🎬 Conversion automatique vers le mat…';
  }
  // T : pendant la réflexion adverse, on invite à préparer un prémouvement (et on
  // affiche celui qui est armé). Il se jouera automatiquement dès ton tour.
  if (isPremoveContext()) {
    if (game.premove) {
      return `⚡ Prémouvement armé : ${game.premove.from} → ${game.premove.to}`;
    }
    return '💡 Glisse une pièce pour préparer ton coup (prémouvement)';
  }
  const run = state.advRun;
  // Mode Pièges : on annonce l'objectif « livre le mat ».
  if (run?.trapsMode && game.phase === 'opening') {
    return '🎯 Piège : fais tomber Stockfish et mate-le';
  }
  // Boss : on annonce le Stockfish en face.
  if (run?.kind === 'boss') {
    const profile = getStockfishLevelProfile(run.bossLevel);
    const strength = profile.elo ? `${profile.elo} Elo` : 'force max';
    return `♟︎ Boss N${profile.level} · ${profile.label} · ${strength}`;
  }
  // Leçon / ouverture : combien de coups de livre restent à découvrir.
  if (game.phase === 'opening') {
    const remaining = advRemainingBookPlies();
    if (remaining <= 0) {
      return '📖 Fin de la ligne — sors du livre';
    }
    return `📖 Ouverture · encore ${remaining} coup${remaining > 1 ? 's' : ''} à découvrir`;
  }
  // Phase libre : objectif de mat pour un boss, sinon générique.
  if (run?.kind === 'boss' || isMateObjective(game)) {
    return '⚔️ Trouve l’échec et mat';
  }
  return '⚡ Phase libre';
}

function renderAdvBoardTop() {
  const el = document.querySelector('#advBoardTop');
  if (el) {
    el.textContent = advBoardTopText();
  }
}

function isExplorationMode() {
  return state.game?.mode === 'exploration' || state.playMode === 'exploration';
}

function isBrainGraphExplorationActive() {
  return isExplorationMode() && state.viewMode === 'brain';
}

function shouldFollowGameInGraph() {
  return Boolean(state.game?.active && !isBrainGraphExplorationActive());
}

function shouldRenderGameDetails() {
  return Boolean(state.game?.active && !isBrainGraphExplorationActive());
}

function setPlayMode(mode) {
  const nextMode = mode === 'exploration' ? 'exploration' : 'challenge';
  if (state.playMode !== nextMode && nextMode === 'challenge') {
    state.campaignLevel = FIRST_LEVEL_NUMBER;
  }
  state.playMode = nextMode;
  syncPlayModeButtons();
  startNewGame();
}

function syncPlayModeButtons() {
  elements.challengeModeButton.classList.toggle('is-active', state.playMode === 'challenge');
  elements.explorationModeButton.classList.toggle('is-active', state.playMode === 'exploration');
}

function createInitialGameState(level = state.campaignLevel) {
  const exploration = state.playMode === 'exploration';
  const isAdventureBoss = state.screen === 'adventure' && state.advRun?.kind === 'boss';
  const objective = isAdventureBoss
    ? { type: 'mate', target: Number.POSITIVE_INFINITY }
    : getLevelObjective(exploration ? FIRST_LEVEL_NUMBER : level);
  const rootNode = getNode('root');
  const chess = new Chess(rootNode?.fen ?? STANDARD_START_FEN);
  const rootEvaluation = rootNode?.evaluation ?? { cpWhite: 0 };
  return {
    active: true,
    mode: state.playMode,
    level: exploration ? FIRST_LEVEL_NUMBER : level,
    objective,
    nextLevel: null,
    finalVictory: false,
    chess,
    currentNodeId: 'root',
    currentPathNodeIds: ['root'],
    currentPathEdgeIds: [],
    phase: 'opening',
    status: 'playing',
    lives: STARTING_LIVES,
    freeRemaining:
      exploration || objective.type === 'mate' ? Number.POSITIVE_INFINITY : objective.target,
    freeRoundPending: false,
    openingBlackMoves: 0,
    currentEvalCp: rootEvaluation.cpWhite ?? 0,
    currentPv: rootEvaluation.pv ?? '',
    currentDepth: rootEvaluation.depth ?? 0,
    locked: false,
    selectedSquare: null,
    message: exploration
      ? 'Mode exploration: teste les lignes ou sors du livre sans perdre de vie.'
      : `Niveau ${level}: ${formatLevelObjective(level)} après l'ouverture.`,
    lastMove: null,
    moveLog: [],
    freeReviewMoves: [createInitialReviewEntry(chess, rootEvaluation)],
    freeReview: {
      active: false,
      index: -1,
      preferredChildByParent: {}
    },
    failureFen: null,
    failureEvaluation: null,
    defeatComment: '',
    expectedOpeningArrows: [],
    defeatLineRecorded: false,
    cinematic: null,
    cinematicTimer: null,
    victoryCinematic: false, // conversion automatique vers le mat en cours
    victoryConverted: false, // déjà déclenchée une fois pour cette partie
    takebackLocked: false, // verrou après un retour arrière « dernière chance »
    gameRecorded: false, // M : partie déjà ajoutée à l'historique
    replayWonLine: false, // N : le joueur a choisi de rejouer une ligne gagnée
    revealLegalDots: false, // Q : cases légales révélées (Normal, après 5 s / erreur)
    finalMateLives: 0, // S : retours « dernière chance » en phase finale du mat
    mateExpected: null, // distance au mat attendue (mat en X) pendant la conversion
    mateTolerance: DEFAULT_MATE_TOLERANCE, // tolérance « mat qui s'éloigne »
    mateResolved: false, // résolution du mat de défaite réussie
    mateResolutionFailed: false, // résolution du mat de défaite échouée
    mateResolution: null, // sous-phase de résolution du mat de défaite
    clock: makeInitialClock(), // U : pendule des deux camps (null si sans horloge)
    premove: null, // T : { from, to } armé pendant la réflexion adverse
    premoveSelect: null, // T : case source sélectionnée pour armer le prémouvement
    revision: null, // Révision : { phase: replay|question|feedback|done, step, answerUci }
    influence: null, // Influence : { selectedUci, lineSans?, lineIndex? } — revue ‹ › + choix
    influencePending: false, // Influence : ouverture auto programmée (anti-flash du carton)
    influenceDone: false, // Influence : phase close → CTA finaux de défaite
    defeatCinematicPending: false, // Punition : suite en cours de construction/lecture
    skipDefeatCinematic: false // ⏩ demandé avant que la suite soit prête
  };
}

function getGameNode() {
  if (!state.game) {
    return null;
  }
  return getNode(state.game.currentNodeId) ?? state.nodesByFen.get(state.game.chess.fen()) ?? null;
}

function getGameNodeByFen() {
  if (!state.game) {
    return null;
  }
  return (
    state.nodesByFen.get(state.game.chess.fen()) ??
    state.nodesByPositionKey.get(fenPositionKey(state.game.chess.fen())) ??
    null
  );
}

function buildRawPathToNode(nodeId) {
  if (!nodeId || (nodeId !== 'root' && !getNode(nodeId))) {
    return { nodeIds: ['root'], edgeIds: [] };
  }

  const nodeIds = [];
  const edgeIds = [];
  let currentId = nodeId;
  const visited = new Set();
  let guard = 0;

  while (currentId && currentId !== 'root' && guard < 180) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    nodeIds.push(currentId);
    const node = getNode(currentId);
    const incomingEdge = node?.incoming.map(getEdge).find(Boolean);
    if (!incomingEdge) {
      break;
    }
    edgeIds.push(incomingEdge.id);
    currentId = incomingEdge.from;
    guard += 1;
  }

  nodeIds.push('root');
  return {
    nodeIds: nodeIds.reverse(),
    edgeIds: edgeIds.reverse()
  };
}

function setGameGraphPathToNode(nodeId) {
  if (!state.game) {
    return;
  }
  const path = buildRawPathToNode(nodeId);
  state.game.currentPathNodeIds = path.nodeIds;
  state.game.currentPathEdgeIds = path.edgeIds;
}

function appendGameGraphPathEdge(edge) {
  const game = state.game;
  if (!game) {
    return;
  }

  if (!Array.isArray(game.currentPathNodeIds) || !Array.isArray(game.currentPathEdgeIds)) {
    setGameGraphPathToNode(edge.from);
  }

  const lastNodeId = game.currentPathNodeIds[game.currentPathNodeIds.length - 1];
  if (lastNodeId !== edge.from) {
    setGameGraphPathToNode(edge.from);
  }

  if (game.currentPathEdgeIds[game.currentPathEdgeIds.length - 1] !== edge.id) {
    game.currentPathEdgeIds.push(edge.id);
  }
  if (game.currentPathNodeIds[game.currentPathNodeIds.length - 1] !== edge.to) {
    game.currentPathNodeIds.push(edge.to);
  }
}

function isEdgeLegalInGame(edge) {
  if (!state.game || !edge) {
    return false;
  }
  const chess = new Chess(state.game.chess.fen());
  return Boolean(playUciOnChess(chess, edge.uci));
}

function buildLiveBookEdgesForNode(nodeId, color = null, { legalInCurrentGame = false } = {}) {
  const node = getNode(nodeId);
  if (!node) {
    return [];
  }

  const outgoing = getRawOutgoingEdges(nodeId, color).filter(
    (edge) => !legalInCurrentGame || isEdgeLegalInGame(edge)
  );
  if (!outgoing.length) {
    return [];
  }

  if (outgoing.length === 1) {
    const edge = { ...outgoing[0] };
    edge.probability = 1;
    edge.deltaCp = 0;
    edge.pathMeanCp = getBranchValue(edge);
    edge.isBest = true;
    edge.endsInMate = branchEventuallyEndsInMate(edge);
    return [edge];
  }

  const temperature = Math.max(1, state.temperatureCp || PROBABILITY_TEMPERATURE_CP);
  const floorMass = clamp(state.floorMass ?? DISPLAY_DEFAULT_FLOOR_MASS, 0, 0.95);
  const scored = outgoing.map((rawEdge) => {
    const edge = { ...rawEdge };
    const pathMean = getBranchValue(edge);
    return {
      edge,
      pathMean,
      score: scoreForSide(pathMean, node.sideToMove)
    };
  });
  const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
  const bestScore = Math.max(...scored.map((item) => item.score));
  const rawWeights = scored.map((item) =>
    Math.exp(clamp(item.score - average, -800, 800) / temperature)
  );
  const rawTotal = rawWeights.reduce((sum, value) => sum + value, 0);

  scored.forEach((item, index) => {
    const softmax = rawTotal > 0 ? rawWeights[index] / rawTotal : 1 / scored.length;
    item.edge.probability = floorMass / scored.length + (1 - floorMass) * softmax;
    item.edge.deltaCp = Math.round(item.score - average);
    item.edge.pathMeanCp = Math.round(item.pathMean);
    item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
    item.edge.endsInMate = branchEventuallyEndsInMate(item.edge);
  });
  applyMinimumProbabilities(scored);
  normalizeScoredProbabilities(scored);
  return scored.map((item) => item.edge);
}

// Un nœud terminal sur un mat livré par les Blancs (cœur d'un piège d'ouverture).
function isWhiteMateBookNode(node) {
  return Boolean(node?.terminal) && (node?.evaluation?.cpWhite ?? 0) >= MATE_SCORE_CP - 1000;
}

let trapReachCache = null;

// Le sous-arbre issu de ce nœud mène-t-il à un mat des Blancs ? (mémoïsé par livre)
function bookNodeReachesMate(nodeId) {
  if (!trapReachCache) {
    trapReachCache = new Map();
  }
  const visiting = new Set();
  const walk = (id) => {
    if (trapReachCache.has(id)) {
      return trapReachCache.get(id);
    }
    if (visiting.has(id)) {
      return false; // garde anti-cycle (transpositions)
    }
    visiting.add(id);
    const node = getNode(id);
    let reaches = isWhiteMateBookNode(node);
    if (!reaches && node) {
      for (const edgeId of node.outgoing) {
        const edge = getEdge(edgeId);
        if (edge && walk(edge.to)) {
          reaches = true;
          break;
        }
      }
    }
    visiting.delete(id);
    trapReachCache.set(id, reaches);
    return reaches;
  };
  return walk(nodeId);
}

// Y a-t-il au moins une ligne de piège (mat) dans tout le livre ?
function bookHasTrapLines() {
  return (state.data?.nodes ?? []).some((node) => isWhiteMateBookNode(node));
}

function getExpectedWhiteBookEdges() {
  if (!state.game || state.game.phase !== 'opening') {
    return [];
  }
  const edges = getRawOutgoingEdges(state.game.currentNodeId, 'w').filter(isEdgeLegalInGame);
  // Mode Pièges : on guide le joueur vers les coups qui mènent au mat.
  if (state.advRun?.trapsMode && edges.length > 1) {
    const trapEdges = edges.filter((edge) => bookNodeReachesMate(edge.to));
    if (trapEdges.length) {
      return trapEdges;
    }
  }
  return edges;
}

function getExpectedWhiteBookArrows() {
  return getExpectedWhiteBookEdges().map((edge) => ({
    from: edge.uci.slice(0, 2),
    to: edge.uci.slice(2, 4),
    san: edge.san
  }));
}

function getBlackBookEdges() {
  if (!state.game || state.game.phase !== 'opening') {
    return [];
  }
  return buildLiveBookEdgesForNode(state.game.currentNodeId, 'b', { legalInCurrentGame: true });
}

/**
 * Réponses du livre que l'adversaire peut réellement jouer pour le run en cours.
 * En mode apprentissage, on retire les lignes déjà découvertes (« tombées ») afin de
 * pousser le joueur vers du neuf. On ne touche pas aux poids relatifs des autres :
 * comme les lignes tombées ne peuvent plus sortir, les restantes se renormalisent
 * naturellement (elles deviennent plus probables). Quand tout est découvert à ce
 * nœud, on relâche le filtre : tout peut de nouveau tomber.
 */
function getOpponentBookEdgesForRun() {
  const edges = getBlackBookEdges();
  if (edges.length <= 1) {
    return edges;
  }
  // O (boutique) : la pondération ±5% achetée est appliquée plus tard, lors du
  // tirage pondéré du coup noir (buildOpponentBookCandidates), pas par un filtre dur.
  // N (boss) : on masque les réponses qui rejoueraient une ligne déjà gagnée,
  // pour pousser vers de la variété. Si tout est masqué, on relâche le filtre.
  if (advWonLineMaskingActive()) {
    const fresh = edges.filter((edge) => !advNextSanLeadsToWonLine(edge.san));
    if (fresh.length) {
      return fresh;
    }
  }
  if (!isAdventureLesson()) {
    return edges;
  }
  // Mode Pièges : on oriente l'adversaire vers les lignes qui finissent sur un mat
  // (il « tombe » dans le piège), en alternant les pièges déjà vus.
  if (state.advRun?.trapsMode) {
    const trapEdges = edges.filter((edge) => bookNodeReachesMate(edge.to));
    const pool = trapEdges.length ? trapEdges : edges;
    const freshTraps = pool.filter((edge) => !isAdventureEdgeMastered(edge));
    return freshTraps.length ? freshTraps : pool;
  }
  const fresh = edges.filter((edge) => !isAdventureEdgeMastered(edge));
  return fresh.length ? fresh : edges;
}

// N — Lignes d'ouverture déjà gagnées contre un boss (suite complète de SAN).
// Sert à forcer la variété : Stockfish évite ces lignes, le joueur les voit badgées.
function advWonBossLines() {
  return (state.adventure?.games || [])
    .filter(
      (g) =>
        g.result === 'won' && g.kind === 'boss' && Array.isArray(g.lineSans) && g.lineSans.length
    )
    .map((g) => g.lineSans);
}

// SAN d'ouverture déjà joués dans la partie en cours (les deux couleurs).
function advCurrentOpeningSans(game = state.game) {
  return (game?.freeReviewMoves || [])
    .filter((entry) => entry.phase === 'opening')
    .map((entry) => normalizeSanForCompare(entry.san));
}

// Vrai si prolonger l'ouverture courante par `nextSan` reste le préfixe d'au
// moins une ligne déjà gagnée contre un boss.
function advNextSanLeadsToWonLine(nextSan, game = state.game) {
  const wonLines = advWonBossLines();
  if (!wonLines.length) {
    return false;
  }
  const prefix = [...advCurrentOpeningSans(game), normalizeSanForCompare(nextSan)];
  return wonLines.some(
    (line) =>
      line.length >= prefix.length &&
      prefix.every((san, index) => normalizeSanForCompare(line[index]) === san)
  );
}

// N s'applique en arène (boss) : le concept de « ligne gagnée » vient des bosses.
function advWonLineMaskingActive() {
  return (
    isAdventureRun() &&
    state.advRun?.kind === 'boss' &&
    !state.game?.replayWonLine &&
    advWonBossLines().length > 0
  );
}

function tryMoveInput(chess, rawInput) {
  const input = String(rawInput ?? '').trim();
  if (!input) {
    return null;
  }

  try {
    return chess.move(input);
  } catch {
    const uci = input.toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      return null;
    }
    try {
      return chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || 'q'
      });
    } catch {
      return null;
    }
  }
}

function findMatchingBookEdge(rawInput) {
  const expected = getExpectedWhiteBookEdges();
  const chess = new Chess(state.game.chess.fen());
  const move = tryMoveInput(chess, rawInput);
  if (!move) {
    return { legal: false, move: null, edge: null };
  }

  const uci = moveToUci(move);
  const san = normalizeSanForCompare(move.san);
  const edge = expected.find(
    (candidate) => candidate.uci === uci || normalizeSanForCompare(candidate.san) === san
  );
  return { legal: true, move, edge: edge ?? null };
}

function getKnownWhiteBookMoveHint(move) {
  if (!state.data || !move) {
    return null;
  }
  const uci = moveToUci(move);
  const san = normalizeSanForCompare(move.san);
  const expectedIds = new Set(getExpectedWhiteBookEdges().map((edge) => edge.id));
  const matches = state.data.edges.filter(
    (edge) =>
      edge.color === 'w' &&
      !expectedIds.has(edge.id) &&
      (edge.uci === uci || normalizeSanForCompare(edge.san) === san)
  );
  if (!matches.length) {
    return null;
  }

  return {
    sources: [...new Set(matches.flatMap((edge) => edge.sources ?? []))],
    count: matches.length
  };
}

function buildOpeningMismatchMessage(move) {
  const expected = getExpectedWhiteBookEdges();
  const expectedText = expected.length
    ? ` Ici, le livre attend ${joinHumanList(expected.map((edge) => edge.san))}.`
    : '';
  const hint = getKnownWhiteBookMoveHint(move);
  if (hint) {
    const sourceText = hint.sources.length ? ` (${formatSourceList(hint.sources)})` : '';
    return (
      `${move.san} existe dans une autre branche du livre${sourceText}, ` +
      `mais pas depuis cette position.${expectedText} Retour utilisé, rejoue un coup d'ouverture.`
    );
  }

  return `Ce coup sort du livre attendu.${expectedText} Retour utilisé, rejoue un coup d'ouverture.`;
}

function canOpponentLeaveBookAtPly(ply) {
  return ply >= OPENING_FREE_BREAK_PLY;
}

function buildOpponentBookCandidates(bookEdges, ply = state.game?.chess.history().length ?? 0) {
  if (!bookEdges.length) {
    return [];
  }

  const canLeave = canOpponentLeaveBookAtPly(ply) && !isAdventureLesson();
  const bookMass = canLeave ? 1 - OPENING_FREE_BREAK_PROBABILITY : 1;
  // O — pondération boutique : ±5% (points de %) sur la proba d'un coup noir donné.
  const branchFen = state.game?.chess.fen();
  return normalizeWeightedCandidates([
    ...bookEdges.map((edge) => {
      const weighted = Math.max(
        0,
        edge.probability + advBlackChoiceWeight(branchFen, edge.uci) / 100
      );
      return {
        id: `book:${edge.id}`,
        type: 'book',
        edge: { ...edge, probability: weighted * bookMass },
        probability: weighted * bookMass
      };
    }),
    ...(canLeave
      ? [
          {
            id: 'free:stockfish',
            type: 'free',
            label: 'Sortie libre',
            probability: OPENING_FREE_BREAK_PROBABILITY
          }
        ]
      : [])
  ]).map((candidate) =>
    candidate.edge
      ? {
          ...candidate,
          edge: { ...candidate.edge, probability: candidate.probability }
        }
      : candidate
  );
}

function applyGameEdge(edge) {
  const beforeFen = state.game.chess.fen();
  const beforeEvalCp = state.game.currentEvalCp;
  const move = playUciOnChess(state.game.chess, edge.uci);
  if (!move) {
    return null;
  }
  state.game.historyView = null; // un nouveau coup ramène toujours à la position en cours
  state.game.lastMove = move;
  state.game.currentNodeId = edge.to;
  appendGameGraphPathEdge(edge);
  const node = getNode(edge.to);
  const evaluation = node?.evaluation ?? {
    cpWhite: state.game.currentEvalCp,
    depth: state.game.currentDepth,
    pv: state.game.currentPv
  };
  state.game.currentEvalCp = evaluation.cpWhite ?? state.game.currentEvalCp;
  state.game.currentPv = evaluation.pv ?? '';
  state.game.currentDepth = evaluation.depth ?? state.game.currentDepth;
  appendGameMove(move, edge.color === 'b' ? 'Livre adverse' : 'Livre blanc');
  recordFreeReviewMove({
    move,
    label: edge.color === 'b' ? 'Livre adverse' : 'Livre blanc',
    phase: 'opening',
    beforeFen,
    beforeEvalCp,
    evaluation,
    status: 'book'
  });
  adventureLightEdge(edge);
  return move;
}

function applyFreeMove(move, label) {
  state.game.historyView = null; // un nouveau coup ramène toujours à la position en cours
  state.game.lastMove = move;
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
  }
  appendGameMove(move, label);
}

function appendGameMove(move, label) {
  // Temps de jeu : on ne compte que les coups BLANCS réellement joués par le
  // joueur. La conversion automatique vers le mat (coups générés par le moteur)
  // ne doit pas gonfler le compteur.
  if (
    state.screen === 'adventure' &&
    state.adventure &&
    move.color === 'w' &&
    label !== 'Conversion auto'
  ) {
    state.adventure.movesPlayed = (state.adventure.movesPlayed || 0) + 1;
  }
  const parsedMoveNumber = Number(move.before?.split(/\s+/)[5] ?? 1);
  const moveNumber = Number.isFinite(parsedMoveNumber) ? parsedMoveNumber : 1;
  const prefix = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
  state.game.moveLog.unshift({
    text: `${prefix} ${move.san}`,
    label,
    color: move.color
  });
  state.game.moveLog = state.game.moveLog.slice(0, 8);
}

// Meilleur coup qui était disponible avant ce coup (1er coup de la PV du parent).

function clearGameCinematic() {
  if (state.game?.cinematicTimer) {
    clearInterval(state.game.cinematicTimer);
  }
  if (state.game) {
    state.game.cinematicTimer = null;
    state.game.cinematic = null;
  }
}

function startNewGame(level = state.campaignLevel) {
  clearGameCinematic();
  resetLegalDotsReveal(); // Q : on repart cases masquées
  setEngineThinking(false);
  document.body.classList.remove('is-game-lost', 'is-game-over');
  if (state.playMode === 'challenge') {
    state.campaignLevel = Math.max(FIRST_LEVEL_NUMBER, level);
  }
  state.game = createInitialGameState(state.campaignLevel);
  state.highlightedEdges.clear();
  state.highlightedNodes = new Set(['root']);
  state.selectedNodeId = 'root';
  state.selectedSegment = null;
  state.segmentStepIndex = 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent =
    state.playMode === 'exploration'
      ? 'Exploration: livre italien actif'
      : `Niveau ${state.game.level}: ${formatLevelObjective(state.game.level)}`;
  renderGraph();
  ensureStockfishReady(false).catch((error) => {
    if (!state.game || state.game.status !== 'playing') {
      return;
    }
    state.game.message = `Stockfish indisponible pour l'instant: ${error.message}`;
    renderGamePanel();
  });
}

function handleNewGameAction() {
  const game = state.game;
  if (
    game?.mode === 'challenge' &&
    game.status === 'won' &&
    !game.finalVictory &&
    Number.isFinite(game.nextLevel)
  ) {
    startNewGame(game.nextLevel);
    return;
  }

  if (game?.mode === 'challenge' && game.status === 'won' && game.finalVictory) {
    state.campaignLevel = FIRST_LEVEL_NUMBER;
  }
  startNewGame();
}

function finishCampaignByMate(message = null) {
  const game = state.game;
  if (!game) {
    return;
  }
  game.finalVictory = true;
  game.nextLevel = null;
  finishGame('won', message ?? `Échec et mat: campagne terminée au niveau ${game.level}.`);
}

function finishSurvivalLevel() {
  const game = state.game;
  if (!game) {
    return;
  }
  const nextLevel = game.level + 1;
  game.nextLevel = nextLevel;
  finishGame(
    'won',
    `Niveau ${game.level} validé: tu as survécu à ${game.objective.target} coups complets libres. Prochain objectif: ${formatLevelObjective(nextLevel)}.`
  );
}

// Nulle (le plus souvent un pat) : aucun camp n'est maté. L'objectif est de mater,
// donc une nulle n'est PAS une victoire — on termine en demandant de refaire la partie.
function finishGameByStalemate(chess) {
  finishGame(
    'lost',
    `${drawKindLabel(chess)} : aucun camp n'est maté. Tu n'as pas réussi le mat, il faut refaire la partie.`
  );
}

function finishTerminalPosition(message = 'La partie est terminée.') {
  const game = state.game;
  if (!game) {
    return;
  }
  if (game.chess.isCheckmate()) {
    if (game.chess.turn() === 'b') {
      finishCampaignByMate(`Échec et mat: campagne terminée au niveau ${game.level}.`);
    } else {
      finishGame('lost', message);
    }
    return;
  }
  // Aucun coup légal sans être en échec = pat (nulle) : ce n'est pas un mat, donc pas une victoire.
  if (game.chess.isDraw()) {
    finishGameByStalemate(game.chess);
    return;
  }
  finishGame('won', message);
}

async function submitHumanMove(rawInput = elements.moveInput.value) {
  const game = state.game;
  if (!game || game.locked) {
    return;
  }

  if (isPostGameReviewPlayable()) {
    await submitReviewVariationMove(rawInput);
    elements.moveInput.value = '';
    return;
  }

  if (game.status !== 'playing') {
    return;
  }

  if (game.chess.turn() !== 'w') {
    game.message = 'Attends la réponse noire.';
    renderGamePanel();
    return;
  }

  const input = String(rawInput ?? '').trim();
  if (!input) {
    game.message = 'Entre un coup blanc en SAN ou en UCI.';
    renderGamePanel();
    return;
  }

  // Révision : pendant la question, un coup joué (échiquier ou champ texte) répond
  // à la question au lieu de suivre le flux de partie normal.
  if (game.revision) {
    if (game.revision.phase === 'question') {
      game.selectedSquare = null;
      advRevisionAnswerInput(input);
      elements.moveInput.value = '';
    }
    return;
  }

  game.selectedSquare = null;
  setGameLocked(true);
  try {
    if (game.phase === 'opening' && getExpectedWhiteBookEdges().length) {
      await submitOpeningMove(input);
    } else {
      if (game.phase === 'opening') {
        enterFreePhase(
          isExplorationMode()
            ? "Le livre blanc est terminé: l'exploration continue en libre."
            : 'Le livre blanc est terminé: survie libre.'
        );
      }
      await submitFreeMove(input);
    }
  } finally {
    setGameLocked(false);
    elements.moveInput.value = '';
    renderGraph();
    // T : maintenant que c'est de nouveau à toi (déverrouillé), joue le prémouvement
    // armé pendant la réflexion adverse. Relance la chaîne (coup → réponse → prémouvement).
    tryExecutePremove();
  }
}

async function submitOpeningMove(input) {
  const result = findMatchingBookEdge(input);
  if (!result.legal) {
    state.game.message = 'Coup illégal ou illisible. Essaie en SAN (Nf3) ou UCI (g1f3).';
    revealLegalDotsNow();
    return;
  }

  if (!result.edge) {
    if (isExplorationMode()) {
      state.game.expectedOpeningArrows = [];
      await submitExplorationMove(
        input,
        "Sortie du livre explorée: l'adversaire passe au calcul libre."
      );
      return;
    }
    state.game.expectedOpeningArrows = getExpectedWhiteBookArrows();
    if (state.screen === 'adventure') {
      adventureOnWrongBook();
    }
    revealLegalDotsNow(); // Q : erreur → on révèle les cases légales
    consumeLife(buildOpeningMismatchMessage(result.move));
    return;
  }

  state.game.expectedOpeningArrows = [];
  // N : si le joueur choisit délibérément un coup qui mène à une ligne déjà
  // gagnée (badgé), on relâche le masquage pour Stockfish sur le reste de la partie.
  if (advNextSanLeadsToWonLine(result.edge.san)) {
    state.game.replayWonLine = true;
  }
  applyGameEdge(result.edge);
  resetLegalDotsReveal(); // Q : coup joué → on remasque pour le tour suivant
  if (state.screen === 'adventure') {
    adventureOnCorrectWhiteBook(result.edge);
  }
  if (!isExplorationMode() && state.game.chess.isCheckmate()) {
    // Mat dans le livre : en leçon/pièges c'est un succès de leçon, sinon fin de campagne.
    if (isAdventureLesson()) {
      adventureOnTrapSolved();
    } else {
      finishCampaignByMate();
    }
    return;
  }
  state.game.message = isExplorationMode()
    ? `Ligne suivie: ${result.edge.san}.`
    : `Bien: ${result.edge.san} reste dans l'ouverture.`;
  // Affiche (et anime) le coup blanc avant que l'adversaire ne réponde.
  renderGameDetails();
  await advanceOpponentTurn();
  // Le prémouvement éventuel est joué après déverrouillage (cf. submitHumanMove).
}

async function submitExplorationMove(input, message) {
  const move = tryMoveInput(state.game.chess, input);
  if (!move) {
    state.game.message = 'Coup illégal ou illisible.';
    return;
  }

  applyFreeMove(move, 'Exploration blanche');
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
  }
  enterFreePhase(message);
  if (state.game.chess.turn() === 'b') {
    await advanceOpponentTurn();
  }
}

async function submitFreeMove(input) {
  if (!state.game || state.game.status !== 'playing') {
    return;
  }
  const beforeFen = state.game.chess.fen();
  const beforeEvalCp = state.game.currentEvalCp;
  const move = tryMoveInput(state.game.chess, input);
  if (!move) {
    state.game.message = 'Coup libre illégal ou illisible.';
    revealLegalDotsNow();
    return;
  }

  applyFreeMove(move, isExplorationMode() ? 'Exploration blanche' : 'Survie blanche');
  resetLegalDotsReveal(); // Q : coup joué → on remasque pour le tour suivant
  state.game.message = 'Stockfish évalue ton coup libre...';
  renderGamePanel();
  renderGameDetails();
  const evaluator = await ensureStockfishReady();
  const evaluation = await evaluator.evaluate(state.game.chess.fen());
  state.game.currentEvalCp = evaluation.cpWhite;
  state.game.currentPv = evaluation.pv;
  state.game.currentDepth = evaluation.depth;

  const deficitLimitCp = isAdventureRun() ? advRunDeficitThresholdCp() : state.survivalLimitCp;
  if (!isExplorationMode() && evaluation.cpWhite < deficitLimitCp) {
    recordFreeReviewMove({
      move,
      label: 'Survie blanche',
      beforeFen,
      beforeEvalCp,
      evaluation,
      status: 'losing'
    });
    state.game.failureFen = state.game.chess.fen();
    state.game.failureEvaluation = evaluation;
    finishGame(
      'lost',
      isAdventureRun()
        ? `Gaffe fatale : la position s'effondre à ${formatEval(evaluation.cpWhite)} (seuil ${formatEval(deficitLimitCp)}).`
        : `Erreur en survie: la position tombe à ${formatEval(evaluation.cpWhite)}.`,
      state.game.chess.fen(),
      evaluation
    );
    return;
  }

  // Filet « mat qui s'éloigne » (aventure) : si tu disposes d'un mat forcé, ton coup
  // ne doit pas faire grimper la distance au mat de plus de 2 par rapport à l'attendu
  // (X-1). Sinon : échec de la position → réessai en perdant une vie (jusqu'à 3).
  if (isAdventureRun() && !state.game.chess.isCheckmate() && !state.game.chess.isDraw()) {
    const newMate =
      isMateScore(evaluation.cpWhite) && evaluation.cpWhite > 0
        ? mateMovesFromCp(evaluation.cpWhite)
        : null;
    if (Number.isFinite(state.game.mateExpected)) {
      const expectedAfter = Math.max(1, state.game.mateExpected - 1);
      const blewIt = newMate === null || newMate > expectedAfter + advMateTolerance();
      if (blewIt) {
        if ((state.game.finalMateLives || 0) > 0) {
          state.game.finalMateLives -= 1;
          revertLastPlayerMove();
          const gotTxt = newMate === null ? 'le mat forcé s’échappe' : `mat en ${newMate}`;
          if (state.game.finalMateLives > 0) {
            // Les vies restantes sont affichées par l'indicateur de cœurs.
            state.game.message = `❌ ${gotTxt} (attendu : mat en ${expectedAfter}). Réessaie !`;
            renderGamePanel();
            renderGameDetails();
            return;
          }
          if (state.game.mateResolution?.active && state.game.mateResolution.originalSnapshot) {
            finishMateResolution(state.game, {
              success: false,
              message: `Fin critique : ${gotTxt} (attendu : mat en ${expectedAfter}).`
            });
            return;
          }
          finishGame(
            'lost',
            `Conversion du mat ratée : le mat s'éloignait trop (plus de vies). ${
              newMate === null ? 'Tu as perdu le mat forcé.' : `Dernier essai : mat en ${newMate}.`
            }`
          );
          return;
        }
        if (state.game.mateResolution?.active && state.game.mateResolution.originalSnapshot) {
          finishMateResolution(state.game, {
            success: false,
            message: `Fin critique : ${newMate === null ? 'le mat forcé s’échappe' : `mat en ${newMate}`}.`
          });
          return;
        }
        finishGame(
          'lost',
          `Conversion du mat ratée : le mat s'éloignait trop (plus de vies). ${
            newMate === null ? 'Tu as perdu le mat forcé.' : `Dernier essai : mat en ${newMate}.`
          }`
        );
        return;
      }
      state.game.mateExpected = newMate; // coup correct : on met à jour l'attente
    } else if (newMate !== null) {
      state.game.mateExpected = newMate; // entrée en phase mat (référence)
      if (!state.game.finalMateLives) {
        state.game.finalMateLives = 3; // 3 vies pour la conversion
      }
    }
  }

  recordFreeReviewMove({
    move,
    label: isExplorationMode() ? 'Exploration blanche' : 'Survie blanche',
    beforeFen,
    beforeEvalCp,
    evaluation
  });

  if (state.game.mateResolution?.active && state.game.chess.isCheckmate()) {
    finishMateResolution(state.game, {
      success: true,
      message: 'Mat résolu : la suite se débloque.'
    });
    return;
  }

  if (!isExplorationMode() && state.game.chess.isCheckmate()) {
    finishCampaignByMate(`Échec et mat: campagne terminée au niveau ${state.game.level}.`);
    return;
  }

  // Pat (ou nulle) après ton coup : tu n'as pas maté → il faut refaire la partie.
  if (!isExplorationMode() && state.game.chess.isDraw()) {
    finishGameByStalemate(state.game.chess);
    return;
  }

  // Avantage décisif (> +2) : on enclenche la conversion cinématique vers le mat,
  // puis on rendra la main au joueur pour conclure.
  if (
    !isExplorationMode() &&
    state.game.phase === 'free' &&
    !state.game.victoryConverted &&
    evaluation.cpWhite >= VICTORY_CINEMATIC_TRIGGER_CP &&
    !isMateScore(evaluation.cpWhite)
  ) {
    await runVictoryConversion();
    return;
  }

  state.game.message = isExplorationMode()
    ? `Position explorée à ${formatEval(evaluation.cpWhite)}. Stockfish répond.`
    : `Coup accepté (${formatEval(evaluation.cpWhite)}). Stockfish répond.`;
  state.game.freeRoundPending = !isExplorationMode();
  renderGamePanel();
  await advanceOpponentTurn();
  // Le prémouvement éventuel est joué après déverrouillage (cf. submitHumanMove).
}

async function advanceOpponentTurn() {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  if (game.phase === 'opening') {
    const blackBookEdges = getOpponentBookEdgesForRun();
    const decision = blackBookEdges.length
      ? pickWeightedCandidate(buildOpponentBookCandidates(blackBookEdges))
      : null;

    if (decision?.type === 'book') {
      const edge = decision.edge;
      // Coup de livre : petite réflexion (pas trop) avant de répondre, le temps aussi
      // que l'animation du coup blanc se termine.
      game.message = 'Les Noirs consultent le livre…';
      renderGamePanel();
      await pause(randomThinkMs(350, 850));
      if (state.game !== game || game.status !== 'playing') {
        return;
      }
      applyGameEdge(edge);
      game.openingBlackMoves += 1;
      if (deductStockfishClock(game)) {
        return; // U : Stockfish tombe au temps
      }
      game.message = `Les Noirs suivent le livre: ${edge.san} (${formatPercent(edge.probability)}).`;
      if (!getExpectedWhiteBookEdges().length) {
        enterFreePhase(
          isExplorationMode()
            ? "Fin de branche: l'exploration continue en coups libres."
            : 'Tu as tenu le livre: début de la survie libre.'
        );
      }
      return;
    }

    enterFreePhase(
      decision?.type === 'free'
        ? 'Les Noirs cassent le livre et passent aux coups Stockfish.'
        : "La branche d'ouverture est terminée: les Noirs passent à Stockfish."
    );
  }

  await playStockfishBlackMove();
}

async function playStockfishBlackMove() {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  const profile = game.mateResolution?.active
    ? { ...getStockfishLevelProfile(10), depth: 12, movetime: 800 }
    : getStockfishLevelProfile();
  const stockfishLabel = formatStockfishLevel(profile);
  game.message = `Stockfish ${stockfishLabel} calcule la réponse noire...`;
  setEngineThinking(true);
  renderGamePanel();
  renderGameDetails();
  // Réflexion perçue, tirée au sort entre 1 et 5 s (en plus du vrai calcul s'il est plus court).
  const thinkStart = performance.now();
  const thinkTarget = randomThinkMs(1000, 5000);
  const evaluator = await ensureStockfishReady(false);
  const beforeFen = game.chess.fen();
  const beforeEvaluation = await evaluator.evaluate(beforeFen);
  const moveSearch = await evaluator.pickMove(beforeFen, profile);
  const beforeEvalCp = beforeEvaluation.cpWhite;
  if (!moveSearch.bestMove) {
    finishTerminalPosition('La partie est terminée.');
    return;
  }

  // Complète le temps de calcul réel pour que la réponse arrive après la durée de réflexion.
  await pause(thinkTarget - (performance.now() - thinkStart));
  setEngineThinking(false);
  if (state.game !== game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  const move = playUciOnChess(game.chess, moveSearch.bestMove);
  if (!move) {
    finishGame('won', 'Stockfish ne trouve aucun coup légal.');
    return;
  }

  applyFreeMove(move, `Stockfish ${stockfishLabel}`);
  if (deductStockfishClock(game)) {
    return; // U : Stockfish tombe au temps
  }
  const afterEvaluation = await evaluator.evaluate(game.chess.fen());
  game.currentEvalCp = afterEvaluation.cpWhite;
  game.currentPv = afterEvaluation.pv;
  game.currentDepth = afterEvaluation.depth;
  recordFreeReviewMove({
    move,
    label: `Stockfish ${stockfishLabel}`,
    beforeFen,
    beforeEvalCp,
    evaluation: afterEvaluation
  });
  if (!isExplorationMode() && game.freeRoundPending && Number.isFinite(game.freeRemaining)) {
    game.freeRemaining = Math.max(0, game.freeRemaining - 1);
  }
  game.freeRoundPending = false;

  if (!isExplorationMode() && game.chess.isCheckmate()) {
    finishGame('lost', 'Échec et mat: la survie s’arrête ici.', game.chess.fen(), afterEvaluation);
    return;
  }

  // Pat infligé par Stockfish : la partie est nulle, l'objectif de mat échoue → refaire la partie.
  if (!isExplorationMode() && game.chess.isDraw()) {
    finishGameByStalemate(game.chess);
    return;
  }

  const replyDeficitLimitCp = isAdventureRun() ? advRunDeficitThresholdCp() : state.survivalLimitCp;
  // La position n'est JAMAIS catégorisée « effondrée » après la réponse de Stockfish :
  // la défaite ne se déclare qu'après TON coup et sa réévaluation (cf. submitFreeMove).
  // Ici on se contente d'avertir si la position est déjà critique, sans finir la partie.
  const replyCritical = !isExplorationMode() && afterEvaluation.cpWhite < replyDeficitLimitCp;

  if (!isExplorationMode() && !isMateObjective(game) && game.freeRemaining <= 0) {
    finishSurvivalLevel();
    return;
  }

  game.message = isExplorationMode()
    ? `Réponse Stockfish ${stockfishLabel}: ${move.san}. Exploration libre, seuil indicatif: ${formatEval(state.survivalLimitCp)}.`
    : replyCritical
      ? `⚠️ Position critique après ${move.san} (éval ${formatEval(afterEvaluation.cpWhite)}). Joue : ton coup et sa réévaluation décideront du sort.`
      : isAdventureRun()
        ? `Réponse Stockfish ${stockfishLabel}: ${move.san}. Cherche le mat sans passer sous ${formatEval(replyDeficitLimitCp)}.`
        : isMateObjective(game)
          ? `Réponse Stockfish ${stockfishLabel}: ${move.san}. Objectif final: trouve le mat sans passer sous ${formatEval(state.survivalLimitCp)}.`
          : `Réponse Stockfish ${stockfishLabel}: ${move.san}. Il reste ${game.freeRemaining} coups complets à tenir.`;
}

function enterFreePhase(message) {
  state.game.phase = 'free';
  if (isAdventureRun() && state.advRun?.kind === 'boss') {
    state.game.message = `Tu as tenu le livre. À l'attaque : cherche le mat sans laisser l'éval passer sous ${formatEval(advRunDeficitThresholdCp())}.`;
  } else if (isExplorationMode()) {
    state.game.message = `${message} Le seuil ${formatEval(state.survivalLimitCp)} reste affiché comme repère, sans pénalité.`;
  } else {
    state.game.message = `${message} Ne laisse pas l'évaluation passer sous ${formatEval(state.survivalLimitCp)}.`;
  }
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
  }
  if (state.screen === 'adventure' && state.advRun?.kind === 'lesson') {
    adventureOnLessonReachedFree();
  }
}

function consumeLife(message) {
  const game = state.game;
  if (isExplorationMode()) {
    game.message = `${message} Aucune vie consommée en exploration.`;
    return;
  }
  game.lives = Math.max(0, game.lives - 1);
  if (game.lives <= 0) {
    finishGame(
      'lost',
      `${message} Plus aucun retour disponible.`,
      game.failureFen,
      game.failureEvaluation
    );
    return;
  }
  // Le nombre de vies restantes est porté par l'indicateur de cœurs.
  game.message = message;
}

function finishGame(result, message, failureFen = null, failureEvaluation = null) {
  const game = state.game;
  if (!game) {
    return;
  }
  clearPremove(); // T : un prémouvement armé n'a plus de sens une fois la partie finie
  setEngineThinking(false);
  document.body.classList.toggle('is-game-lost', result === 'lost');
  document.body.classList.toggle('is-game-over', result === 'won' || result === 'lost');
  game.status = result;
  game.locked = false;
  game.victoryCinematic = false;
  game.defeatComment =
    result === 'lost' && failureFen && failureEvaluation
      ? buildDefeatComment(failureFen, failureEvaluation)
      : '';
  game.message = game.defeatComment ? `${message} ${game.defeatComment}` : message;
  if (result === 'lost' && game.phase === 'opening' && game.expectedOpeningArrows.length) {
    game.message = `${game.message} Les flèches indiquent les coups d'ouverture attendus.`;
  }
  const startsCinematic = result === 'lost' && failureFen && failureEvaluation?.pvUci?.length;
  // La suite de défaite se construit en asynchrone : on le signale tout de suite
  // pour que l'écran de résultat reste en phase « punition » (pas d'influence).
  game.defeatCinematicPending = Boolean(startsCinematic);
  if (game.freeReviewMoves.length) {
    game.freeReview.index = game.freeReviewMoves.length - 1;
    game.freeReview.active = !startsCinematic;
  }
  if (startsCinematic) {
    // K+B : la suite de défaite est déroulée jusqu'au mat réel (ou au plafond),
    // enregistrée dans l'historique puis animée. Asynchrone car la prolongation
    // peut interroger Stockfish.
    startDeficitCinematic(failureFen, failureEvaluation, game.defeatComment);
  }
  if (state.screen === 'adventure') {
    adventureOnGameFinished(result);
  }
}

// Défaite : on déroule la punition jusqu'au MAT RÉEL (les deux camps jouent au
// mieux), pour vraiment « faire constater » la défaite (K). Plafond de sécurité
// élevé pour éviter une séquence interminable si le mat n'arrive pas.
// Construit la suite de défaite en UCI : on consomme d'abord la PV Stockfish
// (sans coût moteur), puis on prolonge avec les meilleurs coups jusqu'à l'échec
// et mat (ou le plafond). On ne s'arrête jamais avant la fin réelle de la ligne.
function setGameLocked(isLocked) {
  if (!state.game) {
    return;
  }
  state.game.locked = isLocked;
  renderGamePanel();
}

// Un score Stockfish encode un mat forcé quand il frôle MATE_SCORE_CP.
// Enregistre dans l'historique de revue un coup JOUÉ AUTOMATIQUEMENT (conversion
// vers le mat ou suite de défaite) : phase « engine-line » → ni XP joueur ni
// verdict, mais le coup apparaît bien dans la revue et la sauvegarde.
function recordAutoMove(move, label, beforeFen, beforeEvalCp, afterEvalCp) {
  if (!move) {
    return;
  }
  const before = Number.isFinite(beforeEvalCp) ? beforeEvalCp : 0;
  const after = Number.isFinite(afterEvalCp) ? afterEvalCp : before;
  recordFreeReviewMove({
    move,
    label,
    phase: 'engine-line',
    beforeFen,
    beforeEvalCp: before,
    evaluation: { cpWhite: after, depth: 0, pv: '', pvUci: [] },
    status: 'engine-line'
  });
}

/**
 * Conversion « cinématique » de la phase libre. Dès que les Blancs dépassent +2,
 * on enchaîne automatiquement meilleurs coups blancs + défense Stockfish, en animant
 * chaque coup, jusqu'à détecter un mat forcé pour les Blancs ; on rend alors la main
 * au joueur pour qu'il porte l'estocade. Garde-fous : on s'arrête si l'avantage
 * retombe, si la partie se termine, ou après un nombre maximal de demi-coups.
 */
async function runVictoryConversion() {
  const game = state.game;
  if (!game) {
    return;
  }
  game.victoryConverted = true;
  game.victoryCinematic = true;
  // S : on entre dans la phase finale du mat → 3 « dernières chances » pour ne
  // pas perdre toute la partie sur une seule bourde de conversion.
  if (!game.finalMateLives) {
    game.finalMateLives = 3;
  }
  setGameLocked(true);
  game.message = 'Position gagnante : conversion automatique vers le mat…';
  renderGamePanel();
  renderGameDetails();

  const evaluator = await ensureStockfishReady(false);
  const profile = getStockfishLevelProfile();
  let mateFound = null;

  try {
    for (let ply = 0; ply < VICTORY_CINEMATIC_MAX_PLIES; ply++) {
      if (state.game !== game || game.status !== 'playing') {
        return; // partie changée ou terminée ailleurs
      }

      if (game.chess.turn() === 'w') {
        // Trait aux Blancs (le joueur) : un mat est-il déjà forcé ?
        const evalNow = await evaluator.evaluate(game.chess.fen(), VICTORY_CINEMATIC_DEPTH);
        if (state.game !== game || game.status !== 'playing') {
          return;
        }
        game.currentEvalCp = evalNow.cpWhite;
        game.currentPv = evalNow.pv;
        game.currentDepth = evalNow.depth;
        if (isMateScore(evalNow.cpWhite) && evalNow.cpWhite > 0) {
          // Réglage « mat en X » : on ne rend la main que lorsque le mat est assez
          // proche (≤ seuil) ; sinon la conversion continue automatiquement.
          if (mateMovesFromCp(evalNow.cpWhite) <= advMateHandover()) {
            mateFound = evalNow;
            break;
          }
        }
        if (evalNow.cpWhite < VICTORY_CINEMATIC_KEEP_CP) {
          break; // l'avantage s'est évaporé → on rend la main
        }
        if (!evalNow.bestMove) {
          break;
        }
        const wBeforeFen = game.chess.fen();
        const wmove = playUciOnChess(game.chess, evalNow.bestMove);
        if (!wmove) {
          break;
        }
        applyFreeMove(wmove, 'Conversion auto');
        recordAutoMove(wmove, 'Conversion auto', wBeforeFen, evalNow.cpWhite, evalNow.cpWhite);
        game.message = `Conversion automatique… (${formatEval(evalNow.cpWhite)})`;
        renderGamePanel();
        renderGameDetails();
        if (game.chess.isCheckmate()) {
          finishCampaignByMate('Mat ! La conversion automatique a conclu la partie.');
          return;
        }
        if (game.chess.isDraw()) {
          finishGameByStalemate(game.chess);
          return;
        }
        await pause(VICTORY_CINEMATIC_STEP_MS);
      } else {
        // Trait aux Noirs : défense de Stockfish. On montre une VRAIE réflexion
        // (badge « réfléchit » + délai) pour que les Noirs ne répondent pas
        // instantanément pendant la phase de mat (la position reste affichée
        // pendant que Stockfish « réfléchit », puis le coup apparaît).
        const bBeforeFen = game.chess.fen();
        const bBeforeEvalCp = game.currentEvalCp;
        game.message = `Stockfish ${formatStockfishLevel(profile)} cherche la défense…`;
        setEngineThinking(true);
        renderGamePanel();
        renderGameDetails();
        const thinkStart = performance.now();
        const thinkTarget = randomThinkMs(900, 2600);
        const search = await evaluator.pickMove(game.chess.fen(), profile);
        if (state.game !== game || game.status !== 'playing') {
          setEngineThinking(false);
          return;
        }
        if (!search.bestMove) {
          setEngineThinking(false);
          break;
        }
        await pause(thinkTarget - (performance.now() - thinkStart));
        setEngineThinking(false);
        if (state.game !== game || game.status !== 'playing') {
          return;
        }
        const bmove = playUciOnChess(game.chess, search.bestMove);
        if (!bmove) {
          break;
        }
        applyFreeMove(bmove, `Stockfish ${formatStockfishLevel(profile)}`);
        const evalNow = await evaluator.evaluate(game.chess.fen(), VICTORY_CINEMATIC_DEPTH);
        if (state.game !== game || game.status !== 'playing') {
          return;
        }
        game.currentEvalCp = evalNow.cpWhite;
        recordAutoMove(
          bmove,
          `Stockfish ${formatStockfishLevel(profile)}`,
          bBeforeFen,
          bBeforeEvalCp,
          evalNow.cpWhite
        );
        game.currentPv = evalNow.pv;
        game.currentDepth = evalNow.depth;
        renderGamePanel();
        renderGameDetails();
        if (game.chess.isCheckmate()) {
          // Les Noirs matent (très improbable depuis une position gagnante).
          finishGame('lost', 'Échec et mat subi pendant la conversion.', game.chess.fen(), evalNow);
          return;
        }
        if (game.chess.isDraw()) {
          finishGameByStalemate(game.chess);
          return;
        }
        // Plus de pause « flat » : la réflexion ci-dessus a déjà donné le tempo.
      }
    }

    // Fin de la conversion : on déverrouille et on rend la main — jamais au trait noir.
    if (state.game !== game) {
      return;
    }
    game.victoryCinematic = false;
    setGameLocked(false);
    game.freeRoundPending = false;
    if (game.status !== 'playing') {
      return;
    }

    // Filet anti-softlock : si la séquence s'arrête alors que c'est aux Noirs (cap
    // atteint, coup introuvable…), Stockfish joue sa défense pour rendre la main aux
    // Blancs au lieu de laisser le joueur bloqué.
    if (game.chess.turn() === 'b') {
      game.message = 'À toi de conclure : Stockfish défend, puis tu joues le mat.';
      renderGamePanel();
      renderGameDetails();
      await advanceOpponentTurn();
      return;
    }

    if (mateFound) {
      const x = mateMovesFromCp(mateFound.cpWhite);
      game.mateExpected = x; // référence pour détecter un mat qui s'éloigne (> 2)
      game.message = `Position gagnante : mat en ${x}. À toi de conclure (sans laisser le mat s'éloigner) !`;
    } else {
      game.message = `Avantage décisif (${formatEval(game.currentEvalCp)}). À toi de porter l'estocade !`;
    }
    renderGamePanel();
    renderGameDetails();
  } catch {
    // Sécurité : une erreur du moteur (timeout…) ne doit jamais bloquer le joueur.
    if (state.game === game) {
      game.victoryCinematic = false;
      setGameLocked(false);
      if (game.status === 'playing') {
        game.message = 'Conversion interrompue. À toi de jouer.';
        renderGamePanel();
        renderGameDetails();
        if (game.chess.turn() === 'b') {
          await advanceOpponentTurn();
        }
      }
    }
  }
}

function getGameRawPathToCurrentNode() {
  const game = state.game;
  if (!game) {
    return { nodeIds: ['root'], edgeIds: [] };
  }

  const currentId = game.currentNodeId ?? 'root';
  const storedNodeIds = Array.isArray(game.currentPathNodeIds) ? game.currentPathNodeIds : [];
  const storedEdgeIds = Array.isArray(game.currentPathEdgeIds) ? game.currentPathEdgeIds : [];
  const endsAtCurrent = storedNodeIds[storedNodeIds.length - 1] === currentId;
  const validStoredPath =
    storedNodeIds.length > 0 &&
    endsAtCurrent &&
    storedNodeIds.every((nodeId) => nodeId === 'root' || getNode(nodeId)) &&
    storedEdgeIds.every((edgeId) => getEdge(edgeId));

  if (validStoredPath) {
    return {
      nodeIds: [...storedNodeIds],
      edgeIds: [...storedEdgeIds]
    };
  }

  return buildRawPathToNode(currentId);
}

function syncGameGraphSelection(view) {
  const game = state.game;
  if (!game?.active || !view) {
    return;
  }

  const currentId = game.currentNodeId;
  const rawPath = getGameRawPathToCurrentNode();
  const highlightedPath = projectRawPathToView(view, rawPath);
  state.highlightedEdges = new Set(highlightedPath.edgeIds);
  state.highlightedNodes = new Set(highlightedPath.nodeIds);

  const directNode = view.nodesById.get(currentId);
  const containingSegment = findCurrentViewSegment(view, currentId, rawPath);
  const currentNode = getNode(currentId);
  const currentLabel = currentId === 'root' ? 'départ' : (currentNode?.san ?? currentId);
  // Nœud du graphe correspondant à la position en cours de la partie (« vous êtes ici »).
  state.gameViewNodeId = containingSegment ? containingSegment.to : directNode ? currentId : null;
  if (containingSegment) {
    state.selectedNodeId = containingSegment.to;
    state.selectedSegment = containingSegment;
    state.segmentStepIndex = Math.max(0, containingSegment.pathNodeIds.indexOf(currentId));
    elements.selectedPathLabel.textContent = `Jeu: ${rawPath.edgeIds.length} coups jusqu'à ${currentLabel}`;
    return;
  }

  if (directNode) {
    state.selectedNodeId = currentId;
    state.selectedSegment = null;
    state.segmentStepIndex = 0;
    elements.selectedPathLabel.textContent =
      currentId === 'root' ? 'Jeu: départ' : `Jeu: ${directNode.raw.san}`;
  }
}

function makeGameBoardNode() {
  const game = state.game;

  // Mode influence (après défaite) : l'échiquier suit le défilement ‹ › du choix
  // d'influence. PRIORITAIRE sur la revue libre et la cinématique, sinon on
  // resterait bloqué sur la position perdante et on ne verrait pas le coup à
  // changer.
  if (game?.influence) {
    if (game.influence.lineSans) {
      return makeInfluenceLineBoardNode(game); // nœud aléatoire : ligne du livre tirée
    }
    if (game.historyView != null) {
      return makeHistoryBoardNode(game); // partie jouée : position revue
    }
    return {
      id: 'game',
      san: game.lastMove?.san ?? 'Départ',
      fen: game.chess.fen(),
      from: game.lastMove?.from ?? '',
      to: game.lastMove?.to ?? '',
      sideToMove: game.chess.turn()
    };
  }

  const reviewEntry = getActiveFreeReviewEntry();
  if (reviewEntry) {
    return {
      id: 'free-review',
      san: reviewEntry.san,
      fen: reviewEntry.afterFen,
      from: reviewEntry.from,
      to: reviewEntry.to,
      sideToMove: reviewEntry.afterFen.split(/\s+/)[1] ?? 'w'
    };
  }

  const cinematic = game?.cinematic;
  if (cinematic?.active) {
    return {
      id: 'cinematic',
      san: cinematic.lastMove?.san ?? 'Déficit',
      fen: cinematic.chess.fen(),
      from: cinematic.lastMove?.from ?? '',
      to: cinematic.lastMove?.to ?? '',
      sideToMove: cinematic.chess.turn()
    };
  }

  // Revue de l'historique : on prévisualise une position passée (lecture seule).
  if (game && game.historyView != null) {
    return makeHistoryBoardNode(game);
  }

  return {
    id: 'game',
    san: game.lastMove?.san ?? 'Départ',
    fen: game.chess.fen(),
    from: game.lastMove?.from ?? '',
    to: game.lastMove?.to ?? '',
    sideToMove: game.chess.turn()
  };
}

function formatGamePanelMessage(game, reviewEntry = null) {
  if (reviewEntry) {
    return isPostGameReviewPlayable()
      ? `Variante depuis ${reviewEntry.text}: joue un coup légal.`
      : `Revue de partie: ${reviewEntry.text}. Utilise les flèches pour naviguer.`;
  }

  if (game.status === 'lost') {
    return "Partie terminée. L'analyse détaillée est dans Infos position.";
  }

  if (game.status === 'won') {
    return game.finalVictory
      ? "Campagne terminée. L'analyse détaillée est dans Infos position."
      : "Niveau réussi. L'analyse détaillée est dans Infos position.";
  }

  return game.message;
}

function getGameInfoAnalysis(game, currentNode = null) {
  if (game.status !== 'playing') {
    return game.message;
  }

  if (currentNode?.comments?.[0]) {
    return currentNode.comments[0];
  }

  if (game.phase === 'opening') {
    return 'Position de livre: choisis un coup blanc attendu pour rester dans le répertoire.';
  }

  if (isExplorationMode()) {
    return 'Position libre: teste une idée, Stockfish répondra sans pénalité.';
  }

  return `Position de survie: garde l'évaluation à ${formatEval(state.survivalLimitCp)} ou mieux.`;
}

function renderGameDetails() {
  const game = state.game;
  if (!game) {
    return;
  }
  renderClocks(); // U : maj de la pendule à chaque rendu de partie

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
        : game.chess.turn() === 'w'
          ? 'Aux Blancs'
          : 'Réponse noire';
  elements.nodeSubtitle.textContent = reviewEntry
    ? `${reviewEntry.text} · ${reviewEntry.label} · ${reviewEntry.index + 1}/${game.freeReviewMoves.length}`
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
  // Rail d'infos de la vue joueur aventure : barre d'éval + coups joués
  updateLiveEvalBar(reviewEntry ? reviewEntry.afterEvalCp : game.currentEvalCp);
  renderRailMoveLog();
  // Indices visuels propres à la vue joueur aventure
  applyAdvBoardHints();
  updateAdvBoardFeedback();
  renderAdvLives(); // indicateur de vies unifié (ouverture / mat) + mat en X
  advScoreArmTimer(); // score apprentissage : chrono armé au retour du trait blanc
  applyAdvInfluenceArrows(); // candidats noirs (mode influence, à un embranchement)
  document.body.classList.toggle('is-influence-review', Boolean(game.influence));
  // Effet « cinématique » pendant la conversion automatique vers le mat.
  document.body.classList.toggle('is-victory-cinematic', Boolean(game.victoryCinematic));
}

function renderGamePanel(phaseLabel = null) {
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

  if (game.chess.turn() !== 'w') {
    const pill = document.createElement('span');
    pill.className = 'expected-pill is-muted';
    pill.textContent = 'Réponse noire';
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

// --- Vue joueur aventure : barre d'éval + journal compact du rail ---

/** Met à jour la largeur de la barre d'évaluation du rail (part des Blancs). */
function updateLiveEvalBar(cpWhite) {
  const fill = elements.liveEvalBarFill;
  if (!fill) {
    return;
  }
  fill.style.width = `${evalToBarPct(cpWhite)}%`;
}

/** Remplit le journal compact « Coups joués » du rail à partir de moveLog. */
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

function pickWeightedViewEdge(viewNode, view) {
  const outgoing = viewNode.outgoing.map((edgeId) => view.edgesById.get(edgeId)).filter(Boolean);
  if (!outgoing.length) {
    return null;
  }
  const selected = pickWeightedCandidate(
    outgoing.map((edge) => ({ id: edge.id, type: 'edge', edge, probability: edge.probability }))
  );
  return selected?.edge ?? null;
}

function buildPath(mode) {
  const view = createCompressedView();
  recomputeViewProbabilities(view);
  const edgeIds = [];
  const nodeIds = ['root'];
  let current = view.nodesById.get('root');
  let guard = 0;

  while (current?.outgoing.length && guard < 80) {
    const outgoing = current.outgoing.map((edgeId) => view.edgesById.get(edgeId)).filter(Boolean);
    const edge =
      mode === 'best'
        ? outgoing.sort((a, b) => b.probability - a.probability)[0]
        : pickWeightedViewEdge(current, view);
    if (!edge) {
      break;
    }
    edgeIds.push(edge.id);
    nodeIds.push(edge.to);
    current = view.nodesById.get(edge.to);
    guard += 1;
  }

  state.highlightedEdges = new Set(edgeIds);
  state.highlightedNodes = new Set(nodeIds);
  state.selectedNodeId = nodeIds[nodeIds.length - 1] ?? 'root';
  state.selectedSegment = edgeIds.length ? view.edgesById.get(edgeIds[edgeIds.length - 1]) : null;
  state.segmentStepIndex = state.selectedSegment?.isCompressed
    ? state.selectedSegment.pathNodeIds.length - 1
    : 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent =
    mode === 'best'
      ? `Meilleur chemin: ${edgeIds.length} décisions`
      : `Chemin simulé: ${edgeIds.length} décisions`;
  renderGraph();
}

function resetHighlight() {
  state.highlightedEdges.clear();
  state.highlightedNodes = new Set([state.selectedNodeId]);
  state.selectedSegment = null;
  state.segmentStepIndex = 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent = 'Aucun chemin sélectionné';
  renderGraph();
}

function setGraphData(data, selectedPathLabel = 'Aucun chemin sélectionné') {
  state.data = data;
  trapReachCache = null; // le cache « mène à un mat » dépend du livre courant
  state.nodesById = new Map(state.data.nodes.map((node) => [node.id, node]));
  state.edgesById = new Map(state.data.edges.map((edge) => [edge.id, edge]));
  state.nodesByFen = new Map(state.data.nodes.map((node) => [node.fen, node]));
  state.nodesByPositionKey = new Map(
    state.data.nodes.map((node) => [fenPositionKey(node.fen), node])
  );
  state.lineFilter = 'all';
  state.highlightedEdges.clear();
  state.highlightedNodes = new Set(['root']);
  state.selectedNodeId = 'root';
  state.selectedSegment = null;
  state.segmentStepIndex = 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent = selectedPathLabel;
  populateControls();
  startNewGame(FIRST_LEVEL_NUMBER);
  elements.selectedPathLabel.textContent = selectedPathLabel;
}

function setImportBusy(isBusy, statusText = '') {
  state.isImportingPgn = isBusy;
  elements.buildPgnButton.disabled = isBusy;
  elements.defaultPgnButton.disabled = isBusy || !state.defaultData;
  elements.pgnFileInput.disabled = isBusy;
  elements.pgnTextInput.disabled = isBusy;
  if (statusText) {
    elements.pgnImportStatus.textContent = statusText;
  }
}

async function buildGraphDataFromPgn(pgn, sourceName = 'PGN importé') {
  const blocks = splitPgnGames(pgn);
  const lines = makeLineEventsUnique(blocks.flatMap(parsePgnGame)).filter(
    (line) => line.moves.length
  );
  if (!lines.length) {
    throw new Error('Aucune ligne PGN jouable trouvée.');
  }

  const graph = buildGraphFromPgnLines(lines);
  if (graph.nodes.length <= 1 || !graph.edges.length) {
    throw new Error('Le PGN ne contient pas de coups légaux exploitables.');
  }

  const evaluator = await ensureStockfishReady(false);
  for (const [index, node] of graph.nodes.entries()) {
    elements.pgnImportStatus.textContent = `Éval ${index + 1}/${graph.nodes.length}`;
    node.evaluation = await evaluator.evaluate(node.fen, IMPORT_STOCKFISH_DEPTH);
    if (index % 4 === 0) {
      await yieldToBrowser();
    }
  }

  computeGraphFutureMeans(graph);
  assignGraphProbabilities(graph);

  return {
    summary: summarizeImportedGraph(graph, lines, IMPORT_STOCKFISH_DEPTH, sourceName),
    lines: lines.map(({ moves, ...line }) => ({
      ...line,
      plies: moves.length
    })),
    nodes: graph.nodes,
    edges: graph.edges,
    warnings: graph.warnings
  };
}

async function importPgnFromInput() {
  const pgn = elements.pgnTextInput.value.trim();
  if (!pgn) {
    elements.pgnImportStatus.textContent = 'PGN vide';
    return;
  }

  setImportBusy(true, 'Lecture PGN');
  try {
    const data = await buildGraphDataFromPgn(pgn, 'PGN importé');
    setGraphData(data, 'PGN importé: graphe prêt');
    state.activeBook = 'custom';
    elements.pgnImportStatus.textContent = `Prêt d${IMPORT_STOCKFISH_DEPTH}`;
  } catch (error) {
    elements.pgnImportStatus.textContent = 'Erreur PGN';
    elements.summaryText.textContent = error.message;
  } finally {
    setImportBusy(false);
  }
}

async function restoreDefaultGraph() {
  if (!state.defaultData) {
    return;
  }
  setImportBusy(true, 'Livre italien');
  setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
  state.activeBook = 'default';
  elements.pgnImportStatus.textContent = 'Livre actif';
  setImportBusy(false);
}

function populateControls() {
  const summary = state.data.summary;
  const model = summary.probabilityModel ?? {};
  state.temperatureCp = model.temperatureCp ?? PROBABILITY_TEMPERATURE_CP;
  state.floorMass = DISPLAY_DEFAULT_FLOOR_MASS;

  elements.temperatureRange.value = String(state.temperatureCp);
  elements.floorRange.value = String(Math.round(state.floorMass * 100));
  elements.temperatureValue.textContent = `${state.temperatureCp} cp`;
  elements.floorValue.textContent = `${Math.round(state.floorMass * 100)}%`;

  elements.lineFilter.replaceChildren();
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'Toutes les lignes';
  elements.lineFilter.append(all);
  for (const line of state.data.lines) {
    const option = document.createElement('option');
    option.value = line.event;
    option.textContent = `${line.id.replace('line_', '#')} · ${line.event}`;
    elements.lineFilter.append(option);
  }

  const warningText = state.data.warnings.length
    ? ` ${state.data.warnings.length} anomalie PGN signalée.`
    : '';
  elements.summaryText.textContent = `${summary.sourceLines} lignes PGN fusionnées en ${summary.nodes} positions évaluées.${warningText}`;
  elements.nodesCount.textContent = String(summary.nodes);
  elements.edgesCount.textContent = String(summary.edges);
  elements.branchingCount.textContent = String(summary.branchingNodes);
  elements.engineDepth.textContent = `d${summary.stockfish.depth}`;
}

/* =====================================================================
   Mode Aventure : cerveau RPG (apprentissage + domination Stockfish)
   ===================================================================== */
const ADV_XP_BOOK_MOVE = 4;
function advTakeBack() {
  const game = state.game;
  if (
    !game ||
    !advAids().takeback ||
    game.takebackLocked ||
    game.status !== 'playing' ||
    game.locked
  ) {
    return;
  }
  if (game.chess.turn() !== 'w' || game.chess.history().length < 2) {
    return;
  }
  game.chess.undo(); // réponse de l'adversaire
  game.chess.undo(); // ton coup
  game.historyView = null;
  game.selectedSquare = null;
  game.freeReview.active = false;
  const verbose = game.chess.history({ verbose: true });
  game.lastMove = verbose[verbose.length - 1] ?? null;
  game.moveLog = game.moveLog.slice(2); // retire les 2 coups les plus récents (en tête)
  if (game.freeReviewMoves.length > 2) {
    game.freeReviewMoves = game.freeReviewMoves.slice(0, -2);
    game.freeReview.index = game.freeReviewMoves.length - 1;
  }
  const lastReview = game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const node = getGameNodeByFen();
  if (node) {
    game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
    game.currentEvalCp = node.evaluation?.cpWhite ?? lastReview?.afterEvalCp ?? game.currentEvalCp;
  } else if (lastReview && Number.isFinite(lastReview.afterEvalCp)) {
    game.currentEvalCp = lastReview.afterEvalCp;
  }
  if (Number.isFinite(game.freeRemaining) && game.objective?.target) {
    game.freeRemaining = Math.min(game.objective.target, game.freeRemaining + 1);
  }
  game.freeRoundPending = false;
  game.message = '↶ Coup annulé. Rejoue ta réponse.';
  renderGamePanel();
  renderGameDetails();
}

// Retour arrière « dernière chance » (très facile) : quand la défaite est prononcée,
// on revient au dernier coup du joueur pour tenter de renverser la partie. Une seule
// fois : ensuite le retour arrière est verrouillé pour cette partie.
// Annule le dernier coup blanc venant d'être joué (avant son enregistrement dans la
// revue), pour permettre un « réessai » : on remet l'échiquier, le journal et l'éval
// à l'état d'avant ce coup. Utilisé par le filet « mat qui s'éloigne ».
function revertLastPlayerMove() {
  const game = state.game;
  const chess = game?.chess;
  if (!chess || chess.history().length === 0) {
    return false;
  }
  chess.undo();
  if (game.moveLog?.length) {
    game.moveLog.shift(); // appendGameMove fait un unshift
  }
  if (state.screen === 'adventure' && state.adventure) {
    state.adventure.movesPlayed = Math.max(0, (state.adventure.movesPlayed || 0) - 1);
  }
  game.historyView = null;
  game.selectedSquare = null;
  const verbose = chess.history({ verbose: true });
  game.lastMove = verbose[verbose.length - 1] ?? null;
  const node = getGameNodeByFen();
  if (node) {
    game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
  }
  const lastReview = game.freeReviewMoves[game.freeReviewMoves.length - 1];
  if (lastReview && Number.isFinite(lastReview.afterEvalCp)) {
    game.currentEvalCp = lastReview.afterEvalCp;
  }
  return true;
}

function advUndoDefeat() {
  const game = state.game;
  if (!game || game.status === 'won') {
    return;
  }
  // Retour possible via l'aide « retour arrière » (une fois) OU une « vie » de la
  // phase finale du mat (S), disponible quelle que soit la difficulté.
  const hasNormalTakeback = advAids().takeback && !game.takebackLocked;
  const hasFinalLife = (game.finalMateLives || 0) > 0;
  if (!hasNormalTakeback && !hasFinalLife) {
    return;
  }
  const chess = game.chess;
  if (chess.history().length === 0) {
    return;
  }
  // La partie reprend : le flux d'influence repartira de zéro à la prochaine défaite.
  game.influence = null;
  game.influencePending = false;
  game.influenceDone = false;
  if (state.advRun) {
    state.advRun.influenceAutoShown = false;
  }
  // Annule jusqu'au trait des Blancs (au moins un demi-coup) : on retire le coup
  // perdant (et la réponse adverse si c'est elle qui a scellé la défaite).
  let undone = 0;
  while (chess.history().length > 0 && (undone === 0 || chess.turn() !== 'w')) {
    chess.undo();
    undone += 1;
  }
  clearGameCinematic();
  document.body.classList.remove('is-game-lost', 'is-game-over');
  game.status = 'playing';
  game.locked = false;
  // S : on consomme d'abord une « vie » de phase finale ; sinon on verrouille le
  // retour arrière normal (une seule chance).
  if (hasFinalLife) {
    game.finalMateLives = Math.max(0, game.finalMateLives - 1);
  } else {
    game.takebackLocked = true;
  }
  game.historyView = null;
  game.selectedSquare = null;
  game.freeReview.active = false;
  game.failureFen = null;
  game.failureEvaluation = null;
  game.defeatComment = '';
  const verbose = chess.history({ verbose: true });
  game.lastMove = verbose[verbose.length - 1] ?? null;
  game.moveLog = game.moveLog.slice(undone);
  if (game.freeReviewMoves.length > undone) {
    game.freeReviewMoves = game.freeReviewMoves.slice(0, -undone);
    game.freeReview.index = game.freeReviewMoves.length - 1;
  }
  const lastReview = game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const node = getGameNodeByFen();
  if (node) {
    game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
    game.currentEvalCp = node.evaluation?.cpWhite ?? lastReview?.afterEvalCp ?? game.currentEvalCp;
  } else if (lastReview && Number.isFinite(lastReview.afterEvalCp)) {
    game.currentEvalCp = lastReview.afterEvalCp;
  }
  if (Number.isFinite(game.freeRemaining) && game.objective?.target) {
    game.freeRemaining = Math.min(game.objective.target, game.freeRemaining + 1);
  }
  game.freeRoundPending = false;
  const resultEl = document.querySelector('#advResult');
  if (resultEl) {
    resultEl.hidden = true;
  }
  game.message = hasFinalLife
    ? `↶ Dernière chance ! Encore ${game.finalMateLives} vie${
        game.finalMateLives > 1 ? 's' : ''
      } pour conclure le mat. Rejoue ce coup.`
    : '↶ Dernière chance ! Rejoue ce coup pour renverser la partie.';
  renderGamePanel();
  renderGameDetails();
}

function adventureOnCorrectWhiteBook() {
  const run = state.advRun;
  if (!run) {
    return;
  }
  run.streak = (run.streak || 0) + 1;
  run.bookMoves = (run.bookMoves || 0) + 1;
  // Score d'apprentissage : temps de réflexion du coup − erreurs×50.
  if (run.scoreTarget != null && !run.revisionMode) {
    advScoreRegisterMove(run, run.scoreMoveStart ? Date.now() - run.scoreMoveStart : null);
  }
  const combo = Math.min(run.streak, 6);
  advAddXp(ADV_XP_BOOK_MOVE + (run.streak >= 3 ? combo : 0));
  flashAdvBoard('good');
  saveAdventure();
}

function adventureOnWrongBook() {
  const run = state.advRun;
  if (!run) {
    return;
  }
  run.streak = 0;
  run.wrongMoves = (run.wrongMoves || 0) + 1;
  if (run.scoreTarget != null && !run.revisionMode) {
    run.scoreMoveErrors = (run.scoreMoveErrors || 0) + 1; // −50 sur le coup en cours
  }
  flashAdvBoard('bad');
}

function adventureOnLessonReachedFree() {
  const run = state.advRun;
  if (!run || run.kind !== 'lesson' || run.completed) {
    return;
  }
  run.completed = true;
  finishGame('won', `Ligne maîtrisée ! Cortex illuminé à ${advCoveragePct()} %.`);
}

// Mat livré dans l'ouverture pendant une leçon (typiquement un piège) : succès de la
// leçon, et non fin de campagne.
function adventureOnTrapSolved() {
  const run = state.advRun;
  if (run) {
    run.completed = true;
  }
  triggerBrainSurge();
  finishGame(
    'won',
    state.advRun?.trapsMode
      ? `Piège réussi ! Échec et mat dans l'ouverture. Cortex à ${advCoveragePct()} %.`
      : `Mat dans l'ouverture ! Cortex à ${advCoveragePct()} %.`
  );
}

// Nom d'ouverture (PGN/ECO) le plus précis atteint en rejouant une suite de coups :
// on suit la ligne dans le graphe et on garde le nom du nœud le plus profond.
// Libellé d'ouverture lisible : « Nom (ECO) » si connu, sinon la séquence de coups.
// --- « Influencer l'ouverture » (fin de défaite, dans la vue de jeu) -----------
const INFLUENCE_ARROW_COLORS = ['#5ad1ff', '#ffd45a', '#ff8a8a', '#9cff8a'];

// === Influence intégrée à la vue de jeu : pas d'écran à part. Après une défaite
// de boss, on navigue la partie comme une revue (‹ ›) ; aux positions
// d'embranchement des Noirs, le bandeau de coups propose les candidats (+5 %).

// Index FEN (4 premiers champs) → nœud influençable.
let advInfluenceFenIndex = null;
function advInfluenceNodeByFen(fen) {
  if (!advInfluenceFenIndex) {
    advInfluenceFenIndex = new Map(advInfluenceableNodes().map((n) => [fenPositionKey(n.fen), n]));
  }
  return advInfluenceFenIndex.get(fenPositionKey(fen)) || null;
}

// Mode d'influence configuré : nœud aléatoire du livre, ou nœuds de la partie jouée.

function makeInfluenceLineBoardNode(game) {
  const infl = game.influence;
  const probe = new Chess();
  let last = null;
  const idx = clamp(infl.lineIndex ?? infl.lineSans.length, 0, infl.lineSans.length);
  for (let i = 0; i < idx; i += 1) {
    try {
      last = probe.move(infl.lineSans[i]);
    } catch {
      break;
    }
  }
  return {
    id: 'influence-line',
    san: last?.san ?? 'Départ',
    fen: probe.fen(),
    from: last?.from ?? '',
    to: last?.to ?? '',
    sideToMove: probe.turn()
  };
}

// Position actuellement affichée (ligne d'influence, revue ‹ ›, ou position courante).
function advViewedFen() {
  const game = state.game;
  if (!game) {
    return null;
  }
  if (game.influence?.lineSans) {
    return makeInfluenceLineBoardNode(game).fen;
  }
  return game.historyView != null ? makeHistoryBoardNode(game).fen : game.chess.fen();
}

// Nœud influençable correspondant à la position affichée (mode influence actif).
function advInfluenceViewedNode() {
  const game = state.game;
  if (!game?.influence) {
    return null;
  }
  const fen = advViewedFen();
  return fen ? advInfluenceNodeByFen(fen) : null;
}

// Entre en mode influence, selon le réglage :
// - « partie jouée » : place la revue ‹ › sur l'embranchement le plus profond traversé ;
// - « aléatoire » : tire UN nœud du livre au hasard, sa ligne se parcourt avec ‹ ›.
function openAdvInfluence() {
  const game = state.game;
  if (!advInfluenceEnabled() || !game) {
    return;
  }
  if (advInfluenceMode() === 'random') {
    const nodes = advInfluenceableNodes();
    if (!nodes.length) {
      showAdventureToast({
        icon: '🎚️',
        title: 'Aucun choix',
        text: 'Le livre ne laisse pas de choix aux Noirs.',
        kind: null
      });
      return;
    }
    const node = nodes[Math.floor(randomUnit() * nodes.length)];
    game.influence = {
      selectedUci: null,
      lineSans: node.sans, // la ligne du livre jusqu'au nœud, navigable avec ‹ ›
      lineIndex: node.sans.length
    };
    game.historyView = null;
    renderGameDetails();
    renderGamePanel();
    return;
  }
  // Mode « partie jouée » : cherche la position d'embranchement la plus profonde.
  let bestIdx = -1;
  try {
    const history = game.chess.history({ verbose: true });
    const probe = new Chess();
    if (advInfluenceNodeByFen(probe.fen())) {
      bestIdx = 0;
    }
    for (let i = 0; i < history.length; i += 1) {
      probe.move(history[i]);
      if (advInfluenceNodeByFen(probe.fen())) {
        bestIdx = i + 1;
      }
    }
  } catch {
    bestIdx = -1;
  }
  if (bestIdx < 0) {
    showAdventureToast({
      icon: '🎚️',
      title: 'Aucun embranchement',
      text: 'Cette partie n’a pas traversé de choix des Noirs à influencer.',
      kind: null
    });
    return;
  }
  game.influence = { selectedUci: null };
  advHistoryGoto(bestIdx); // re-rend la vue : bandeau + flèches + touches
  renderGamePanel();
}

// Sélection d'un candidat (touche du bandeau) : la flèche s'allume, la touche
// de validation apparaît.
function advInfluenceSelect(uci) {
  const game = state.game;
  if (!game?.influence) {
    return;
  }
  game.influence.selectedUci = uci;
  renderGameDetails();
}

function advInfluenceArrows(moves, selectedUci) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('adv-influence-arrows');
  const defs = document.createElementNS(ns, 'defs');
  moves.forEach((m, i) => {
    const color = INFLUENCE_ARROW_COLORS[i % INFLUENCE_ARROW_COLORS.length];
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', `advArrow${i}`);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    path.setAttribute('fill', color);
    marker.append(path);
    defs.append(marker);
  });
  svg.append(defs);
  moves.forEach((m, i) => {
    const color = INFLUENCE_ARROW_COLORS[i % INFLUENCE_ARROW_COLORS.length];
    const sel = m.uci === selectedUci;
    const v = uciToBoardVec(m.uci);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(v.fromX));
    line.setAttribute('y1', String(v.fromY));
    line.setAttribute('x2', String(v.toX));
    line.setAttribute('y2', String(v.toY));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', sel ? '0.3' : '0.15');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', sel ? '0.95' : '0.38');
    line.setAttribute('marker-end', `url(#advArrow${i})`);
    svg.append(line);
  });
  return svg;
}

// Valide la surpondération du candidat sélectionné, à la position affichée.
function advInfluenceValidate() {
  const game = state.game;
  const node = advInfluenceViewedNode();
  const uci = game?.influence?.selectedUci;
  if (!node || !uci) {
    return;
  }
  const chosen = node.moves.find((m) => m.uci === uci);
  if (advOverweightMove(node, uci)) {
    showAdventureToast({
      icon: '🎚️',
      title: 'Coup surpondéré',
      text: `+5% sur ${chosen?.san || 'ce coup'} pour ta revanche.`,
      kind: 'boss'
    });
    game.influence.selectedUci = null;
    renderGameDetails();
    renderGamePanel();
    renderAdvShop();
  }
}

// Flèches des candidats noirs directement sur l'échiquier de jeu (mode influence,
// quand la position affichée est un embranchement).
function applyAdvInfluenceArrows() {
  const board = document.querySelector('#boardPreview');
  if (!board) {
    return;
  }
  board.querySelector('.adv-influence-arrows')?.remove();
  const game = state.game;
  if (!game?.influence || state.advViewMode !== 'board') {
    return;
  }
  const node = advInfluenceViewedNode();
  if (!node) {
    return;
  }
  board.append(advInfluenceArrows(node.moves, game.influence.selectedUci));
}

// === Révision : quiz « trouve le coup » + refaire un mat passé =================
// Rejeu accéléré d'une ligne (livre) ou d'une partie gagnée, puis on interroge le
// joueur sur les coups blancs. Réussir une révision recharge les vies globales.

// Quiz « trouve le coup » : ligne principale du livre, interrogation des coups blancs.
function advBuildQuizSteps() {
  const lineSans = [];
  const lineUcis = [];
  let nodeId = 'root';
  const visited = new Set();
  for (let i = 0; i < 16; i += 1) {
    if (visited.has(nodeId)) break;
    visited.add(nodeId);
    const outs = getRawOutgoingEdges(nodeId);
    if (!outs.length) break;
    // Blancs : on suit la ligne principale (le coup du répertoire à réviser).
    // Noirs : tirage pondéré par les probabilités → la ligne varie à chaque
    // lancement (le quiz n'est plus toujours le même).
    const blackToMove = outs[0].color === 'b';
    const edge = blackToMove
      ? advPickBookEdge(outs)
      : outs.slice().sort((a, b) => (b.probability || 0) - (a.probability || 0))[0];
    if (!edge) break;
    lineSans.push(edge.san);
    lineUcis.push(edge.uci);
    nodeId = edge.to;
  }
  // Coups blancs interrogeables = indices pairs ≥ 2 (on saute le 1er coup trivial).
  const whiteIdx = [];
  for (let idx = 2; idx < lineSans.length; idx += 2) {
    whiteIdx.push(idx);
  }
  // Tire jusqu'à 3 points de quiz au hasard, puis remet l'ordre chronologique.
  const chosen = advShuffle(whiteIdx)
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

// Refaire un mat : reprend la partie gagnée la plus récente, interroge les 2 derniers
// coups blancs (la mise à mort).
function advBuildMateSteps() {
  const games = (state.adventure?.games || []).filter(
    (g) => g.result === 'won' && Array.isArray(g.moves) && g.moves.length >= 6
  );
  if (!games.length) {
    return { steps: [], label: null };
  }
  const game = games[0];
  const sans = game.moves.map((m) => m.san || m.move?.san).filter((s) => typeof s === 'string');
  let chess;
  try {
    chess = new Chess();
  } catch {
    return { steps: [], label: null };
  }
  const ucis = [];
  const playedSans = [];
  for (const s of sans) {
    let mv = null;
    try {
      mv = chess.move(s);
    } catch {
      mv = null;
    }
    if (!mv) break;
    ucis.push(mv.from + mv.to + (mv.promotion || ''));
    playedSans.push(mv.san);
  }
  const n = Math.min(playedSans.length, ucis.length);
  const steps = [];
  for (let idx = n - 1; idx >= 0 && steps.length < 2; idx -= 1) {
    if (idx % 2 !== 0) continue; // coups blancs = indices pairs
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

// La révision se joue DANS la vue de partie standard : le rejeu accéléré anime
// l'échiquier de jeu, et le QCM réutilise le bandeau « choix du coup » du bas.
function launchRevision(mode) {
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
  // Run de type « lesson » (recharge des vies, hors historique) avec un mode de
  // révision qui pilote le rejeu scripté + QCM.
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
  advScoreInit(state.advRun, steps.length); // score comparable : nb de questions fixe
  state.playMode = 'challenge';
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.clock = null; // pas de pendule en révision
    state.game.revision = { phase: 'replay', step: null, answerUci: null };
    setGameLocked(true); // on répond via les touches du bandeau, pas sur l'échiquier
  }
  renderAdventureHud();
  advRevisionPlayStep();
}

// Les touches QCM suivent la difficulté (mêmes règles que les aides en partie) :
// faciles → visibles d'emblée ; Normal → seulement après une erreur ; Difficile →
// jamais (on joue le coup directement sur l'échiquier).
function advRevisionKeysRevealableOnError() {
  return Boolean(advCurrentDifficulty().legalDotsRevealable); // Normal uniquement
}

// Rejoue (accéléré) les coups de la ligne sur l'échiquier de jeu jusqu'à la
// position de la question, puis pose la question (QCM ou coup à jouer).
function advRevisionPlayStep() {
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
  setGameLocked(true); // verrouillé pendant le rejeu
  game.revision = {
    phase: 'replay',
    step,
    answerUci: null,
    keysRevealed: advAids().moveChoices, // faciles : propositions immédiates
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
        ? 'Quel est le bon coup des Blancs ? Réponds avec les touches du bas.'
        : 'Joue le bon coup des Blancs directement sur l’échiquier.';
      run.scoreMoveStart = Date.now(); // score : le chrono démarre à la question
      run.scoreMoveErrors = 0;
      setGameLocked(false); // question : l'échiquier devient jouable
      renderGameDetails();
      renderGamePanel();
      return;
    }
    let mv = null;
    try {
      mv = game.chess.move(step.lead[played]);
    } catch {
      mv = null;
    }
    if (!mv) {
      clearInterval(timer);
      advRevisionFinish();
      return;
    }
    game.lastMove = mv;
    renderGameDetails();
  }, 420);
}

// Réponse à la question — par touche QCM ou coup joué sur l'échiquier.
function advRevisionAnswer(uci) {
  const run = state.advRun;
  const game = state.game;
  const rev = game?.revision;
  if (!run?.revisionMode || !rev || rev.phase !== 'question') {
    return;
  }
  const step = rev.step;
  const correct = uci === step.correctUci;
  // Seul le PREMIER essai compte pour le score (et fige le temps de réflexion).
  if (!rev.attempted) {
    rev.attempted = true;
    run.scoreElapsedMs = run.scoreMoveStart ? Date.now() - run.scoreMoveStart : null;
    if (correct) {
      run.correctCount += 1;
    }
  }
  if (!correct) {
    run.scoreMoveErrors = (run.scoreMoveErrors || 0) + 1; // −50 par mauvaise réponse
  }
  // Normal : une erreur révèle les propositions et laisse réessayer.
  if (!correct && !rev.keysRevealed && advRevisionKeysRevealableOnError()) {
    rev.keysRevealed = true;
    rev.errorHint = true; // légende : signale l'erreur au moment de la révélation
    game.selectedSquare = null;
    game.message = '❌ Pas celui-là. Les propositions apparaissent : choisis le bon coup.';
    flashAdvBoard('bad');
    renderGameDetails();
    renderGamePanel();
    return;
  }
  rev.phase = 'feedback';
  rev.answerUci = uci;
  advScoreRegisterMove(run, run.scoreElapsedMs); // score de la question résolue
  game.selectedSquare = null;
  setGameLocked(true); // plus d'entrée pendant le feedback
  // Le bon coup s'exécute sur l'échiquier (on le voit, même après une erreur).
  let mv = null;
  try {
    mv = game.chess.move(step.correctSan);
  } catch {
    mv = null;
  }
  if (mv) {
    game.lastMove = mv;
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

// Normalise une entrée (SAN ou UCI, échiquier ou champ texte) vers l'UCI de la
// position de la question, puis répond.
function advRevisionAnswerInput(input) {
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
  const mv = tryMoveInput(probe, input);
  if (!mv) {
    game.message = 'Coup illégal ou illisible.';
    renderGamePanel();
    return;
  }
  advRevisionAnswer(`${mv.from}${mv.to}${mv.promotion ?? ''}`);
}

function advRevisionFinish() {
  const run = state.advRun;
  const game = state.game;
  if (!run?.revisionMode || !game || run.completed) {
    return;
  }
  run.completed = true;
  game.revision = { phase: 'done', step: null, answerUci: null };
  advAddXp(ADV_XP_BOOK_MOVE * Math.max(1, run.correctCount));
  // finishGame → adventureOnGameFinished (won + lesson) → recharge des vies.
  finishGame('won', `Révision terminée : ${run.correctCount}/${run.steps.length}.`);
  renderGameDetails();
  renderGamePanel(); // affiche l'écran de résultat (score + rejouer)
}

function adventureOnGameFinished(result) {
  const run = state.advRun;
  if (!state.adventure || !run) {
    return;
  }
  advRecordGame(result);
  // Boutique : pièces gagnées à chaque victoire (boss/leçon/piège).
  if (result === 'won' && !run.coinsAwarded) {
    run.coinsAwarded = true;
    const reward = advWinCoinReward(run);
    if (reward > 0) {
      advAwardCoins(reward);
      showAdventureToast({
        icon: '🪙',
        title: `+${reward} pièces`,
        text: 'À dépenser à la boutique.',
        kind: null
      });
    }
  }
  // Score d'apprentissage : enregistre le record du mode (une seule fois).
  if (run.scoreTarget != null && (run.scorePlayed || 0) > 0 && !run.scoreRecorded) {
    run.scoreRecorded = true;
    const key = advScoreKey(run);
    state.adventure.bestScores = state.adventure.bestScores || {};
    const prev = Number(state.adventure.bestScores[key]);
    const total = Math.round(run.scoreTotal || 0);
    run.scoreIsRecord = !Number.isFinite(prev) || total > prev;
    if (run.scoreIsRecord) {
      state.adventure.bestScores[key] = total;
    }
  }
  // Apprentissage terminé (leçon/piège réussi) → recharge les vies globales.
  if (result === 'won' && run.kind === 'lesson') {
    advRefillGlobalLivesFromLearning();
  }
  // Défaite contre un bot d'arène → consomme une vie globale.
  if (result === 'lost' && run.kind === 'boss' && !run.tournament) {
    advConsumeGlobalLife();
  }
  if (run.kind === 'boss' && !run.tournament) {
    const level = run.bossLevel;
    state.adventure.bossStreaks = state.adventure.bossStreaks || {};
    if (result === 'won' && !run.resolved) {
      run.resolved = true;
      const prevStreak = advBossStreakCount(level);
      const streak = Math.min(prevStreak + 1, ADV_BOSS_STARS);
      state.adventure.bossStreaks[level] = streak;
      const prevRecord = advBossRecord(level);
      const record = Math.max(prevRecord, streak);
      state.adventure.bosses[level] = record;
      // XP à chaque nouvelle étoile gagnée (progression).
      if (record > prevRecord) {
        advAddXp(Math.max(10, Math.round(advBossXp(level) / ADV_BOSS_STARS)));
      }
      const conquered = streak >= ADV_BOSS_STARS;
      const newlyConquered = conquered && prevRecord < ADV_BOSS_STARS;
      if (newlyConquered && level > state.adventure.highestBoss) {
        state.adventure.highestBoss = level;
      }
      const profile = getStockfishLevelProfile(level);
      if (conquered) {
        showAdventureToast({
          icon: '👑',
          title: `Boss N${level} maîtrisé !`,
          text: newlyConquered
            ? `Trois victoires d'affilée — ${profile.label} est dompté !`
            : `${profile.label} retombe (déjà maîtrisé).`,
          kind: 'boss'
        });
      } else {
        showAdventureToast({
          icon: '⭐',
          title: `Victoire ${streak}/${ADV_BOSS_STARS} contre N${level}`,
          text: `Encore ${ADV_BOSS_STARS - streak} victoire(s) d'affilée pour le maîtriser.`,
          kind: 'boss'
        });
      }
    } else if (result === 'lost') {
      const hadStreak = advBossStreakCount(level);
      state.adventure.bossStreaks[level] = 0; // la série tombe ; le record (déjà acquis) reste
      const chess = state.game?.chess;
      const drawn = Boolean(chess?.isDraw?.());
      const matedReally = Boolean(chess?.isCheckmate?.());
      showAdventureToast({
        icon: drawn ? '🤝' : '💥',
        title: drawn
          ? `${drawKindLabel(chess)} — pas de mat`
          : matedReally
            ? 'Échec et mat subi'
            : 'Position effondrée',
        text:
          hadStreak > 0
            ? `Série interrompue : tu repars de 0. Tes ${advBossRecord(level)} étoile(s) acquises restent.`
            : drawn
              ? 'Tu n’as pas maté (partie nulle). Il faut refaire la partie.'
              : matedReally
                ? 'Le boss te mate. Relance l’assaut.'
                : 'Ta position est tombée trop bas. Relance l’assaut.',
        kind: null
      });
    }
    // O (refonte) — la surpondération s'accumule défaite après défaite et n'est
    // remise à zéro qu'à la VICTOIRE (le buff a rempli son office).
    if (result === 'won') {
      advResetOpeningInfluence();
    }
  }
  saveAdventure();
  updateHomeProgress();
}

function setScreen(screen) {
  state.screen = screen;
  setEngineThinking(false);
  closeAdvAnalyseSheet();
  showBrainScrub(false);
  document.body.classList.toggle('screen-home', screen === 'home');
  document.body.classList.toggle('screen-creative', screen === 'creative');
  document.body.classList.toggle('screen-adventure', screen === 'adventure');
  applyDifficultyClasses(); // aides selon la difficulté (Aventure) ou complètes (Atelier)
  if (screen !== 'adventure') {
    closeAdventureMap();
  }
  if (screen === 'home') {
    updateHomeProgress();
  }
  if (screen === 'adventure') {
    renderAdventureHud();
  }
  renderGraph();
}

function enterAdventure() {
  state.advRun = null;
  if (state.activeBook !== 'default' && state.defaultData) {
    setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
    state.activeBook = 'default';
    elements.pgnImportStatus.textContent = 'Livre actif';
  }
  state.playMode = 'challenge';
  syncPlayModeButtons();
  setViewMode('brain');
  setAdvViewMode(state.advViewMode); // applique la vue par défaut (joueur) dès l'entrée
  setScreen('adventure');
  openAdventureMap();
}

function enterCreative() {
  const from = state.screen;
  // Une partie d'aventure (leçon/boss) reste chargée tant que state.advRun existe,
  // même après un détour par l'accueil. On repart alors sur une partie créative neuve
  // pour ne pas hériter d'une position d'aventure. Une partie créative en cours
  // (advRun nul) est préservée.
  const hadAdventureGame = from === 'adventure' || Boolean(state.advRun);
  state.advRun = null;
  setScreen('creative');
  if (hadAdventureGame) {
    state.playMode = 'challenge';
    syncPlayModeButtons();
    startNewGame(FIRST_LEVEL_NUMBER);
  }
}

function resetAdventureProgress() {
  state.adventure = createAdventureState();
  saveAdventure();
  updateHomeProgress();
  if (state.screen === 'adventure') {
    renderAdventureHud();
    renderAdventureMap();
    renderGraph();
  }
  showAdventureToast({
    icon: '🧼',
    title: 'Progression réinitialisée',
    text: 'Le cortex est de nouveau vierge.',
    kind: null
  });
}

function focusAdvInput() {
  window.requestAnimationFrame(() => {
    const input = document.querySelector('#advMoveInput');
    if (input && !input.disabled) {
      input.focus();
    }
  });
}

function launchLesson() {
  state.advRun = { kind: 'lesson', streak: 0, wrongMoves: 0, bookMoves: 0, completed: false };
  advScoreInit(state.advRun, ADV_SCORE_MOVE_COUNT); // score comparable : 10 coups
  state.playMode = 'challenge';
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.message =
      'Suis le livre : chaque bon coup allume un neurone. Va jusqu’au bout de la ligne.';
  }
  renderAdventureHud();
  focusAdvInput();
}

// Catégorie « Pièges » : débloquée une fois toutes les lignes apprises (100 % du
// cortex = dernière leçon validée) et seulement si le livre contient des mats.
function advTrapsUnlocked() {
  return Boolean(state.adventure?.lessons?.l4) && bookHasTrapLines();
}

function launchTrapsLesson() {
  if (!advTrapsUnlocked()) {
    return;
  }
  state.advRun = {
    kind: 'lesson',
    trapsMode: true,
    streak: 0,
    wrongMoves: 0,
    bookMoves: 0,
    completed: false
  };
  advScoreInit(state.advRun, ADV_SCORE_MOVE_COUNT); // score comparable : 10 coups
  state.playMode = 'challenge';
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.message =
      'Mode Pièges : suis la ligne, fais tomber Stockfish dans le piège et livre le mat !';
  }
  renderAdventureHud();
  focusAdvInput();
}

function launchBoss(level) {
  if (!advBossUnlocked(level)) {
    return;
  }
  advSyncGlobalLives();
  if (!advCanFightBots()) {
    advNotifyNoLives();
    return;
  }
  state.advRun = { kind: 'boss', bossLevel: level, streak: 0, wrongMoves: 0, resolved: false };
  state.playMode = 'challenge';
  state.stockfishLevel = level;
  updateStockfishLevelUi();
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    const profile = getStockfishLevelProfile(level);
    state.game.message = `Boss N${level} · ${profile.label}. Sors du livre puis cherche l’échec et mat.`;
  }
  renderAdventureHud();
  focusAdvInput();
}

function submitAdventureMove() {
  const input = document.querySelector('#advMoveInput');
  if (!input) {
    return;
  }
  const value = input.value;
  input.value = '';
  submitHumanMove(value);
}

// --- Version portable : feuille d'analyse + barreau de coups en 1er niveau ---

function openAdvAnalyseSheet() {
  renderAdvAnalyseSheet();
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
  }
}

function closeAdvAnalyseSheet() {
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }
}

// Volet d'options rapides, ouvert par la bulle « niveau joueur » (haut à droite).
// Hub de navigation pendant la partie : carte/niveaux, réglages, accueil.
function openAdvQuickMenu() {
  closeAdvAnalyseSheet();
  renderAdvPlayerBadge(); // synchronise niveau + XP dans l'en-tête du volet
  const menu = document.querySelector('#advQuickMenu');
  if (menu) {
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
  }
}

function closeAdvQuickMenu() {
  const menu = document.querySelector('#advQuickMenu');
  if (menu) {
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
  }
}

// Reprend l'éval détaillée + le commentaire déjà calculés (éléments du rail) dans la feuille.
function renderAdvAnalyseSheet() {
  const game = state.game;
  // Message d'évaluation / feedback en cours (ce qui apparaissait avant sur l'échiquier) —
  // c'est la première info utile : « Coup accepté (+0.38)… », combos, raison de défaite, etc.
  const message = document.querySelector('#advSheetMessage');
  if (message) {
    const text = game?.message ?? '';
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('is-defeat', game?.status === 'lost');
  }
  const evalDl = document.querySelector('#advSheetEval');
  if (evalDl) {
    // Quand un mat forcé est en vue, on remplace « Moyenne future » par le nombre
    // de coups avant le mat (info clé après la conversion automatique).
    const cp = game?.currentEvalCp;
    const mateMoves = isMateScore(cp) ? mateMovesFromCp(cp) : null;
    const secondRow = mateMoves
      ? ['Mat en', `${mateMoves} coup${mateMoves > 1 ? 's' : ''}`]
      : ['Moyenne future', document.querySelector('#nodeFuture')?.textContent ?? '-'];
    const rows = [
      ['Évaluation', document.querySelector('#nodeEval')?.textContent ?? '-'],
      secondRow,
      ['Trait', document.querySelector('#nodeTurn')?.textContent ?? '-']
    ];
    evalDl.replaceChildren();
    for (const [key, value] of rows) {
      const div = document.createElement('div');
      div.innerHTML = `<dt>${key}</dt><dd>${escapeHtml(value)}</dd>`;
      evalDl.append(div);
    }
  }
  // Commentaire de position (note du livre) : secondaire, masqué s'il double le message.
  const comment = document.querySelector('#advSheetComment');
  if (comment) {
    const txt = document.querySelector('#nodeComment')?.textContent ?? '';
    comment.textContent = txt;
    comment.hidden = !txt || txt === (game?.message ?? '');
    comment.classList.remove('is-defeat');
  }
  const sources = document.querySelector('#advSheetSources');
  if (sources) {
    const txt = document.querySelector('#nodeSources')?.textContent ?? '';
    sources.textContent = txt;
    sources.hidden = !txt || txt === '-';
  }
}

// Coups jouables (livre) affichés en 1er niveau : pièce + notation, sans texte autour.
function renderAdvMovesStrip() {
  const host = document.querySelector('#advMovesStrip');
  if (!host) {
    return;
  }
  host.replaceChildren();
  const game = state.game;
  // Révision : le bandeau devient le QCM — mêmes touches que le choix du coup.
  // Les propositions suivent la difficulté (faciles : d'emblée ; Normal : après
  // une erreur ; Difficile : jamais — on joue sur l'échiquier).
  const rev = state.advRun?.revisionMode ? game?.revision : null;
  if (rev && game?.status === 'playing') {
    const showKeys =
      (rev.phase === 'question' || rev.phase === 'feedback') && rev.step && rev.keysRevealed;
    if (showKeys) {
      for (const opt of rev.step.options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'adv-move-key';
        btn.dataset.revUci = opt.uci;
        btn.innerHTML =
          `<img class="adv-move-key-piece" src="/pieces/merida/w${sanPieceLetter(opt.san)}.svg" alt="" aria-hidden="true">` +
          `<span class="adv-move-key-san">${escapeHtml(opt.san)}</span>`;
        if (rev.phase === 'feedback') {
          btn.disabled = true;
          if (opt.uci === rev.step.correctUci) {
            btn.classList.add('is-correct');
          } else if (opt.uci === rev.answerUci) {
            btn.classList.add('is-wrong');
          }
        }
        host.append(btn);
      }
    } else {
      const ph = document.createElement('span');
      ph.className = 'adv-moves-placeholder';
      ph.textContent =
        rev.phase === 'question'
          ? '🧠 Joue le bon coup sur l’échiquier'
          : rev.phase === 'feedback'
            ? rev.answerUci === rev.step?.correctUci
              ? `✅ ${rev.step?.correctSan} !`
              : `❌ Le bon coup : ${rev.step?.correctSan}`
            : '⏩ Rejeu accéléré…';
      host.append(ph);
    }
    return;
  }
  // Influence (après défaite de boss) : aux positions d'embranchement des Noirs,
  // le bandeau propose les candidats à surpondérer — mêmes touches qu'en partie.
  if (game?.influence) {
    const node = advInfluenceViewedNode();
    if (node) {
      const used = Boolean(state.advRun?.overweightUsed);
      node.moves.forEach((m, i) => {
        const color = INFLUENCE_ARROW_COLORS[i % INFLUENCE_ARROW_COLORS.length];
        const sel = m.uci === game.influence.selectedUci;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `adv-move-key is-influence${sel ? ' is-influence-selected' : ''}`;
        btn.style.setProperty('--key-color', color);
        btn.dataset.inflUci = m.uci;
        btn.disabled = used;
        const w = advOpeningWeightOf(`${node.fen}|${m.uci}`);
        const tag =
          w > 0.01
            ? `+${Math.round(w)}%`
            : w < -0.01
              ? `${Math.round(w)}%`
              : `${Math.round(m.baseProb * 100)}%`;
        btn.innerHTML =
          `<img class="adv-move-key-piece" src="/pieces/merida/b${sanPieceLetter(m.san)}.svg" alt="" aria-hidden="true">` +
          `<span class="adv-move-key-san">${escapeHtml(m.san)}</span>` +
          `<span class="adv-move-key-prob">${escapeHtml(tag)}</span>`;
        host.append(btn);
      });
      const selMove = !used && node.moves.find((m) => m.uci === game.influence.selectedUci);
      if (selMove) {
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'adv-move-key is-influence-validate';
        ok.dataset.inflValidate = '1';
        ok.innerHTML = `<span class="adv-move-key-san">✓ ${escapeHtml(selMove.san)} +5%</span>`;
        host.append(ok);
      }
    } else {
      const ph = document.createElement('span');
      ph.className = 'adv-moves-placeholder';
      ph.textContent = '‹ › Navigue jusqu’à un choix des Noirs pour influencer';
      host.append(ph);
    }
    // « Terminer » clôt la phase d'influence → CTA finaux (rejouer / suivant / analyser).
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'adv-move-key is-influence-done';
    done.dataset.inflDone = '1';
    done.innerHTML = '<span class="adv-move-key-san">Terminer ›</span>';
    host.append(done);
    return;
  }
  const reviewing = Boolean(game && game.historyView != null);
  const inPlay = Boolean(game && game.status === 'playing' && !reviewing);
  // « choix du coup » : aide désactivée aux niveaux Normal/Difficile → le joueur
  // joue de lui-même sur l'échiquier (les touches et fantômes disparaissent).
  const showChoices = advAids().moveChoices;

  // 1) Coups blancs jouables (selectionnables) pendant l'ouverture.
  const whitePlayable =
    inPlay && game.chess.turn() === 'w' && !game.locked && game.phase === 'opening';
  const whiteEdges = whitePlayable && showChoices ? getExpectedWhiteBookEdges() : [];
  for (const edge of whiteEdges) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-move-key';
    btn.dataset.uci = edge.uci;
    btn.innerHTML =
      `<img class="adv-move-key-piece" src="/pieces/merida/w${sanPieceLetter(edge.san)}.svg" alt="" aria-hidden="true">` +
      `<span class="adv-move-key-san">${escapeHtml(edge.san)}</span>`;
    host.append(btn);
  }

  // 2) Reponses de Stockfish encore dans la theorie : touches "fantomes" non
  //    cliquables, avec la proba en discret (on voit le coup sans pouvoir le jouer).
  let ghosts = [];
  if (
    showChoices &&
    !whiteEdges.length &&
    inPlay &&
    game.chess.turn() === 'b' &&
    game.phase === 'opening'
  ) {
    ghosts = buildOpponentBookCandidates(getOpponentBookEdgesForRun());
  }
  for (const cand of ghosts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-move-key is-ghost';
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const prob = `<span class="adv-move-key-prob">${escapeHtml(formatPercent(cand.probability))}</span>`;
    if (cand.type === 'free') {
      btn.classList.add('is-ghost-free');
      btn.innerHTML = `<span class="adv-move-key-san">Imprevu</span>${prob}`;
    } else {
      const san = cand.edge.san;
      btn.innerHTML =
        `<img class="adv-move-key-piece" src="/pieces/merida/b${sanPieceLetter(san)}.svg" alt="" aria-hidden="true">` +
        `<span class="adv-move-key-san">${escapeHtml(san)}</span>${prob}`;
    }
    host.append(btn);
  }
  // Zone réservée en permanence : quand aucun coup de livre n'est dispo (au tour de
  // Stockfish, ou hors livre), on garde la place avec un libellé — l'échiquier ne bouge plus.
  const hasContent = whiteEdges.length || ghosts.length;
  if (!hasContent) {
    const ph = document.createElement('span');
    ph.className = 'adv-moves-placeholder';
    const yourTurnNoAid =
      !showChoices && game?.status === 'playing' && game.chess.turn() === 'w' && !game.locked;
    ph.textContent = yourTurnNoAid
      ? 'À toi de jouer sur l’échiquier'
      : game?.victoryCinematic
        ? 'Conversion automatique en cours…'
        : game?.status === 'playing' && game.chess.turn() === 'b'
          ? 'Au tour de Stockfish…'
          : game?.status === 'playing' && game.phase !== 'opening'
            ? 'Hors du livre : joue ton coup sur l’échiquier'
            : ' ';
    host.append(ph);
  }
  host.classList.toggle('is-empty', !hasContent);
}

// Rafraîchit la barre portable (libellé de vue + barreau de coups + feuille d'analyse ouverte).
function updateAdvMobileBar() {
  const label = document.querySelector('#advBarViewLabel');
  if (label) {
    label.textContent = state.advViewMode === 'board' ? 'Cerveau' : 'Échiquier';
  }
  const ico = document.querySelector('#advBarView .adv-bar-ico');
  if (ico) {
    ico.textContent = state.advViewMode === 'board' ? '🧠' : '🎮';
  }
  renderAdvMovesStrip();
  renderAdvHistory();
  renderAdvTakeBack();
  renderAdvPlayerBadge();
  if (document.querySelector('#advAnalyseSheet')?.classList.contains('is-open')) {
    renderAdvAnalyseSheet();
  }
}

// --- Historique : navigation ‹/› + prévisualisation des positions passées ---

function advHistoryLength() {
  const game = state.game;
  return game?.chess ? game.chess.history().length : 0;
}

// Place la revue à un index de demi-coups (null/au-delà du total = position en cours).
function advHistoryGoto(index) {
  const game = state.game;
  if (!game) {
    return;
  }
  const total = advHistoryLength();
  game.historyView = index == null || index >= total ? null : clamp(index, 0, total);
  game.selectedSquare = null;
  // Revoir la partie via ‹/› doit fonctionner même après la fin : on désactive la
  // revue libre (qui sinon impose sa position à l'échiquier) tant qu'on navigue.
  if (game.historyView != null && game.freeReview?.active) {
    game.freeReview.active = false;
  }
  renderGameDetails();
}

function advHistoryStep(delta) {
  const game = state.game;
  if (!game) {
    return;
  }
  // Influence « nœud aléatoire » : ‹ › parcourent la ligne du livre tirée.
  if (game.influence?.lineSans) {
    const len = game.influence.lineSans.length;
    game.influence.lineIndex = clamp((game.influence.lineIndex ?? len) + delta, 0, len);
    renderGameDetails();
    return;
  }
  const current = game.historyView ?? advHistoryLength(); // position en cours = total demi-coups
  advHistoryGoto(current + delta);
}

// Affiche/masque la bande d'historique ; en la masquant on revient à la position en cours.
function toggleAdvHistory() {
  const hidden = document.body.classList.toggle('is-history-hidden');
  if (hidden && state.game?.historyView != null) {
    advHistoryGoto(null);
  }
}

function renderAdvHistory() {
  const host = document.querySelector('#advHistory');
  if (!host) {
    return;
  }
  const game = state.game;
  const total = advHistoryLength();
  const prev = document.querySelector('#advHistPrev');
  const next = document.querySelector('#advHistNext');
  const label = document.querySelector('#advHistLabel');
  // Influence « nœud aléatoire » : la bande ‹ › navigue la ligne du livre tirée.
  const infl = game?.influence?.lineSans ? game.influence : null;
  if (infl) {
    const len = infl.lineSans.length;
    const cur = clamp(infl.lineIndex ?? len, 0, len);
    document.body.classList.toggle('is-reviewing-history', cur < len);
    host.classList.toggle('is-reviewing', true);
    if (label) {
      const san = cur > 0 ? infl.lineSans[cur - 1] : null;
      const moveNo = Math.ceil(cur / 2);
      const moveLabel = san
        ? cur % 2 === 1
          ? `${moveNo}. ${san}`
          : `${moveNo}… ${san}`
        : 'Départ';
      label.textContent = `${moveLabel} · ${cur}/${len}`;
    }
    if (prev) prev.disabled = cur <= 0;
    if (next) next.disabled = cur >= len;
    return;
  }
  const reviewing = Boolean(game && game.historyView != null);
  document.body.classList.toggle('is-reviewing-history', reviewing);
  host.classList.toggle('is-reviewing', reviewing);

  if (!game || total === 0) {
    if (label) label.textContent = 'Aucun coup';
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }
  const current = game.historyView ?? total;
  if (label) {
    label.textContent = `${formatHistoryMoveLabel(game, current)} · ${current}/${total}`;
  }
  if (prev) prev.disabled = current <= 0;
  if (next) next.disabled = !reviewing; // déjà à la position en cours
}

function updateHomeProgress() {
  const el = document.querySelector('#homeAdventureProgress');
  if (!el || !state.adventure) {
    return;
  }
  const progress = advBrainProgress();
  el.textContent = `Joueur Nv.${advPlayerLevel()} · Cerveau Nv.${progress.level} · ${advCoveragePct()} % du cortex · ${state.adventure.highestBoss}/10 boss`;
}

function advResultButton(label, handler, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  if (primary) {
    button.className = 'is-primary';
  }
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

// ⏩ Avance rapide : déroule d'un coup la fin de la cinématique de punition.
// Si la suite est encore en construction (moteur), on mémorise la demande et le
// saut s'applique dès qu'elle est prête.
function advSkipDefeatCinematic() {
  const game = state.game;
  if (!game) {
    return;
  }
  const cin = game.cinematic;
  if (!cin) {
    game.skipDefeatCinematic = true;
    return;
  }
  while (cin.index < cin.moves.length) {
    cin.lastMove = playUciOnChess(cin.chess, cin.moves[cin.index]) || cin.lastMove;
    cin.index += 1;
  }
  const mateResolution = cin.mateResolution;
  const handoverFen = cin.chess.fen();
  clearGameCinematic();
  game.defeatCinematicPending = false;
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
  if (game.freeReviewMoves.length) {
    game.freeReview.active = true;
    game.freeReview.index = game.freeReviewMoves.length - 1;
  }
  renderGameDetails();
  renderGamePanel();
}

// ✓ Terminer : clôt la phase d'influence → CTA finaux (rejouer / suivant / analyser).
function advInfluenceFinish() {
  const game = state.game;
  if (!game?.influence) {
    return;
  }
  game.influence = null;
  game.influenceDone = true;
  advHistoryGoto(null); // revient à la position finale + re-rend les détails
  renderGamePanel();
}

function bindAdventureEvents() {
  const bind = (selector, handler) => {
    const el = document.querySelector(selector);
    if (el) {
      el.addEventListener('click', handler);
    }
  };
  bind('#homeAdventureButton', enterAdventure);
  bind('#homeCreativeButton', enterCreative);
  bind('#homeResetAdventure', () => {
    if (window.confirm('Réinitialiser toute la progression Aventure ?')) {
      resetAdventureProgress();
    }
  });
  bind('#advHomeButton', () => setScreen('home'));
  bind('#advMapButton', openAdventureMap);
  bind('#advViewToggle', toggleAdvViewMode);
  // Onglets / vues de la carte aventure
  bind('#advTabMain', () => setAdvMapView('main'));
  bind('#advTabShop', () => setAdvMapView('shop'));
  bind('#advSettingsBtn', () => setAdvMapView('settings'));
  bind('#advSettingsBack', () => setAdvMapView('main'));
  bind('#advArenaBack', () => setAdvMapView('main'));
  // « Illuminer le cerveau » : écran de choix du parcours (libre / piège)
  bind('#advBtnLesson', () => setAdvMapView('lesson'));
  bind('#advLessonBack', () => setAdvMapView('main'));
  bind('#advLessonFree', launchLesson);
  bind('#advLessonQuiz', () => launchRevision('quiz')); // révision : quiz « trouve le coup »
  bind('#advLessonMate', () => launchRevision('mate')); // révision : refaire un mat passé
  bind('#advLessonTrap', () => {
    if (advTrapsUnlocked()) {
      launchTrapsLesson();
    }
  });
  bind('#advBtnArena', () => setAdvMapView('arena'));
  bind('#advBtnTournament', advOpenOrStartTournament); // Mode Tournoi
  bind('#advTournamentClose', closeAdvTournament);
  bind('#advInfluenceToggle', advToggleInfluenceFeature); // réglage activer/désactiver l'influence
  bind('#advShopThreatsBtn', advToggleThreats); // Boutique R : voir les menaces
  // Revue d'une partie historique : navigation + fermeture.
  bind('#advReviewClose', closeGameReview);
  bind('#advReviewFirst', () => gameReviewStep('first'));
  bind('#advReviewPrev', () => gameReviewStep(-1));
  bind('#advReviewNext', () => gameReviewStep(1));
  bind('#advReviewLast', () => gameReviewStep('last'));
  // Clic sur l'échiquier de revue : jouer/explorer une sous-variante.
  const reviewBoard = document.querySelector('#advReviewBoard');
  if (reviewBoard) {
    reviewBoard.addEventListener('click', (event) => {
      if (!state.gameReview) {
        return;
      }
      const sqEl = event.target.closest?.('.board-square');
      if (sqEl?.dataset.square) {
        gameReviewClickSquare(sqEl.dataset.square);
      }
    });
  }
  const reviewOverlay = document.querySelector('#advGameReview');
  if (reviewOverlay) {
    reviewOverlay.addEventListener('click', (event) => {
      if (event.target === reviewOverlay) {
        closeGameReview(); // clic sur le fond ferme la revue
      }
    });
  }
  // Clavier : flèches pour naviguer dans la revue, Échap pour fermer.
  window.addEventListener('keydown', (event) => {
    if (!state.gameReview) {
      return;
    }
    if (event.key === 'Escape') {
      closeGameReview();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      gameReviewStep(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      gameReviewStep(1);
    }
  });
  const customClockInput = document.querySelector('#advTimeCustomInput');
  if (customClockInput) {
    // U : cadence personnalisée (validée à la perte de focus / Entrée).
    customClockInput.addEventListener('change', () => setAdvCustomClock(customClockInput.value));
  }
  // Barre d'actions de jeu : Vue (cerveau/échiquier) + Analyse
  bind('#advBarAnalyse', openAdvAnalyseSheet);
  bind('#advBarView', toggleAdvViewMode);
  // Bulle haut-droite : ouvre le volet d'options rapides (menu de navigation)
  bind('#advPlayerBadge', openAdvQuickMenu);
  bind('#advQuickMap', () => {
    closeAdvQuickMenu();
    openAdventureMap();
  });
  bind('#advQuickSettings', () => {
    closeAdvQuickMenu();
    openAdventureMap();
    setAdvMapView('settings');
  });
  bind('#advQuickHome', () => {
    closeAdvQuickMenu();
    setScreen('home');
  });
  const quickMenu = document.querySelector('#advQuickMenu');
  if (quickMenu) {
    quickMenu.addEventListener('click', (event) => {
      if (event.target.closest('[data-quick-close]')) {
        closeAdvQuickMenu();
      }
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const m = document.querySelector('#advQuickMenu');
    if (m && m.classList.contains('is-open')) {
      closeAdvQuickMenu();
    }
  });
  // Historique : navigation ‹/› + masquer/afficher
  bind('#advHistPrev', () => advHistoryStep(-1));
  bind('#advHistNext', () => advHistoryStep(1));
  bind('#advHistToggle', toggleAdvHistory);
  bind('#advTakeBack', advTakeBack);
  // Feuille d'analyse : fermeture (croix / backdrop)
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-close]')) {
        closeAdvAnalyseSheet();
      }
    });
  }
  // Barreau de coups en 1er niveau : touche = jouer le coup.
  const movesStrip = document.querySelector('#advMovesStrip');
  if (movesStrip) {
    movesStrip.addEventListener('click', (event) => {
      const btn = event.target.closest('.adv-move-key');
      if (!btn || btn.disabled) {
        return;
      }
      // Révision : la touche répond au QCM au lieu de jouer un coup.
      if (btn.dataset.revUci) {
        advRevisionAnswer(btn.dataset.revUci);
        return;
      }
      // Influence : sélection d'un candidat noir, validation +5 %, ou clôture.
      if (btn.dataset.inflValidate) {
        advInfluenceValidate();
        return;
      }
      if (btn.dataset.inflDone) {
        advInfluenceFinish();
        return;
      }
      if (btn.dataset.inflUci) {
        advInfluenceSelect(btn.dataset.inflUci);
        return;
      }
      // Les touches « fantômes » (réponses de Stockfish) n'ont pas d'UCI : non jouables.
      if (btn.dataset.uci) {
        submitHumanMove(btn.dataset.uci);
      }
    });
  }
  // « Quitter » (bas de l'écran Choix du mode de jeu) : sortir vers l'accueil principal.
  bind('#advMapQuit', () => {
    closeAdventureMap();
    setScreen('home');
  });
  const form = document.querySelector('#advMoveForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAdventureMove();
    });
  }
  // Rail d'infos (vue joueur aventure) : replier/déplier les sections de 2e niveau.
  if (elements.detailInfoContent) {
    elements.detailInfoContent.addEventListener('click', (event) => {
      if (state.screen !== 'adventure' || !document.body.classList.contains('is-adv-board-view')) {
        return;
      }
      const title = event.target.closest('.detail-section > h3');
      if (!title || !elements.detailInfoContent.contains(title)) {
        return;
      }
      title.parentElement.classList.toggle('is-open');
    });
  }
}

function bindEvents() {
  initBoardInteraction({
    getInteractiveChess,
    getPlayableBoardColor,
    getBookTargetsFromSquare,
    isOpeningBookChoiceActive,
    submitHumanMove,
    renderGameDetails,
    isBoardInteractive,
    getActiveFreeReviewEntry
  });
  bindPanelResizeHandles(renderGraph);
  bindBoardDragEvents();
  initBrainScrub({ renderGraph, renderBoard }); // injection : re-rendu graphe + échiquier
  initGraphRenderer({
    shouldFollowGameInGraph,
    syncGameGraphSelection,
    selectEdge,
    selectNode,
    renderDetails
  });
  initAdventureHistory({ getReviewParent }); // injection : parent d'un coup dans l'arbre de revue
  initAdventureProgressHud({
    isExplorationMode,
    flashAdvBoard,
    updateHomeProgress
  });
  initMateResolution({
    ensureStockfishReady,
    clearGameCinematic,
    setEngineThinking,
    renderGameDetails,
    renderGamePanel,
    advSkipDefeatCinematic
  });
  initFreeReview({
    ensureStockfishReady,
    renderGameDetails,
    renderGamePanel,
    clearGameCinematic,
    syncPlayModeButtons,
    setGameGraphPathToNode,
    renderGraph,
    setGameLocked,
    advanceOpponentTurn,
    tryMoveInput
  });
  initAdventureSettings({ renderGameDetails, advHistoryGoto });
  initAdventureMap({
    closeAdvAnalyseSheet,
    renderAdvDifficulty,
    renderAdvTimeControl,
    renderAdvMateHandover,
    renderAdvMateTolerance,
    renderAdvInfluenceSetting,
    renderAdvShop,
    advTrapsUnlocked,
    launchBoss
  });
  initAdventureTournament({
    ensureStockfishReady,
    closeAdventureMap,
    setViewMode,
    setAdvViewMode,
    startNewGame,
    focusAdvInput,
    renderAdventureHud
  });
  initAdventureHud({
    advResultButton,
    advUndoDefeat,
    advSkipDefeatCinematic,
    openAdvInfluence,
    advMateTolerance,
    launchBoss,
    launchRevision,
    launchTrapsLesson,
    launchLesson,
    updateAdvMobileBar,
    getExpectedWhiteBookEdges
  });
  initAdventureAids({ renderGameDetails });
  initOpeningViewer({ renderAdvShop }); // injection : re-rendu du carrousel boutique (HUD)
  initGameReview({ renderBoard, ensureStockfishReady }); // injection : échiquier + moteur
  bindBrainScrubEvents();

  elements.temperatureRange.addEventListener('input', () => {
    state.temperatureCp = Number(elements.temperatureRange.value);
    elements.temperatureValue.textContent = `${state.temperatureCp} cp`;
    renderGraph();
  });

  elements.floorRange.addEventListener('input', () => {
    state.floorMass = Number(elements.floorRange.value) / 100;
    elements.floorValue.textContent = `${elements.floorRange.value}%`;
    renderGraph();
  });

  elements.lineFilter.addEventListener('change', () => {
    state.lineFilter = elements.lineFilter.value;
    renderGraph();
  });

  elements.pgnFileInput.addEventListener('change', async () => {
    const file = elements.pgnFileInput.files?.[0];
    if (!file) {
      return;
    }
    elements.pgnImportStatus.textContent = 'Fichier chargé';
    elements.pgnTextInput.value = await file.text();
  });
  elements.buildPgnButton.addEventListener('click', () => {
    importPgnFromInput();
  });
  elements.defaultPgnButton.addEventListener('click', () => {
    restoreDefaultGraph();
  });

  elements.stockfishLevelRange.addEventListener('input', () => {
    state.stockfishLevel = getStockfishLevelProfile(elements.stockfishLevelRange.value).level;
    updateStockfishLevelUi();
    renderGamePanel();
  });

  elements.survivalLimitRange.addEventListener('input', () => {
    state.survivalLimitCp = Number(elements.survivalLimitRange.value);
    updateSurvivalLimitUi();
    renderGamePanel();
  });

  elements.bestPathButton.addEventListener('click', () => buildPath('best'));
  elements.randomPathButton.addEventListener('click', () => buildPath('random'));
  elements.resetButton.addEventListener('click', resetHighlight);
  elements.viewModeButton.addEventListener('click', toggleViewMode);
  elements.challengeModeButton.addEventListener('click', () => setPlayMode('challenge'));
  elements.explorationModeButton.addEventListener('click', () => setPlayMode('exploration'));
  elements.newGameButton.addEventListener('click', handleNewGameAction);
  elements.moveForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitHumanMove();
  });
  elements.boardZoomButton.addEventListener('click', () => setBoardZoomed(!state.boardZoomed));
  elements.boardZoomCloseButton.addEventListener('click', () => setBoardZoomed(false));
  elements.segmentToggleButton.addEventListener('click', () => {
    state.segmentExpanded = !state.segmentExpanded;
    renderDetails();
  });
  elements.segmentPrevButton.addEventListener('click', () => {
    state.segmentStepIndex = Math.max(0, state.segmentStepIndex - 1);
    renderDetails();
  });
  elements.segmentNextButton.addEventListener('click', () => {
    const maxIndex = Math.max(0, (state.selectedSegment?.pathNodeIds.length ?? 1) - 1);
    state.segmentStepIndex = Math.min(maxIndex, state.segmentStepIndex + 1);
    renderDetails();
  });
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
    if (isTyping) {
      return;
    }
    if (event.key.toLowerCase() === 'd') {
      event.preventDefault();
      toggleViewMode();
    }
  });
  window.addEventListener('resize', () => {
    clampPanelWidths();
    renderGraph();
  });
}

async function init() {
  const response = await fetch('/opening-graph.json');
  if (!response.ok) {
    throw new Error(`Impossible de charger opening-graph.json (${response.status})`);
  }
  state.defaultData = await response.json();
  state.adventure = loadAdventure();
  bindEvents();
  bindAdventureEvents();
  updateStockfishLevelUi();
  updateSurvivalLimitUi();
  setViewMode('human');
  setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
  state.activeBook = 'default';
  elements.pgnImportStatus.textContent = 'Livre actif';
  setScreen('home');
  updateHomeProgress();
  initClocks({ finishGame }); // injection : fin de partie au temps
  startClockTicker(); // U : démarre le décompte de la pendule
}

init().catch((error) => {
  elements.summaryText.textContent = error.message;
  elements.selectedPathLabel.textContent = 'Le JSON du graphe est introuvable';
  console.error(error);
});
