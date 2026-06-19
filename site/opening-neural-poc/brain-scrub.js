// Vue cerveau au doigt : glisser sur le graphe pour révéler les positions
// (mini-échiquier de prévisualisation + infos + retour haptique au changement de
// nœud). Couplé à l'état (scrubPoints, view, brainFocus) et au DOM. Le re-rendu du
// graphe et le rendu d'un échiquier sont INJECTÉS (initBrainScrub) pour éviter une
// dépendance circulaire avec app.js.
import { elements } from './elements.js';
import { state } from './state.js';
import { formatEval } from './eval-commentary.js';

// Re-rendu du graphe / rendu d'un échiquier, injectés par app.js (cf. initBrainScrub).
let renderGraph = () => {};
let renderBoard = () => {};

export function initBrainScrub(deps) {
  renderGraph = deps.renderGraph ?? renderGraph;
  renderBoard = deps.renderBoard ?? renderBoard;
}

let brainScrub = null;

export function bindBrainScrubEvents() {
  elements.graphSvg?.addEventListener('pointerdown', onBrainPointerDown);
  // Taper le fond (hors nœud/arc) dézoome la vue cerveau.
  elements.graphSvg?.addEventListener('click', (event) => {
    if (state.suppressNextGraphClick) {
      return;
    }
    if (
      state.brainFocus &&
      !event.target.closest?.('.neural-node') &&
      !event.target.closest?.('.neural-edge')
    ) {
      state.brainFocus = null;
      renderGraph();
    }
  });
}

// Actif quand le graphe est la vue principale « cerveau » de l'Aventure.
export function isBrainScrubContext() {
  return state.screen === 'adventure' && state.advViewMode === 'brain';
}

function onBrainPointerDown(event) {
  if (!isBrainScrubContext()) {
    return;
  }
  brainScrub = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    started: false,
    lastId: null,
    branchNodeIds: null // G : branche actuellement suivie (collante)
  };
  window.addEventListener('pointermove', onBrainPointerMove);
  window.addEventListener('pointerup', onBrainPointerUp);
  window.addEventListener('pointercancel', onBrainPointerUp);
}

function onBrainPointerMove(event) {
  if (!brainScrub || event.pointerId !== brainScrub.pointerId) {
    return;
  }
  if (!brainScrub.started) {
    if (Math.hypot(event.clientX - brainScrub.startX, event.clientY - brainScrub.startY) < 8) {
      return; // reste un tap potentiel (sélection de noeud)
    }
    brainScrub.started = true;
    showBrainScrub(true);
  }
  event.preventDefault();
  const point = graphNearestScrubPoint(event.clientX, event.clientY, brainScrub.branchNodeIds);
  const key = point?.fen;
  if (point && key !== brainScrub.lastId) {
    brainScrub.lastId = key;
    // G : la branche suivie devient celle de ce point (racine → nœud courant).
    brainScrub.branchNodeIds = brainBranchPath(point.nodeId).nodeIds;
    updateBrainScrub(point);
    navigator.vibrate?.(8); // retour haptique (Android) si supporté
  }
}

// Point défilable (nœud ou coup intermédiaire) le plus proche du doigt. G : on
// applique un bonus de distance aux points de la branche déjà suivie pour rester
// dessus (au lieu de sauter vers une branche voisine au moindre mouvement).
function graphNearestScrubPoint(clientX, clientY, branchNodeIds = null) {
  const svg = elements.graphSvg;
  const ctm = svg?.getScreenCTM?.();
  if (!ctm || !state.scrubPoints?.length) {
    return null;
  }
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  let best = null;
  let bestScore = Infinity;
  for (const sp of state.scrubPoints) {
    let score = Math.hypot(sp.x - pt.x, sp.y - pt.y);
    if (branchNodeIds && branchNodeIds.has(sp.nodeId)) {
      score *= 0.5; // « collant » à la branche courante (hystérésis)
    }
    if (score < bestScore) {
      bestScore = score;
      best = sp;
    }
  }
  return best;
}

// Chemin (nœuds + arcs) de la racine jusqu'au nœud donné : définit la « branche »
// suivie pour le scrub (surbrillance + hystérésis).
function brainBranchPath(nodeId) {
  const view = state.view;
  const nodeIds = new Set();
  const edgeIds = new Set();
  if (!view || !nodeId) {
    return { nodeIds, edgeIds };
  }
  let current = nodeId;
  let guard = 0;
  while (current && !nodeIds.has(current) && guard < 300) {
    guard += 1;
    nodeIds.add(current);
    const viewNode = view.nodesById.get(current);
    const inEdgeId = viewNode?.incoming?.[0];
    if (!inEdgeId) {
      break;
    }
    edgeIds.add(inEdgeId);
    const edge = view.edgesById.get(inEdgeId);
    if (!edge) {
      break;
    }
    current = edge.from;
  }
  return { nodeIds, edgeIds };
}

function onBrainPointerUp(event) {
  if (!brainScrub || event.pointerId !== brainScrub.pointerId) {
    return;
  }
  const wasScrubbing = brainScrub.started;
  brainScrub = null;
  window.removeEventListener('pointermove', onBrainPointerMove);
  window.removeEventListener('pointerup', onBrainPointerUp);
  window.removeEventListener('pointercancel', onBrainPointerUp);
  if (wasScrubbing) {
    // évite la sélection de noeud par le clic synthétique qui suit le scrub
    state.suppressNextGraphClick = true;
    setTimeout(() => {
      state.suppressNextGraphClick = false;
    }, 60);
  }
}

export function showBrainScrub(show) {
  const panel = document.querySelector('#brainScrub');
  if (panel) {
    panel.classList.toggle('is-active', show);
    panel.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  if (!show) {
    clearScrubNodeHighlight();
  }
}

function updateBrainScrub(point) {
  if (!point) {
    return;
  }
  const boardEl = document.querySelector('#brainScrubBoard');
  if (boardEl) {
    renderBoard(
      { id: `scrub-${point.fen}`, fen: point.fen, from: point.from, to: point.to, san: point.san },
      boardEl
    );
  }
  const title = document.querySelector('#brainScrubTitle');
  if (title) {
    title.textContent = point.label || point.san || '—';
  }
  const meta = document.querySelector('#brainScrubMeta');
  if (meta) {
    const colorTxt =
      point.moveColor === 'w' ? '⬜ Coup blanc' : point.moveColor === 'b' ? '⬛ Coup noir' : 'Position de départ';
    const evalTxt = point.eval != null ? ` · Éval ${formatEval(point.eval)}` : '';
    meta.textContent = `${colorTxt}${evalTxt}`;
  }
  highlightScrubBranch(point.nodeId);
}

// G : met en surbrillance toute la branche suivie (nœuds + arcs de la racine au
// nœud courant), avec le nœud courant accentué.
function highlightScrubBranch(nodeId) {
  clearScrubNodeHighlight();
  const svg = elements.graphSvg;
  if (!svg || !nodeId) {
    return;
  }
  const { nodeIds, edgeIds } = brainBranchPath(nodeId);
  for (const id of nodeIds) {
    const el = svg.querySelector(`.neural-node[data-node-id="${CSS.escape(id)}"]`);
    el?.classList.add(id === nodeId ? 'is-scrub' : 'is-scrub-branch');
  }
  for (const id of edgeIds) {
    for (const el of svg.querySelectorAll(`.neural-edge[data-edge-id="${CSS.escape(id)}"]`)) {
      el.classList.add('is-scrub-branch');
    }
  }
}

function clearScrubNodeHighlight() {
  for (const el of elements.graphSvg?.querySelectorAll('.is-scrub, .is-scrub-branch') ?? []) {
    el.classList.remove('is-scrub', 'is-scrub-branch');
  }
}
