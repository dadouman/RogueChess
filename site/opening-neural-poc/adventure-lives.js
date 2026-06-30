// Vies globales (méta) du mode Aventure : nombre de défaites possibles contre les
// bots. Débloquées à 50 % de couverture du cortex, rechargées chaque jour ou par
// l'apprentissage (révision/leçon), consommées à la défaite. Lit/écrit l'état
// Aventure et le persiste ; dépend de helpers feuilles. Acyclique, pas de DI.
import { state } from './state.js';
import { saveAdventure } from './adventure-state.js';
import { showAdventureToast } from './toast.js';
import { advCoverage } from './adventure-status.js';
import { ADV_GLOBAL_LIVES_MAX } from './adventure-config.js';

const ADV_LIVES_UNLOCK_COVERAGE = 0.5; // 50 % d'apprentissage débloque les vies

function advTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function advGlobalLives() {
  return Math.max(0, Number(state.adventure?.globalLives) || 0);
}

function advLivesUnlocked() {
  return Boolean(state.adventure?.livesUnlocked);
}

function advCanFightBots() {
  return advGlobalLives() > 0;
}

// Déblocage à 50 % + reset quotidien. À appeler à l'ouverture de la carte / après
// apprentissage. Renvoie true si l'état a changé.
function advSyncGlobalLives() {
  const adv = state.adventure;
  if (!adv) {
    return false;
  }
  let changed = false;
  if (!adv.livesUnlocked && advCoverage() >= ADV_LIVES_UNLOCK_COVERAGE) {
    adv.livesUnlocked = true;
    adv.globalLives = ADV_GLOBAL_LIVES_MAX;
    adv.livesDate = advTodayKey();
    changed = true;
    showAdventureToast({
      icon: '❤️',
      title: '3 vies débloquées !',
      text: '50 % du cortex : tu peux affronter les bots. 3 défaites possibles.',
      kind: 'boss'
    });
  }
  if (adv.livesUnlocked && adv.livesDate !== advTodayKey()) {
    adv.livesDate = advTodayKey();
    if ((adv.globalLives || 0) < ADV_GLOBAL_LIVES_MAX) {
      adv.globalLives = ADV_GLOBAL_LIVES_MAX;
      showAdventureToast({
        icon: '🌅',
        title: 'Vies rechargées',
        text: 'Nouveau jour : 3 défaites à nouveau possibles contre les bots.',
        kind: null
      });
    }
    changed = true;
  }
  if (changed) {
    saveAdventure();
  }
  return changed;
}

function advConsumeGlobalLife() {
  const adv = state.adventure;
  if (!adv || !adv.livesUnlocked) {
    return;
  }
  adv.globalLives = Math.max(0, (adv.globalLives || 0) - 1);
  saveAdventure();
}

// Récupération des vies par l'apprentissage (révision réussie / leçon terminée).
function advRefillGlobalLivesFromLearning() {
  const adv = state.adventure;
  if (!adv) {
    return;
  }
  advSyncGlobalLives(); // peut débloquer si on vient de franchir 50 %
  if (!adv.livesUnlocked || (adv.globalLives || 0) >= ADV_GLOBAL_LIVES_MAX) {
    return;
  }
  adv.globalLives = ADV_GLOBAL_LIVES_MAX;
  adv.livesDate = advTodayKey();
  saveAdventure();
  showAdventureToast({
    icon: '❤️',
    title: 'Vies rechargées',
    text: 'Révision réussie : 3 défaites à nouveau possibles.',
    kind: 'boss'
  });
}

// Message quand on tente d'affronter un bot sans vie.
function advNotifyNoLives() {
  showAdventureToast({
    icon: '💔',
    title: 'Plus de vies',
    text: advLivesUnlocked()
      ? 'Révise une ligne (Illuminer le cerveau) ou reviens demain pour 3 nouvelles défaites.'
      : 'Atteins 50 % du cortex (Illuminer le cerveau) pour débloquer 3 vies.',
    kind: null
  });
}

export {
  advTodayKey,
  advGlobalLives,
  advLivesUnlocked,
  advCanFightBots,
  advSyncGlobalLives,
  advConsumeGlobalLife,
  advRefillGlobalLivesFromLearning,
  advNotifyNoLives
};
