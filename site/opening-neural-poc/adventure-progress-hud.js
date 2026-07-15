import { state } from './state.js';
import { clamp } from './utils.js';
import { advLivesState, advCoverage, advAddXp } from './adventure-status.js';
import { advPlayerProgress } from './adventure-progress.js';
import { advSyncGlobalLives } from './adventure-lives.js';
import { advAids } from './adventure-aids.js';
import { showAdventureToast } from './toast.js';
import { saveAdventure } from './adventure-state.js';
import { ADV_ACT2_UNLOCK } from './adventure-config.js';

let isExplorationMode = () => false;
let flashAdvBoard = () => {};
let updateHomeProgress = () => {};

export function initAdventureProgressHud(deps) {
  isExplorationMode = deps.isExplorationMode ?? isExplorationMode;
  flashAdvBoard = deps.flashAdvBoard ?? flashAdvBoard;
  updateHomeProgress = deps.updateHomeProgress ?? updateHomeProgress;
}

const ADV_LESSONS = [
  { id: 'l1', target: 0.25, title: 'Premiers neurones', icon: '🌱' },
  { id: 'l2', target: 0.5, title: 'Réseau en éveil', icon: '✨' },
  { id: 'l3', target: 0.75, title: 'Cortex dense', icon: '🔆' },
  { id: 'l4', target: 1, title: 'Cerveau complet', icon: '🧠' }
];
const ADV_XP_PER_SYNAPSE = 8;
const ADV_XP_LESSON = 50;
let lastPlayerLevelShown = 0;
let advSurgeTimer = null;

export function renderAdvLives() {
  const el = document.querySelector('#advLives');
  if (!el) {
    return;
  }
  const game = state.game;
  const show =
    state.screen === 'adventure' &&
    state.advViewMode === 'board' &&
    Boolean(game) &&
    !game.revision &&
    game.status === 'playing' &&
    !isExplorationMode();
  el.hidden = !show;
  if (!show) {
    return;
  }
  const st = advLivesState(game);
  el.dataset.kind = st.kind;
  el.replaceChildren();
  const hearts = document.createElement('div');
  hearts.className = 'adv-lives-hearts';
  if (st.kind === 'sudden') {
    const pip = document.createElement('span');
    pip.className = 'adv-life is-sudden';
    pip.textContent = '⚡';
    hearts.append(pip);
  } else {
    for (let i = 0; i < st.max; i += 1) {
      const h = document.createElement('span');
      h.className = `adv-life ${i < st.count ? 'is-full' : 'is-empty'}`;
      h.textContent = '♥';
      hearts.append(h);
    }
  }
  el.append(hearts);
  const cap = document.createElement('span');
  cap.className = 'adv-lives-cap';
  cap.textContent = st.label;
  el.append(cap);
}

export function renderAdvTakeBack() {
  const btn = document.querySelector('#advTakeBack');
  if (!btn) {
    return;
  }
  const game = state.game;
  const canUndo = Boolean(
    advAids().takeback &&
    game &&
    !game.takebackLocked &&
    game.status === 'playing' &&
    !game.locked &&
    game.historyView == null &&
    game.chess.turn() === 'w' &&
    game.chess.history().length >= 2
  );
  btn.disabled = !canUndo;
}

// Pastille « niveau joueur » : le numéro + le cadre-jauge (progression vers le niveau
// suivant). Flash + toast quand le niveau monte.
export function renderAdvPlayerBadge() {
  const badge = document.querySelector('#advPlayerBadge');
  if (!badge) {
    return;
  }
  const prog = advPlayerProgress();
  const pct = clamp((prog.into / prog.span) * 100, 0, 100);
  badge.style.setProperty('--xp-pct', pct.toFixed(1));
  const lvlEl = document.querySelector('#advPlayerBadgeLevel');
  if (lvlEl) {
    lvlEl.textContent = String(prog.level);
  }
  badge.title = `Niveau joueur ${prog.level} · ${prog.xp} XP`;

  // En-tête du volet d'options rapides (même progression que la bulle).
  const ring = document.querySelector('#advQuickRing');
  if (ring) {
    ring.style.setProperty('--xp-pct', pct.toFixed(1));
  }
  const quickLvl = document.querySelector('#advQuickLevel');
  if (quickLvl) {
    quickLvl.textContent = String(prog.level);
  }
  const quickXp = document.querySelector('#advQuickXp');
  if (quickXp) {
    quickXp.textContent = `${prog.xp} XP`;
  }
  if (lastPlayerLevelShown && prog.level > lastPlayerLevelShown) {
    badge.classList.remove('is-levelup');
    void badge.offsetWidth; // relance l'animation
    badge.classList.add('is-levelup');
    showAdventureToast({
      icon: '⬆️',
      title: `Niveau joueur ${prog.level} !`,
      text: 'Tu montes en puissance.',
      kind: 'levelup'
    });
  }
  lastPlayerLevelShown = prog.level;
}

export function triggerBrainSurge() {
  document.body.classList.remove('is-brain-surge');
  void document.body.offsetWidth;
  document.body.classList.add('is-brain-surge');
  clearTimeout(advSurgeTimer);
  advSurgeTimer = setTimeout(() => document.body.classList.remove('is-brain-surge'), 720);
}

function checkLessonMilestones() {
  const coverage = advCoverage();
  for (const lesson of ADV_LESSONS) {
    if (!state.adventure.lessons[lesson.id] && coverage + 1e-9 >= lesson.target) {
      state.adventure.lessons[lesson.id] = 3;
      advAddXp(ADV_XP_LESSON);
      showAdventureToast({
        icon: lesson.icon,
        title: `Leçon validée : ${lesson.title}`,
        text: `${Math.round(lesson.target * 100)} % du cortex illuminé.`,
        kind: 'synapse'
      });
    }
  }
  if (coverage >= ADV_ACT2_UNLOCK && !state.adventure.act2Announced) {
    state.adventure.act2Announced = true;
    showAdventureToast({
      icon: '⚔️',
      title: 'Arène déverrouillée !',
      text: 'Acte 2 : affronte Stockfish niveau par niveau.',
      kind: 'boss'
    });
  }
  advSyncGlobalLives(); // déblocage des vies à 50 % d'apprentissage
}

export function adventureLightEdge(edge) {
  if (state.screen !== 'adventure' || !state.adventure || !edge) {
    return;
  }
  let lit = 0;
  for (const id of [edge.from, edge.to]) {
    if (id && id !== 'root' && !state.adventure.nodes.has(id)) {
      state.adventure.nodes.add(id);
      lit += 1;
    }
  }
  if (lit) {
    advAddXp(lit * ADV_XP_PER_SYNAPSE);
    triggerBrainSurge();
    flashAdvBoard('learn'); // écho de l'apprentissage sur l'échiquier (vue joueur)
    checkLessonMilestones();
    updateHomeProgress();
    saveAdventure();
  }
}
