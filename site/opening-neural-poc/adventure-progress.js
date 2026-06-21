// Progression « joueur » Aventure : niveau cerveau (XP de cortex), niveau joueur
// (XP des coups blancs), jauges de progression et résolution de la difficulté.
// Lit/écrit l'état Aventure ; dépend seulement de state et de la config.
import { state } from './state.js';
import { ADV_DIFFICULTIES, DEFAULT_ADV_DIFFICULTY } from './adventure-config.js';

function advLevelSpan(level) {
  return 260 + (level - 1) * 120;
}

function advBrainProgress() {
  let level = 1;
  let remaining = state.adventure ? state.adventure.xp : 0;
  while (remaining >= advLevelSpan(level)) {
    remaining -= advLevelSpan(level);
    level += 1;
  }
  return { level, into: remaining, span: advLevelSpan(level) };
}

// Niveau « joueur » : XP gagnée sur les coups BLANCS, pondérée par leur qualité.
// Courbe croissante (de plus en plus d'XP par niveau). Témoin d'engagement.
const PLAYER_XP_BASE = 10; // coup correct
const PLAYER_XP_STEP = 45; // XP cumulée pour atteindre le niveau L = STEP·(L-1)²

function advPlayerMoves() {
  return state.adventure?.movesPlayed || 0;
}

function advPlayerXp() {
  return state.adventure?.playerXp || 0;
}

// XP d'un coup blanc : gaffe (perte > 1 en éval) = 0, coup brillant (gain > 1) = double.
function advMoveXp(deltaCp) {
  if (!Number.isFinite(deltaCp) || deltaCp <= -100) {
    return 0;
  }
  if (deltaCp >= 100) {
    return PLAYER_XP_BASE * 2;
  }
  return PLAYER_XP_BASE;
}

function advAwardPlayerXp(deltaCp) {
  if (state.screen !== 'adventure' || !state.adventure) {
    return;
  }
  state.adventure.playerXp = (state.adventure.playerXp || 0) + advMoveXp(deltaCp);
}

function advPlayerLevel(xp = advPlayerXp()) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / PLAYER_XP_STEP)) + 1;
}

// Progression vers le niveau joueur suivant (pour la jauge).
function advPlayerProgress() {
  const xp = advPlayerXp();
  const level = advPlayerLevel(xp);
  const floorXp = PLAYER_XP_STEP * (level - 1) * (level - 1);
  const nextXp = PLAYER_XP_STEP * level * level;
  const span = Math.max(1, nextXp - floorXp);
  return { level, xp, moves: advPlayerMoves(), into: xp - floorXp, span };
}

// --- Difficulté Aventure : aides modulables ---

function advDifficultyById(id) {
  return (
    ADV_DIFFICULTIES.find((d) => d.id === id) ||
    ADV_DIFFICULTIES.find((d) => d.id === DEFAULT_ADV_DIFFICULTY)
  );
}

function advCurrentDifficulty() {
  return advDifficultyById(state.adventure?.difficulty || DEFAULT_ADV_DIFFICULTY);
}

export {
  advBrainProgress,
  advAwardPlayerXp,
  advPlayerLevel,
  advPlayerProgress,
  advCurrentDifficulty
};
