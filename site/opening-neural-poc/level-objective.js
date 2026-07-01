// Objectif d'un niveau solo : survie (tenir N coups libres) ou mat.
// Domaine pur, sans état global : dérive l'objectif d'un niveau et le formate.

// Coups libres à tenir par niveau ; au-delà, l'objectif devient le mat.
const FREE_SURVIVAL_TARGETS = [5, 7, 10, 13, 15];

export function getLevelObjective(level) {
  const target = FREE_SURVIVAL_TARGETS[level - 1];
  if (Number.isFinite(target)) {
    return { type: 'survival', target };
  }
  return { type: 'mate', target: Number.POSITIVE_INFINITY };
}

export function isMateObjective(game) {
  return game?.objective?.type === 'mate';
}

export function formatLevelObjective(level) {
  const objective = getLevelObjective(level);
  return objective.type === 'mate'
    ? "mater l'adversaire"
    : `tenir ${objective.target} coups complets libres`;
}

export function formatSurvivalTarget(game) {
  return isMateObjective(game) ? "jusqu'au mat" : `${game.objective.target}`;
}
