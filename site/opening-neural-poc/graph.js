// Modèle du graphe d'ouverture (le « livre ») : accesseurs sur les nœuds/arêtes
// et sélection pondérée des coups. S'appuie sur l'état partagé et un util RNG.
import { state } from './state.js';
import { randomUnit } from './utils.js';

export function getNode(id) {
  return state.nodesById.get(id);
}

export function getEdge(id) {
  return state.edgesById.get(id);
}

export function getRawOutgoingEdges(nodeId, color = null) {
  const node = getNode(nodeId);
  if (!node) {
    return [];
  }
  return node.outgoing
    .map(getEdge)
    .filter((edge) => edge && (!color || edge.color === color));
}

export function normalizeWeightedCandidates(candidates) {
  if (!candidates.length) {
    return [];
  }

  const total = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.probability ?? 0),
    0
  );
  if (total <= 0) {
    const equal = 1 / candidates.length;
    return candidates.map((candidate) => ({ ...candidate, probability: equal }));
  }

  return candidates.map((candidate) => ({
    ...candidate,
    probability: Math.max(0, candidate.probability ?? 0) / total
  }));
}

export function pickWeightedCandidate(candidates) {
  const normalized = normalizeWeightedCandidates(candidates);
  if (!normalized.length) {
    return null;
  }

  const weighted = normalized.map((candidate) => ({
    ...candidate,
    lotteryWeight: candidate.probability
  }));

  const total = weighted.reduce((sum, candidate) => sum + candidate.lotteryWeight, 0);
  let roll = randomUnit() * total;
  let selected = weighted[weighted.length - 1];
  for (const candidate of weighted) {
    roll -= candidate.lotteryWeight;
    if (roll <= 0) {
      selected = candidate;
      break;
    }
  }

  return selected;
}
