// Géométrie du graphe cerveau : placement des nœuds en couloirs (layout), boîte de
// zoom « dans les lignes », positions rejouées d'une séquence compressée, tracé du
// contour cérébral et des arêtes (Bézier cubique) + échantillonnage de la courbe.
// Sous-couche de la pipeline de rendu : écrit/lit state.layout, lit state.data ;
// le rendu SVG lui-même (renderGraph) reste dans app.js.
import { elements } from './elements.js';
import { state } from './state.js';
import { clamp } from './utils.js';
import { getNode } from './graph.js';
import { Chess } from './vendor/chess.js';

function computeLayout(view) {
  const svg = elements.graphSvg;
  const rect = svg.getBoundingClientRect();
  const width = Math.max(640, rect.width || 960);
  const height = Math.max(430, rect.height || 620);
  const maxPly = Math.max(1, state.data.summary.maxPly);
  const padding = {
    left: 66,
    right: 66,
    top: 42,
    bottom: 48
  };
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const laneByNode = new Map();
  let nextLane = 0;

  state.layout.clear();

  function lineIndex(edge) {
    const index = state.data.lines.findIndex((line) => edge.sources.includes(line.event));
    return index < 0 ? 999 : index;
  }

  function sortedOutgoing(node) {
    return node.outgoing
      .map((edgeId) => view.edgesById.get(edgeId))
      .filter(Boolean)
      .sort((a, b) => {
        const lineDelta = lineIndex(a) - lineIndex(b);
        if (lineDelta) {
          return lineDelta;
        }
        const branchDelta = (b.probability ?? 0) - (a.probability ?? 0);
        return branchDelta || a.id.localeCompare(b.id, undefined, { numeric: true });
      });
  }

  function assignLane(node, active = new Set()) {
    if (laneByNode.has(node.id)) {
      return laneByNode.get(node.id);
    }
    if (active.has(node.id)) {
      return nextLane;
    }

    active.add(node.id);
    const children = sortedOutgoing(node)
      .map((edge) => view.nodesById.get(edge.to))
      .filter(Boolean);
    let lane;
    if (!children.length) {
      lane = nextLane;
      nextLane += 1;
    } else {
      const childLanes = children.map((child) => assignLane(child, active));
      lane = childLanes.reduce((sum, value) => sum + value, 0) / childLanes.length;
    }
    active.delete(node.id);
    laneByNode.set(node.id, lane);
    return lane;
  }

  assignLane(view.nodesById.get('root'));

  for (const node of view.nodes) {
    if (!laneByNode.has(node.id)) {
      assignLane(node);
    }
  }

  const laneCount = Math.max(1, nextLane);
  const laneStep = usableHeight / Math.max(1, laneCount - 1);
  for (const node of view.nodes) {
    const lane = laneByNode.get(node.id) ?? 0;
    const x = padding.left + (node.raw.ply / maxPly) * usableWidth;
    const softWave = Math.sin(node.raw.ply * 0.5 + lane * 0.4) * Math.min(10, laneStep * 0.22);
    const y = laneCount === 1 ? height / 2 : padding.top + lane * laneStep + softWave;
    state.layout.set(node.id, {
      x,
      y: clamp(y, padding.top, height - padding.bottom)
    });
  }

  return { width, height };
}

// Zoom « dans les lignes » (téléphone) : viewBox resserré autour du nœud ciblé, en
// laissant de la place à droite pour voir ses continuations.
function computeBrainFocusViewBox(focusId, fullW, fullH) {
  const p = state.layout?.get(focusId);
  if (!p) {
    return null;
  }
  const zoom = 2.4;
  const w = fullW / zoom;
  const h = fullH / zoom;
  let x = p.x - w * 0.32; // nœud à ~1/3 depuis la gauche, lignes vers la droite
  let y = p.y - h / 2;
  x = clamp(x, 0, Math.max(0, fullW - w));
  y = clamp(y, 0, Math.max(0, fullH - h));
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
}

// Positions (FEN + coup) de chaque demi-coup d'un arc compressé, rejouées depuis la source.
function computeEdgeSequencePositions(edge) {
  if (!edge?.isCompressed || !edge.sequence?.length) {
    return [];
  }
  const source = getNode(edge.from);
  if (!source?.fen) {
    return [];
  }
  const probe = new Chess(source.fen);
  const out = [];
  for (const san of edge.sequence) {
    let move = null;
    try {
      move = probe.move(san);
    } catch {
      move = null;
    }
    if (!move) {
      break;
    }
    out.push({ fen: probe.fen(), san: move.san, from: move.from, to: move.to });
  }
  return out;
}

function brainOutlinePath(width, height) {
  const left = width * 0.09;
  const right = width * 0.91;
  const top = height * 0.16;
  const bottom = height * 0.86;
  const mid = height * 0.52;
  return [
    `M ${left + 60} ${mid}`,
    `C ${left - 18} ${top + 94}, ${left + 120} ${top - 38}, ${width * 0.34} ${top + 26}`,
    `C ${width * 0.46} ${top - 52}, ${width * 0.61} ${top - 18}, ${width * 0.68} ${top + 48}`,
    `C ${right + 34} ${top + 44}, ${right + 30} ${mid - 34}, ${right - 26} ${mid}`,
    `C ${right + 56} ${mid + 106}, ${right - 100} ${bottom + 34}, ${width * 0.66} ${bottom - 30}`,
    `C ${width * 0.53} ${bottom + 42}, ${width * 0.38} ${bottom + 6}, ${width * 0.31} ${bottom - 56}`,
    `C ${left + 82} ${bottom - 24}, ${left - 34} ${mid + 102}, ${left + 60} ${mid}`,
    'Z'
  ].join(' ');
}

function edgeControlPoints(edge) {
  const source = state.layout.get(edge.from);
  const target = state.layout.get(edge.to);
  if (!source || !target) {
    return null;
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  return {
    p0: { x: source.x, y: source.y },
    c1: { x: source.x + dx * 0.62, y: source.y + dy * 0.08 },
    c2: { x: target.x - dx * 0.34, y: target.y - dy * 0.08 },
    p3: { x: target.x, y: target.y }
  };
}

function edgePath(edge) {
  const cp = edgeControlPoints(edge);
  if (!cp) {
    return '';
  }
  return `M ${cp.p0.x.toFixed(1)} ${cp.p0.y.toFixed(1)} C ${cp.c1.x.toFixed(1)} ${cp.c1.y.toFixed(1)}, ${cp.c2.x.toFixed(1)} ${cp.c2.y.toFixed(1)}, ${cp.p3.x.toFixed(1)} ${cp.p3.y.toFixed(1)}`;
}

// Point et tangente d'une courbe de Bézier cubique au paramètre t (pour poser les barreaux).
function cubicBezierAt(cp, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  const da = 3 * mt * mt;
  const db = 6 * mt * t;
  const dc = 3 * t * t;
  return {
    x: a * cp.p0.x + b * cp.c1.x + c * cp.c2.x + d * cp.p3.x,
    y: a * cp.p0.y + b * cp.c1.y + c * cp.c2.y + d * cp.p3.y,
    tx: da * (cp.c1.x - cp.p0.x) + db * (cp.c2.x - cp.c1.x) + dc * (cp.p3.x - cp.c2.x),
    ty: da * (cp.c1.y - cp.p0.y) + db * (cp.c2.y - cp.c1.y) + dc * (cp.p3.y - cp.c2.y)
  };
}

export {
  computeLayout,
  computeBrainFocusViewBox,
  computeEdgeSequencePositions,
  brainOutlinePath,
  edgeControlPoints,
  edgePath,
  cubicBezierAt
};
