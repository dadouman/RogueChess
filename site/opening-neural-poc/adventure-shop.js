// Boutique du mode Aventure (économie) : monnaie « pièces » (gain par victoire,
// solde, crédit) et déblocage de l'option « voir les menaces » (R) après 3 boss.
// Lecture/écriture de l'état Aventure uniquement ; aucun rendu (l'UI boutique et
// la pondération d'ouverture restent dans app.js). Acyclique, pas de DI.
import { state } from './state.js';

// R : « voir les menaces » débloqué après 3 boss maîtrisés.
const SHOP_THREATS_BOSS_UNLOCK = 3;

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

export {
  SHOP_THREATS_BOSS_UNLOCK,
  advWinCoinReward,
  advCoins,
  advAwardCoins,
  advThreatsUnlocked,
  advThreatsActive
};
