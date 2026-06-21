import { Chess } from './vendor/chess.js';
import { elements } from './elements.js';
import { state } from './state.js';
import {
  FIRST_LEVEL_NUMBER,
  DISPLAY_DEFAULT_FLOOR_MASS,
  MATE_SCORE_CP,
  PROBABILITY_TEMPERATURE_CP,
  PROBABILITY_FLOOR_MASS
} from './constants.js';
import {
  clamp,
  formatPercent,
  sideLabel,
  sanPieceLetter,
  moveColorAt,
  escapeHtml,
  pause,
  randomThinkMs,
  randomUnit
} from './utils.js';
import {
  playUciOnChess,
  terminalEvaluation,
  isMateScore,
  mateMovesFromCp,
  STANDARD_START_FEN,
  scoreForSide,
  moveToUci
} from './chess-utils.js';
import {
  formatEval,
  joinHumanList,
  buildHumanEval,
  buildDefeatComment
} from './eval-commentary.js';
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
  pickWeightedCandidate,
  advOpeningDisplayLabel
} from './graph.js';
import {
  ADV_DIFFICULTIES,
  DEFAULT_ADV_DIFFICULTY,
  TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  ADV_MAX_GAMES,
  ADV_GLOBAL_LIVES_MAX,
  MATE_HANDOVER_OPTIONS,
  DEFAULT_MATE_HANDOVER,
  ADV_MAX_REVIEW_MOVES
} from './adventure-config.js';
import { createAdventureState, loadAdventure, saveAdventure } from './adventure-state.js';
import { showAdventureToast } from './toast.js';
import { OPENING_MAX_PLIES, buildOpeningFrames, fillOpeningBoard } from './board-render.js';
import { getTimeControlConfig } from './time-control.js';
import { clampPanelWidths, bindPanelResizeHandles } from './panels.js';
import { advSetText, advSetWidth } from './dom.js';
import {
  initClocks,
  makeInitialClock,
  startClockTicker,
  deductStockfishClock,
  renderClocks
} from './clocks.js';
import {
  showNodeTooltip,
  showEdgeTooltip,
  showRungTooltip,
  hideTooltip
} from './graph-tooltips.js';
import {
  computeLayout,
  computeBrainFocusViewBox,
  computeEdgeSequencePositions,
  brainOutlinePath,
  edgeControlPoints,
  edgePath,
  cubicBezierAt
} from './graph-geometry.js';
import {
  nodeMatchesFilter,
  edgeMatchesFilter,
  getBranchValue,
  isMateNode,
  branchEventuallyEndsInMate,
  applyMinimumProbabilities,
  normalizeScoredProbabilities,
  recomputeViewProbabilities,
  createCompressedView
} from './graph-view-model.js';
import {
  initBrainScrub,
  bindBrainScrubEvents,
  isBrainScrubContext,
  showBrainScrub
} from './brain-scrub.js';
import {
  advBrainProgress,
  advAwardPlayerXp,
  advPlayerLevel,
  advPlayerProgress,
  advCurrentDifficulty
} from './adventure-progress.js';
import {
  STOCKFISH_DEPTH,
  getStockfishLevelProfile,
  formatStockfishLevel,
  BrowserStockfishEvaluator
} from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FREE_SURVIVAL_TARGETS = [5, 7, 10, 13, 15];
const IMPORT_STOCKFISH_DEPTH = 5;
const STARTING_LIVES = 3;
const OPENING_FREE_BREAK_PLY = 14;
const OPENING_FREE_BREAK_PROBABILITY = 0.25;
// Conversion automatique « cinématique » de la phase libre : dès que les Blancs
// dépassent +2, on avance la partie seul (meilleurs coups blancs vs défense Stockfish)
// jusqu'à voir un mat forcé, puis on rend la main au joueur pour conclure.
const VICTORY_CINEMATIC_TRIGGER_CP = 200;  // +2.00 : seuil de déclenchement
const VICTORY_CINEMATIC_KEEP_CP = 150;     // si l'avantage retombe sous +1.50, on rend la main
const VICTORY_CINEMATIC_DEPTH = 10;        // profondeur d'analyse pendant la conversion
const VICTORY_CINEMATIC_MAX_PLIES = 36;    // garde-fou : ~18 coups complets max
const VICTORY_CINEMATIC_STEP_MS = 650;     // tempo entre deux coups
// Niveaux de difficulté Aventure : chaque niveau active un sous-ensemble d'aides.
//  - moveChoices : coups suggérés (touches + indices dorés du bon coup)
//  - legalDots   : points (cases légales) quand on sélectionne une pièce
//  - evaluation  : barre / chiffres d'évaluation
//  - takeback    : retour arrière (annuler son dernier coup)
// Cases légales (« points verts ») : visibles aux niveaux faciles, masquées en
// Normal mais révélées après 5 s de réflexion ou après une erreur (Q), et jamais
// affichées en Difficile. Les niveaux se distinguent aussi par les autres aides.
const FULL_AIDS = { moveChoices: true, legalDots: true, evaluation: true, takeback: false };

function createSvgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

function getLevelObjective(level) {
  const target = FREE_SURVIVAL_TARGETS[level - 1];
  if (Number.isFinite(target)) {
    return { type: 'survival', target };
  }
  return { type: 'mate', target: Number.POSITIVE_INFINITY };
}

function isMateObjective(game) {
  return game?.objective?.type === 'mate';
}

function formatLevelObjective(level) {
  const objective = getLevelObjective(level);
  return objective.type === 'mate'
    ? "mater l'adversaire"
    : `tenir ${objective.target} coups complets libres`;
}

function formatSurvivalTarget(game) {
  return isMateObjective(game) ? "jusqu'au mat" : `${game.objective.target}`;
}

function updateStockfishLevelUi() {
  const profile = getStockfishLevelProfile();
  elements.stockfishLevelRange.value = String(profile.level);
  elements.stockfishLevelValue.textContent = formatStockfishLevel(profile);
}

function updateSurvivalLimitUi() {
  elements.survivalLimitRange.value = String(state.survivalLimitCp);
  elements.survivalLimitValue.textContent = formatEval(state.survivalLimitCp);
}

function computeGraphFutureMeans(graph) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const memo = new Map();

  function visit(nodeId, stack = new Set()) {
    if (memo.has(nodeId)) {
      return memo.get(nodeId);
    }
    if (stack.has(nodeId)) {
      const node = nodesById.get(nodeId);
      return node?.evaluation?.cpWhite ?? 0;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return 0;
    }

    stack.add(nodeId);
    const childMeans = node.outgoing
      .map((edgeId) => edgesById.get(edgeId))
      .filter(Boolean)
      .map((edge) => visit(edge.to, stack));
    stack.delete(nodeId);

    const ownCp = node.evaluation?.cpWhite ?? 0;
    const mean = childMeans.length
      ? (ownCp + childMeans.reduce((sum, value) => sum + value, 0)) / (childMeans.length + 1)
      : ownCp;

    node.futureMeanCp = Math.round(mean);
    memo.set(nodeId, node.futureMeanCp);
    return node.futureMeanCp;
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }
}

function assignGraphProbabilities(graph) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  for (const node of graph.nodes) {
    const outgoing = node.outgoing.map((edgeId) => edgesById.get(edgeId)).filter(Boolean);
    if (!outgoing.length) {
      continue;
    }
    if (outgoing.length === 1) {
      outgoing[0].probability = 1;
      outgoing[0].deltaCp = 0;
      outgoing[0].pathMeanCp = nodesById.get(outgoing[0].to)?.futureMeanCp ?? null;
      outgoing[0].isBest = true;
      continue;
    }

    const scored = outgoing.map((edge) => {
      const child = nodesById.get(edge.to);
      const pathMeanCp = child?.futureMeanCp ?? child?.evaluation?.cpWhite ?? 0;
      return {
        edge,
        pathMeanCp,
        score: scoreForSide(pathMeanCp, node.sideToMove)
      };
    });
    const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
    const bestScore = Math.max(...scored.map((item) => item.score));
    const rawWeights = scored.map((item) =>
      Math.exp(clamp(item.score - average, -800, 800) / PROBABILITY_TEMPERATURE_CP)
    );
    const rawTotal = rawWeights.reduce((sum, value) => sum + value, 0);

    scored.forEach((item, index) => {
      const softmax = rawWeights[index] / rawTotal;
      item.edge.probability =
        PROBABILITY_FLOOR_MASS / scored.length + (1 - PROBABILITY_FLOOR_MASS) * softmax;
      item.edge.deltaCp = Math.round(item.score - average);
      item.edge.pathMeanCp = Math.round(item.pathMeanCp);
      item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
      item.edge.endsInMate = isMateNode(nodesById.get(item.edge.to));
    });
    applyMinimumProbabilities(scored);
    normalizeScoredProbabilities(scored);
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cloneGraphData(data) {
  return JSON.parse(JSON.stringify(data));
}

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
function renderGraph() {
  if (!state.data) {
    return;
  }
  const view = createCompressedView();
  recomputeViewProbabilities(view);
  state.view = view;
  if (state.selectedSegment) {
    state.selectedSegment = view.edgesById.get(state.selectedSegment.id) ?? null;
  }
  state.gameViewNodeId = null; // (re)calculé par syncGameGraphSelection si une partie suit le graphe
  if (shouldFollowGameInGraph()) {
    syncGameGraphSelection(view);
  }
  state.scrubPoints = []; // points (nœuds + coups intermédiaires) défilables au doigt
  const { width, height } = computeLayout(view);
  const svg = elements.graphSvg;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const defs = createSvgElement('defs');
  const glow = createSvgElement('filter', { id: 'nodeGlow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
  glow.append(
    createSvgElement('feGaussianBlur', { stdDeviation: '4', result: 'blur' }),
    createSvgElement('feColorMatrix', {
      in: 'blur',
      type: 'matrix',
      values: '1 0 0 0 0.95  0 1 0 0 0.78  0 0 1 0 0.22  0 0 0 0.55 0'
    }),
    createSvgElement('feMerge')
  );
  glow.lastChild.append(createSvgElement('feMergeNode'), createSvgElement('feMergeNode', { in: 'SourceGraphic' }));
  defs.append(glow);
  svg.append(defs);

  svg.append(createSvgElement('path', { class: 'brain-outline', d: brainOutlinePath(width, height) }));

  const edgeLayer = createSvgElement('g', { class: 'edge-layer' });
  const rungLayer = createSvgElement('g', { class: 'rung-layer' });
  const nodeLayer = createSvgElement('g', { class: 'node-layer' });
  svg.append(edgeLayer, rungLayer, nodeLayer);

  const orderedEdges = [...view.edges].sort((a, b) => a.probability - b.probability);
  for (const edge of orderedEdges) {
    const matches = edgeMatchesFilter(edge);
    const isHighlighted = state.highlightedEdges.has(edge.id);
    const sourceNode = view.nodesById.get(edge.from);
    const isForced = (sourceNode?.outgoing.length ?? 0) <= 1;
    const strokeWidth = isHighlighted
      ? 5.4
      : isForced
        ? 2.65
        : 2.3 + edge.probability * 4.9;
    const edgeOpacity = isHighlighted
      ? 0.95
      : isForced
        ? 0.56
        : 0.46 + edge.probability * 0.42;
    const pathD = edgePath(edge);
    const casing = createSvgElement('path', {
      class: [
        'neural-edge-casing',
        !matches ? 'is-muted' : '',
        isHighlighted ? 'is-highlighted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      d: pathD,
      'stroke-width': String(strokeWidth + 4.2),
      opacity: String(matches ? (isHighlighted ? 0.92 : 0.58) : 0.1)
    });
    const moveSide = sourceNode?.raw?.sideToMove;
    const path = createSvgElement('path', {
      class: [
        'neural-edge',
        moveSide === 'w' ? 'is-white-move' : moveSide === 'b' ? 'is-black-move' : '',
        edge.isBest ? 'is-best' : '',
        isForced ? 'is-forced' : '',
        isAdventureEdgeMastered(edge) ? 'is-mastered' : '',
        !matches ? 'is-muted' : '',
        isHighlighted ? 'is-highlighted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      'data-edge-id': edge.id, // G : surbrillance de la branche pendant le scrub
      d: pathD,
      'stroke-width': String(strokeWidth),
      opacity: String(matches ? edgeOpacity : 0.08)
    });
    path.addEventListener('mouseenter', (event) => showEdgeTooltip(edge, event));
    path.addEventListener('mouseleave', hideTooltip);
    path.addEventListener('click', () => selectEdge(edge));
    edgeLayer.append(casing, path);

    // Barreaux d'échelle : un par coup intermédiaire d'un arc compressé. Survol = coup attendu + position.
    if (edge.isCompressed && matches) {
      const cp = edgeControlPoints(edge);
      const moveCount = edge.sequence?.length ?? 0;
      const seqPositions = computeEdgeSequencePositions(edge);
      if (cp && moveCount > 1) {
        for (let i = 0; i < moveCount; i += 1) {
          const pt = cubicBezierAt(cp, (i + 0.5) / moveCount);
          const len = Math.hypot(pt.tx, pt.ty) || 1;
          const nx = -pt.ty / len;
          const ny = pt.tx / len;
          const half = 5.5;
          const coords = {
            x1: (pt.x - nx * half).toFixed(1),
            y1: (pt.y - ny * half).toFixed(1),
            x2: (pt.x + nx * half).toFixed(1),
            y2: (pt.y + ny * half).toFixed(1)
          };
          const rungColor = moveColorAt(edge, i);
          const rungGroup = createSvgElement('g', {
            class: [
              'edge-rung-group',
              rungColor === 'w' ? 'is-white-move' : 'is-black-move',
              isHighlighted ? 'is-highlighted' : ''
            ].filter(Boolean).join(' ')
          });
          rungGroup.append(
            createSvgElement('line', { class: 'edge-rung-hit', ...coords }),
            createSvgElement('line', { class: 'edge-rung', ...coords })
          );
          const moveIndex = i;
          rungGroup.addEventListener('mouseenter', (event) => showRungTooltip(edge, moveIndex, event));
          rungGroup.addEventListener('mouseleave', hideTooltip);
          rungLayer.append(rungGroup);
          // Point défilable au doigt : le coup intermédiaire (position reconstruite).
          const seqPos = seqPositions[i];
          if (seqPos) {
            state.scrubPoints.push({
              x: pt.x,
              y: pt.y,
              fen: seqPos.fen,
              san: seqPos.san,
              from: seqPos.from,
              to: seqPos.to,
              moveColor: rungColor,
              label: `${seqPos.san} (${i + 1}/${moveCount})`,
              eval: undefined,
              nodeId: edge.to
            });
          }
        }
      }
    }
  }

  for (const viewNode of view.nodes) {
    const node = viewNode.raw;
    const point = state.layout.get(viewNode.id);
    if (!point) {
      continue;
    }
    // Point défilable au doigt pour ce nœud (mini-échiquier de la position).
    state.scrubPoints.push({
      x: point.x,
      y: point.y,
      fen: node.fen,
      san: node.san,
      from: node.from,
      to: node.to,
      moveColor: node.from ? (node.sideToMove === 'w' ? 'b' : 'w') : null,
      label: node.id === 'root' ? 'Départ' : node.san,
      eval: node.evaluation?.cpWhite,
      nodeId: node.id
    });
    const evalTone = clamp(((node.futureMeanCp ?? node.evaluation?.cpWhite ?? 0) + 250) / 500, 0, 1);
    const outgoing = viewNode.outgoing.length;
    const radius = node.id === 'root'
      ? 11
      : clamp(6.5 + outgoing * 2 + viewNode.collapsedIncomingPlyCount * 0.75, 7.5, 18);
    const matches = nodeMatchesFilter(node);
    const group = createSvgElement('g', {
      class: [
        'neural-node',
        node.sideToMove === 'w' ? 'is-white-turn' : node.sideToMove === 'b' ? 'is-black-turn' : '',
        outgoing > 1 ? 'is-branch' : '',
        viewNode.collapsedIncomingPlyCount > 1 ? 'is-compressed' : '',
        node.terminal ? 'is-terminal' : '',
        isAdventureMastered(node.id) ? 'is-mastered' : '',
        state.highlightedNodes.has(node.id) ? 'is-path' : '',
        state.gameViewNodeId === node.id ? 'is-current-position' : '',
        state.selectedNodeId === node.id ? 'is-selected' : '',
        !matches ? 'is-muted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`,
      'data-node-id': node.id
    });

    const pulse = createSvgElement('circle', {
      class: 'node-pulse',
      r: String(radius + 7),
      opacity: String(outgoing > 1 ? 0.65 : 0.28)
    });
    const circle = createSvgElement('circle', {
      r: String(radius),
      filter: state.highlightedNodes.has(node.id) ? 'url(#nodeGlow)' : '',
      style: `fill: color-mix(in srgb, var(--cyan) ${Math.round((1 - evalTone) * 38)}%, #1d231c);`
    });
    const label = createSvgElement('text', { y: String(radius + 17) });
    label.textContent = node.id === 'root' ? 'Start' : node.san;
    if (outgoing <= 1 && state.selectedNodeId !== node.id && !state.highlightedNodes.has(node.id)) {
      label.setAttribute('opacity', '0');
    }

    // Anneau « au trait » À L'INTÉRIEUR du nœud : clair = les Blancs jouent le prochain
    // coup, sombre = les Noirs. La couleur est ainsi portée par le nœud lui-même.
    const turnRing = createSvgElement('circle', {
      class: 'node-turn-ring',
      r: String(Math.max(2.5, radius - 2.8)),
      fill: 'none'
    });
    group.append(pulse, circle, turnRing, label);
    group.addEventListener('mouseenter', (event) => showNodeTooltip(node, event));
    group.addEventListener('mouseleave', hideTooltip);
    group.addEventListener('click', () => {
      if (state.suppressNextGraphClick) {
        state.suppressNextGraphClick = false;
        return;
      }
      // Téléphone (vue cerveau) : taper un nœud zoome dans ses lignes ; re-taper dézoome.
      if (isBrainScrubContext()) {
        state.brainFocus = state.brainFocus === node.id ? null : node.id;
      }
      selectNode(node.id, { clearPath: false });
    });
    nodeLayer.append(group);
  }

  // Zoom « dans les lignes » : on resserre le viewBox autour du nœud ciblé (téléphone).
  const focusBox = state.brainFocus ? computeBrainFocusViewBox(state.brainFocus, width, height) : null;
  if (focusBox) {
    svg.setAttribute('viewBox', focusBox);
  }
  document.body.classList.toggle('is-brain-focused', Boolean(focusBox));

  renderDetails();
}

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
    elements.selectedPathLabel.textContent = nodeId === 'root' ? 'Départ sélectionné' : `Noeud sélectionné: ${getNode(nodeId)?.san ?? nodeId}`;
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

function formatSourceList(sources) {
  if (!sources.length) {
    return '-';
  }
  if (sources.length <= 4) {
    return sources.join(' · ');
  }
  return `${sources.slice(0, 3).join(' · ')} · +${sources.length - 3} lignes`;
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
    empty.textContent = node.terminal ? 'Fin de ligne: aucune suite légale.' : 'Fin du livre PGN pour cette branche.';
    elements.choiceList.append(empty);
    return;
  }

  for (const edge of outgoing) {
    const child = getNode(edge.to);
    const detail = edge.isCompressed
      ? `${edge.collapsedPlyCount} coups: ${edge.sequenceLabel}`
      : edge.comments[0] ?? child?.comments[0] ?? 'Suite sans commentaire';
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

// Case du roi en échec (le camp au trait), ou null. Marche pour les deux couleurs.
function kingInCheckSquare(fen) {
  try {
    const probe = new Chess(fen);
    if (!probe.isCheck()) {
      return null;
    }
    const turn = probe.turn();
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
  } catch {
    /* FEN invalide : pas de surbrillance d'échec */
  }
  return null;
}

// Case du roi maté (uniquement si la position est un échec et mat), pour l'animation
// de fin de partie : le roi vaincu se renverse. Renvoie null si pas de mat.
function matedKingSquare(fen) {
  try {
    const probe = new Chess(fen);
    if (!probe.isCheckmate()) {
      return null;
    }
    const turn = probe.turn(); // le camp maté est celui au trait
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
  } catch {
    /* FEN invalide : pas d'animation de mat */
  }
  return null;
}

// R (boutique) — Cases des pièces blanches attaquées par les Noirs (menaces),
// affichées seulement quand c'est au joueur de jouer.
function threatenedWhiteSquares(fen) {
  const set = new Set();
  try {
    const probe = new Chess(fen);
    if (probe.turn() !== 'w') {
      return set;
    }
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.color === 'w' && probe.isAttacked(cell.square, 'b')) {
          set.add(cell.square);
        }
      }
    }
  } catch {
    /* FEN invalide : pas de menaces */
  }
  return set;
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
  const isGameNode =
    node.id === 'game' || node.id === 'cinematic' || node.id === 'free-review';
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
  if (skipNextMoveAnim) {
    skipNextMoveAnim = false; // glisser-déposer : la pièce est déjà à destination
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

function squareCenter(square) {
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return {
    x: ((fileIndex + 0.5) / 8) * 100,
    y: ((8 - rank + 0.5) / 8) * 100
  };
}

function renderBoardArrows(container, arrows) {
  if (!arrows.length) {
    return;
  }

  const svg = createSvgElement('svg', {
    class: 'board-arrow-layer',
    viewBox: '0 0 100 100',
    'aria-hidden': 'true'
  });

  arrows.forEach((arrow) => {
    const start = squareCenter(arrow.from);
    const end = squareCenter(arrow.to);
    const d = buildBoardArrowPath(start, end);
    if (!d) {
      return;
    }
    const arrowPath = createSvgElement('path', {
      class: 'board-opening-arrow',
      d
    });
    svg.append(arrowPath);
  });

  container.append(svg);
}

function buildBoardArrowPath(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return '';
  }

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const trimStart = Math.min(5.4, length * 0.36);
  const trimEnd = Math.min(1.8, length * 0.12);
  const tip = {
    x: end.x - ux * trimEnd,
    y: end.y - uy * trimEnd
  };
  const tail = {
    x: start.x + ux * trimStart,
    y: start.y + uy * trimStart
  };
  const visibleLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
  const headLength = clamp(visibleLength * 0.34, 4.8, 7.4);
  const shaftWidth = clamp(visibleLength * 0.12, 2.1, 3.0);
  const headWidth = shaftWidth * 2.05;
  const headBase = {
    x: tip.x - ux * headLength,
    y: tip.y - uy * headLength
  };
  const shaftHalf = shaftWidth / 2;
  const headHalf = headWidth / 2;
  const points = [
    [tail.x + nx * shaftHalf, tail.y + ny * shaftHalf],
    [headBase.x + nx * shaftHalf, headBase.y + ny * shaftHalf],
    [headBase.x + nx * headHalf, headBase.y + ny * headHalf],
    [tip.x, tip.y],
    [headBase.x - nx * headHalf, headBase.y - ny * headHalf],
    [headBase.x - nx * shaftHalf, headBase.y - ny * shaftHalf],
    [tail.x - nx * shaftHalf, tail.y - ny * shaftHalf]
  ];

  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
    .concat(' Z');
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
      .filter(
        (edge) => edge.uci.slice(0, 2) === square && advNextSanLeadsToWonLine(edge.san)
      )
      .map((edge) => edge.uci.slice(2, 4))
  );
}

function getBoardSquareLabel(squareName, piece, isTarget) {
  const pieceLabel = piece
    ? `${piece === piece.toUpperCase() ? 'pièce blanche' : 'pièce noire'} ${piece.toUpperCase()}`
    : 'case vide';
  return isTarget ? `${squareName}, destination légale` : `${squareName}, ${pieceLabel}`;
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

  const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.board-square');
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
  elements.viewModeButton.textContent =
    state.viewMode === 'human' ? 'Vue cerveau' : 'Vue joueur';
  elements.viewModeButton.setAttribute(
    'aria-label',
    state.viewMode === 'human'
      ? 'Basculer vers la vue cerveau'
      : 'Basculer vers la vue joueur'
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
    btn.setAttribute('aria-label',
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
  const board   = document.querySelector('#boardPreview');
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
    caption.textContent = isMate ? '⚔️ Trouve l\'échec et mat' : '⚡ Phase libre';
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

function fenPositionKey(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
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
      ? "Mode exploration: teste les lignes ou sors du livre sans perdre de vie."
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
    takebackLocked: false,   // verrou après un retour arrière « dernière chance »
    gameRecorded: false,     // M : partie déjà ajoutée à l'historique
    replayWonLine: false,    // N : le joueur a choisi de rejouer une ligne gagnée
    revealLegalDots: false,  // Q : cases légales révélées (Normal, après 5 s / erreur)
    finalMateLives: 0,       // S : retours « dernière chance » en phase finale du mat
    mateExpected: null,      // distance au mat attendue (mat en X) pendant la conversion
    clock: makeInitialClock(), // U : pendule des deux camps (null si sans horloge)
    premove: null,           // T : { from, to } armé pendant la réflexion adverse
    premoveSelect: null,     // T : case source sélectionnée pour armer le prémouvement
    revision: null,          // Révision : { phase: replay|question|feedback|done, step, answerUci }
    influence: null,         // Influence : { selectedUci, lineSans?, lineIndex? } — revue ‹ › + choix
    influencePending: false, // Influence : ouverture auto programmée (anti-flash du carton)
    influenceDone: false,    // Influence : phase close → CTA finaux de défaite
    defeatCinematicPending: false, // Punition : suite en cours de construction/lecture
    skipDefeatCinematic: false     // ⏩ demandé avant que la suite soit prête
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

function normalizeSanForCompare(san) {
  return String(san ?? '')
    .replace(/[!?]+$/g, '')
    .replace(/[+#]+$/g, '')
    .trim();
}

// N — Lignes d'ouverture déjà gagnées contre un boss (suite complète de SAN).
// Sert à forcer la variété : Stockfish évite ces lignes, le joueur les voit badgées.
function advWonBossLines() {
  return (state.adventure?.games || [])
    .filter(
      (g) =>
        g.result === 'won' &&
        g.kind === 'boss' &&
        Array.isArray(g.lineSans) &&
        g.lineSans.length
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
    (candidate) =>
      candidate.uci === uci || normalizeSanForCompare(candidate.san) === san
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
    const sourceText = hint.sources.length
      ? ` (${formatSourceList(hint.sources)})`
      : '';
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
      const weighted = Math.max(0, edge.probability + advBlackChoiceWeight(branchFen, edge.uci) / 100);
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

function getMoveText(move) {
  const parsedMoveNumber = Number(move.before?.split(/\s+/)[5] ?? 1);
  const moveNumber = Number.isFinite(parsedMoveNumber) ? parsedMoveNumber : 1;
  const prefix = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
  return `${prefix} ${move.san}`;
}

function formatEvalDelta(deltaCp) {
  if (!Number.isFinite(deltaCp)) {
    return '-';
  }
  return `${deltaCp >= 0 ? '+' : ''}${(deltaCp / 100).toFixed(2)}`;
}

// L — Verdicts type Lichess (sur les coups BLANCS, ceux du joueur), selon la
// perte d'évaluation par rapport au meilleur coup.
const MOVE_VERDICTS = {
  brilliant: { label: 'Brillant', short: '✦', cls: 'brilliant' },
  good: { label: 'Bon', short: '✓', cls: 'good' },
  inaccuracy: { label: 'Imprécision', short: '?!', cls: 'inaccuracy' },
  mistake: { label: 'Erreur', short: '?', cls: 'mistake' },
  blunder: { label: 'Gaffe', short: '??', cls: 'blunder' },
  book: { label: 'Livre', short: '📖', cls: 'book' }
};
const MOVE_VERDICT_LOSS = { inaccuracy: 50, mistake: 100, blunder: 200 };
const MOVE_BRILLIANT_GAIN = 200; // gain d'éval (cp) pour un coup « brillant »
const MOVE_BRILLIANT_MIN_CP = 300; // position nettement gagnante après le coup

function advMoveVerdict(entry) {
  if (!entry || entry.color !== 'w') {
    return null;
  }
  if (entry.phase === 'opening') {
    return { key: 'book', ...MOVE_VERDICTS.book };
  }
  if (entry.phase !== 'free') {
    return null; // suite Stockfish / variantes d'analyse : pas de verdict joueur
  }
  if (!Number.isFinite(entry.beforeEvalCp) || !Number.isFinite(entry.afterEvalCp)) {
    return null;
  }
  const before = entry.beforeEvalCp;
  const after = entry.afterEvalCp;
  // Coup brillant : ton coup crée un mat forcé, ou gagne décisivement (gros gain
  // d'éval vers une position nettement gagnante).
  const createsMate = isMateScore(after) && after > 0 && !(isMateScore(before) && before > 0);
  const decisiveGain = after - before >= MOVE_BRILLIANT_GAIN && after >= MOVE_BRILLIANT_MIN_CP;
  if (createsMate || decisiveGain) {
    return { key: 'brilliant', loss: 0, ...MOVE_VERDICTS.brilliant };
  }
  const loss = before - after; // perte d'éval côté blanc
  let key = 'good';
  if (loss >= MOVE_VERDICT_LOSS.blunder) {
    key = 'blunder';
  } else if (loss >= MOVE_VERDICT_LOSS.mistake) {
    key = 'mistake';
  } else if (loss >= MOVE_VERDICT_LOSS.inaccuracy) {
    key = 'inaccuracy';
  }
  return { key, loss, ...MOVE_VERDICTS[key] };
}

// Meilleur coup qui était disponible avant ce coup (1er coup de la PV du parent).
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

  const delta = entry.afterEvalCp - entry.beforeEvalCp;
  const evalText = `Éval ${formatEval(entry.beforeEvalCp)} → ${formatEval(entry.afterEvalCp)} (${formatEvalDelta(delta)}).`;
  let verdict;
  if (entry.phase === 'opening') {
    verdict =
      entry.color === 'w'
        ? "Coup du livre blanc: la partie reste dans l'arbre d'ouverture attendu."
        : "Réponse du livre adverse: l'adversaire suit encore une branche préparée.";
  } else if (entry.phase === 'engine-line') {
    verdict =
      entry.color === 'w'
        ? 'Suite Stockfish côté blanc: la ligne forcée montre pourquoi la position reste difficile à sauver.'
        : 'Suite Stockfish côté noir: la punition se précise dans la variante calculée.';
  } else if (entry.color === 'w') {
    if (delta >= 45) {
      verdict = 'Très bon coup libre: tu améliores nettement la position.';
    } else if (delta >= 12) {
      verdict = 'Bon coup libre: la position progresse sans prendre de risque majeur.';
    } else if (delta > -15) {
      verdict = 'Coup stable: la position reste dans la même zone.';
    } else if (delta > -55) {
      verdict = 'Petite concession: la position baisse, mais reste encore jouable.';
    } else {
      verdict = 'Coup coûteux: Stockfish voit une chute claire de la position blanche.';
    }
  } else if (delta <= -45) {
    verdict = 'Réponse noire forte: Stockfish creuse le déficit côté blanc.';
  } else if (delta <= -12) {
    verdict = 'Réponse noire utile: la pression augmente contre les Blancs.';
  } else if (delta < 15) {
    verdict = 'Réponse noire neutre: l’équilibre d’évaluation bouge peu.';
  } else {
    verdict = 'Stockfish relâche un peu: l’évaluation remonte pour les Blancs.';
  }

  const thresholdText =
    entry.phase === 'free' && entry.color === 'w' && entry.afterEvalCp < state.survivalLimitCp
      ? ` Le coup passe sous le seuil ${formatEval(state.survivalLimitCp)}.`
      : '';
  const statusText = entry.status === 'returned'
    ? ' Retour consommé: cette tentative a été annulée sur l’échiquier de partie.'
    : entry.status === 'losing'
      ? ' Coup de défaite immédiate: le seuil de survie est franchi.'
      : entry.status === 'evaluating'
        ? ' Évaluation détaillée en cours: le score affiché est provisoire.'
      : '';
  const pvText =
    entry.phase !== 'opening' && entry.pv ? ` Ligne Stockfish: ${entry.pv}.` : '';
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
  const humanEvalText = humanEval
    ? ` Lecture humaine: ${humanEval.sentence}${adviceText}`
    : '';
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
    move.color === 'w' &&
    Number.isFinite(evaluation.cpWhite) &&
    (phase === 'free' || phase === 'opening')
  ) {
    advAwardPlayerXp(evaluation.cpWhite - beforeEvalCp);
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
    state.game &&
      state.game.status !== 'playing' &&
      state.game.freeReviewMoves.length
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
    state.nodesByFen.get(chess.fen()) ??
    state.nodesByPositionKey.get(fenPositionKey(chess.fen()));

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

  if (game.chess.turn() === 'b') {
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
  finishGame(
    'won',
    message ?? `Échec et mat: campagne terminée au niveau ${game.level}.`
  );
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

// Libellé court du type de nulle (pat, répétition, matériel insuffisant…) pour les messages.
function drawKindLabel(chess) {
  return chess?.isStalemate?.() ? 'Pat' : 'Partie nulle';
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
      await submitExplorationMove(input, "Sortie du livre explorée: l'adversaire passe au calcul libre.");
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
      const blewIt = newMate === null || newMate > expectedAfter + 2;
      if (blewIt) {
        if ((state.game.finalMateLives || 0) > 0) {
          state.game.finalMateLives -= 1;
          revertLastPlayerMove();
          const gotTxt = newMate === null ? 'le mat forcé s’échappe' : `mat en ${newMate}`;
          // Les vies restantes sont affichées par l'indicateur de cœurs.
          state.game.message = `❌ ${gotTxt} (attendu : mat en ${expectedAfter}). Réessaie !`;
          renderGamePanel();
          renderGameDetails();
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
      ? pickWeightedCandidate(
          buildOpponentBookCandidates(blackBookEdges)
        )
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
        ? "Les Noirs cassent le livre et passent aux coups Stockfish."
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

  const profile = getStockfishLevelProfile();
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
    finishGame('lost', `${message} Plus aucun retour disponible.`, game.failureFen, game.failureEvaluation);
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
const DEFEAT_LINE_MAX_PLIES = 30;

// Construit la suite de défaite en UCI : on consomme d'abord la PV Stockfish
// (sans coût moteur), puis on prolonge avec les meilleurs coups jusqu'à l'échec
// et mat (ou le plafond). On ne s'arrête jamais avant la fin réelle de la ligne.
async function buildDefeatLineUci(fen, evaluation) {
  const chess = new Chess(fen);
  const line = [];
  for (const uci of evaluation.pvUci || []) {
    if (line.length >= DEFEAT_LINE_MAX_PLIES) {
      return line;
    }
    if (!playUciOnChess(chess, uci)) {
      break;
    }
    line.push(uci);
    if (chess.isGameOver()) {
      return line; // la PV mène déjà au mat / à la nulle
    }
  }
  if (line.length >= DEFEAT_LINE_MAX_PLIES || chess.isGameOver()) {
    return line;
  }
  // La PV ne va pas jusqu'au bout : on prolonge avec Stockfish jusqu'au mat réel
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
    }
  } catch {
    /* Moteur indisponible : on garde la PV récupérée. */
  }
  return line;
}

async function startDeficitCinematic(fen, evaluation, defeatComment = '') {
  clearGameCinematic();
  const game = state.game;
  if (!game) {
    return;
  }
  const line = await buildDefeatLineUci(fen, evaluation);
  if (state.game !== game) {
    return; // partie changée pendant le calcul de la prolongation
  }
  // B : on enregistre toute la suite dans l'historique (rejeu au ralenti) et on
  // réintègre ces coups auto dans la partie sauvegardée (revue d'historique).
  if (line.length) {
    appendDefeatLineReview(fen, evaluation, line);
    advRefreshRecordedMoves(game);
  }
  if (!line.length) {
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
    moves: line,
    index: 0,
    lastMove: null
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
      clearGameCinematic();
      if (state.game) {
        state.game.defeatCinematicPending = false; // punition terminée → phase suivante
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
      recordAutoMove(bmove, `Stockfish ${formatStockfishLevel(profile)}`, bBeforeFen, bBeforeEvalCp, evalNow.cpWhite);
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

function projectRawPathToView(view, rawPath) {
  const rawEdgeIds = new Set(rawPath.edgeIds);
  const rawNodeIds = new Set(rawPath.nodeIds);
  const highlightedEdges = [];
  const highlightedNodes = new Set(['root']);

  for (const edge of view.edges) {
    if (!edge.pathEdgeIds.some((edgeId) => rawEdgeIds.has(edgeId))) {
      continue;
    }
    highlightedEdges.push(edge.id);
    highlightedNodes.add(edge.from);
    highlightedNodes.add(edge.to);
  }

  for (const nodeId of rawNodeIds) {
    if (view.nodesById.has(nodeId)) {
      highlightedNodes.add(nodeId);
    }
  }

  return {
    edgeIds: highlightedEdges,
    nodeIds: [...highlightedNodes]
  };
}

function findCurrentViewSegment(view, currentId, rawPath) {
  const lastRawEdgeId = rawPath.edgeIds[rawPath.edgeIds.length - 1];
  return (
    view.edges.find((edge) => edge.pathEdgeIds.includes(lastRawEdgeId)) ??
    view.edges.find((edge) => edge.pathNodeIds.includes(currentId)) ??
    null
  );
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
  const currentLabel = currentId === 'root' ? 'départ' : currentNode?.san ?? currentId;
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

// Reconstruit la position après `game.historyView` demi-coups (rejoués depuis le départ).
function makeHistoryBoardNode(game) {
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
    return "Position de livre: choisis un coup blanc attendu pour rester dans le répertoire.";
  }

  if (isExplorationMode()) {
    return "Position libre: teste une idée, Stockfish répondra sans pénalité.";
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
  elements.nodeTitle.textContent =
    reviewEntry
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
  elements.nodeSubtitle.textContent =
    reviewEntry
      ? `${reviewEntry.text} · ${reviewEntry.label} · ${reviewEntry.index + 1}/${game.freeReviewMoves.length}`
      : game.phase === 'opening'
      ? "Reste dans les coups d'ouverture attendus."
      : isExplorationMode()
        ? 'Exploration libre: teste la position contre Stockfish.'
        : isMateObjective(game)
          ? `Objectif final: mater sans passer sous ${formatEval(state.survivalLimitCp)}.`
          : `Survie Stockfish: ${game.freeRemaining}/${game.objective.target} coups complets restants.`;
  elements.nodeEval.textContent = reviewEntry ? formatEval(reviewEntry.afterEvalCp) : formatEval(game.currentEvalCp);
  elements.nodeFuture.textContent =
    reviewEntry
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
  elements.gameTurn.textContent = sideLabel(reviewEntry ? reviewEntry.afterFen.split(/\s+/)[1] : game.chess.turn());
  elements.gameMessage.textContent = formatGamePanelMessage(game, reviewEntry);
  const reviewPlayable = isPostGameReviewPlayable();
  elements.playMoveButton.disabled =
    game.locked || !(reviewPlayable || (game.status === 'playing' && game.chess.turn() === 'w'));
  elements.moveInput.disabled = elements.playMoveButton.disabled;
  const inputSide = reviewPlayable
    ? sideLabel(reviewEntry.afterFen.split(/\s+/)[1])
    : 'Blancs';
  elements.moveInputLabel.textContent = reviewPlayable ? `Coup des ${inputSide}` : 'Coup blanc';
  elements.moveInput.placeholder = reviewPlayable
    ? `${inputSide}: SAN ou UCI`
    : 'ex. Nf3 ou g1f3';
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

function formatGamePhase(game) {
  if (game.mode === 'exploration') {
    return game.phase === 'opening' ? 'Exploration livre' : 'Exploration libre';
  }
  return game.phase === 'opening' ? 'Ouverture' : 'Survie libre';
}

function formatFreeRemaining(game) {
  if (game.mode === 'exploration') {
    return 'libre';
  }
  if (game.phase !== 'free') {
    return isMateObjective(game) ? "objectif mat" : `objectif ${formatSurvivalTarget(game)}`;
  }
  return isMateObjective(game)
    ? "jusqu'au mat"
    : `${game.freeRemaining}/${game.objective.target}`;
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
    : state.game?.moveLog ?? [];
  for (const item of moves) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.label)}</span>`;
    elements.moveLogList.append(row);
  }
}

// --- Vue joueur aventure : barre d'éval + journal compact du rail ---

/** Convertit une éval (centipions, côté blanc) en pourcentage [0..100] pour la barre. */
function evalToBarPct(cpWhite) {
  const v = Math.max(-1200, Math.min(1200, Number(cpWhite) || 0));
  return Math.round((Math.tanh(v / 400) + 1) * 50);
}

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
  const reviewReady =
    hasPostGameFreeReview() && (!inAdventure || game.freeReviewMoves.length > 1);
  if (!reviewReady) {
    host.hidden = true;
    return;
  }

  host.hidden = false;
  ensureReviewTree(game);
  const activeEntry = getActiveFreeReviewEntry() ?? game.freeReviewMoves[game.freeReviewMoves.length - 1];
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
      free.textContent = 'Exploration: les coups du livre sont proposés, mais tu peux aussi jouer directement sur l’échiquier pour sortir de la ligne.';
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
const ADV_ACT2_UNLOCK = 0.5;
const ADV_LESSONS = [
  { id: 'l1', target: 0.25, title: 'Premiers neurones', icon: '🌱' },
  { id: 'l2', target: 0.5, title: 'Réseau en éveil', icon: '✨' },
  { id: 'l3', target: 0.75, title: 'Cortex dense', icon: '🔆' },
  { id: 'l4', target: 1, title: 'Cerveau complet', icon: '🧠' }
];
const ADV_XP_PER_SYNAPSE = 8;
const ADV_XP_BOOK_MOVE = 4;
const ADV_XP_LESSON = 50;
let advSurgeTimer = null;

function advTotalSynapseNodes() {
  return state.data ? state.data.nodes.filter((node) => node.id !== 'root').length : 0;
}

function advCoverage() {
  const total = advTotalSynapseNodes();
  return total ? Math.min(1, state.adventure.nodes.size / total) : 0;
}

function advCoveragePct() {
  return Math.round(advCoverage() * 100);
}

// === Vies globales (méta) : nombre de défaites possibles contre les bots ========
const ADV_LIVES_UNLOCK_COVERAGE = 0.5; // 50 % d'apprentissage débloque les vies

function advTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function advGlobalLives() {
  return Math.max(0, Number(state.adventure?.globalLives) || 0);
}

function advLivesUnlocked() {
  return Boolean(state.adventure?.livesUnlocked);
}

function advCanFightBots() {
  return advGlobalLives() > 0;
}

// Déblocage à 50 % + reset quotidien. À appeler à l'ouverture de la carte / après
// apprentissage. Renvoie true si l'état a changé.
function advSyncGlobalLives() {
  const adv = state.adventure;
  if (!adv) {
    return false;
  }
  let changed = false;
  if (!adv.livesUnlocked && advCoverage() >= ADV_LIVES_UNLOCK_COVERAGE) {
    adv.livesUnlocked = true;
    adv.globalLives = ADV_GLOBAL_LIVES_MAX;
    adv.livesDate = advTodayKey();
    changed = true;
    showAdventureToast({
      icon: '❤️',
      title: '3 vies débloquées !',
      text: '50 % du cortex : tu peux affronter les bots. 3 défaites possibles.',
      kind: 'boss'
    });
  }
  if (adv.livesUnlocked && adv.livesDate !== advTodayKey()) {
    adv.livesDate = advTodayKey();
    if ((adv.globalLives || 0) < ADV_GLOBAL_LIVES_MAX) {
      adv.globalLives = ADV_GLOBAL_LIVES_MAX;
      showAdventureToast({
        icon: '🌅',
        title: 'Vies rechargées',
        text: 'Nouveau jour : 3 défaites à nouveau possibles contre les bots.',
        kind: null
      });
    }
    changed = true;
  }
  if (changed) {
    saveAdventure();
  }
  return changed;
}

function advConsumeGlobalLife() {
  const adv = state.adventure;
  if (!adv || !adv.livesUnlocked) {
    return;
  }
  adv.globalLives = Math.max(0, (adv.globalLives || 0) - 1);
  saveAdventure();
}

// Récupération des vies par l'apprentissage (révision réussie / leçon terminée).
function advRefillGlobalLivesFromLearning() {
  const adv = state.adventure;
  if (!adv) {
    return;
  }
  advSyncGlobalLives(); // peut débloquer si on vient de franchir 50 %
  if (!adv.livesUnlocked || (adv.globalLives || 0) >= ADV_GLOBAL_LIVES_MAX) {
    return;
  }
  adv.globalLives = ADV_GLOBAL_LIVES_MAX;
  adv.livesDate = advTodayKey();
  saveAdventure();
  showAdventureToast({
    icon: '❤️',
    title: 'Vies rechargées',
    text: 'Révision réussie : 3 défaites à nouveau possibles.',
    kind: 'boss'
  });
}

// Message quand on tente d'affronter un bot sans vie.
function advNotifyNoLives() {
  showAdventureToast({
    icon: '💔',
    title: 'Plus de vies',
    text: advLivesUnlocked()
      ? 'Révise une ligne (Illuminer le cerveau) ou reviens demain pour 3 nouvelles défaites.'
      : 'Atteins 50 % du cortex (Illuminer le cerveau) pour débloquer 3 vies.',
    kind: null
  });
}

// Aides actives : selon la difficulté en Aventure, complètes ailleurs (Atelier).
function advAids() {
  if (state.screen !== 'adventure') {
    return FULL_AIDS;
  }
  const difficulty = advCurrentDifficulty();
  // Q : en Normal, les cases légales sont masquées mais révélées après 5 s ou
  // une erreur (state.game.revealLegalDots). En Difficile : jamais.
  if (difficulty.legalDotsRevealable && state.game?.revealLegalDots) {
    return { ...difficulty.aids, legalDots: true };
  }
  return difficulty.aids;
}

// Q — La difficulté courante masque-t-elle les cases légales de façon révélable ?
function legalDotsRevealable() {
  return state.screen === 'adventure' && Boolean(advCurrentDifficulty()?.legalDotsRevealable);
}

let legalDotsTimer = null;

// Réinitialise la révélation des cases légales pour le tour courant (masquées,
// minuteur 5 s relancé au prochain rendu).
function resetLegalDotsReveal() {
  if (legalDotsTimer) {
    clearTimeout(legalDotsTimer);
    legalDotsTimer = null;
  }
  if (state.game) {
    state.game.revealLegalDots = false;
  }
}

// Révèle immédiatement les cases légales (déclenché par une erreur du joueur).
function revealLegalDotsNow() {
  if (legalDotsTimer) {
    clearTimeout(legalDotsTimer);
    legalDotsTimer = null;
  }
  if (state.game && legalDotsRevealable() && !state.game.revealLegalDots) {
    state.game.revealLegalDots = true;
    renderGameDetails();
  }
}

// Arme le minuteur 5 s de révélation si c'est au joueur de jouer (appelé au rendu
// du plateau interactif). Les gardes évitent de relancer le minuteur à chaque rendu.
function maybeArmLegalDotsTimer() {
  if (
    !legalDotsRevealable() ||
    !state.game ||
    state.game.revealLegalDots ||
    legalDotsTimer ||
    state.game.status !== 'playing' ||
    state.game.locked ||
    state.game.historyView != null ||
    state.game.chess.turn() !== 'w'
  ) {
    return;
  }
  legalDotsTimer = setTimeout(() => {
    legalDotsTimer = null;
    if (state.game && legalDotsRevealable() && state.game.status === 'playing') {
      state.game.revealLegalDots = true;
      renderGameDetails();
    }
  }, 5000);
}

// Classes sur <body> pour piloter l'affichage (éval, touches, retour arrière) en CSS.
function applyDifficultyClasses() {
  const aids = advAids();
  document.body.classList.toggle('aid-no-eval', !aids.evaluation);
  document.body.classList.toggle('aid-no-choices', !aids.moveChoices);
  document.body.classList.toggle('aid-takeback', Boolean(aids.takeback));
}

function setAdvDifficulty(id) {
  if (!state.adventure || !ADV_DIFFICULTIES.some((d) => d.id === id)) {
    return;
  }
  state.adventure.difficulty = id;
  saveAdventure();
  applyDifficultyClasses();
  if (state.game) {
    renderGameDetails();
  }
  renderAdventureMap();
}

// Retour arrière (très facile) : annule ton dernier coup complet (le tien + la réponse)
// pour rejouer la position. Disponible seulement à ton tour, hors verrou.
function advTakeBack() {
  const game = state.game;
  if (!game || !advAids().takeback || game.takebackLocked || game.status !== 'playing' || game.locked) {
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

// Sélecteur de difficulté (carte d'aventure) : 4 niveaux, le courant en surbrillance.
function renderAdvDifficulty() {
  const host = document.querySelector('#advDifficultyButtons');
  if (!host) {
    return;
  }
  const current = advCurrentDifficulty();
  host.replaceChildren();
  for (const diff of ADV_DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${diff.id === current.id ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', diff.id === current.id ? 'true' : 'false');
    btn.innerHTML =
      `<span class="adv-diff-ico" aria-hidden="true">${diff.icon}</span>` +
      `<span class="adv-diff-label">${escapeHtml(diff.label)}</span>`;
    btn.addEventListener('click', () => setAdvDifficulty(diff.id));
    host.append(btn);
  }
  const desc = document.querySelector('#advDifficultyDesc');
  if (desc) {
    desc.textContent = current.desc;
  }
}

// U — Sélecteur de cadence (carte) : sans horloge / bullet / blitz / rapide.
function renderAdvTimeControl() {
  const host = document.querySelector('#advTimeButtons');
  if (!host) {
    return;
  }
  const currentId = state.adventure?.timeControl || DEFAULT_TIME_CONTROL;
  host.replaceChildren();
  for (const tc of TIME_CONTROLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${tc.id === currentId ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', tc.id === currentId ? 'true' : 'false');
    btn.innerHTML =
      `<span class="adv-diff-ico" aria-hidden="true">${tc.icon}</span>` +
      `<span class="adv-diff-label">${escapeHtml(tc.label)}</span>`;
    btn.addEventListener('click', () => setAdvTimeControl(tc.id));
    host.append(btn);
  }
  // Champ de cadence personnalisée : synchronisé avec la valeur stockée.
  const input = document.querySelector('#advTimeCustomInput');
  if (input && document.activeElement !== input) {
    input.value = String(state.adventure?.customClockMinutes ?? 10);
  }
  document.querySelector('.adv-time-custom')?.classList.toggle('is-active', currentId === 'custom');

  const desc = document.querySelector('#advTimeDesc');
  if (desc) {
    const tc = getTimeControlConfig(currentId);
    const minutes = tc.baseMs / 60000;
    const minutesLabel = Number.isInteger(minutes) ? minutes : minutes.toFixed(1);
    desc.textContent =
      tc.id === 'off'
        ? 'Pas de pression du temps : joue à ton rythme.'
        : `${minutesLabel} min par camp · Stockfish ~${Math.round(
            tc.meanMs / 1000
          )} s/coup (σ ${Math.round((tc.meanMs * 2) / 1000)} s). Appliqué à la prochaine partie.`;
  }
}

function setAdvTimeControl(id) {
  if (!state.adventure || !TIME_CONTROLS.some((t) => t.id === id)) {
    return;
  }
  state.adventure.timeControl = id;
  saveAdventure();
  renderAdvTimeControl();
}

// U — Règle la cadence personnalisée (minutes par camp) et l'active.
function setAdvCustomClock(minutesRaw) {
  if (!state.adventure) {
    return;
  }
  const minutes = clamp(Number(minutesRaw) || 10, 0.5, 180);
  state.adventure.customClockMinutes = minutes;
  state.adventure.timeControl = 'custom';
  saveAdventure();
  renderAdvTimeControl();
}

// Réglage : activer/désactiver l'influence des lignes d'ouverture (surpondération)
// + choix du mode (nœud aléatoire vs nœuds de la partie jouée).
function renderAdvInfluenceSetting() {
  const btn = document.querySelector('#advInfluenceToggle');
  if (btn) {
    const enabled = advInfluenceEnabled();
    btn.textContent = enabled ? 'Activé' : 'Désactivé';
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
  const host = document.querySelector('#advInfluenceModeButtons');
  if (host) {
    const current = advInfluenceMode();
    host.replaceChildren();
    for (const opt of [
      { id: 'random', icon: '🎲', label: 'Nœud aléatoire' },
      { id: 'game', icon: '📖', label: 'Partie jouée' }
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `adv-diff-btn${opt.id === current ? ' is-active' : ''}`;
      b.setAttribute('aria-pressed', opt.id === current ? 'true' : 'false');
      b.innerHTML =
        `<span class="adv-diff-ico" aria-hidden="true">${opt.icon}</span>` +
        `<span class="adv-diff-label">${escapeHtml(opt.label)}</span>`;
      b.addEventListener('click', () => setAdvInfluenceMode(opt.id));
      host.append(b);
    }
  }
  const desc = document.querySelector('#advInfluenceModeDesc');
  if (desc) {
    desc.textContent =
      advInfluenceMode() === 'random'
        ? 'Après une défaite : UN embranchement du livre est tiré au hasard, tu rejoues sa ligne avec ‹ › et tu pousses un coup des Noirs.'
        : 'Après une défaite : tu revois ta partie avec ‹ › et tu pousses un coup des Noirs sur un embranchement réellement traversé.';
  }
}

function setAdvInfluenceMode(mode) {
  if (!state.adventure) {
    return;
  }
  state.adventure.influenceMode = mode === 'game' ? 'game' : 'random';
  saveAdventure();
  renderAdvInfluenceSetting();
}

function advToggleInfluenceFeature() {
  if (!state.adventure) {
    return;
  }
  state.adventure.influenceDisabled = !state.adventure.influenceDisabled;
  saveAdventure();
  renderAdvInfluenceSetting();
  renderAdvShop();
  if (state.adventure.influenceDisabled && state.game?.influence) {
    state.game.influence = null; // si désactivé pendant le mode influence
    advHistoryGoto(null);
  }
}

// === Vies + « mat en X » ========================================================
// Indicateur de vies unifié (cœurs) + réglage du moment où la cinématique de
// victoire rend la main au joueur pour conclure le mat.
function advMateHandover() {
  const v = Number(state.adventure?.mateHandover);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MATE_HANDOVER;
}

// Distance au mat affichée : l'attente fixée (phase joueur) ou le score moteur
// pendant la conversion automatique.
function advCurrentMateInX(game) {
  if (!game) {
    return null;
  }
  if (Number.isFinite(game.mateExpected)) {
    return game.mateExpected;
  }
  if (isMateScore(game.currentEvalCp) && game.currentEvalCp > 0) {
    return mateMovesFromCp(game.currentEvalCp);
  }
  return null;
}

// État de l'indicateur de vies : ouverture (game.lives), phase de mat
// (game.finalMateLives), ou mort subite (phase libre sans mat).
function advLivesState(game) {
  const mateX = advCurrentMateInX(game);
  const inMate = mateX != null || game.victoryCinematic || (game.finalMateLives || 0) > 0;
  if (inMate) {
    return {
      kind: 'mate',
      count: Math.max(0, game.finalMateLives || 0),
      max: 3,
      label: mateX != null ? `Mat en ${mateX}` : 'Conversion'
    };
  }
  if (game.phase === 'opening') {
    return { kind: 'opening', count: Math.max(0, game.lives), max: STARTING_LIVES, label: 'Ouverture' };
  }
  return { kind: 'sudden', count: 1, max: 1, label: 'Mort subite' };
}

function renderAdvLives() {
  const el = document.querySelector('#advLives');
  if (!el) {
    return;
  }
  const game = state.game;
  const show =
    state.screen === 'adventure' &&
    state.advViewMode === 'board' &&
    Boolean(game) &&
    !game.revision &&
    game.status === 'playing' &&
    !isExplorationMode();
  el.hidden = !show;
  if (!show) {
    return;
  }
  const st = advLivesState(game);
  el.dataset.kind = st.kind;
  el.replaceChildren();
  const hearts = document.createElement('div');
  hearts.className = 'adv-lives-hearts';
  if (st.kind === 'sudden') {
    const pip = document.createElement('span');
    pip.className = 'adv-life is-sudden';
    pip.textContent = '⚡';
    hearts.append(pip);
  } else {
    for (let i = 0; i < st.max; i += 1) {
      const h = document.createElement('span');
      h.className = `adv-life ${i < st.count ? 'is-full' : 'is-empty'}`;
      h.textContent = '♥';
      hearts.append(h);
    }
  }
  el.append(hearts);
  const cap = document.createElement('span');
  cap.className = 'adv-lives-cap';
  cap.textContent = st.label;
  el.append(cap);
}

function renderAdvMateHandover() {
  const host = document.querySelector('#advMateHandoverButtons');
  if (!host) {
    return;
  }
  const current = advMateHandover();
  host.replaceChildren();
  for (const opt of MATE_HANDOVER_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${opt.id === current ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', opt.id === current ? 'true' : 'false');
    btn.innerHTML = `<span class="adv-diff-label">${escapeHtml(opt.label)}</span>`;
    btn.addEventListener('click', () => setAdvMateHandover(opt.id));
    host.append(btn);
  }
  const desc = document.querySelector('#advMateHandoverDesc');
  if (desc) {
    desc.textContent =
      current >= 99
        ? 'La conversion te rend la main dès qu’un mat forcé est trouvé (tu joues toute la finale).'
        : `La conversion joue jusqu’au mat en ${current}, puis te laisse conclure.`;
  }
}

function setAdvMateHandover(id) {
  if (!state.adventure) {
    return;
  }
  state.adventure.mateHandover = id;
  saveAdventure();
  renderAdvMateHandover();
}

// === Boutique (rendu + achats) ===
function renderAdvShop() {
  if (!state.adventure) {
    return;
  }
  advSetText('#advShopCoins', String(advCoins()));

  // R — bascule « voir les menaces » (gratuite, débloquée après 3 boss).
  const unlocked = advThreatsUnlocked();
  const threatsBtn = document.querySelector('#advShopThreatsBtn');
  if (threatsBtn) {
    threatsBtn.disabled = !unlocked;
    threatsBtn.textContent = !unlocked
      ? `🔒 ${SHOP_THREATS_BOSS_UNLOCK} boss`
      : state.adventure.threatsEnabled
        ? 'Désactiver'
        : 'Activer';
    threatsBtn.classList.toggle('is-active', unlocked && Boolean(state.adventure.threatsEnabled));
  }
  const threatsDesc = document.querySelector('#advShopThreatsDesc');
  if (threatsDesc) {
    threatsDesc.textContent = unlocked
      ? 'Surligne en rouge tes pièces attaquées par les Noirs.'
      : `Débloqué après ${SHOP_THREATS_BOSS_UNLOCK} boss vaincus (actuel ${
          state.adventure.highestBoss || 0
        }).`;
  }

  // O — pondération des choix d'ouverture : la mise se fait en fin de défaite ;
  // la boutique n'affiche qu'un récap en lecture seule.
  const host = document.querySelector('#advShopLines');
  if (host) {
    renderAdvWeightRecap(host);
  }
}

let advCarouselIndex = 0;

function advToggleThreats() {
  if (!state.adventure || !advThreatsUnlocked()) {
    return;
  }
  state.adventure.threatsEnabled = !state.adventure.threatsEnabled;
  saveAdventure();
  renderAdvShop();
  renderGameDetails();
}

// Bouton « Annuler » (retour arrière) : actif seulement si l'aide est dispo et qu'un
// coup complet peut être repris.
function renderAdvTakeBack() {
  const btn = document.querySelector('#advTakeBack');
  if (!btn) {
    return;
  }
  const game = state.game;
  const canUndo = Boolean(
    advAids().takeback &&
      game &&
      !game.takebackLocked &&
      game.status === 'playing' &&
      !game.locked &&
      game.historyView == null &&
      game.chess.turn() === 'w' &&
      game.chess.history().length >= 2
  );
  btn.disabled = !canUndo;
}

// Pastille « niveau joueur » : le numéro + le cadre-jauge (progression vers le niveau
// suivant). Flash + toast quand le niveau monte.
let lastPlayerLevelShown = 0;
function renderAdvPlayerBadge() {
  const badge = document.querySelector('#advPlayerBadge');
  if (!badge) {
    return;
  }
  const prog = advPlayerProgress();
  const pct = clamp((prog.into / prog.span) * 100, 0, 100);
  badge.style.setProperty('--xp-pct', pct.toFixed(1));
  const lvlEl = document.querySelector('#advPlayerBadgeLevel');
  if (lvlEl) {
    lvlEl.textContent = String(prog.level);
  }
  badge.title = `Niveau joueur ${prog.level} · ${prog.xp} XP`;

  // En-tête du volet d'options rapides (même progression que la bulle).
  const ring = document.querySelector('#advQuickRing');
  if (ring) {
    ring.style.setProperty('--xp-pct', pct.toFixed(1));
  }
  const quickLvl = document.querySelector('#advQuickLevel');
  if (quickLvl) {
    quickLvl.textContent = String(prog.level);
  }
  const quickXp = document.querySelector('#advQuickXp');
  if (quickXp) {
    quickXp.textContent = `${prog.xp} XP`;
  }
  if (lastPlayerLevelShown && prog.level > lastPlayerLevelShown) {
    badge.classList.remove('is-levelup');
    void badge.offsetWidth; // relance l'animation
    badge.classList.add('is-levelup');
    showAdventureToast({
      icon: '⬆️',
      title: `Niveau joueur ${prog.level} !`,
      text: 'Tu montes en puissance.',
      kind: 'levelup'
    });
  }
  lastPlayerLevelShown = prog.level;
}

function advBossXp(level) {
  return 120 + level * 40;
}

function advAct2Unlocked() {
  return advCoverage() >= ADV_ACT2_UNLOCK;
}

// Un boss se maîtrise en 3 victoires d'affilée (3 étoiles).
const ADV_BOSS_STARS = 3;

// Étoiles « déjà acquises » (record permanent, conservé même après défaite).
function advBossRecord(level) {
  return clamp(Math.round(state.adventure?.bosses?.[level] || 0), 0, ADV_BOSS_STARS);
}

// Série de victoires en cours (remise à 0 à la défaite).
function advBossStreakCount(level) {
  return clamp(Math.round(state.adventure?.bossStreaks?.[level] || 0), 0, ADV_BOSS_STARS);
}

function advBossConquered(level) {
  return advBossRecord(level) >= ADV_BOSS_STARS;
}

// Le boss suivant s'ouvre dès une étoile (une victoire) sur le précédent.
function advBossUnlocked(level) {
  if (!advAct2Unlocked()) {
    return false;
  }
  if (level <= 1) {
    return true;
  }
  return advBossRecord(level - 1) >= 1;
}

// Prochain boss à travailler : le plus petit débloqué pas encore maîtrisé.
function advCurrentBossTarget() {
  for (let level = 1; level <= 10; level += 1) {
    if (advBossUnlocked(level) && !advBossConquered(level)) {
      return level;
    }
  }
  return 0;
}

// Étoiles d'un boss en deux couleurs : série en cours (or) + déjà acquises (cyan).
function advBossStarsMarkup(level) {
  const streak = advBossStreakCount(level);
  const record = advBossRecord(level);
  let html = '';
  for (let i = 1; i <= ADV_BOSS_STARS; i += 1) {
    if (i <= streak) {
      html += '<span class="adv-star is-streak">★</span>';
    } else if (i <= record) {
      html += '<span class="adv-star is-earned">★</span>';
    } else {
      html += '<span class="adv-star is-empty">☆</span>';
    }
  }
  return html;
}

function isAdventureRun() {
  return state.screen === 'adventure' && Boolean(state.advRun);
}

// Seuil de déficit toléré en aventure, fonction de la difficulté choisie.
// La difficulté la plus basse (N1) tolère jusqu'à -5 ; la plus haute (N10)
// n'autorise plus qu'un déficit de -1 avant la cinématique de défaite.
function advDeficitThresholdCp(level) {
  const safe = clamp(Math.round(Number(level) || 1), 1, 10);
  const easiestCp = -500; // -5 pions au niveau le plus facile
  const hardestCp = -100; // -1 pion au niveau le plus difficile
  const t = (safe - 1) / 9;
  return Math.round((easiestCp + (hardestCp - easiestCp) * t) / 10) * 10;
}

// Difficulté de la partie d'aventure courante (niveau du boss, sinon la force
// Stockfish active pour une leçon).
function advRunDifficultyLevel() {
  const run = state.advRun;
  if (!run) {
    return state.stockfishLevel;
  }
  return run.kind === 'boss' ? run.bossLevel : state.stockfishLevel;
}

function advRunDeficitThresholdCp() {
  return advDeficitThresholdCp(advRunDifficultyLevel());
}

function isAdventureMastered(id) {
  return state.screen === 'adventure' && Boolean(state.adventure?.nodes.has(id));
}

function isAdventureLesson() {
  return isAdventureRun() && state.advRun?.kind === 'lesson';
}

function isAdventureEdgeMastered(edge) {
  if (state.screen !== 'adventure' || !state.adventure || !edge) {
    return false;
  }
  if (edge.from && edge.from !== 'root' && !state.adventure.nodes.has(edge.from)) {
    return false;
  }
  const ids = edge.pathNodeIds?.length ? edge.pathNodeIds : [edge.to];
  return ids.every((id) => state.adventure.nodes.has(id));
}

function advAddXp(amount) {
  if (!amount || !state.adventure) {
    return;
  }
  const before = advBrainProgress().level;
  state.adventure.xp += amount;
  const after = advBrainProgress().level;
  if (after > before) {
    showAdventureToast({
      icon: '🧠',
      title: `Cerveau niveau ${after} !`,
      text: 'Nouveau palier neuronal atteint.',
      kind: 'levelup'
    });
  }
}

function triggerBrainSurge() {
  document.body.classList.remove('is-brain-surge');
  void document.body.offsetWidth;
  document.body.classList.add('is-brain-surge');
  clearTimeout(advSurgeTimer);
  advSurgeTimer = setTimeout(() => document.body.classList.remove('is-brain-surge'), 720);
}

function checkLessonMilestones() {
  const coverage = advCoverage();
  for (const lesson of ADV_LESSONS) {
    if (!state.adventure.lessons[lesson.id] && coverage + 1e-9 >= lesson.target) {
      state.adventure.lessons[lesson.id] = 3;
      advAddXp(ADV_XP_LESSON);
      showAdventureToast({
        icon: lesson.icon,
        title: `Leçon validée : ${lesson.title}`,
        text: `${Math.round(lesson.target * 100)} % du cortex illuminé.`,
        kind: 'synapse'
      });
    }
  }
  if (coverage >= ADV_ACT2_UNLOCK && !state.adventure.act2Announced) {
    state.adventure.act2Announced = true;
    showAdventureToast({
      icon: '⚔️',
      title: 'Arène déverrouillée !',
      text: 'Acte 2 : affronte Stockfish niveau par niveau.',
      kind: 'boss'
    });
  }
  advSyncGlobalLives(); // déblocage des vies à 50 % d'apprentissage
}

function adventureLightEdge(edge) {
  if (state.screen !== 'adventure' || !state.adventure || !edge) {
    return;
  }
  let lit = 0;
  for (const id of [edge.from, edge.to]) {
    if (id && id !== 'root' && !state.adventure.nodes.has(id)) {
      state.adventure.nodes.add(id);
      lit += 1;
    }
  }
  if (lit) {
    advAddXp(lit * ADV_XP_PER_SYNAPSE);
    triggerBrainSurge();
    flashAdvBoard('learn'); // écho de l'apprentissage sur l'échiquier (vue joueur)
    checkLessonMilestones();
    updateHomeProgress();
    saveAdventure();
  }
}

// === Score d'apprentissage =====================================================
// Par coup : points de temps (100 pts à ≤1 s → 1 pt à ≥30 s, linéaire) moins
// 50 pts par erreur sur ce coup. Le nombre de coups scorés est CONSTANT par mode
// (défini au lancement) pour que les scores restent comparables entre sessions.
const ADV_SCORE_MOVE_COUNT = 10; // leçon libre / piège
const ADV_SCORE_ERROR_PENALTY = 50;

function advScoreTimePoints(elapsedMs) {
  const sec = (Number(elapsedMs) || 30000) / 1000;
  if (sec <= 1) {
    return 100;
  }
  if (sec >= 30) {
    return 1;
  }
  return Math.round(100 - ((sec - 1) * 99) / 29);
}

function advScoreInit(run, target) {
  run.scoreTarget = target;
  run.scoreTotal = 0;
  run.scorePlayed = 0;
  run.scoreMoveStart = null;
  run.scoreMoveErrors = 0;
}

// Enregistre le score du coup courant (temps − erreurs×50) puis réarme.
function advScoreRegisterMove(run, elapsedMs) {
  if (!run || run.scoreTarget == null || (run.scorePlayed || 0) >= run.scoreTarget) {
    return;
  }
  const pts = advScoreTimePoints(elapsedMs) - (run.scoreMoveErrors || 0) * ADV_SCORE_ERROR_PENALTY;
  run.scoreTotal = (run.scoreTotal || 0) + pts;
  run.scorePlayed = (run.scorePlayed || 0) + 1;
  run.scoreMoveStart = null;
  run.scoreMoveErrors = 0;
}

// Le chrono du coup démarre quand le trait revient aux Blancs (leçons/pièges).
function advScoreArmTimer() {
  const run = state.advRun;
  const game = state.game;
  if (!run || run.scoreTarget == null || run.revisionMode || !game) {
    return;
  }
  if (game.status !== 'playing' || game.locked || game.chess.turn() !== 'w') {
    return;
  }
  if (run.scoreMoveStart == null) {
    run.scoreMoveStart = Date.now();
  }
}

function advScoreKey(run) {
  return run.revisionMode || (run.trapsMode ? 'trap' : 'lesson');
}

// Ligne d'affichage du score (résultat de fin) — lecture seule, le record est
// mis à jour une seule fois dans adventureOnGameFinished.
function advScoreResultLine(run) {
  if (!run || run.scoreTarget == null || !(run.scorePlayed > 0)) {
    return '';
  }
  const total = Math.round(run.scoreTotal || 0);
  const max = run.scoreTarget * 100;
  const best = Number(state.adventure?.bestScores?.[advScoreKey(run)]);
  const rec = run.scoreIsRecord
    ? ' · 🏆 record !'
    : Number.isFinite(best)
      ? ` · record ${best}`
      : '';
  return ` ⚡ Score : ${total}/${max} (${run.scorePlayed}/${run.scoreTarget} coups)${rec}`;
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

// M — Signature de l'ouverture jouée : libellé PGN compact (« 1.e4 e5 2.Nf3 »)
// pour l'affichage, et clé = enchaînement des coups BLANCS (le choix du joueur)
// pour regrouper les parties par ouverture (et alimenter le masquage N).
function advOpeningSignature(game) {
  const openingEntries = (game?.freeReviewMoves || []).filter((e) => e.phase === 'opening');
  if (!openingEntries.length) {
    return { key: 'hors-livre', label: 'Hors livre' };
  }
  let label = '';
  let moveNo = 0;
  const whiteSans = [];
  const sans = [];
  for (const entry of openingEntries) {
    sans.push(entry.san);
    if (entry.color === 'w') {
      moveNo += 1;
      whiteSans.push(entry.san);
      label += `${label ? ' ' : ''}${moveNo}.${entry.san}`;
    } else {
      label += ` ${entry.san}`;
    }
  }
  return {
    key: whiteSans.join(' ') || 'hors-livre',
    label: label || 'Hors livre',
    sans // suite complète (deux couleurs) pour le préfixe des lignes (N)
  };
}

// Nom d'ouverture (PGN/ECO) le plus précis atteint en rejouant une suite de coups :
// on suit la ligne dans le graphe et on garde le nom du nœud le plus profond.
// Libellé d'ouverture lisible : « Nom (ECO) » si connu, sinon la séquence de coups.
// === Visuel d'ouverture : vignette (position finale) + visionneuse animée ===
const OPENING_VIEWER_SPEEDS = [
  { label: '🐢 Lent', ms: 1500 },
  { label: 'Normal', ms: 850 },
  { label: '🐇 Rapide', ms: 380 }
];

// --- Visionneuse animée plein écran (lecture/pause + vitesse réglable) ---
let openingViewer = null;

function closeOpeningViewer() {
  if (!openingViewer) {
    return;
  }
  if (openingViewer.timer) {
    window.clearInterval(openingViewer.timer);
  }
  if (openingViewer.keyHandler) {
    window.removeEventListener('keydown', openingViewer.keyHandler);
  }
  openingViewer.overlay.remove();
  openingViewer = null;
}

function openingViewerRender() {
  const v = openingViewer;
  if (!v) {
    return;
  }
  const frame = v.frames[v.index];
  fillOpeningBoard(v.board, frame);
  v.counter.textContent = `${v.index} / ${v.frames.length - 1}`;
  v.moveLabel.textContent = frame.san
    ? `${Math.ceil(v.index / 2)}${v.index % 2 === 1 ? '.' : '…'} ${frame.san}`
    : 'Position de départ';
  v.playBtn.textContent = v.playing ? '⏸' : '▶';
}

function openingViewerStep(delta) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  v.index = (v.index + delta + v.frames.length) % v.frames.length;
  openingViewerRender();
}

function openingViewerSetPlaying(play) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  v.playing = play;
  if (v.timer) {
    window.clearInterval(v.timer);
    v.timer = null;
  }
  if (play) {
    v.timer = window.setInterval(() => {
      v.index = v.index + 1 >= v.frames.length ? 0 : v.index + 1;
      openingViewerRender();
    }, OPENING_VIEWER_SPEEDS[v.speed].ms);
  }
  openingViewerRender();
}

function openingViewerSetSpeed(speedIndex) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  v.speed = clamp(speedIndex, 0, OPENING_VIEWER_SPEEDS.length - 1);
  v.speedBtns.forEach((btn, i) => btn.classList.toggle('is-active', i === v.speed));
  if (v.playing) {
    openingViewerSetPlaying(true); // relance le minuteur à la nouvelle vitesse
  }
}

function openOpeningViewer(sans, name, label, shopKey = null, maxPlies = OPENING_MAX_PLIES) {
  const frames = buildOpeningFrames(sans, maxPlies);
  if (!frames) {
    return;
  }
  closeOpeningViewer();

  const overlay = document.createElement('div');
  overlay.className = 'opening-viewer';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOpeningViewer();
    }
  });

  const panel = document.createElement('div');
  panel.className = 'opening-viewer-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const head = document.createElement('header');
  head.className = 'opening-viewer-head';
  const title = document.createElement('div');
  title.className = 'opening-viewer-title';
  title.innerHTML = `<strong>${escapeHtml(name || 'Ouverture')}</strong><span>${escapeHtml(
    label || ''
  )}</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'opening-viewer-x';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Fermer');
  closeBtn.addEventListener('click', closeOpeningViewer);
  head.append(title, closeBtn);

  const board = document.createElement('div');
  board.className = 'opening-board opening-board-large';

  const moveLabel = document.createElement('p');
  moveLabel.className = 'opening-viewer-move';

  const controls = document.createElement('div');
  controls.className = 'opening-viewer-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'opening-ctl';
  prev.textContent = '‹';
  prev.setAttribute('aria-label', 'Coup précédent');
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'opening-ctl is-play';
  playBtn.setAttribute('aria-label', 'Lecture / Pause');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'opening-ctl';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Coup suivant');
  const counter = document.createElement('span');
  counter.className = 'opening-viewer-counter';
  prev.addEventListener('click', () => {
    openingViewerSetPlaying(false);
    openingViewerStep(-1);
  });
  next.addEventListener('click', () => {
    openingViewerSetPlaying(false);
    openingViewerStep(1);
  });
  playBtn.addEventListener('click', () => openingViewerSetPlaying(!openingViewer.playing));
  controls.append(prev, playBtn, next, counter);

  const speeds = document.createElement('div');
  speeds.className = 'opening-viewer-speeds';
  const speedBtns = OPENING_VIEWER_SPEEDS.map((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opening-speed';
    btn.textContent = s.label;
    btn.addEventListener('click', () => openingViewerSetSpeed(i));
    speeds.append(btn);
    return btn;
  });

  // Actions boutique (±5 % / cadenas / passer) directement depuis la visionneuse,
  // pour choisir sans revenir au carrousel. Renseignées par renderOpeningViewerShop().
  const shopActions = document.createElement('div');
  shopActions.className = 'opening-viewer-shop';

  panel.append(head, board, moveLabel, controls, speeds, shopActions);
  overlay.append(panel);
  document.body.append(overlay);

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeOpeningViewer();
    } else if (event.key === 'ArrowLeft') {
      openingViewerSetPlaying(false);
      openingViewerStep(-1);
    } else if (event.key === 'ArrowRight') {
      openingViewerSetPlaying(false);
      openingViewerStep(1);
    }
  };
  window.addEventListener('keydown', keyHandler);

  openingViewer = {
    overlay,
    panel,
    board,
    titleEl: title,
    moveLabel,
    counter,
    playBtn,
    speedBtns,
    shopActions,
    shopKey,
    frames,
    index: 0,
    playing: false,
    speed: 1,
    timer: null,
    keyHandler
  };
  panel.classList.toggle('has-shop', Boolean(shopKey));
  openingViewerSetSpeed(1);
  renderOpeningViewerShop();
  openingViewerSetPlaying(true); // démarre l'animation
}

// Charge une autre proposition dans la visionneuse ouverte (sans la recréer).
function loadOpeningViewerChoice(choice) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  const frames = buildOpeningFrames(choice.sans);
  if (!frames) {
    closeOpeningViewer();
    return;
  }
  v.frames = frames;
  v.index = 0;
  v.shopKey = choice.key;
  const name = advOpeningDisplayLabel(choice.sans, choice.name || 'Hors livre');
  v.titleEl.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(
    choice.sans.join(' ')
  )}</span>`;
  renderOpeningViewerShop();
  openingViewerSetPlaying(true);
}

// Rangée d'actions boutique dans la visionneuse (coins + pondération + ±5 / cadenas / passer).
function renderOpeningViewerShop() {
  const v = openingViewer;
  if (!v?.shopActions) {
    return;
  }
  v.shopActions.replaceChildren();
  if (!v.shopKey) {
    v.shopActions.hidden = true;
    return;
  }
  v.shopActions.hidden = false;
  const weight = advOpeningWeightOf(v.shopKey);
  const wTxt = weight > 0 ? `+${weight}%` : weight < 0 ? `${weight}%` : '0%';
  const info = document.createElement('div');
  info.className = 'opening-viewer-shop-info';
  info.innerHTML =
    `<span class="opening-viewer-shop-coins">${advCoins()} 🪙</span>` +
    `<span class="adv-weight-delta ${weight > 0 ? 'is-up' : weight < 0 ? 'is-down' : ''}">pondération ${wTxt}</span>`;
  v.shopActions.append(info);

  const buys = document.createElement('div');
  buys.className = 'adv-weight-buys';
  const makeBuy = (dir, label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-weight-buy ${dir > 0 ? 'is-up' : 'is-down'}`;
    btn.textContent = `${label} (${OPENING_WEIGHT_COST}🪙)`;
    btn.disabled = advCoins() < OPENING_WEIGHT_COST;
    btn.addEventListener('click', () => openingViewerShopWeight(dir));
    return btn;
  };
  buys.append(makeBuy(-1, '− 5%'), makeBuy(1, '+ 5%'));
  v.shopActions.append(buys);

  const nav = document.createElement('div');
  nav.className = 'adv-weight-nav';
  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'adv-ghost adv-weight-lock';
  const locked = advOpeningLockIs(v.shopKey);
  lockBtn.classList.toggle('is-active', locked);
  lockBtn.textContent = locked ? '🔒 Gardée' : '🔓 Garder';
  lockBtn.addEventListener('click', openingViewerShopLock);
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'adv-ghost adv-weight-skip';
  skipBtn.textContent = 'Passer ›';
  skipBtn.addEventListener('click', openingViewerShopSkip);
  nav.append(lockBtn, skipBtn);
  v.shopActions.append(nav);
}

function openingViewerShopWeight(dir) {
  const v = openingViewer;
  if (!v?.shopKey) {
    return;
  }
  if (advAdjustOpeningWeight(v.shopKey, dir)) {
    openingViewerShopAdvance();
  } else {
    renderOpeningViewerShop(); // pas assez de pièces : on reste sur la position
  }
}

function openingViewerShopSkip() {
  if (openingViewer?.shopKey) {
    openingViewerShopAdvance();
  }
}

function openingViewerShopLock() {
  const v = openingViewer;
  if (!v?.shopKey) {
    return;
  }
  advToggleOpeningLock(v.shopKey);
  renderAdvShop(); // garde le carrousel en phase
  renderOpeningViewerShop();
}

// Après un choix : consomme la proposition et enchaîne sur la suivante dans la visionneuse.
function openingViewerShopAdvance() {
  const v = openingViewer;
  if (!v?.shopKey) {
    return;
  }
  advConsumeOpeningChoice(v.shopKey);
  renderAdvShop();
  const deck = advEnsureOpeningDeck();
  const nextKey = deck[advCarouselIndex];
  const next = nextKey ? advChoiceByKey(nextKey) : null;
  if (next) {
    loadOpeningViewerChoice(next);
  } else {
    closeOpeningViewer(); // plus de proposition : on referme
  }
}

// M — Enregistre une partie terminée dans l'historique persistant.
// Coups joués (avec évals) d'une partie, version compacte persistable, pour la
// revue + analyse a posteriori. Construite depuis freeReviewMoves à la fin.
function buildGameReviewMoves(game) {
  const entries = (game?.freeReviewMoves || []).filter((e) => e.phase && e.phase !== 'start');
  return entries.slice(0, ADV_MAX_REVIEW_MOVES).map((entry) => {
    const best =
      entry.color === 'w' && (entry.phase === 'free' || entry.phase === 'opening')
        ? String(getReviewParent(entry)?.pv || '')
            .trim()
            .split(/\s+/)[0] || ''
        : '';
    return {
      san: entry.san,
      color: entry.color,
      phase: entry.phase,
      before: Number.isFinite(entry.beforeEvalCp) ? Math.round(entry.beforeEvalCp) : null,
      after: Number.isFinite(entry.afterEvalCp) ? Math.round(entry.afterEvalCp) : null,
      best
    };
  });
}

function advRecordGame(result) {
  const game = state.game;
  const run = state.advRun;
  if (!state.adventure || !game || !run || game.gameRecorded) {
    return;
  }
  // « Illuminer le cerveau » (leçons libres + pièges) = entraînement : ces parties
  // ne sont PAS enregistrées dans l'historique. Seule l'arène (boss) y figure.
  // Les matchs de tournoi ne polluent pas non plus l'historique de l'arène.
  if (run.kind !== 'boss' || run.tournament) {
    game.gameRecorded = true;
    return;
  }
  game.gameRecorded = true;
  const opening = advOpeningSignature(game);
  const plies = (game.freeReviewMoves || []).filter(
    (e) => e.phase !== 'start' && e.phase !== 'engine-line'
  ).length;
  state.adventure.games = state.adventure.games || [];
  const record = {
    ts: Date.now(),
    result, // 'won' | 'lost'
    kind: run.kind, // 'lesson' | 'boss'
    bossLevel: run.kind === 'boss' ? run.bossLevel : null,
    opponentLevel: advRunDifficultyLevel(),
    trapsMode: Boolean(run.trapsMode),
    openingKey: opening.key,
    openingLabel: opening.label,
    lineSans: opening.sans, // suite d'ouverture complète (N : préfixe de ligne)
    moves: buildGameReviewMoves(game), // revue + analyse a posteriori
    plies,
    mate: Boolean(game.chess?.isCheckmate?.()),
    difficulty: state.adventure.difficulty || DEFAULT_ADV_DIFFICULTY
  };
  state.adventure.games.unshift(record);
  // La suite de défaite est ajoutée plus tard (asynchrone) : on garde un lien vers
  // ce record pour y réintégrer les coups auto une fois la suite enregistrée.
  game.recordRef = record;
  if (state.adventure.games.length > ADV_MAX_GAMES) {
    state.adventure.games.length = ADV_MAX_GAMES;
  }
}

// Met à jour les coups sauvegardés du dernier record (ex. après l'ajout async de
// la suite de défaite) pour que la revue d'historique inclue les coups auto.
function advRefreshRecordedMoves(game) {
  if (game?.recordRef && state.adventure?.games?.includes(game.recordRef)) {
    game.recordRef.moves = buildGameReviewMoves(game);
    saveAdventure();
  }
}

// M — Agrégats victoires/défaites par adversaire et par ouverture.
function advGameStats(gameFilter = null) {
  const source = state.adventure?.games || [];
  const games = gameFilter ? source.filter(gameFilter) : source;
  const byOpening = new Map();
  const byOpponent = new Map();
  let won = 0;
  let lost = 0;
  for (const g of games) {
    const isWin = g.result === 'won';
    if (isWin) won += 1;
    else lost += 1;

    const oKey = g.openingKey || 'hors-livre';
    const o = byOpening.get(oKey) || {
      key: oKey,
      label: g.openingLabel || oKey,
      lineSans: Array.isArray(g.lineSans) ? g.lineSans : null, // pour nom d'ouverture + mini-échiquier
      won: 0,
      lost: 0
    };
    if (!o.lineSans && Array.isArray(g.lineSans)) {
      o.lineSans = g.lineSans;
    }
    if (isWin) o.won += 1;
    else o.lost += 1;
    byOpening.set(oKey, o);

    const pKey = g.kind === 'boss' ? `boss-${g.bossLevel}` : `lesson-${g.opponentLevel}`;
    const p = byOpponent.get(pKey) || {
      key: pKey,
      kind: g.kind,
      level: g.kind === 'boss' ? g.bossLevel : g.opponentLevel,
      won: 0,
      lost: 0
    };
    if (isWin) p.won += 1;
    else p.lost += 1;
    byOpponent.set(pKey, p);
  }
  const sortByGames = (a, b) => b.won + b.lost - (a.won + a.lost);
  return {
    games,
    won,
    lost,
    byOpening: [...byOpening.values()].sort(sortByGames),
    byOpponent: [...byOpponent.values()].sort((a, b) => (a.level || 0) - (b.level || 0))
  };
}

// === Boutique : monnaie « pièces », surpondération de ligne (O), menaces (R) ===
const SHOP_THREATS_BOSS_UNLOCK = 3;  // R : « voir les menaces » débloqué après 3 boss

// Récompense en pièces pour une victoire (boss = davantage selon le niveau).
function advWinCoinReward(run) {
  if (!run) {
    return 0;
  }
  if (run.kind === 'boss') {
    return 20 + (run.bossLevel || 1) * 5;
  }
  return run.trapsMode ? 8 : 5; // leçon / piège
}

function advCoins() {
  return state.adventure?.coins || 0;
}

function advAwardCoins(amount) {
  if (!state.adventure || amount <= 0) {
    return;
  }
  state.adventure.coins = (state.adventure.coins || 0) + amount;
}

function advThreatsUnlocked() {
  return (state.adventure?.highestBoss || 0) >= SHOP_THREATS_BOSS_UNLOCK;
}

function advThreatsActive() {
  return Boolean(state.adventure?.threatsEnabled) && advThreatsUnlocked();
}

// === O — Pondération des choix d'ouverture de Stockfish (boutique) ===
const OPENING_WEIGHT_STEP = 5; // points de % par achat
const OPENING_WEIGHT_COST = 10; // pièces par ±5 %
const OPENING_WEIGHT_MAX = 60; // bornes de la pondération cumulée
const OPENING_BRANCH_MAX_PLY = 20;

let advChoicesCache = null;

// Énumère tous les coups noirs « influençables » : positions du livre où les Noirs
// ont au moins 2 réponses (vrai choix de Stockfish). Un élément = un coup à un
// embranchement. Mis en cache (le livre est statique).
function advInfluenceableChoices() {
  if (advChoicesCache) {
    return advChoicesCache;
  }
  const out = [];
  if (!(state.edgesById instanceof Map)) {
    return out;
  }
  const seen = new Set();
  const queue = [{ id: 'root', sans: [] }];
  let guard = 0;
  while (queue.length && guard < 6000) {
    guard += 1;
    const { id, sans } = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const node = getNode(id);
    if (!node) {
      continue;
    }
    const outs = getRawOutgoingEdges(id);
    const blacks = outs.filter((edge) => edge.color === 'b');
    if (blacks.length >= 2 && sans.length <= OPENING_BRANCH_MAX_PLY) {
      for (const edge of blacks) {
        const child = getNode(edge.to);
        out.push({
          key: `${node.fen}|${edge.uci}`,
          fen: node.fen,
          uci: edge.uci,
          san: edge.san,
          sans: [...sans, edge.san],
          name: child?.opening || null,
          eco: child?.eco || null,
          baseProb: Number(edge.probability) || 0
        });
      }
    }
    if (sans.length < OPENING_BRANCH_MAX_PLY + 4) {
      for (const edge of outs) {
        if (!seen.has(edge.to)) {
          queue.push({ id: edge.to, sans: [...sans, edge.san] });
        }
      }
    }
  }
  advChoicesCache = out;
  return out;
}

function advChoiceByKey(key) {
  return advInfluenceableChoices().find((choice) => choice.key === key) || null;
}

// === Refonte boutique : surpondération d'un COUP à un NŒUD d'embranchement ======
// On regroupe les coups noirs par nœud (position où les Noirs ont ≥2 réponses) ;
// pour chaque coup candidat on calcule la suite la plus probable jusqu'au prochain
// embranchement (aperçu de la ligne, pour décider quel coup pousser). Cache : le
// livre est statique.
let advNodesCache = null;
function advInfluenceableNodes() {
  if (advNodesCache) {
    return advNodesCache;
  }
  const out = [];
  if (!(state.edgesById instanceof Map)) {
    return out;
  }
  const seen = new Set();
  const queue = [{ id: 'root', sans: [] }];
  let guard = 0;
  while (queue.length && guard < 6000) {
    guard += 1;
    const { id, sans } = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const node = getNode(id);
    if (!node) {
      continue;
    }
    const outs = getRawOutgoingEdges(id);
    const blacks = outs.filter((edge) => edge.color === 'b');
    if (blacks.length >= 2 && sans.length <= OPENING_BRANCH_MAX_PLY) {
      const moves = blacks.map((edge) => {
        const child = getNode(edge.to);
        return {
          uci: edge.uci,
          san: edge.san,
          baseProb: Number(edge.probability) || 0,
          name: child?.opening || null,
          eco: child?.eco || null,
          line: advLineToNextBranch(edge.to)
        };
      });
      out.push({ key: node.fen, fen: node.fen, sans: [...sans], moves });
    }
    if (sans.length < OPENING_BRANCH_MAX_PLY + 4) {
      for (const edge of outs) {
        if (!seen.has(edge.to)) {
          queue.push({ id: edge.to, sans: [...sans, edge.san] });
        }
      }
    }
  }
  advNodesCache = out;
  return out;
}

// Suite la plus probable depuis un nœud, jusqu'au prochain embranchement noir (ou cap).
function advLineToNextBranch(startId, maxPlies = 6) {
  const lineSans = [];
  let cur = startId;
  const visited = new Set();
  for (let i = 0; i < maxPlies; i += 1) {
    if (visited.has(cur)) {
      break;
    }
    visited.add(cur);
    const outs = getRawOutgoingEdges(cur);
    if (!outs.length) {
      break;
    }
    if (i > 0 && outs.filter((e) => e.color === 'b').length >= 2) {
      break; // prochain embranchement atteint
    }
    const best = outs.slice().sort((a, b) => (b.probability || 0) - (a.probability || 0))[0];
    if (!best) {
      break;
    }
    lineSans.push(best.san);
    cur = best.to;
  }
  return lineSans;
}

// Surpondère un coup : +5 % au coup choisi, et −5 %/(nombre d'autres coups) à chacun
// des autres (somme nulle). Coût 10 🪙, une seule fois par défaite. true si appliqué.
function advOverweightMove(node, chosenUci) {
  const adv = state.adventure;
  if (!adv || !node || !advInfluenceEnabled()) {
    return false;
  }
  if (state.advRun?.overweightUsed) {
    showAdventureToast({ icon: '🎚️', title: 'Déjà fait', text: 'Une seule surpondération par défaite.', kind: null });
    return false;
  }
  const moves = node.moves || [];
  if (moves.length < 2 || !moves.some((m) => m.uci === chosenUci)) {
    return false;
  }
  adv.openingWeights = adv.openingWeights || {};
  const bump = (uci, delta) => {
    const key = `${node.fen}|${uci}`;
    const next = clamp((Number(adv.openingWeights[key]) || 0) + delta, -OPENING_WEIGHT_MAX, OPENING_WEIGHT_MAX);
    if (Math.abs(next) < 1e-6) {
      delete adv.openingWeights[key];
    } else {
      adv.openingWeights[key] = next;
    }
  };
  const others = moves.filter((m) => m.uci !== chosenUci);
  bump(chosenUci, OPENING_WEIGHT_STEP);
  const per = OPENING_WEIGHT_STEP / others.length;
  for (const m of others) {
    bump(m.uci, -per);
  }
  // Gratuit : plus de coût en pièces (la monnaie reste pour d'autres fonctions).
  if (state.advRun) {
    state.advRun.overweightUsed = true;
  }
  saveAdventure();
  return true;
}

// --- « Influencer l'ouverture » (fin de défaite, dans la vue de jeu) -----------
const INFLUENCE_ARROW_COLORS = ['#5ad1ff', '#ffd45a', '#ff8a8a', '#9cff8a'];

// === Influence intégrée à la vue de jeu : pas d'écran à part. Après une défaite
// de boss, on navigue la partie comme une revue (‹ ›) ; aux positions
// d'embranchement des Noirs, le bandeau de coups propose les candidats (+5 %).

// Index FEN (4 premiers champs) → nœud influençable.
let advInfluenceFenIndex = null;
function advInfluenceNodeByFen(fen) {
  if (!advInfluenceFenIndex) {
    advInfluenceFenIndex = new Map(
      advInfluenceableNodes().map((n) => [fenPositionKey(n.fen), n])
    );
  }
  return advInfluenceFenIndex.get(fenPositionKey(fen)) || null;
}

// Mode d'influence configuré : nœud aléatoire du livre, ou nœuds de la partie jouée.
function advInfluenceMode() {
  return state.adventure?.influenceMode === 'game' ? 'game' : 'random';
}

// Position de la ligne d'influence (mode aléatoire) après lineIndex demi-coups.
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
      showAdventureToast({ icon: '🎚️', title: 'Aucun choix', text: 'Le livre ne laisse pas de choix aux Noirs.', kind: null });
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

// Coordonnées centre→centre d'un coup UCI dans un repère 8×8 (vue des Blancs).
function uciToBoardVec(uci) {
  const file = (c) => c.charCodeAt(0) - 97;
  const rank = (c) => parseInt(c, 10);
  return {
    fromX: file(uci[0]) + 0.5,
    fromY: 8.5 - rank(uci[1]),
    toX: file(uci[2]) + 0.5,
    toY: 8.5 - rank(uci[3])
  };
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
function advShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomUnit() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Options d'un quiz : coup correct + 2 leurres légaux, à une position (leadSans).
function advQuizOptions(leadSans, correctUci) {
  let chess;
  try {
    chess = new Chess();
  } catch {
    return [];
  }
  for (const s of leadSans) {
    try {
      if (!chess.move(s)) return [];
    } catch {
      return [];
    }
  }
  const all = chess
    .moves({ verbose: true })
    .map((m) => ({ uci: m.from + m.to + (m.promotion || ''), san: m.san }));
  const correct = all.find((o) => o.uci === correctUci);
  if (!correct) {
    return [];
  }
  const decoys = advShuffle(all.filter((o) => o.uci !== correctUci)).slice(0, 2);
  return advShuffle([correct, ...decoys]);
}

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
  const chosen = advShuffle(whiteIdx).slice(0, 3).sort((a, b) => a - b);
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
      showAdventureToast({ icon: '⚡', title: 'Quiz indisponible', text: 'Le livre est trop court.', kind: null });
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
  game.message = correct ? `✅ Bravo : ${step.correctSan} !` : `❌ Le bon coup était ${step.correctSan}.`;
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

// Récap lecture seule (onglet Boutique) : pondérations actives + note explicative.
function renderAdvWeightRecap(host) {
  host.replaceChildren();
  const note = document.createElement('p');
  note.className = 'adv-shop-empty';
  note.textContent = advInfluenceEnabled()
    ? "Après une défaite de boss, le choix s'ouvre tout seul : pousse un coup des Noirs de +5% (gratuit). L'effet s'accumule jusqu'à ta victoire. Désactivable dans les réglages."
    : 'Influence des ouvertures désactivée (réactive-la dans les réglages).';
  host.append(note);
  if (!advInfluenceEnabled()) {
    return;
  }
  const active = Object.entries(state.adventure?.openingWeights || {}).filter(
    ([, v]) => Math.abs(v) > 0.01
  );
  if (!active.length) {
    return;
  }
  const summary = document.createElement('div');
  summary.className = 'adv-weight-summary';
  summary.innerHTML = '<span class="adv-tally-label">Pondérations actives</span>';
  const chips = document.createElement('div');
  chips.className = 'adv-weight-chips';
  for (const [k, v] of active) {
    const choice = advChoiceByKey(k);
    const chip = document.createElement('span');
    chip.className = `adv-weight-chip ${v > 0 ? 'is-up' : 'is-down'}`;
    const nm = choice ? choice.san : k.split('|')[1];
    chip.textContent = `${nm} ${v > 0 ? '+' : ''}${Math.round(v)}%`;
    chips.append(chip);
  }
  summary.append(chips);
  host.append(summary);
}

// Pondération (points de %) d'un coup noir donné — seulement en partie de boss.
// La surpondération peut être désactivée dans les réglages.
function advInfluenceEnabled() {
  return !state.adventure?.influenceDisabled;
}

function advBlackChoiceWeight(fen, uci) {
  const weights = state.adventure?.openingWeights;
  if (!weights || state.advRun?.kind !== 'boss' || !advInfluenceEnabled()) {
    return 0;
  }
  return Number(weights[`${fen}|${uci}`]) || 0;
}

function advOpeningWeightOf(key) {
  return Number(state.adventure?.openingWeights?.[key]) || 0;
}

function advOpeningLocks() {
  return state.adventure?.openingLocks || [];
}

function advOpeningLockIs(key) {
  return advOpeningLocks().includes(key);
}

// File des propositions du carrousel. null → on (re)remplit avec TOUS les choix
// (cadenas en tête) ; un tableau (même vide) signifie « déjà parcourue » et n'est
// pas re-rempli avant une partie de boss.
function advEnsureOpeningDeck() {
  const adv = state.adventure;
  if (!adv) {
    return [];
  }
  const all = advInfluenceableChoices();
  const valid = new Set(all.map((choice) => choice.key));
  adv.openingLocks = (adv.openingLocks || []).filter((key) => valid.has(key));
  if (Array.isArray(adv.openingDeck)) {
    adv.openingDeck = adv.openingDeck.filter((key) => valid.has(key));
    return adv.openingDeck;
  }
  // (Re)remplissage : tous les choix, cadenas d'abord puis le reste dans l'ordre du livre.
  const locked = advOpeningLocks();
  const rest = all.map((c) => c.key).filter((key) => !locked.includes(key));
  adv.openingDeck = [...locked, ...rest];
  saveAdventure();
  return adv.openingDeck;
}

// Consomme la proposition courante (passer/+5/−5) : elle disparaît du carrousel et
// on passe à la suivante. Une proposition cadenassée n'est PAS consommée (cumulable).
function advConsumeOpeningChoice(key) {
  const adv = state.adventure;
  if (!adv || !Array.isArray(adv.openingDeck)) {
    return;
  }
  if (advOpeningLockIs(key)) {
    if (adv.openingDeck.length) {
      advCarouselIndex = (advCarouselIndex + 1) % adv.openingDeck.length;
    }
    return;
  }
  const idx = adv.openingDeck.indexOf(key);
  if (idx >= 0) {
    adv.openingDeck.splice(idx, 1);
  }
  if (advCarouselIndex >= adv.openingDeck.length) {
    advCarouselIndex = 0;
  }
  saveAdventure();
}

// Remise à zéro après une partie de boss : pondérations + propositions (cadenas gardés).
function advResetOpeningInfluence() {
  if (!state.adventure) {
    return;
  }
  state.adventure.openingWeights = {};
  state.adventure.openingDeck = null;
}

// Achat : ajuste la pondération d'un coup de ±5 % (10 🪙). Renvoie true si appliqué.
function advAdjustOpeningWeight(key, direction) {
  const adv = state.adventure;
  if (!adv || !advChoiceByKey(key)) {
    return false;
  }
  if (advCoins() < OPENING_WEIGHT_COST) {
    showAdventureToast({ icon: '🪙', title: 'Pas assez de pièces', text: `Il faut ${OPENING_WEIGHT_COST} 🪙.`, kind: null });
    return false;
  }
  const next = clamp(
    advOpeningWeightOf(key) + direction * OPENING_WEIGHT_STEP,
    -OPENING_WEIGHT_MAX,
    OPENING_WEIGHT_MAX
  );
  if (next === advOpeningWeightOf(key)) {
    return false; // borne atteinte
  }
  adv.openingWeights = adv.openingWeights || {};
  if (next === 0) {
    delete adv.openingWeights[key];
  } else {
    adv.openingWeights[key] = next;
  }
  adv.coins = Math.max(0, advCoins() - OPENING_WEIGHT_COST);
  saveAdventure();
  return true;
}

function advToggleOpeningLock(key) {
  const adv = state.adventure;
  if (!adv) {
    return;
  }
  adv.openingLocks = adv.openingLocks || [];
  if (adv.openingLocks.includes(key)) {
    adv.openingLocks = adv.openingLocks.filter((k) => k !== key);
  } else {
    adv.openingLocks.push(key);
    if (!(adv.openingDeck || []).includes(key)) {
      adv.openingDeck = [...(adv.openingDeck || []), key];
    }
  }
  saveAdventure();
}

// Libellé court de l'adversaire d'une partie enregistrée (M).
function advFormatGameOpponent(g) {
  if (g.kind === 'boss') {
    return `Boss N${g.bossLevel}`;
  }
  if (g.trapsMode) {
    return `Piège · N${g.opponentLevel}`;
  }
  const profile = getStockfishLevelProfile(g.opponentLevel);
  return profile?.label || `Leçon N${g.opponentLevel}`;
}

// Date relative compacte pour l'historique.
function advFormatRelativeTime(ts) {
  const diff = Date.now() - (Number(ts) || 0);
  if (diff < 60_000) {
    return "à l'instant";
  }
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) {
    return `il y a ${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `il y a ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function makeAdvTallyChip(title, won, lost) {
  const chip = document.createElement('span');
  chip.className = 'adv-tally-chip';
  const total = won + lost;
  const rate = total ? Math.round((won / total) * 100) : 0;
  chip.classList.toggle('is-positive', won > lost);
  chip.classList.toggle('is-negative', lost > won);
  chip.innerHTML = `<b>${title}</b><em>${won}–${lost}</em><i>${rate}%</i>`;
  chip.title = `${title} : ${won} victoire(s), ${lost} défaite(s) — ${rate}% de réussite`;
  return chip;
}

// Barre data-viz victoires/défaites : segment vert (V) + rouge (D) proportionnels,
// libellé court à gauche, score V–D à droite. Lecture immédiate.
function makeWinLossBar(label, won, lost) {
  const total = won + lost;
  const rate = total ? Math.round((won / total) * 100) : 0;
  const row = document.createElement('div');
  row.className = 'adv-wl-bar';
  row.innerHTML =
    `<span class="adv-wl-label">${escapeHtml(label)}</span>` +
    `<span class="adv-wl-track">` +
    `<span class="adv-wl-win" style="flex:${won}"></span>` +
    `<span class="adv-wl-loss" style="flex:${lost}"></span>` +
    `</span>` +
    `<span class="adv-wl-count">${won}<i>–</i>${lost}</span>`;
  row.title = `${label} : ${won} V / ${lost} D — ${rate}% de réussite`;
  return row;
}

// M — Affiche l'historique des parties (tallies par adversaire/ouverture + liste).
// Seules les parties d'arène (boss) sont listées : les leçons « illuminer le
// cerveau » sont de l'entraînement et n'apparaissent pas dans l'historique.
function renderAdvGameHistory() {
  const stats = advGameStats((g) => g.kind === 'boss');
  const summary = document.querySelector('#advHistorySummary');
  const tallies = document.querySelector('#advHistoryTallies');
  const list = document.querySelector('#advHistoryList');

  if (summary) {
    summary.textContent = stats.games.length
      ? `${stats.won} victoire${stats.won > 1 ? 's' : ''} · ${stats.lost} défaite${
          stats.lost > 1 ? 's' : ''
        } sur ${stats.games.length} partie${stats.games.length > 1 ? 's' : ''}.`
      : "Aucune partie jouée pour l'instant.";
  }

  if (tallies) {
    tallies.replaceChildren();

    // Bilan global : une barre V/D pour un coup d'œil immédiat.
    if (stats.games.length) {
      const group = document.createElement('div');
      group.className = 'adv-tally-group';
      group.innerHTML = '<span class="adv-tally-label">Bilan</span>';
      const bars = document.createElement('div');
      bars.className = 'adv-wl-bars';
      bars.append(makeWinLossBar('Total', stats.won, stats.lost));
      group.append(bars);
      tallies.append(group);
    }

    // Par boss : data-viz V/D par niveau (N1 → N10), l'info clé demandée.
    const bosses = stats.byOpponent
      .filter((p) => p.kind === 'boss')
      .sort((a, b) => (a.level || 0) - (b.level || 0));
    if (bosses.length) {
      const group = document.createElement('div');
      group.className = 'adv-tally-group';
      group.innerHTML = '<span class="adv-tally-label">Par boss</span>';
      const bars = document.createElement('div');
      bars.className = 'adv-wl-bars';
      for (const b of bosses) {
        bars.append(makeWinLossBar(`N${b.level}`, b.won, b.lost));
      }
      group.append(bars);
      tallies.append(group);
    }

    if (stats.byOpening.length) {
      const group = document.createElement('div');
      group.className = 'adv-tally-group';
      group.innerHTML = '<span class="adv-tally-label">Par ouverture</span>';
      for (const o of stats.byOpening.slice(0, 6)) {
        group.append(makeAdvTallyChip(advOpeningDisplayLabel(o.lineSans, o.label), o.won, o.lost));
      }
      tallies.append(group);
    }
  }

  if (list) {
    list.replaceChildren();
    for (const g of stats.games.slice(0, 12)) {
      const li = document.createElement('li');
      const reviewable = Array.isArray(g.moves) && g.moves.length > 0;
      li.className = `adv-history-row is-${g.result}${reviewable ? ' is-reviewable' : ''}`;
      const icon = g.result === 'won' ? '✅' : '❌';
      const mateBadge = g.mate ? '<span class="adv-history-mate">mat</span>' : '';
      const chevron = reviewable ? '<span class="adv-history-chevron" aria-hidden="true">▸</span>' : '';
      const openingText = advOpeningDisplayLabel(g.lineSans, g.openingLabel);
      li.innerHTML = `
        <span class="adv-history-result">${icon}</span>
        <span class="adv-history-main">
          <b>${escapeHtml(advFormatGameOpponent(g))}</b>${mateBadge}
          <i>${escapeHtml(openingText)}</i>
        </span>
        <span class="adv-history-meta">${g.plies} c · ${advFormatRelativeTime(g.ts)}</span>${chevron}`;
      if (reviewable) {
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `Revoir la partie : ${advFormatGameOpponent(g)}`);
        li.addEventListener('click', () => openGameReview(g));
        li.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openGameReview(g);
          }
        });
      }
      list.append(li);
    }
  }
}

// === Revue d'une partie historique : échiquier rejouable + analyse a posteriori ===
function advStoredVerdict(move) {
  return advMoveVerdict({
    color: move.color,
    phase: move.phase,
    beforeEvalCp: move.before,
    afterEvalCp: move.after
  });
}

// Précision : part des coups BLANCS du joueur sans faute (bon / livre).
function advGameAccuracy(moves) {
  const whiteMoves = (moves || []).filter(
    (m) => m.color === 'w' && (m.phase === 'free' || m.phase === 'opening')
  );
  if (!whiteMoves.length) {
    return null;
  }
  let clean = 0;
  for (const m of whiteMoves) {
    const verdict = advStoredVerdict(m);
    if (verdict && ['good', 'book', 'brilliant'].includes(verdict.key)) {
      clean += 1;
    }
  }
  return Math.round((clean / whiteMoves.length) * 100);
}

// L — Compte les coups BLANCS par verdict (brillant/bon/imprécision/erreur/gaffe).
function advMoveStatsFromStored(moves) {
  const counts = { brilliant: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, book: 0 };
  let total = 0;
  for (const m of moves || []) {
    const verdict = advStoredVerdict(m);
    if (!verdict) {
      continue;
    }
    counts[verdict.key] = (counts[verdict.key] || 0) + 1;
    total += 1;
  }
  return { counts, total };
}

// Bandeau d'analyse de fin de partie : compteurs par verdict + précision.
function buildMoveStatsRow(moves) {
  const { counts, total } = advMoveStatsFromStored(moves);
  if (!total) {
    return null;
  }
  const wrap = document.createElement('div');
  wrap.className = 'adv-analysis';
  // « Bon coup » regroupe les coups solides + les coups de livre.
  const tiers = [
    { key: 'brilliant', n: counts.brilliant },
    { key: 'good', n: counts.good + counts.book },
    { key: 'inaccuracy', n: counts.inaccuracy },
    { key: 'mistake', n: counts.mistake },
    { key: 'blunder', n: counts.blunder }
  ];
  for (const tier of tiers) {
    const v = MOVE_VERDICTS[tier.key];
    const stat = document.createElement('span');
    stat.className = `adv-analysis-stat is-${v.cls}`;
    stat.innerHTML = `<i>${v.short}</i> ${tier.n}`;
    stat.title = `${v.label} : ${tier.n}`;
    wrap.append(stat);
  }
  const acc = advGameAccuracy(moves);
  const accEl = document.createElement('span');
  accEl.className = 'adv-analysis-accuracy';
  accEl.textContent = `Précision ${acc == null ? '—' : `${acc} %`}`;
  wrap.append(accEl);
  return wrap;
}

function buildStoredMoveComment(move) {
  const verdict = advStoredVerdict(move);
  const label =
    verdict && verdict.key !== 'good' && verdict.key !== 'book' ? `${verdict.label}. ` : '';
  const evalTxt =
    move.before != null && move.after != null
      ? `Éval ${formatEval(move.before)} → ${formatEval(move.after)}.`
      : '';
  const best =
    move.best && verdict && ['inaccuracy', 'mistake', 'blunder'].includes(verdict.key)
      ? ` Meilleur coup : ${move.best}.`
      : '';
  return `${label}${evalTxt}${best}`.trim() || 'Coup joué.';
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
      showAdventureToast({ icon: '🪙', title: `+${reward} pièces`, text: 'À dépenser à la boutique.', kind: null });
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

function openAdventureMap() {
  closeAdvAnalyseSheet();
  const map = document.querySelector('#adventureMap');
  if (map) {
    map.hidden = false;
  }
  document.body.classList.add('is-adv-map-open'); // verrou du scroll de fond (anti double-scroll)
  setAdvMapView('main'); // on rouvre toujours sur l'onglet principal
  renderAdventureMap();
}

function closeAdventureMap() {
  const map = document.querySelector('#adventureMap');
  if (map) {
    map.hidden = true;
  }
  document.body.classList.remove('is-adv-map-open');
  closeOpeningViewer(); // ferme la visionneuse d'ouverture si ouverte
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

// ===================== Mode Tournoi (élimination directe) =====================
// 8 participants : le joueur (toujours Blancs, seed 2) + 7 bots de niveaux distincts.
// Seeding : le bot le plus fort (seed 1) est dans la moitié opposée au joueur, et les
// bots faibles jalonnent le parcours du joueur → la finale oppose (presque toujours)
// le meilleur bot au joueur. Matchs entre bots simulés (Stockfish vs Stockfish) et
// regardables, en respectant le livre d'ouverture.
const TOURNAMENT_PLAYER_SEED = 2;
const TOURNAMENT_BOT_LEVELS = { 1: 10, 3: 7, 4: 8, 5: 6, 6: 5, 7: 4, 8: 3 };
const TOURNAMENT_QF_PAIRS = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7]
];
const TOURNAMENT_ROUND_LABELS = ['Quarts de finale', 'Demi-finales', 'Finale'];
const TOURNAMENT_SIM_BOOK_PLIES = 10;
const TOURNAMENT_SIM_MAX_PLIES = 36;
const TOURNAMENT_SIM_RESIGN_CP = 600;
let tournamentSimming = false;

function advTournamentParticipantLabel(seed) {
  const p = state.tournament?.participants?.[seed];
  if (!p) {
    return '—';
  }
  return p.isPlayer ? 'Toi (Blancs)' : `Bot N${p.level}`;
}

function advMatchIsPlayer(match) {
  const t = state.tournament;
  return Boolean(t && (t.participants[match.a]?.isPlayer || t.participants[match.b]?.isPlayer));
}

// Bouton « Tournoi » : reprend un tournoi en cours, sinon en démarre un nouveau.
function advOpenOrStartTournament() {
  if (state.tournament && state.tournament.status === 'active') {
    openAdvTournament();
    advRenderTournament();
    advTournamentEnsureBotSims();
    return;
  }
  // Affronter des bots exige des vies (apprends d'abord).
  advSyncGlobalLives();
  if (!advCanFightBots()) {
    advNotifyNoLives();
    return;
  }
  advStartTournament();
}

function advStartTournament() {
  const participants = {};
  for (let seed = 1; seed <= 8; seed += 1) {
    participants[seed] =
      seed === TOURNAMENT_PLAYER_SEED
        ? { seed, isPlayer: true, level: null }
        : { seed, isPlayer: false, level: TOURNAMENT_BOT_LEVELS[seed] };
  }
  const mk = (round, slot, a, b) => ({
    round,
    slot,
    a,
    b,
    winner: null,
    result: null,
    sans: [],
    simulating: false,
    playerRetryUsed: false
  });
  const rounds = [
    TOURNAMENT_QF_PAIRS.map(([a, b], i) => mk(0, i, a, b)),
    [mk(1, 0, null, null), mk(1, 1, null, null)],
    [mk(2, 0, null, null)]
  ];
  state.tournament = { participants, rounds, currentRound: 0, status: 'active' };
  openAdvTournament();
  advRenderTournament();
  advTournamentEnsureBotSims();
}

function openAdvTournament() {
  const overlay = document.querySelector('#advTournament');
  if (overlay) {
    overlay.hidden = false;
  }
  document.body.classList.add('is-adv-tournament-open');
}

function closeAdvTournament() {
  const overlay = document.querySelector('#advTournament');
  if (overlay) {
    overlay.hidden = true;
  }
  document.body.classList.remove('is-adv-tournament-open');
}

// Tirage pondéré d'une arête de livre (par probabilité) pour l'ouverture simulée.
function advPickBookEdge(edges) {
  const total = edges.reduce((s, e) => s + (Number(e.probability) || 0), 0);
  if (total <= 0) {
    return edges[Math.floor(randomUnit() * edges.length)];
  }
  let roll = randomUnit() * total;
  for (const e of edges) {
    roll -= Number(e.probability) || 0;
    if (roll <= 0) {
      return e;
    }
  }
  return edges[edges.length - 1];
}

// Simule un match bot-vs-bot : ouverture suivie du livre, puis playout Stockfish des
// deux camps (à leur niveau) jusqu'au mat / résignation / plafond. Vainqueur réel.
async function advSimulateBotMatch(whiteLevel, blackLevel) {
  const fallback = whiteLevel >= blackLevel ? 'w' : 'b';
  let chess;
  try {
    chess = new Chess();
  } catch {
    return { winner: fallback, sans: [] };
  }
  const sans = [];
  let nodeId = 'root';
  for (let ply = 0; ply < TOURNAMENT_SIM_BOOK_PLIES; ply += 1) {
    const edges = getRawOutgoingEdges(nodeId).filter((e) => e.color === chess.turn());
    if (!edges.length) {
      break;
    }
    const edge = advPickBookEdge(edges);
    const mv = playUciOnChess(chess, edge.uci);
    if (!mv) {
      break;
    }
    sans.push(mv.san);
    nodeId = edge.to;
    if (chess.isGameOver()) {
      break;
    }
  }
  let winner = null;
  try {
    const evaluator = await ensureStockfishReady(false);
    const wProfile = getStockfishLevelProfile(whiteLevel);
    const bProfile = getStockfishLevelProfile(blackLevel);
    while (sans.length < TOURNAMENT_SIM_MAX_PLIES && !chess.isGameOver()) {
      const profile = chess.turn() === 'w' ? wProfile : bProfile;
      const search = await evaluator.pickMove(chess.fen(), profile);
      if (!search?.bestMove) {
        break;
      }
      const mv = playUciOnChess(chess, search.bestMove);
      if (!mv) {
        break;
      }
      sans.push(mv.san);
      if (chess.isGameOver()) {
        break;
      }
      const evalNow = await evaluator.evaluate(chess.fen());
      if (Number.isFinite(evalNow.cpWhite) && Math.abs(evalNow.cpWhite) >= TOURNAMENT_SIM_RESIGN_CP) {
        winner = evalNow.cpWhite > 0 ? 'w' : 'b';
        break;
      }
    }
    if (!winner) {
      if (chess.isCheckmate()) {
        winner = chess.turn() === 'w' ? 'b' : 'w';
      } else {
        const evalFinal = await evaluator.evaluate(chess.fen());
        winner =
          Number.isFinite(evalFinal.cpWhite) && Math.abs(evalFinal.cpWhite) >= 60
            ? evalFinal.cpWhite > 0
              ? 'w'
              : 'b'
            : fallback;
      }
    }
  } catch {
    winner = fallback;
  }
  return { winner, sans };
}

// Simule (en arrière-plan) les matchs entre bots du round courant, puis avance si prêt.
async function advTournamentEnsureBotSims() {
  const t = state.tournament;
  if (!t || t.status !== 'active' || tournamentSimming) {
    return;
  }
  tournamentSimming = true;
  try {
    const round = t.rounds[t.currentRound];
    for (const match of round) {
      if (state.tournament !== t || t.status !== 'active') {
        return;
      }
      if (match.winner != null || match.a == null || match.b == null || advMatchIsPlayer(match)) {
        continue;
      }
      match.simulating = true;
      advRenderTournament();
      const sim = await advSimulateBotMatch(
        t.participants[match.a].level,
        t.participants[match.b].level
      );
      if (state.tournament !== t) {
        return;
      }
      match.simulating = false;
      match.sans = sim.sans;
      match.winner = sim.winner === 'w' ? match.a : match.b;
      match.result = sim.winner;
      advRenderTournament();
    }
  } finally {
    tournamentSimming = false;
  }
  advTournamentAdvanceIfReady();
}

function advTournamentAdvanceIfReady() {
  const t = state.tournament;
  if (!t || t.status !== 'active') {
    return;
  }
  const round = t.rounds[t.currentRound];
  if (round.some((m) => m.winner == null)) {
    return; // tous les matchs du round ne sont pas finis
  }
  if (t.currentRound >= t.rounds.length - 1) {
    const finalMatch = round[0];
    t.status = t.participants[finalMatch.winner]?.isPlayer ? 'won' : 'eliminated';
    advRenderTournament();
    return;
  }
  const next = t.rounds[t.currentRound + 1];
  for (const m of round) {
    const target = next[Math.floor(m.slot / 2)];
    if (m.slot % 2 === 0) {
      target.a = m.winner;
    } else {
      target.b = m.winner;
    }
  }
  t.currentRound += 1;
  advRenderTournament();
  advTournamentEnsureBotSims();
}

// Lance le match en direct du joueur (Blancs) contre le bot adverse (mécanique boss).
function advTournamentPlayMatch() {
  const t = state.tournament;
  if (!t || t.status !== 'active') {
    return;
  }
  const round = t.rounds[t.currentRound];
  const match = round.find((m) => advMatchIsPlayer(m) && m.winner == null);
  if (!match || match.a == null || match.b == null) {
    return;
  }
  advSyncGlobalLives();
  if (!advCanFightBots()) {
    advNotifyNoLives();
    return;
  }
  const oppSeed = t.participants[match.a].isPlayer ? match.b : match.a;
  const oppLevel = t.participants[oppSeed].level;
  state.advRun = {
    kind: 'boss',
    bossLevel: oppLevel,
    streak: 0,
    wrongMoves: 0,
    resolved: false,
    tournament: { round: match.round, slot: match.slot }
  };
  state.playMode = 'challenge';
  state.stockfishLevel = oppLevel;
  updateStockfishLevelUi();
  closeAdvTournament();
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.message = `${TOURNAMENT_ROUND_LABELS[match.round]} · Toi (Blancs) vs Bot N${oppLevel}. Sors du livre puis cherche le mat.`;
  }
  renderAdventureHud();
  focusAdvInput();
}

// Résolution du match du joueur après la partie : victoire → avance ; défaite → 1 seul
// réessai, puis élimination.
function advTournamentResolveMatch(result) {
  const t = state.tournament;
  const ref = state.advRun?.tournament;
  state.advRun = null;
  const resultEl = document.querySelector('#advResult');
  if (resultEl) {
    resultEl.hidden = true;
  }
  document.body.classList.remove('is-game-over', 'is-game-lost');
  if (t && ref) {
    const match = t.rounds[ref.round]?.[ref.slot];
    if (match) {
      if (result === 'won') {
        match.winner = TOURNAMENT_PLAYER_SEED;
        match.result = 'player';
      } else if (!match.playerRetryUsed) {
        match.playerRetryUsed = true; // une dernière chance
      } else {
        t.status = 'eliminated';
        advConsumeGlobalLife(); // élimination du tournoi = défaite contre les bots
      }
    }
  }
  openAdvTournament();
  advRenderTournament();
  advTournamentEnsureBotSims();
  advTournamentAdvanceIfReady();
}

function advTournamentWatch(round, slot) {
  const match = state.tournament?.rounds?.[round]?.[slot];
  if (!match || !match.sans?.length) {
    return;
  }
  const title = `${advTournamentParticipantLabel(match.a)} vs ${advTournamentParticipantLabel(match.b)}`;
  openOpeningViewer(
    match.sans,
    title,
    `Vainqueur : ${advTournamentParticipantLabel(match.winner)}`,
    null,
    match.sans.length
  );
}

function advRenderTournamentMatch(match, isCurrent) {
  const t = state.tournament;
  const el = document.createElement('div');
  el.className = 'adv-tour-match';
  const sideRow = (seed) => {
    const row = document.createElement('div');
    const p = seed == null ? null : t.participants[seed];
    row.className = 'adv-tour-side';
    row.classList.toggle('is-player', Boolean(p?.isPlayer));
    row.classList.toggle('is-winner', match.winner != null && match.winner === seed);
    row.classList.toggle('is-out', match.winner != null && seed != null && match.winner !== seed);
    row.textContent = seed == null ? '—' : advTournamentParticipantLabel(seed);
    return row;
  };
  el.append(sideRow(match.a), sideRow(match.b));

  const actions = document.createElement('div');
  actions.className = 'adv-tour-actions';
  const playable =
    advMatchIsPlayer(match) &&
    match.winner == null &&
    isCurrent &&
    t.status === 'active' &&
    match.a != null &&
    match.b != null;
  if (match.simulating) {
    const s = document.createElement('span');
    s.className = 'adv-tour-status';
    s.textContent = '⏳ Simulation…';
    actions.append(s);
  } else if (playable) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-tour-play';
    btn.textContent = match.playerRetryUsed ? '🔁 Rejouer (dernière chance)' : '▶ Jouer mon match';
    btn.addEventListener('click', advTournamentPlayMatch);
    actions.append(btn);
  } else if (match.winner != null && match.sans?.length) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-ghost adv-tour-watch';
    btn.textContent = '👁 Voir';
    btn.addEventListener('click', () => advTournamentWatch(match.round, match.slot));
    actions.append(btn);
  }
  if (actions.childElementCount) {
    el.append(actions);
  }
  return el;
}

function advRenderTournament() {
  const t = state.tournament;
  const host = document.querySelector('#advTournamentBody');
  if (!host) {
    return;
  }
  host.replaceChildren();
  if (!t) {
    return;
  }
  if (t.status !== 'active') {
    const banner = document.createElement('div');
    banner.className = `adv-tour-banner is-${t.status}`;
    banner.textContent =
      t.status === 'won' ? '🏆 Champion ! Tu remportes le tournoi.' : '❌ Éliminé du tournoi.';
    host.append(banner);
  }
  t.rounds.forEach((round, rIdx) => {
    const section = document.createElement('section');
    section.className = `adv-tour-round${rIdx === t.currentRound && t.status === 'active' ? ' is-current' : ''}`;
    const h = document.createElement('h3');
    h.textContent = TOURNAMENT_ROUND_LABELS[rIdx];
    section.append(h);
    for (const match of round) {
      section.append(advRenderTournamentMatch(match, rIdx === t.currentRound));
    }
    host.append(section);
  });
  if (t.status !== 'active') {
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'adv-bottom-btn';
    restart.textContent = '🔁 Nouveau tournoi';
    restart.addEventListener('click', advStartTournament);
    host.append(restart);
  }
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
          w > 0.01 ? `+${Math.round(w)}%` : w < -0.01 ? `${Math.round(w)}%` : `${Math.round(m.baseProb * 100)}%`;
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
  const whitePlayable = inPlay && game.chess.turn() === 'w' && !game.locked && game.phase === 'opening';
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
  if (showChoices && !whiteEdges.length && inPlay && game.chess.turn() === 'b' && game.phase === 'opening') {
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

// Libellé « N. san » / « N… san » du coup amenant à la position `idx`.
function formatHistoryMoveLabel(game, idx) {
  const move = game.chess.history({ verbose: true })[idx - 1];
  if (!move) {
    return 'Départ';
  }
  const moveNumber = Math.ceil(idx / 2);
  return move.color === 'w' ? `${moveNumber}. ${move.san}` : `${moveNumber}… ${move.san}`;
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
      const moveLabel = san ? (cur % 2 === 1 ? `${moveNo}. ${san}` : `${moveNo}… ${san}`) : 'Départ';
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

function advStarString(count) {
  const filled = clamp(Math.round(count), 0, 3);
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
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

// Phrase d'évaluation de la position effondrée : rend la défaite explicite
// (« tu n'avais plus aucune chance ») en chiffrant l'écart pour le joueur (Blancs).
function advDefeatEvalLine(game) {
  if (game?.chess?.isCheckmate?.()) {
    return 'Échec et mat sur l’échiquier — plus aucune ressource.';
  }
  const cp = game?.failureEvaluation?.cpWhite;
  if (!Number.isFinite(cp)) {
    return '';
  }
  const mag = Math.abs(cp);
  const qual =
    mag >= 600 ? 'totalement perdante' : mag >= 300 ? 'largement perdante' : 'très compromise';
  return `Position ${qual} : Stockfish évalue à ${formatEval(cp)} pour toi — tu n’avais plus aucune chance de la sauver.`;
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
  clearGameCinematic();
  game.defeatCinematicPending = false;
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

// Défaite de boss (hors tournoi) : flux en 3 phases pour éviter la confusion
// entre la punition qui se déroule et le choix d'influence.
// A. Cinématique : un seul CTA — avance rapide (+ retour arrière si l'aide existe).
// B. Influence : aucun carton — la vue (revue ‹ › + bandeau de coups) suffit.
// C. Influence terminée : CTA finaux (rejouer / boss suivant / analyser), c'est tout.
function renderBossDefeatResult(el, game, run) {
  el.classList.remove('is-win');
  el.classList.add('is-loss');
  el.replaceChildren();
  const heading = document.createElement('strong');
  const actions = document.createElement('div');
  actions.className = 'adv-result-actions';
  const level = run.bossLevel;

  // --- Phase A : la punition se déroule (ou se prépare encore côté moteur).
  if (game.cinematic || game.defeatCinematicPending) {
    el.hidden = false;
    heading.textContent = 'Défaite — la chute se rejoue…';
    const finalLives = game.finalMateLives || 0;
    const canComeback =
      game.chess.history().length > 0 &&
      ((advAids().takeback && !game.takebackLocked) || finalLives > 0);
    if (canComeback) {
      const label =
        finalLives > 0
          ? `↶ Dernière chance (${finalLives} vie${finalLives > 1 ? 's' : ''})`
          : '↶ Revenir en arrière';
      actions.append(advResultButton(label, () => advUndoDefeat(), true));
    }
    actions.append(advResultButton('⏩ Avance rapide', () => advSkipDefeatCinematic(), !canComeback));
    el.append(heading, actions);
    return;
  }

  // --- Phase B : choix d'influence (carton masqué, la touche « Terminer » clôt).
  const influenceLoss = advInfluenceEnabled() && !game.influenceDone;
  if (influenceLoss && !game.influence && !run.influenceAutoShown) {
    run.influenceAutoShown = true;
    game.influencePending = true;
    setTimeout(() => {
      if (state.game !== game) {
        return;
      }
      game.influencePending = false;
      if (state.advRun === run && game.status === 'lost') {
        openAdvInfluence();
        if (!game.influence) {
          game.influenceDone = true; // rien à influencer → CTA finaux
        }
      }
      renderGameDetails();
      renderGamePanel();
    }, 350);
    el.hidden = true;
    return;
  }
  if (influenceLoss && (game.influence || game.influencePending)) {
    el.hidden = true;
    return;
  }

  // --- Phase C : CTA finaux uniquement.
  el.hidden = false;
  heading.textContent = game.chess?.isCheckmate?.() ? 'Échec et mat subi' : 'Position effondrée';
  actions.append(advResultButton(`🔁 Rejouer le boss N${level}`, () => launchBoss(level), true));
  if (level < 10 && advBossUnlocked(level + 1)) {
    actions.append(advResultButton(`Boss N${level + 1} ▸`, () => launchBoss(level + 1)));
  }
  if (game.recordRef && Array.isArray(game.recordRef.moves) && game.recordRef.moves.length) {
    actions.append(
      advResultButton('🔍 Analyser la partie', () => {
        advRefreshRecordedMoves(game); // s'assure que la suite de défaite est incluse
        openGameReview(game.recordRef);
      })
    );
  }
  el.append(heading, actions);
}

function renderAdventureResult(el, game, run) {
  // Défaite de boss (hors tournoi) : flux dédié en 3 phases (voir ci-dessus).
  if (run.kind === 'boss' && !run.tournament && game.status === 'lost') {
    renderBossDefeatResult(el, game, run);
    return;
  }
  el.hidden = false;
  const win = game.status === 'won';
  el.classList.toggle('is-win', win);
  el.classList.toggle('is-loss', !win);
  el.replaceChildren();

  const heading = document.createElement('strong');
  const stars = document.createElement('div');
  stars.className = 'adv-stars';
  const note = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'adv-result-actions';

  if (run.kind === 'boss' && run.tournament) {
    // Match de tournoi : on route vers le tableau (avance / réessai unique / élimination).
    const ref = run.tournament;
    const t = state.tournament;
    const match = t?.rounds?.[ref.round]?.[ref.slot];
    const roundLabel = TOURNAMENT_ROUND_LABELS[ref.round] || 'Match';
    if (win) {
      heading.textContent = `Match gagné — ${roundLabel}`;
      note.textContent =
        ref.round >= (t ? t.rounds.length - 1 : 2)
          ? 'La couronne est à toi !'
          : 'Tu avances dans le tableau.';
    } else {
      const mated = Boolean(game.chess?.isCheckmate?.());
      const lastChance = !match?.playerRetryUsed;
      heading.textContent = mated ? 'Échec et mat subi' : 'Position effondrée';
      note.textContent = lastChance
        ? 'Tu as droit à un seul réessai de ce match.'
        : 'Réessai déjà utilisé : tu es éliminé du tournoi.';
    }
    actions.append(
      advResultButton('🏆 Continuer le tournoi', () => advTournamentResolveMatch(game.status), true)
    );
  } else if (run.kind === 'boss') {
    // Victoire de boss (la défaite passe par renderBossDefeatResult).
    const level = run.bossLevel;
    const streak = advBossStreakCount(level);
    const conquered = advBossConquered(level);
    stars.innerHTML = advBossStarsMarkup(level);
    if (conquered) {
      heading.textContent = `Boss N${level} maîtrisé !`;
      note.textContent = "Trois victoires d'affilée — le cortex gagne en puissance.";
    } else {
      heading.textContent = `Victoire ${streak}/${ADV_BOSS_STARS} contre N${level}`;
      note.textContent = `Enchaîne ${ADV_BOSS_STARS - streak} victoire(s) d'affilée pour le maîtriser.`;
    }
    // Call to action : rejouer le même boss, + jouer le suivant si une étoile est débloquée.
    actions.append(advResultButton(`🔁 Rejouer le boss N${level}`, () => launchBoss(level), true));
    if (level < 10 && advBossUnlocked(level + 1)) {
      actions.append(advResultButton(`Boss N${level + 1} ▸`, () => launchBoss(level + 1)));
    }
  } else if (run.revisionMode) {
    const total = run.steps?.length || 0;
    const score = run.correctCount || 0;
    heading.textContent = `Révision : ${score}/${total}`;
    note.textContent =
      score === total
        ? 'Sans faute ! Vies rechargées — les bots n’ont qu’à bien se tenir.'
        : 'Révision terminée, les lignes rentrent. Vies rechargées.';
    actions.append(
      advResultButton('Encore une révision ▸', () => launchRevision(run.revisionMode), true)
    );
  } else if (run.trapsMode) {
    if (win) {
      heading.textContent = 'Piège livré !';
      note.textContent = `Échec et mat dans l'ouverture. Cortex à ${advCoveragePct()} %.`;
      actions.append(advResultButton('Un autre piège ▸', () => launchTrapsLesson(), true));
    } else {
      heading.textContent = 'Piège manqué';
      note.textContent = 'Le piège n’a pas abouti. Réessaie de faire tomber Stockfish.';
      actions.append(advResultButton('🔁 Recommencer', () => launchTrapsLesson(), true));
    }
  } else if (win) {
    heading.textContent = 'Ligne maîtrisée !';
    note.textContent = `Cortex illuminé à ${advCoveragePct()} %.`;
    actions.append(advResultButton('Apprendre une autre ligne ▸', () => launchLesson(), true));
  } else {
    heading.textContent = 'Ligne interrompue';
    note.textContent = 'Reprends une ligne du livre pour illuminer plus de neurones.';
    actions.append(advResultButton('🔁 Recommencer', () => launchLesson(), true));
  }

  // Score d'apprentissage (leçon / piège / révision) : total, coups scorés, record.
  const scoreLine = advScoreResultLine(run);
  if (scoreLine) {
    note.textContent += scoreLine;
  }

  // « Dernière chance » pour annuler la défaite : via l'aide retour arrière (une
  // fois) OU une « vie » de la phase finale du mat (S, toutes difficultés).
  const finalLives = game.finalMateLives || 0;
  const canComeback =
    game.status === 'lost' &&
    game.chess.history().length > 0 &&
    ((advAids().takeback && !game.takebackLocked) || finalLives > 0);
  if (canComeback) {
    const label =
      finalLives > 0
        ? `↶ Dernière chance (${finalLives} vie${finalLives > 1 ? 's' : ''})`
        : '↶ Revenir en arrière';
    actions.prepend(advResultButton(label, () => advUndoDefeat(), true));
  }
  // Effondrement : éval bien visible (« aucune chance ») + accès à l'analyse détaillée.
  const evalEl = document.createElement('p');
  evalEl.className = 'adv-result-eval';
  if (!win) {
    const line = advDefeatEvalLine(game);
    if (line) {
      evalEl.textContent = line;
    } else {
      evalEl.hidden = true;
    }
  } else {
    evalEl.hidden = true;
  }

  // « Analyser la partie » : ouvre la revue (sous-variantes : meilleure suite Stockfish
  // + exploration perso) pour comprendre l'effondrement coup par coup.
  if (!win && game.recordRef && Array.isArray(game.recordRef.moves) && game.recordRef.moves.length) {
    actions.append(
      advResultButton('🔍 Analyser la partie', () => {
        const record = game.recordRef;
        advRefreshRecordedMoves(game); // s'assure que la suite de défaite est incluse
        openGameReview(record);
      })
    );
  }

  // Analyse de la partie : compteurs brillant/bon/imprécision/erreur/gaffe + précision.
  // Masquée par défaut (anti-encombrement) et révélée par le bouton « Analyse ».
  const analysisMoves =
    (game.recordRef && Array.isArray(game.recordRef.moves) && game.recordRef.moves.length
      ? game.recordRef.moves
      : buildGameReviewMoves(game)) || [];
  const statsRow = buildMoveStatsRow(analysisMoves);
  if (statsRow) {
    statsRow.hidden = true;
    const analyseBtn = advResultButton('📊 Analyse', () => {
      statsRow.hidden = !statsRow.hidden;
      analyseBtn.classList.toggle('is-active', !statsRow.hidden);
    });
    actions.append(analyseBtn);
  }

  actions.append(advResultButton('Carte du cerveau', () => openAdventureMap()));

  el.append(heading, stars, evalEl, note, actions);
  if (statsRow) {
    el.append(statsRow);
  }
}

function renderAdventureHud() {
  if (!state.adventure) {
    return;
  }
  const progress = advBrainProgress();
  const coveragePct = advCoveragePct();
  advSetText('#advBrainLevel', String(progress.level));
  advSetText('#advXpLabel', `${Math.round(progress.into)} / ${progress.span} XP`);
  advSetWidth('#advXpFill', progress.span ? (progress.into / progress.span) * 100 : 0);
  advSetText('#advPowerValue', `N${state.adventure.highestBoss} / N10`);
  advSetWidth('#advPowerFill', state.adventure.highestBoss * 10);

  const run = state.advRun;
  const game = state.game;
  const kicker = document.querySelector('#advStageKicker');
  const title = document.querySelector('#advStageTitle');
  const starsEl = document.querySelector('#advStars');
  const objective = document.querySelector('#advObjective');
  const streak = document.querySelector('#advStreak');
  const message = document.querySelector('#advMessage');
  const expected = document.querySelector('#advExpected');
  const result = document.querySelector('#advResult');
  const moveInput = document.querySelector('#advMoveInput');
  const moveButton = document.querySelector('#advMoveButton');

  updateAdvMobileBar();

  if (starsEl) {
    starsEl.textContent = '';
  }

  if (!run || !game) {
    if (kicker) kicker.textContent = 'Mode Aventure';
    if (title) title.textContent = 'Choisis une étape';
    if (objective)
      objective.textContent = 'Ouvre la carte du cerveau pour lancer une leçon ou un boss.';
    if (streak) streak.hidden = true;
    if (expected) expected.replaceChildren();
    if (result) result.hidden = true;
    if (message) message.textContent = 'Bienvenue, cerveau. Ouvre la carte pour commencer.';
    if (moveInput) moveInput.disabled = true;
    if (moveButton) moveButton.disabled = true;
    return;
  }

  if (run.kind === 'lesson' && run.revisionMode) {
    const total = run.steps?.length || 0;
    if (kicker)
      kicker.textContent =
        run.revisionMode === 'mate'
          ? `Révision · Refaire un mat${run.revisionLabel ? ' · ' + run.revisionLabel : ''}`
          : 'Révision · Quiz';
    if (title)
      title.textContent = `Coup ${Math.min(run.stepIndex + 1, total)} / ${total} · ⚡ ${Math.round(run.scoreTotal || 0)}`;
    if (objective)
      objective.textContent = 'Trouve le bon coup des Blancs pour recharger tes vies.';
  } else if (run.kind === 'lesson') {
    if (kicker) kicker.textContent = 'Acte 1 · Apprentissage';
    if (title)
      title.textContent =
        run.scoreTarget != null
          ? `Apprends la ligne · ⚡ ${Math.round(run.scoreTotal || 0)} (${run.scorePlayed || 0}/${run.scoreTarget})`
          : 'Apprends la ligne';
    if (objective)
      objective.textContent = `Reste dans le livre jusqu’au bout. Cortex actuel : ${coveragePct} %.`;
  } else {
    const profile = getStockfishLevelProfile(run.bossLevel);
    if (kicker) kicker.textContent = `Acte 2 · Boss N${run.bossLevel}`;
    if (title) title.textContent = `Mater ${profile.label}`;
    if (objective)
      objective.textContent = `Sors du livre puis cherche l’échec et mat contre Stockfish N${run.bossLevel}.`;
  }

  if (streak) {
    if (game.status === 'playing' && (run.streak || 0) >= 2) {
      streak.hidden = false;
      if (state.advViewMode === 'board') {
        // Vue joueur : flammes proportionnelles au streak (max 5)
        streak.textContent = '🔥'.repeat(Math.min(run.streak, 5));
        streak.dataset.streakCount = run.streak;
      } else {
        streak.textContent = `🔥 Combo x${run.streak}`;
        delete streak.dataset.streakCount;
      }
    } else {
      streak.hidden = true;
    }
  }

  if (expected) {
    expected.replaceChildren();
    if (game.status === 'playing' && game.phase === 'opening') {
      for (const edge of getExpectedWhiteBookEdges()) {
        const chip = document.createElement('span');
        chip.className = 'adv-expected-chip';
        chip.textContent = edge.san;
        expected.append(chip);
      }
    }
  }

  if (message) {
    message.textContent = game.message;
  }

  if (result) {
    if (game.status === 'won' || game.status === 'lost') {
      renderAdventureResult(result, game, run);
    } else {
      result.hidden = true;
    }
  }

  const canMove = game.status === 'playing' && game.chess.turn() === 'w' && !game.locked;
  if (moveInput) moveInput.disabled = !canMove;
  if (moveButton) moveButton.disabled = !canMove;
}

function makeAdventureStageRow(options) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `adv-stage${options.cls ? ` ${options.cls}` : ''}`;
  if (options.disabled) {
    button.disabled = true;
  }
  const node = document.createElement('span');
  node.className = 'adv-stage-node';
  node.textContent = options.icon;
  const info = document.createElement('div');
  info.className = 'adv-stage-info';
  const title = document.createElement('strong');
  title.textContent = options.title;
  const desc = document.createElement('span');
  desc.textContent = options.desc;
  info.append(title, desc);
  const stars = document.createElement('span');
  stars.className = 'adv-stage-stars';
  if (options.starsHtml != null) {
    stars.innerHTML = options.starsHtml;
  } else {
    stars.textContent = options.showStars ? advStarString(options.stars) : '';
  }
  button.append(node, info, stars);
  if (!options.disabled && options.onClick) {
    button.addEventListener('click', options.onClick);
  }
  return button;
}

// Bascule entre les vues de la carte : principale, arène, boutique, réglages.
function setAdvMapView(view) {
  state.advMapView = view;
  const panel = document.querySelector('.adv-map-panel');
  if (panel) {
    panel.dataset.view = view;
  }
  document
    .querySelector('#advTabMain')
    ?.classList.toggle('is-active', view === 'main' || view === 'arena' || view === 'lesson');
  document.querySelector('#advTabShop')?.classList.toggle('is-active', view === 'shop');
  document.querySelector('#advSettingsBtn')?.classList.toggle('is-active', view === 'settings');
  document.querySelector('.adv-tab-content')?.scrollTo?.(0, 0);
}

// Sous-titres des deux gros boutons de la vue principale.
function renderAdvMainActions() {
  if (!state.adventure) {
    return;
  }
  const lessonSub = document.querySelector('#advBtnLessonSub');
  if (lessonSub) {
    lessonSub.textContent = `Libre ou piège · cortex à ${advCoveragePct()} %`;
  }
  const arenaSub = document.querySelector('#advBtnArenaSub');
  if (arenaSub) {
    arenaSub.textContent = advAct2Unlocked()
      ? `Affronte Stockfish · meilleur N${state.adventure.highestBoss}/10`
      : `Verrouillé · illumine ${Math.round(ADV_ACT2_UNLOCK * 100)} % du cortex`;
  }
  renderAdvLivesBanner();
}

// Bandeau « vies contre les bots » : cœurs + statut (verrou / révise / demain).
function renderAdvLivesBanner() {
  const host = document.querySelector('#advLivesBanner');
  if (!host) {
    return;
  }
  host.replaceChildren();
  const lives = advGlobalLives();
  const unlocked = advLivesUnlocked();
  host.dataset.state = !unlocked ? 'locked' : lives > 0 ? 'ok' : 'empty';

  const hearts = document.createElement('div');
  hearts.className = 'adv-lives-banner-hearts';
  if (!unlocked) {
    const lock = document.createElement('span');
    lock.className = 'adv-life is-empty';
    lock.textContent = '🔒';
    hearts.append(lock);
  } else {
    for (let i = 0; i < ADV_GLOBAL_LIVES_MAX; i += 1) {
      const h = document.createElement('span');
      h.className = `adv-life ${i < lives ? 'is-full' : 'is-empty'}`;
      h.textContent = '♥';
      hearts.append(h);
    }
  }
  host.append(hearts);

  const txt = document.createElement('span');
  txt.className = 'adv-lives-banner-text';
  txt.textContent = !unlocked
    ? `Atteins 50 % du cortex pour débloquer 3 vies (cortex ${advCoveragePct()} %).`
    : lives > 0
      ? `${lives} défaite${lives > 1 ? 's' : ''} possible${lives > 1 ? 's' : ''} contre les bots.`
      : 'Plus de vies : révise une ligne ou reviens demain.';
  host.append(txt);
}

// Vue « Illuminer le cerveau » : anneau cortex + choix du parcours (libre / piège).
function renderAdvLessonChoice() {
  if (!state.adventure) {
    return;
  }
  const pct = advCoveragePct();
  const brain = document.querySelector('#advLessonBrain');
  if (brain) {
    brain.style.setProperty('--xp-pct', String(pct));
  }
  advSetText('#advLessonCortex', `${pct} %`);
  // Le mode « Piège » se débloque une fois tout le cortex illuminé.
  const unlocked = advTrapsUnlocked();
  const trapBtn = document.querySelector('#advLessonTrap');
  if (trapBtn) {
    trapBtn.disabled = !unlocked;
    trapBtn.classList.toggle('is-locked', !unlocked);
  }
  const trapSub = document.querySelector('#advLessonTrapSub');
  if (trapSub) {
    trapSub.textContent = unlocked
      ? 'Fais tomber Stockfish dans un piège'
      : 'Verrouillé · illumine 100 % du cortex';
  }
}

function renderAdventureMap() {
  if (!state.adventure) {
    return;
  }
  advSyncGlobalLives(); // déblocage 50 % + reset quotidien à l'ouverture de la carte
  const coveragePct = advCoveragePct();
  // Pastille « niveau joueur » en haut à gauche de la carte (cadre = jauge d'XP),
  // comme sur les autres écrans. La cartouche de stats a été supprimée.
  const playerProg = advPlayerProgress();
  advSetText('#advMapLevelValue', String(playerProg.level));
  const levelBubble = document.querySelector('#advMapLevel');
  if (levelBubble) {
    const pct = clamp((playerProg.into / playerProg.span) * 100, 0, 100);
    levelBubble.style.setProperty('--xp-pct', pct.toFixed(1));
    levelBubble.title = `Niveau joueur ${playerProg.level} · ${playerProg.xp} XP`;
  }
  renderAdvDifficulty();
  renderAdvTimeControl();
  renderAdvMateHandover();
  renderAdvInfluenceSetting();
  renderAdvShop();
  renderAdvGameHistory();
  renderAdvMainActions();
  renderAdvLessonChoice();

  const act2 = document.querySelector('#advAct2Stages');
  const lock = document.querySelector('#advAct2Lock');
  const unlocked = advAct2Unlocked();
  if (lock) {
    // Texte allégé : rien quand l'arène est ouverte (l'écran tient sans scroll),
    // une seule ligne courte sinon.
    lock.hidden = unlocked;
    lock.textContent = unlocked
      ? ''
      : `Verrouillé · illumine ${Math.round(ADV_ACT2_UNLOCK * 100)} % du cortex (actuel ${coveragePct} %).`;
  }
  if (act2) {
    act2.replaceChildren();
    const target = advCurrentBossTarget();
    for (let level = 1; level <= 10; level += 1) {
      const profile = getStockfishLevelProfile(level);
      const conquered = advBossConquered(level);
      const open = advBossUnlocked(level);
      const isCurrent = open && !conquered && level === target;
      act2.append(
        makeAdventureStageRow({
          icon: open ? `N${level}` : '🔒',
          title: profile.label,
          desc: profile.elo ? `${profile.elo} Elo` : 'Force max',
          starsHtml: open ? advBossStarsMarkup(level) : '',
          cls: conquered ? 'is-done' : isCurrent ? 'is-current' : open ? '' : 'is-locked',
          disabled: !open,
          onClick: () => launchBoss(level)
        })
      );
    }
  }
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
  bindPanelResizeHandles(renderGraph);
  bindBoardDragEvents();
  initBrainScrub({ renderGraph, renderBoard }); // injection : re-rendu graphe + échiquier
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
  const response = await fetch('./opening-graph.json');
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
