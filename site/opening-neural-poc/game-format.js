import { isMateObjective, formatSurvivalTarget } from './level-objective.js';

export function formatSourceList(sources) {
  if (!sources.length) {
    return '-';
  }
  if (sources.length <= 4) {
    return sources.join(' · ');
  }
  return `${sources.slice(0, 3).join(' · ')} · +${sources.length - 3} lignes`;
}

// Libellé court du type de nulle (pat, répétition, matériel insuffisant…) pour les messages.
export function drawKindLabel(chess) {
  return chess?.isStalemate?.() ? 'Pat' : 'Partie nulle';
}

export function formatGamePhase(game) {
  if (game.mode === 'exploration') {
    return game.phase === 'opening' ? 'Exploration livre' : 'Exploration libre';
  }
  return game.phase === 'opening' ? 'Ouverture' : 'Survie libre';
}

export function formatFreeRemaining(game) {
  if (game.mode === 'exploration') {
    return 'libre';
  }
  if (game.phase !== 'free') {
    return isMateObjective(game) ? 'objectif mat' : `objectif ${formatSurvivalTarget(game)}`;
  }
  return isMateObjective(game) ? "jusqu'au mat" : `${game.freeRemaining}/${game.objective.target}`;
}
