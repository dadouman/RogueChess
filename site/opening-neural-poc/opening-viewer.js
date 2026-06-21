// Visionneuse d'ouverture (modal plein écran) : rejoue une ligne d'ouverture image
// par image (lecture/pause, vitesse réglable, ‹ ›/clavier), avec une rangée
// « boutique » optionnelle pour pondérer/garder/passer une proposition sans revenir
// au carrousel. État du modal et index du carrousel internes au module. Le rendu du
// carrousel HUD (renderAdvShop) est INJECTÉ (initOpeningViewer) pour éviter un cycle
// avec app.js. Acyclique sinon.
import { state } from './state.js';
import { clamp, escapeHtml } from './utils.js';
import { buildOpeningFrames, fillOpeningBoard, OPENING_MAX_PLIES } from './board-render.js';
import { advOpeningDisplayLabel } from './graph.js';
import { advCoins } from './adventure-shop.js';
import { saveAdventure } from './adventure-state.js';
import {
  OPENING_WEIGHT_COST,
  advChoiceByKey,
  advOpeningWeightOf,
  advOpeningLockIs,
  advAdjustOpeningWeight,
  advToggleOpeningLock,
  advEnsureOpeningDeck
} from './opening-weight.js';

// Rendu du carrousel boutique dans le HUD, injecté par app.js (cf. initOpeningViewer).
let renderAdvShop = () => {};

export function initOpeningViewer(deps) {
  renderAdvShop = deps.renderAdvShop ?? renderAdvShop;
}

// Index courant dans la file de propositions (carrousel) — état UI propre au modal.
let advCarouselIndex = 0;

const OPENING_VIEWER_SPEEDS = [
  { label: '🐢 Lent', ms: 1500 },
  { label: 'Normal', ms: 850 },
  { label: '🐇 Rapide', ms: 380 }
];

// --- Visionneuse animée plein écran (lecture/pause + vitesse réglable) ---
let openingViewer = null;

function closeOpeningViewer() {
  if (!openingViewer) {
    return;
  }
  if (openingViewer.timer) {
    window.clearInterval(openingViewer.timer);
  }
  if (openingViewer.keyHandler) {
    window.removeEventListener('keydown', openingViewer.keyHandler);
  }
  openingViewer.overlay.remove();
  openingViewer = null;
}

function openingViewerRender() {
  const v = openingViewer;
  if (!v) {
    return;
  }
  const frame = v.frames[v.index];
  fillOpeningBoard(v.board, frame);
  v.counter.textContent = `${v.index} / ${v.frames.length - 1}`;
  v.moveLabel.textContent = frame.san
    ? `${Math.ceil(v.index / 2)}${v.index % 2 === 1 ? '.' : '…'} ${frame.san}`
    : 'Position de départ';
  v.playBtn.textContent = v.playing ? '⏸' : '▶';
}

function openingViewerStep(delta) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  v.index = (v.index + delta + v.frames.length) % v.frames.length;
  openingViewerRender();
}

function openingViewerSetPlaying(play) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  v.playing = play;
  if (v.timer) {
    window.clearInterval(v.timer);
    v.timer = null;
  }
  if (play) {
    v.timer = window.setInterval(() => {
      v.index = v.index + 1 >= v.frames.length ? 0 : v.index + 1;
      openingViewerRender();
    }, OPENING_VIEWER_SPEEDS[v.speed].ms);
  }
  openingViewerRender();
}

function openingViewerSetSpeed(speedIndex) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  v.speed = clamp(speedIndex, 0, OPENING_VIEWER_SPEEDS.length - 1);
  v.speedBtns.forEach((btn, i) => btn.classList.toggle('is-active', i === v.speed));
  if (v.playing) {
    openingViewerSetPlaying(true); // relance le minuteur à la nouvelle vitesse
  }
}

function openOpeningViewer(sans, name, label, shopKey = null, maxPlies = OPENING_MAX_PLIES) {
  const frames = buildOpeningFrames(sans, maxPlies);
  if (!frames) {
    return;
  }
  closeOpeningViewer();

  const overlay = document.createElement('div');
  overlay.className = 'opening-viewer';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOpeningViewer();
    }
  });

  const panel = document.createElement('div');
  panel.className = 'opening-viewer-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const head = document.createElement('header');
  head.className = 'opening-viewer-head';
  const title = document.createElement('div');
  title.className = 'opening-viewer-title';
  title.innerHTML = `<strong>${escapeHtml(name || 'Ouverture')}</strong><span>${escapeHtml(
    label || ''
  )}</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'opening-viewer-x';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Fermer');
  closeBtn.addEventListener('click', closeOpeningViewer);
  head.append(title, closeBtn);

  const board = document.createElement('div');
  board.className = 'opening-board opening-board-large';

  const moveLabel = document.createElement('p');
  moveLabel.className = 'opening-viewer-move';

  const controls = document.createElement('div');
  controls.className = 'opening-viewer-controls';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'opening-ctl';
  prev.textContent = '‹';
  prev.setAttribute('aria-label', 'Coup précédent');
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'opening-ctl is-play';
  playBtn.setAttribute('aria-label', 'Lecture / Pause');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'opening-ctl';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Coup suivant');
  const counter = document.createElement('span');
  counter.className = 'opening-viewer-counter';
  prev.addEventListener('click', () => {
    openingViewerSetPlaying(false);
    openingViewerStep(-1);
  });
  next.addEventListener('click', () => {
    openingViewerSetPlaying(false);
    openingViewerStep(1);
  });
  playBtn.addEventListener('click', () => openingViewerSetPlaying(!openingViewer.playing));
  controls.append(prev, playBtn, next, counter);

  const speeds = document.createElement('div');
  speeds.className = 'opening-viewer-speeds';
  const speedBtns = OPENING_VIEWER_SPEEDS.map((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opening-speed';
    btn.textContent = s.label;
    btn.addEventListener('click', () => openingViewerSetSpeed(i));
    speeds.append(btn);
    return btn;
  });

  // Actions boutique (±5 % / cadenas / passer) directement depuis la visionneuse,
  // pour choisir sans revenir au carrousel. Renseignées par renderOpeningViewerShop().
  const shopActions = document.createElement('div');
  shopActions.className = 'opening-viewer-shop';

  panel.append(head, board, moveLabel, controls, speeds, shopActions);
  overlay.append(panel);
  document.body.append(overlay);

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeOpeningViewer();
    } else if (event.key === 'ArrowLeft') {
      openingViewerSetPlaying(false);
      openingViewerStep(-1);
    } else if (event.key === 'ArrowRight') {
      openingViewerSetPlaying(false);
      openingViewerStep(1);
    }
  };
  window.addEventListener('keydown', keyHandler);

  openingViewer = {
    overlay,
    panel,
    board,
    titleEl: title,
    moveLabel,
    counter,
    playBtn,
    speedBtns,
    shopActions,
    shopKey,
    frames,
    index: 0,
    playing: false,
    speed: 1,
    timer: null,
    keyHandler
  };
  panel.classList.toggle('has-shop', Boolean(shopKey));
  openingViewerSetSpeed(1);
  renderOpeningViewerShop();
  openingViewerSetPlaying(true); // démarre l'animation
}

// Charge une autre proposition dans la visionneuse ouverte (sans la recréer).
function loadOpeningViewerChoice(choice) {
  const v = openingViewer;
  if (!v) {
    return;
  }
  const frames = buildOpeningFrames(choice.sans);
  if (!frames) {
    closeOpeningViewer();
    return;
  }
  v.frames = frames;
  v.index = 0;
  v.shopKey = choice.key;
  const name = advOpeningDisplayLabel(choice.sans, choice.name || 'Hors livre');
  v.titleEl.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(
    choice.sans.join(' ')
  )}</span>`;
  renderOpeningViewerShop();
  openingViewerSetPlaying(true);
}

// Rangée d'actions boutique dans la visionneuse (coins + pondération + ±5 / cadenas / passer).
function renderOpeningViewerShop() {
  const v = openingViewer;
  if (!v?.shopActions) {
    return;
  }
  v.shopActions.replaceChildren();
  if (!v.shopKey) {
    v.shopActions.hidden = true;
    return;
  }
  v.shopActions.hidden = false;
  const weight = advOpeningWeightOf(v.shopKey);
  const wTxt = weight > 0 ? `+${weight}%` : weight < 0 ? `${weight}%` : '0%';
  const info = document.createElement('div');
  info.className = 'opening-viewer-shop-info';
  info.innerHTML =
    `<span class="opening-viewer-shop-coins">${advCoins()} 🪙</span>` +
    `<span class="adv-weight-delta ${weight > 0 ? 'is-up' : weight < 0 ? 'is-down' : ''}">pondération ${wTxt}</span>`;
  v.shopActions.append(info);

  const buys = document.createElement('div');
  buys.className = 'adv-weight-buys';
  const makeBuy = (dir, label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-weight-buy ${dir > 0 ? 'is-up' : 'is-down'}`;
    btn.textContent = `${label} (${OPENING_WEIGHT_COST}🪙)`;
    btn.disabled = advCoins() < OPENING_WEIGHT_COST;
    btn.addEventListener('click', () => openingViewerShopWeight(dir));
    return btn;
  };
  buys.append(makeBuy(-1, '− 5%'), makeBuy(1, '+ 5%'));
  v.shopActions.append(buys);

  const nav = document.createElement('div');
  nav.className = 'adv-weight-nav';
  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'adv-ghost adv-weight-lock';
  const locked = advOpeningLockIs(v.shopKey);
  lockBtn.classList.toggle('is-active', locked);
  lockBtn.textContent = locked ? '🔒 Gardée' : '🔓 Garder';
  lockBtn.addEventListener('click', openingViewerShopLock);
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'adv-ghost adv-weight-skip';
  skipBtn.textContent = 'Passer ›';
  skipBtn.addEventListener('click', openingViewerShopSkip);
  nav.append(lockBtn, skipBtn);
  v.shopActions.append(nav);
}

function openingViewerShopWeight(dir) {
  const v = openingViewer;
  if (!v?.shopKey) {
    return;
  }
  if (advAdjustOpeningWeight(v.shopKey, dir)) {
    openingViewerShopAdvance();
  } else {
    renderOpeningViewerShop(); // pas assez de pièces : on reste sur la position
  }
}

function openingViewerShopSkip() {
  if (openingViewer?.shopKey) {
    openingViewerShopAdvance();
  }
}

function openingViewerShopLock() {
  const v = openingViewer;
  if (!v?.shopKey) {
    return;
  }
  advToggleOpeningLock(v.shopKey);
  renderAdvShop(); // garde le carrousel en phase
  renderOpeningViewerShop();
}

// Après un choix : consomme la proposition et enchaîne sur la suivante dans la visionneuse.
function openingViewerShopAdvance() {
  const v = openingViewer;
  if (!v?.shopKey) {
    return;
  }
  advConsumeOpeningChoice(v.shopKey);
  renderAdvShop();
  const deck = advEnsureOpeningDeck();
  const nextKey = deck[advCarouselIndex];
  const next = nextKey ? advChoiceByKey(nextKey) : null;
  if (next) {
    loadOpeningViewerChoice(next);
  } else {
    closeOpeningViewer(); // plus de proposition : on referme
  }
}

// Consomme la proposition courante (passer/+5/−5) : elle disparaît du carrousel et
// on passe à la suivante. Une proposition cadenassée n'est PAS consommée (cumulable).
function advConsumeOpeningChoice(key) {
  const adv = state.adventure;
  if (!adv || !Array.isArray(adv.openingDeck)) {
    return;
  }
  if (advOpeningLockIs(key)) {
    if (adv.openingDeck.length) {
      advCarouselIndex = (advCarouselIndex + 1) % adv.openingDeck.length;
    }
    return;
  }
  const idx = adv.openingDeck.indexOf(key);
  if (idx >= 0) {
    adv.openingDeck.splice(idx, 1);
  }
  if (advCarouselIndex >= adv.openingDeck.length) {
    advCarouselIndex = 0;
  }
  saveAdventure();
}

export { openOpeningViewer, closeOpeningViewer };
