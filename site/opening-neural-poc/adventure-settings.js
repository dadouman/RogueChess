import { state } from './state.js';
import { saveAdventure } from './adventure-state.js';
import {
  ADV_DIFFICULTIES,
  TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  MATE_HANDOVER_OPTIONS,
  DEFAULT_MATE_HANDOVER,
  MATE_TOLERANCE_OPTIONS,
  DEFAULT_MATE_TOLERANCE
} from './adventure-config.js';
import { advCurrentDifficulty } from './adventure-progress.js';
import { applyDifficultyClasses } from './adventure-aids.js';
import { renderAdventureMap } from './adventure-map.js';
import { advSetText } from './dom.js';
import { getTimeControlConfig } from './time-control.js';
import { clamp, escapeHtml } from './utils.js';
import { advCoins, advThreatsUnlocked, SHOP_THREATS_BOSS_UNLOCK } from './adventure-shop.js';
import { advInfluenceEnabled, advChoiceByKey } from './opening-weight.js';

let renderGameDetails = () => {};
let advHistoryGoto = () => {};

export function initAdventureSettings(deps) {
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
  advHistoryGoto = deps.advHistoryGoto ?? advHistoryGoto;
}

function setAdvDifficulty(id) {
  if (!state.adventure || !ADV_DIFFICULTIES.some((d) => d.id === id)) {
    return;
  }
  state.adventure.difficulty = id;
  saveAdventure();
  applyDifficultyClasses();
  if (state.game) {
    renderGameDetails();
  }
  renderAdventureMap();
}

// Sélecteur de difficulté (carte d'aventure) : 4 niveaux, le courant en surbrillance.
function renderAdvDifficulty() {
  const host = document.querySelector('#advDifficultyButtons');
  if (!host) {
    return;
  }
  const current = advCurrentDifficulty();
  host.replaceChildren();
  for (const diff of ADV_DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${diff.id === current.id ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', diff.id === current.id ? 'true' : 'false');
    btn.innerHTML =
      `<span class="adv-diff-ico" aria-hidden="true">${diff.icon}</span>` +
      `<span class="adv-diff-label">${escapeHtml(diff.label)}</span>`;
    btn.addEventListener('click', () => setAdvDifficulty(diff.id));
    host.append(btn);
  }
  const desc = document.querySelector('#advDifficultyDesc');
  if (desc) {
    desc.textContent = current.desc;
  }
}

// U — Sélecteur de cadence (carte) : sans horloge / bullet / blitz / rapide.
function renderAdvTimeControl() {
  const host = document.querySelector('#advTimeButtons');
  if (!host) {
    return;
  }
  const currentId = state.adventure?.timeControl || DEFAULT_TIME_CONTROL;
  host.replaceChildren();
  for (const tc of TIME_CONTROLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${tc.id === currentId ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', tc.id === currentId ? 'true' : 'false');
    btn.innerHTML =
      `<span class="adv-diff-ico" aria-hidden="true">${tc.icon}</span>` +
      `<span class="adv-diff-label">${escapeHtml(tc.label)}</span>`;
    btn.addEventListener('click', () => setAdvTimeControl(tc.id));
    host.append(btn);
  }
  // Champ de cadence personnalisée : synchronisé avec la valeur stockée.
  const input = document.querySelector('#advTimeCustomInput');
  if (input && document.activeElement !== input) {
    input.value = String(state.adventure?.customClockMinutes ?? 10);
  }
  document.querySelector('.adv-time-custom')?.classList.toggle('is-active', currentId === 'custom');

  const desc = document.querySelector('#advTimeDesc');
  if (desc) {
    const tc = getTimeControlConfig(currentId);
    const minutes = tc.baseMs / 60000;
    const minutesLabel = Number.isInteger(minutes) ? minutes : minutes.toFixed(1);
    desc.textContent =
      tc.id === 'off'
        ? 'Pas de pression du temps : joue à ton rythme.'
        : `${minutesLabel} min par camp · Stockfish ~${Math.round(
            tc.meanMs / 1000
          )} s/coup (σ ${Math.round((tc.meanMs * 2) / 1000)} s). Appliqué à la prochaine partie.`;
  }
}

function setAdvTimeControl(id) {
  if (!state.adventure || !TIME_CONTROLS.some((t) => t.id === id)) {
    return;
  }
  state.adventure.timeControl = id;
  saveAdventure();
  renderAdvTimeControl();
}

// U — Règle la cadence personnalisée (minutes par camp) et l'active.
function setAdvCustomClock(minutesRaw) {
  if (!state.adventure) {
    return;
  }
  const minutes = clamp(Number(minutesRaw) || 10, 0.5, 180);
  state.adventure.customClockMinutes = minutes;
  state.adventure.timeControl = 'custom';
  saveAdventure();
  renderAdvTimeControl();
}

// Réglage : activer/désactiver l'influence des lignes d'ouverture (surpondération)
// + choix du mode (nœud aléatoire vs nœuds de la partie jouée).
function renderAdvInfluenceSetting() {
  const btn = document.querySelector('#advInfluenceToggle');
  if (btn) {
    const enabled = advInfluenceEnabled();
    btn.textContent = enabled ? 'Activé' : 'Désactivé';
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
  const host = document.querySelector('#advInfluenceModeButtons');
  if (host) {
    const current = advInfluenceMode();
    host.replaceChildren();
    for (const opt of [
      { id: 'random', icon: '🎲', label: 'Nœud aléatoire' },
      { id: 'game', icon: '📖', label: 'Partie jouée' }
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `adv-diff-btn${opt.id === current ? ' is-active' : ''}`;
      b.setAttribute('aria-pressed', opt.id === current ? 'true' : 'false');
      b.innerHTML =
        `<span class="adv-diff-ico" aria-hidden="true">${opt.icon}</span>` +
        `<span class="adv-diff-label">${escapeHtml(opt.label)}</span>`;
      b.addEventListener('click', () => setAdvInfluenceMode(opt.id));
      host.append(b);
    }
  }
  const desc = document.querySelector('#advInfluenceModeDesc');
  if (desc) {
    desc.textContent =
      advInfluenceMode() === 'random'
        ? 'Après une défaite : UN embranchement du livre est tiré au hasard, tu rejoues sa ligne avec ‹ › et tu pousses un coup des Noirs.'
        : 'Après une défaite : tu revois ta partie avec ‹ › et tu pousses un coup des Noirs sur un embranchement réellement traversé.';
  }
}

function setAdvInfluenceMode(mode) {
  if (!state.adventure) {
    return;
  }
  state.adventure.influenceMode = mode === 'game' ? 'game' : 'random';
  saveAdventure();
  renderAdvInfluenceSetting();
}

function advToggleInfluenceFeature() {
  if (!state.adventure) {
    return;
  }
  state.adventure.influenceDisabled = !state.adventure.influenceDisabled;
  saveAdventure();
  renderAdvInfluenceSetting();
  renderAdvShop();
  if (state.adventure.influenceDisabled && state.game?.influence) {
    state.game.influence = null; // si désactivé pendant le mode influence
    advHistoryGoto(null);
  }
}

// === Vies + « mat en X » ========================================================
// Indicateur de vies unifié (cœurs) + réglage du moment où la cinématique de
// victoire rend la main au joueur pour conclure le mat.
function advMateHandover() {
  const v = Number(state.adventure?.mateHandover);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MATE_HANDOVER;
}

function renderAdvMateHandover() {
  const host = document.querySelector('#advMateHandoverButtons');
  if (!host) {
    return;
  }
  const current = advMateHandover();
  host.replaceChildren();
  for (const opt of MATE_HANDOVER_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${opt.id === current ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', opt.id === current ? 'true' : 'false');
    btn.innerHTML = `<span class="adv-diff-label">${escapeHtml(opt.label)}</span>`;
    btn.addEventListener('click', () => setAdvMateHandover(opt.id));
    host.append(btn);
  }
  const desc = document.querySelector('#advMateHandoverDesc');
  if (desc) {
    desc.textContent =
      current >= 99
        ? 'La conversion te rend la main dès qu’un mat forcé est trouvé (tu joues toute la finale).'
        : `La conversion joue jusqu’au mat en ${current}, puis te laisse conclure.`;
  }
}

function setAdvMateHandover(id) {
  if (!state.adventure) {
    return;
  }
  state.adventure.mateHandover = id;
  saveAdventure();
  renderAdvMateHandover();
}

function advMateTolerance() {
  const v = Number(state.adventure?.mateTolerance);
  return MATE_TOLERANCE_OPTIONS.some((o) => o.id === v) ? v : DEFAULT_MATE_TOLERANCE;
}

function renderAdvMateTolerance() {
  const host = document.querySelector('#advMateToleranceButtons');
  if (!host) {
    return;
  }
  const current = advMateTolerance();
  host.replaceChildren();
  for (const opt of MATE_TOLERANCE_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `adv-diff-btn${opt.id === current ? ' is-active' : ''}`;
    btn.setAttribute('aria-pressed', opt.id === current ? 'true' : 'false');
    btn.innerHTML = `<span class="adv-diff-label">${escapeHtml(opt.label)}</span>`;
    btn.addEventListener('click', () => setAdvMateTolerance(opt.id));
    host.append(btn);
  }
  const desc = document.querySelector('#advMateToleranceDesc');
  if (desc) {
    desc.textContent =
      current === 0
        ? 'Le mat doit rester exact : aucune dérive tolérée.'
        : `Le mat peut dériver de +${current} coup${current > 1 ? 's' : ''} avant de perdre une vie.`;
  }
}

function setAdvMateTolerance(id) {
  if (!state.adventure || !MATE_TOLERANCE_OPTIONS.some((o) => o.id === id)) {
    return;
  }
  state.adventure.mateTolerance = id;
  saveAdventure();
  renderAdvMateTolerance();
}

// === Boutique (rendu + achats) ===

function renderAdvShop() {
  if (!state.adventure) {
    return;
  }
  advSetText('#advShopCoins', String(advCoins()));

  // R — bascule « voir les menaces » (gratuite, débloquée après 3 boss).
  const unlocked = advThreatsUnlocked();
  const threatsBtn = document.querySelector('#advShopThreatsBtn');
  if (threatsBtn) {
    threatsBtn.disabled = !unlocked;
    threatsBtn.textContent = !unlocked
      ? `🔒 ${SHOP_THREATS_BOSS_UNLOCK} boss`
      : state.adventure.threatsEnabled
        ? 'Désactiver'
        : 'Activer';
    threatsBtn.classList.toggle('is-active', unlocked && Boolean(state.adventure.threatsEnabled));
  }
  const threatsDesc = document.querySelector('#advShopThreatsDesc');
  if (threatsDesc) {
    threatsDesc.textContent = unlocked
      ? 'Surligne en rouge tes pièces attaquées par les Noirs.'
      : `Débloqué après ${SHOP_THREATS_BOSS_UNLOCK} boss vaincus (actuel ${
          state.adventure.highestBoss || 0
        }).`;
  }

  // O — pondération des choix d'ouverture : la mise se fait en fin de défaite ;
  // la boutique n'affiche qu'un récap en lecture seule.
  const host = document.querySelector('#advShopLines');
  if (host) {
    renderAdvWeightRecap(host);
  }
}

function advToggleThreats() {
  if (!state.adventure || !advThreatsUnlocked()) {
    return;
  }
  state.adventure.threatsEnabled = !state.adventure.threatsEnabled;
  saveAdventure();
  renderAdvShop();
  renderGameDetails();
}

// Récap lecture seule (onglet Boutique) : pondérations actives + note explicative.
function advInfluenceMode() {
  return state.adventure?.influenceMode === 'game' ? 'game' : 'random';
}

function renderAdvWeightRecap(host) {
  host.replaceChildren();
  const note = document.createElement('p');
  note.className = 'adv-shop-empty';
  note.textContent = advInfluenceEnabled()
    ? "Après une défaite de boss, le choix s'ouvre tout seul : pousse un coup des Noirs de +5% (gratuit). L'effet s'accumule jusqu'à ta victoire. Désactivable dans les réglages."
    : 'Influence des ouvertures désactivée (réactive-la dans les réglages).';
  host.append(note);
  if (!advInfluenceEnabled()) {
    return;
  }
  const active = Object.entries(state.adventure?.openingWeights || {}).filter(
    ([, v]) => Math.abs(v) > 0.01
  );
  if (!active.length) {
    return;
  }
  const summary = document.createElement('div');
  summary.className = 'adv-weight-summary';
  summary.innerHTML = '<span class="adv-tally-label">Pondérations actives</span>';
  const chips = document.createElement('div');
  chips.className = 'adv-weight-chips';
  for (const [k, v] of active) {
    const choice = advChoiceByKey(k);
    const chip = document.createElement('span');
    chip.className = `adv-weight-chip ${v > 0 ? 'is-up' : 'is-down'}`;
    const nm = choice ? choice.san : k.split('|')[1];
    chip.textContent = `${nm} ${v > 0 ? '+' : ''}${Math.round(v)}%`;
    chips.append(chip);
  }
  summary.append(chips);
  host.append(summary);
}

export {
  setAdvDifficulty,
  renderAdvDifficulty,
  renderAdvTimeControl,
  setAdvTimeControl,
  setAdvCustomClock,
  renderAdvInfluenceSetting,
  setAdvInfluenceMode,
  advToggleInfluenceFeature,
  advMateHandover,
  renderAdvMateHandover,
  setAdvMateHandover,
  advMateTolerance,
  renderAdvMateTolerance,
  setAdvMateTolerance,
  renderAdvShop,
  advToggleThreats,
  advInfluenceMode,
  renderAdvWeightRecap
};
