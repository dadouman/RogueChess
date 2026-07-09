// Modèle de vue du graphe : filtres de lignes, valeur/probabilité des branches
// (softmax + planchers, branches de mat), et compression des chaînes linéaires en
// arêtes de vue. Transforme l'état/graphe brut en structure prête à dessiner ;
// aucune dépendance au DOM ni au rendu (renderGraph en reste le consommateur).
import { state } from './state.js';
import { getNode, getEdge } from './graph.js';
import { scoreForSide } from './chess-utils.js';
import { clamp } from './utils.js';
import {
  MATE_SCORE_CP,
  MATE_BRANCH_MIN_PROBABILITY,
  PROBABILITY_TEMPERATURE_CP,
  PROBABILITY_FLOOR_MASS
} from './constants.js';

function nodeMatchesFilter(node) {
  return state.lineFilter === 'all' || node.sources.includes(state.lineFilter);
}

function edgeMatchesFilter(edge) {
  return state.lineFilter === 'all' || edge.sources.includes(state.lineFilter);
}

function getBranchValue(edge) {
  const target = getNode(edge.to);
  if (!target) {
    return 0;
  }
  if (target.terminal || !target.outgoing.length) {
    return target.evaluation?.cpWhite ?? target.futureMeanCp ?? 0;
  }
  return Number.isFinite(target.futureMeanCp)
    ? target.futureMeanCp
    : (target.evaluation?.cpWhite ?? 0);
}

function isMateNode(node) {
  return Boolean(node?.terminal && Math.abs(node.evaluation?.cpWhite ?? 0) >= MATE_SCORE_CP - 1000);
}

function branchEventuallyEndsInMate(edge) {
  let current = getNode(edge?.to);
  let guard = 0;
  while (current && guard < 80) {
    if (isMateNode(current)) {
      return true;
    }
    if (current.outgoing.length !== 1) {
      return false;
    }
    const nextEdge = getEdge(current.outgoing[0]);
    current = nextEdge ? getNode(nextEdge.to) : null;
    guard += 1;
  }
  return false;
}

function applyMinimumProbabilities(scored) {
  const reserved = scored.map((item) => (item.edge.endsInMate ? MATE_BRANCH_MIN_PROBABILITY : 0));
  const reservedTotal = reserved.reduce((sum, value) => sum + value, 0);
  if (reservedTotal <= 0 || reservedTotal >= 0.95) {
    return;
  }

  let freeTotal = 0;
  for (const [index, item] of scored.entries()) {
    if (!item.edge.endsInMate) {
      freeTotal += item.edge.probability;
    } else if (item.edge.probability > reserved[index]) {
      freeTotal += item.edge.probability - reserved[index];
    }
  }

  if (freeTotal <= 0) {
    scored.forEach((item, index) => {
      item.edge.probability = reserved[index] || (1 - reservedTotal) / scored.length;
    });
    return;
  }

  const scale = (1 - reservedTotal) / freeTotal;
  scored.forEach((item, index) => {
    const reserve = reserved[index];
    const free = item.edge.endsInMate
      ? Math.max(0, item.edge.probability - reserve)
      : item.edge.probability;
    item.edge.probability = reserve + free * scale;
  });
}

function normalizeScoredProbabilities(scored) {
  if (!scored.length) {
    return;
  }

  const total = scored.reduce((sum, item) => sum + Math.max(0, item.edge.probability ?? 0), 0);
  if (total <= 0) {
    const equal = 1 / scored.length;
    scored.forEach((item) => {
      item.edge.probability = equal;
    });
    return;
  }

  scored.forEach((item) => {
    item.edge.probability = Math.max(0, item.edge.probability ?? 0) / total;
  });
}

export function computeGraphFutureMeans(graph) {
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

export function assignGraphProbabilities(graph) {
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

function recomputeViewProbabilities(view) {
  for (const node of view.nodes) {
    const outgoing = node.outgoing.map((edgeId) => view.edgesById.get(edgeId)).filter(Boolean);
    if (!outgoing.length) {
      continue;
    }

    if (outgoing.length === 1) {
      outgoing[0].probability = 1;
      outgoing[0].deltaCp = 0;
      outgoing[0].isBest = true;
      continue;
    }

    const scored = outgoing.map((edge) => {
      const pathMean = getBranchValue(edge);
      return {
        edge,
        pathMean,
        score: scoreForSide(pathMean, node.raw.sideToMove)
      };
    });
    const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
    const bestScore = Math.max(...scored.map((item) => item.score));
    const raw = scored.map((item) =>
      Math.exp(clamp(item.score - average, -800, 800) / state.temperatureCp)
    );
    const rawTotal = raw.reduce((sum, value) => sum + value, 0);

    scored.forEach((item, index) => {
      const softmax = raw[index] / rawTotal;
      item.edge.probability = state.floorMass / scored.length + (1 - state.floorMass) * softmax;
      item.edge.deltaCp = Math.round(item.score - average);
      item.edge.pathMeanCp = Math.round(item.pathMean);
      item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
    });
    applyMinimumProbabilities(scored);
    normalizeScoredProbabilities(scored);
  }
}

function createCompressedView() {
  const visibleNodeIds = new Set();
  for (const node of state.data.nodes) {
    if (
      node.id === 'root' ||
      node.terminal ||
      node.outgoing.length !== 1 ||
      node.incoming.length !== 1
    ) {
      visibleNodeIds.add(node.id);
    }
  }

  const viewNodes = [...visibleNodeIds].map((nodeId) => ({
    id: nodeId,
    raw: getNode(nodeId),
    outgoing: [],
    incoming: [],
    collapsedIncomingPlyCount: 0
  }));
  const viewNodesById = new Map(viewNodes.map((node) => [node.id, node]));
  const viewEdges = [];

  function collectUnique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  for (const source of viewNodes) {
    const rawSource = source.raw;
    for (const firstEdgeId of rawSource.outgoing) {
      const firstEdge = getEdge(firstEdgeId);
      if (!firstEdge) {
        continue;
      }

      const pathEdgeIds = [firstEdge.id];
      const pathNodeIds = [firstEdge.to];
      const sources = [...firstEdge.sources];
      const comments = [...firstEdge.comments];
      let current = getNode(firstEdge.to);

      while (current && !visibleNodeIds.has(current.id)) {
        sources.push(...current.sources);
        comments.push(...current.comments);
        const nextEdge = getEdge(current.outgoing[0]);
        if (!nextEdge) {
          break;
        }
        pathEdgeIds.push(nextEdge.id);
        pathNodeIds.push(nextEdge.to);
        sources.push(...nextEdge.sources);
        comments.push(...nextEdge.comments);
        current = getNode(nextEdge.to);
      }

      if (!current) {
        continue;
      }

      const target = viewNodesById.get(current.id);
      if (!target) {
        continue;
      }

      const sequence = pathEdgeIds.map((edgeId) => getEdge(edgeId)?.san).filter(Boolean);
      const viewEdge = {
        id: `v${viewEdges.length + 1}`,
        from: rawSource.id,
        to: current.id,
        san: firstEdge.san,
        rawSan: firstEdge.rawSan,
        annotation: firstEdge.annotation,
        uci: firstEdge.uci,
        color: firstEdge.color,
        comments: collectUnique(comments),
        sources: collectUnique(sources),
        probability: 1,
        deltaCp: 0,
        pathMeanCp: getBranchValue({ to: current.id }),
        isBest: false,
        isCompressed: pathEdgeIds.length > 1,
        pathEdgeIds,
        pathNodeIds,
        sequence,
        sequenceLabel: sequence.join(' '),
        collapsedPlyCount: pathEdgeIds.length,
        endsInMate: isMateNode(current),
        terminal: current.terminal
      };

      viewEdges.push(viewEdge);
      source.outgoing.push(viewEdge.id);
      target.incoming.push(viewEdge.id);
      target.collapsedIncomingPlyCount = Math.max(
        target.collapsedIncomingPlyCount,
        viewEdge.collapsedPlyCount
      );
    }
  }

  const viewEdgesById = new Map(viewEdges.map((edge) => [edge.id, edge]));
  return { nodes: viewNodes, edges: viewEdges, nodesById: viewNodesById, edgesById: viewEdgesById };
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

export {
  nodeMatchesFilter,
  edgeMatchesFilter,
  getBranchValue,
  isMateNode,
  branchEventuallyEndsInMate,
  applyMinimumProbabilities,
  normalizeScoredProbabilities,
  recomputeViewProbabilities,
  createCompressedView,
  projectRawPathToView,
  findCurrentViewSegment
};
