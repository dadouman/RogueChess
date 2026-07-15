import { state } from './state.js';
import { clamp } from './utils.js';
import { advSetText } from './dom.js';
import { ADV_GLOBAL_LIVES_MAX, ADV_ACT2_UNLOCK } from './adventure-config.js';
import {
  advCoveragePct,
  advAct2Unlocked,
  advBossConquered,
  advBossUnlocked,
  advCurrentBossTarget,
  advBossStarsMarkup
} from './adventure-status.js';
import { advPlayerProgress } from './adventure-progress.js';
import { advGlobalLives, advLivesUnlocked, advSyncGlobalLives } from './adventure-lives.js';
import { advStarString } from './adventure-utils.js';
import { renderAdvGameHistory } from './adventure-history-ui.js';
import { getStockfishLevelProfile } from './engine.js';
import { closeOpeningViewer } from './opening-viewer.js';

let closeAdvAnalyseSheet = () => {};
let renderAdvDifficulty = () => {};
let renderAdvTimeControl = () => {};
let renderAdvMateHandover = () => {};
let renderAdvMateTolerance = () => {};
let renderAdvInfluenceSetting = () => {};
let renderAdvShop = () => {};
let advTrapsUnlocked = () => false;
let launchBoss = () => {};

export function initAdventureMap(deps) {
  closeAdvAnalyseSheet = deps.closeAdvAnalyseSheet ?? closeAdvAnalyseSheet;
  renderAdvDifficulty = deps.renderAdvDifficulty ?? renderAdvDifficulty;
  renderAdvTimeControl = deps.renderAdvTimeControl ?? renderAdvTimeControl;
  renderAdvMateHandover = deps.renderAdvMateHandover ?? renderAdvMateHandover;
  renderAdvMateTolerance = deps.renderAdvMateTolerance ?? renderAdvMateTolerance;
  renderAdvInfluenceSetting = deps.renderAdvInfluenceSetting ?? renderAdvInfluenceSetting;
  renderAdvShop = deps.renderAdvShop ?? renderAdvShop;
  advTrapsUnlocked = deps.advTrapsUnlocked ?? advTrapsUnlocked;
  launchBoss = deps.launchBoss ?? launchBoss;
}

function openAdventureMap() {
  closeAdvAnalyseSheet();
  const map = document.querySelector('#adventureMap');
  if (map) {
    map.hidden = false;
  }
  document.body.classList.add('is-adv-map-open'); // verrou du scroll de fond (anti double-scroll)
  setAdvMapView('main'); // on rouvre toujours sur l'onglet principal
  renderAdventureMap();
}

function closeAdventureMap() {
  const map = document.querySelector('#adventureMap');
  if (map) {
    map.hidden = true;
  }
  document.body.classList.remove('is-adv-map-open');
  closeOpeningViewer(); // ferme la visionneuse d'ouverture si ouverte
}

function makeAdventureStageRow(options) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `adv-stage${options.cls ? ` ${options.cls}` : ''}`;
  if (options.disabled) {
    button.disabled = true;
  }
  const node = document.createElement('span');
  node.className = 'adv-stage-node';
  node.textContent = options.icon;
  const info = document.createElement('div');
  info.className = 'adv-stage-info';
  const title = document.createElement('strong');
  title.textContent = options.title;
  const desc = document.createElement('span');
  desc.textContent = options.desc;
  info.append(title, desc);
  const stars = document.createElement('span');
  stars.className = 'adv-stage-stars';
  if (options.starsHtml != null) {
    stars.innerHTML = options.starsHtml;
  } else {
    stars.textContent = options.showStars ? advStarString(options.stars) : '';
  }
  button.append(node, info, stars);
  if (!options.disabled && options.onClick) {
    button.addEventListener('click', options.onClick);
  }
  return button;
}

// Bascule entre les vues de la carte : principale, arène, boutique, réglages.
function setAdvMapView(view) {
  state.advMapView = view;
  const panel = document.querySelector('.adv-map-panel');
  if (panel) {
    panel.dataset.view = view;
  }
  document
    .querySelector('#advTabMain')
    ?.classList.toggle('is-active', view === 'main' || view === 'arena' || view === 'lesson');
  document.querySelector('#advTabShop')?.classList.toggle('is-active', view === 'shop');
  document.querySelector('#advSettingsBtn')?.classList.toggle('is-active', view === 'settings');
  document.querySelector('.adv-tab-content')?.scrollTo?.(0, 0);
}

// Sous-titres des deux gros boutons de la vue principale.
function renderAdvMainActions() {
  if (!state.adventure) {
    return;
  }
  const lessonSub = document.querySelector('#advBtnLessonSub');
  if (lessonSub) {
    lessonSub.textContent = `Libre ou piège · cortex à ${advCoveragePct()} %`;
  }
  const arenaSub = document.querySelector('#advBtnArenaSub');
  if (arenaSub) {
    arenaSub.textContent = advAct2Unlocked()
      ? `Affronte Stockfish · meilleur N${state.adventure.highestBoss}/10`
      : `Verrouillé · illumine ${Math.round(ADV_ACT2_UNLOCK * 100)} % du cortex`;
  }
  renderAdvLivesBanner();
}

// Bandeau « vies contre les bots » : cœurs + statut (verrou / révise / demain).
function renderAdvLivesBanner() {
  const host = document.querySelector('#advLivesBanner');
  if (!host) {
    return;
  }
  host.replaceChildren();
  const lives = advGlobalLives();
  const unlocked = advLivesUnlocked();
  host.dataset.state = !unlocked ? 'locked' : lives > 0 ? 'ok' : 'empty';

  const hearts = document.createElement('div');
  hearts.className = 'adv-lives-banner-hearts';
  if (!unlocked) {
    const lock = document.createElement('span');
    lock.className = 'adv-life is-empty';
    lock.textContent = '🔒';
    hearts.append(lock);
  } else {
    for (let i = 0; i < ADV_GLOBAL_LIVES_MAX; i += 1) {
      const h = document.createElement('span');
      h.className = `adv-life ${i < lives ? 'is-full' : 'is-empty'}`;
      h.textContent = '♥';
      hearts.append(h);
    }
  }
  host.append(hearts);

  const txt = document.createElement('span');
  txt.className = 'adv-lives-banner-text';
  txt.textContent = !unlocked
    ? `Atteins 50 % du cortex pour débloquer 3 vies (cortex ${advCoveragePct()} %).`
    : lives > 0
      ? `${lives} défaite${lives > 1 ? 's' : ''} possible${lives > 1 ? 's' : ''} contre les bots.`
      : 'Plus de vies : révise une ligne ou reviens demain.';
  host.append(txt);
}

// Vue « Illuminer le cerveau » : anneau cortex + choix du parcours (libre / piège).
function renderAdvLessonChoice() {
  if (!state.adventure) {
    return;
  }
  const pct = advCoveragePct();
  const brain = document.querySelector('#advLessonBrain');
  if (brain) {
    brain.style.setProperty('--xp-pct', String(pct));
  }
  advSetText('#advLessonCortex', `${pct} %`);
  // Le mode « Piège » se débloque une fois tout le cortex illuminé.
  const unlocked = advTrapsUnlocked();
  const trapBtn = document.querySelector('#advLessonTrap');
  if (trapBtn) {
    trapBtn.disabled = !unlocked;
    trapBtn.classList.toggle('is-locked', !unlocked);
  }
  const trapSub = document.querySelector('#advLessonTrapSub');
  if (trapSub) {
    trapSub.textContent = unlocked
      ? 'Fais tomber Stockfish dans un piège'
      : 'Verrouillé · illumine 100 % du cortex';
  }
}

function renderAdventureMap() {
  if (!state.adventure) {
    return;
  }
  advSyncGlobalLives(); // déblocage 50 % + reset quotidien à l'ouverture de la carte
  const coveragePct = advCoveragePct();
  // Pastille « niveau joueur » en haut à gauche de la carte (cadre = jauge d'XP),
  // comme sur les autres écrans. La cartouche de stats a été supprimée.
  const playerProg = advPlayerProgress();
  advSetText('#advMapLevelValue', String(playerProg.level));
  const levelBubble = document.querySelector('#advMapLevel');
  if (levelBubble) {
    const pct = clamp((playerProg.into / playerProg.span) * 100, 0, 100);
    levelBubble.style.setProperty('--xp-pct', pct.toFixed(1));
    levelBubble.title = `Niveau joueur ${playerProg.level} · ${playerProg.xp} XP`;
  }
  renderAdvDifficulty();
  renderAdvTimeControl();
  renderAdvMateHandover();
  renderAdvMateTolerance();
  renderAdvInfluenceSetting();
  renderAdvShop();
  renderAdvGameHistory();
  renderAdvMainActions();
  renderAdvLessonChoice();

  const act2 = document.querySelector('#advAct2Stages');
  const lock = document.querySelector('#advAct2Lock');
  const unlocked = advAct2Unlocked();
  if (lock) {
    // Texte allégé : rien quand l'arène est ouverte (l'écran tient sans scroll),
    // une seule ligne courte sinon.
    lock.hidden = unlocked;
    lock.textContent = unlocked
      ? ''
      : `Verrouillé · illumine ${Math.round(ADV_ACT2_UNLOCK * 100)} % du cortex (actuel ${coveragePct} %).`;
  }
  if (act2) {
    act2.replaceChildren();
    const target = advCurrentBossTarget();
    for (let level = 1; level <= 10; level += 1) {
      const profile = getStockfishLevelProfile(level);
      const conquered = advBossConquered(level);
      const open = advBossUnlocked(level);
      const isCurrent = open && !conquered && level === target;
      act2.append(
        makeAdventureStageRow({
          icon: open ? `N${level}` : '🔒',
          title: profile.label,
          desc: profile.elo ? `${profile.elo} Elo` : 'Force max',
          starsHtml: open ? advBossStarsMarkup(level) : '',
          cls: conquered ? 'is-done' : isCurrent ? 'is-current' : open ? '' : 'is-locked',
          disabled: !open,
          onClick: () => launchBoss(level)
        })
      );
    }
  }
}

export {
  openAdventureMap,
  closeAdventureMap,
  setAdvMapView,
  makeAdventureStageRow,
  renderAdvMainActions,
  renderAdvLivesBanner,
  renderAdvLessonChoice,
  renderAdventureMap
};
