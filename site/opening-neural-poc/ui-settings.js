import { state } from './state.js';
import { elements } from './elements.js';
import { formatEval } from './eval-commentary.js';
import { getStockfishLevelProfile, formatStockfishLevel } from './engine.js';

export function updateStockfishLevelUi() {
  const profile = state.game?.mateResolution?.active
    ? { ...getStockfishLevelProfile(10), depth: 12, movetime: 800 }
    : getStockfishLevelProfile();
  elements.stockfishLevelRange.value = String(profile.level);
  elements.stockfishLevelValue.textContent = formatStockfishLevel(profile);
}

export function updateSurvivalLimitUi() {
  elements.survivalLimitRange.value = String(state.survivalLimitCp);
  elements.survivalLimitValue.textContent = formatEval(state.survivalLimitCp);
}
