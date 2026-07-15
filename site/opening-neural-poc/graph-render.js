import { elements } from './elements.js';
import { state } from './state.js';
import { clamp, moveColorAt } from './utils.js';
import { isBrainScrubContext } from './brain-scrub.js';
import { isAdventureEdgeMastered, isAdventureMastered } from './adventure-status.js';
import {
  nodeMatchesFilter,
  edgeMatchesFilter,
  createCompressedView,
  recomputeViewProbabilities
} from './graph-view-model.js';
import {
  computeLayout,
  computeBrainFocusViewBox,
  computeEdgeSequencePositions,
  brainOutlinePath,
  edgeControlPoints,
  edgePath,
  cubicBezierAt
} from './graph-geometry.js';
import { createSvgElement } from './svg.js';
import {
  showNodeTooltip,
  showEdgeTooltip,
  showRungTooltip,
  hideTooltip
} from './graph-tooltips.js';

let shouldFollowGameInGraph = () => false;
let syncGameGraphSelection = () => {};
let selectEdge = () => {};
let selectNode = () => {};
let renderDetails = () => {};

export function initGraphRenderer(deps) {
  shouldFollowGameInGraph = deps.shouldFollowGameInGraph ?? shouldFollowGameInGraph;
  syncGameGraphSelection = deps.syncGameGraphSelection ?? syncGameGraphSelection;
  selectEdge = deps.selectEdge ?? selectEdge;
  selectNode = deps.selectNode ?? selectNode;
  renderDetails = deps.renderDetails ?? renderDetails;
}

export function renderGraph() {
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
  const glow = createSvgElement('filter', {
    id: 'nodeGlow',
    x: '-80%',
    y: '-80%',
    width: '260%',
    height: '260%'
  });
  glow.append(
    createSvgElement('feGaussianBlur', { stdDeviation: '4', result: 'blur' }),
    createSvgElement('feColorMatrix', {
      in: 'blur',
      type: 'matrix',
      values: '1 0 0 0 0.95  0 1 0 0 0.78  0 0 1 0 0.22  0 0 0 0.55 0'
    }),
    createSvgElement('feMerge')
  );
  glow.lastChild.append(
    createSvgElement('feMergeNode'),
    createSvgElement('feMergeNode', { in: 'SourceGraphic' })
  );
  defs.append(glow);
  svg.append(defs);

  svg.append(
    createSvgElement('path', { class: 'brain-outline', d: brainOutlinePath(width, height) })
  );

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
    const strokeWidth = isHighlighted ? 5.4 : isForced ? 2.65 : 2.3 + edge.probability * 4.9;
    const edgeOpacity = isHighlighted ? 0.95 : isForced ? 0.56 : 0.46 + edge.probability * 0.42;
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
            ]
              .filter(Boolean)
              .join(' ')
          });
          rungGroup.append(
            createSvgElement('line', { class: 'edge-rung-hit', ...coords }),
            createSvgElement('line', { class: 'edge-rung', ...coords })
          );
          const moveIndex = i;
          rungGroup.addEventListener('mouseenter', (event) =>
            showRungTooltip(edge, moveIndex, event)
          );
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
    const evalTone = clamp(
      ((node.futureMeanCp ?? node.evaluation?.cpWhite ?? 0) + 250) / 500,
      0,
      1
    );
    const outgoing = viewNode.outgoing.length;
    const radius =
      node.id === 'root'
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
  const focusBox = state.brainFocus
    ? computeBrainFocusViewBox(state.brainFocus, width, height)
    : null;
  if (focusBox) {
    svg.setAttribute('viewBox', focusBox);
  }
  document.body.classList.toggle('is-brain-focused', Boolean(focusBox));

  renderDetails();
}
