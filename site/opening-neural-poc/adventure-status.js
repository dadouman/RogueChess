// Statut Aventure : couverture du cortex (synapses maîtrisées), déblocage de
// l'Acte 2, état des boss (étoiles, séries, déblocage, cible courante), seuils de
// déficit selon la difficulté, et drapeaux de run (leçon/boss/maîtrise). Lit/écrit
// l'état Aventure ; dépend de helpers feuilles. Acyclique, pas de DI.
import { state } from './state.js';
import { clamp } from './utils.js';
import { showAdventureToast } from './toast.js';
import { advBrainProgress } from './adventure-progress.js';
import { ADV_ACT2_UNLOCK } from './adventure-config.js';

function advTotalSynapseNodes() {
  return state.data ? state.data.nodes.filter((node) => node.id !== 'root').length : 0;
}

function advCoverage() {
  const total = advTotalSynapseNodes();
  return total ? Math.min(1, state.adventure.nodes.size / total) : 0;
}

function advCoveragePct() {
  return Math.round(advCoverage() * 100);
}

function advBossXp(level) {
  return 120 + level * 40;
}

function advAct2Unlocked() {
  return advCoverage() >= ADV_ACT2_UNLOCK;
}

// Un boss se maîtrise en 3 victoires d'affilée (3 étoiles).
const ADV_BOSS_STARS = 3;

// Étoiles « déjà acquises » (record permanent, conservé même après défaite).
function advBossRecord(level) {
  return clamp(Math.round(state.adventure?.bosses?.[level] || 0), 0, ADV_BOSS_STARS);
}

// Série de victoires en cours (remise à 0 à la défaite).
function advBossStreakCount(level) {
  return clamp(Math.round(state.adventure?.bossStreaks?.[level] || 0), 0, ADV_BOSS_STARS);
}

function advBossConquered(level) {
  return advBossRecord(level) >= ADV_BOSS_STARS;
}

// Le boss suivant s'ouvre dès une étoile (une victoire) sur le précédent.
function advBossUnlocked(level) {
  if (!advAct2Unlocked()) {
    return false;
  }
  if (level <= 1) {
    return true;
  }
  return advBossRecord(level - 1) >= 1;
}

// Prochain boss à travailler : le plus petit débloqué pas encore maîtrisé.
function advCurrentBossTarget() {
  for (let level = 1; level <= 10; level += 1) {
    if (advBossUnlocked(level) && !advBossConquered(level)) {
      return level;
    }
  }
  return 0;
}

// Étoiles d'un boss en deux couleurs : série en cours (or) + déjà acquises (cyan).
function advBossStarsMarkup(level) {
  const streak = advBossStreakCount(level);
  const record = advBossRecord(level);
  let html = '';
  for (let i = 1; i <= ADV_BOSS_STARS; i += 1) {
    if (i <= streak) {
      html += '<span class="adv-star is-streak">★</span>';
    } else if (i <= record) {
      html += '<span class="adv-star is-earned">★</span>';
    } else {
      html += '<span class="adv-star is-empty">☆</span>';
    }
  }
  return html;
}

function isAdventureRun() {
  return state.screen === 'adventure' && Boolean(state.advRun);
}

// Seuil de déficit toléré en aventure, fonction de la difficulté choisie.
// La difficulté la plus basse (N1) tolère jusqu'à -5 ; la plus haute (N10)
// n'autorise plus qu'un déficit de -1 avant la cinématique de défaite.
function advDeficitThresholdCp(level) {
  const safe = clamp(Math.round(Number(level) || 1), 1, 10);
  const easiestCp = -500; // -5 pions au niveau le plus facile
  const hardestCp = -100; // -1 pion au niveau le plus difficile
  const t = (safe - 1) / 9;
  return Math.round((easiestCp + (hardestCp - easiestCp) * t) / 10) * 10;
}

// Difficulté de la partie d'aventure courante (niveau du boss, sinon la force
// Stockfish active pour une leçon).
function advRunDifficultyLevel() {
  const run = state.advRun;
  if (!run) {
    return state.stockfishLevel;
  }
  return run.kind === 'boss' ? run.bossLevel : state.stockfishLevel;
}

function advRunDeficitThresholdCp() {
  return advDeficitThresholdCp(advRunDifficultyLevel());
}

function isAdventureMastered(id) {
  return state.screen === 'adventure' && Boolean(state.adventure?.nodes.has(id));
}

function isAdventureLesson() {
  return isAdventureRun() && state.advRun?.kind === 'lesson';
}

function isAdventureEdgeMastered(edge) {
  if (state.screen !== 'adventure' || !state.adventure || !edge) {
    return false;
  }
  if (edge.from && edge.from !== 'root' && !state.adventure.nodes.has(edge.from)) {
    return false;
  }
  const ids = edge.pathNodeIds?.length ? edge.pathNodeIds : [edge.to];
  return ids.every((id) => state.adventure.nodes.has(id));
}

function advAddXp(amount) {
  if (!amount || !state.adventure) {
    return;
  }
  const before = advBrainProgress().level;
  state.adventure.xp += amount;
  const after = advBrainProgress().level;
  if (after > before) {
    showAdventureToast({
      icon: '🧠',
      title: `Cerveau niveau ${after} !`,
      text: 'Nouveau palier neuronal atteint.',
      kind: 'levelup'
    });
  }
}

export {
  ADV_BOSS_STARS,
  advTotalSynapseNodes,
  advCoverage,
  advCoveragePct,
  advBossXp,
  advAct2Unlocked,
  advBossRecord,
  advBossStreakCount,
  advBossConquered,
  advBossUnlocked,
  advCurrentBossTarget,
  advBossStarsMarkup,
  isAdventureRun,
  advDeficitThresholdCp,
  advRunDifficultyLevel,
  advRunDeficitThresholdCp,
  isAdventureMastered,
  isAdventureLesson,
  isAdventureEdgeMastered,
  advAddXp
};
