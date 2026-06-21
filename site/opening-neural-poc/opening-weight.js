// Modèle de pondération d'ouverture (O) du mode Aventure : « influence » du joueur
// sur les choix noirs du livre. Énumère les positions d'embranchement influençables
// (parcours du graphe, mis en cache), applique une surpondération à un coup choisi
// (±%, bornée), et lit les poids/cadenas effectifs (actifs seulement en partie de
// boss). Données pures : état + accès au graphe ; AUCUN rendu (les flèches SVG et
// l'UI restent dans app.js). Acyclique, pas de DI.
import { state } from './state.js';
import { getNode, getRawOutgoingEdges } from './graph.js';
import { clamp } from './utils.js';
import { showAdventureToast } from './toast.js';
import { saveAdventure } from './adventure-state.js';
import { advCoins } from './adventure-shop.js';

const OPENING_WEIGHT_STEP = 5; // points de % par achat
const OPENING_WEIGHT_COST = 10; // pièces par ±5 %
const OPENING_WEIGHT_MAX = 60; // bornes de la pondération cumulée
const OPENING_BRANCH_MAX_PLY = 20;

let advChoicesCache = null;

// Énumère tous les coups noirs « influençables » : positions du livre où les Noirs
// ont au moins 2 réponses (vrai choix de Stockfish). Un élément = un coup à un
// embranchement. Mis en cache (le livre est statique).
function advInfluenceableChoices() {
  if (advChoicesCache) {
    return advChoicesCache;
  }
  const out = [];
  if (!(state.edgesById instanceof Map)) {
    return out;
  }
  const seen = new Set();
  const queue = [{ id: 'root', sans: [] }];
  let guard = 0;
  while (queue.length && guard < 6000) {
    guard += 1;
    const { id, sans } = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const node = getNode(id);
    if (!node) {
      continue;
    }
    const outs = getRawOutgoingEdges(id);
    const blacks = outs.filter((edge) => edge.color === 'b');
    if (blacks.length >= 2 && sans.length <= OPENING_BRANCH_MAX_PLY) {
      for (const edge of blacks) {
        const child = getNode(edge.to);
        out.push({
          key: `${node.fen}|${edge.uci}`,
          fen: node.fen,
          uci: edge.uci,
          san: edge.san,
          sans: [...sans, edge.san],
          name: child?.opening || null,
          eco: child?.eco || null,
          baseProb: Number(edge.probability) || 0
        });
      }
    }
    if (sans.length < OPENING_BRANCH_MAX_PLY + 4) {
      for (const edge of outs) {
        if (!seen.has(edge.to)) {
          queue.push({ id: edge.to, sans: [...sans, edge.san] });
        }
      }
    }
  }
  advChoicesCache = out;
  return out;
}

function advChoiceByKey(key) {
  return advInfluenceableChoices().find((choice) => choice.key === key) || null;
}

// === Refonte boutique : surpondération d'un COUP à un NŒUD d'embranchement ======
// On regroupe les coups noirs par nœud (position où les Noirs ont ≥2 réponses) ;
// pour chaque coup candidat on calcule la suite la plus probable jusqu'au prochain
// embranchement (aperçu de la ligne, pour décider quel coup pousser). Cache : le
// livre est statique.
let advNodesCache = null;
function advInfluenceableNodes() {
  if (advNodesCache) {
    return advNodesCache;
  }
  const out = [];
  if (!(state.edgesById instanceof Map)) {
    return out;
  }
  const seen = new Set();
  const queue = [{ id: 'root', sans: [] }];
  let guard = 0;
  while (queue.length && guard < 6000) {
    guard += 1;
    const { id, sans } = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const node = getNode(id);
    if (!node) {
      continue;
    }
    const outs = getRawOutgoingEdges(id);
    const blacks = outs.filter((edge) => edge.color === 'b');
    if (blacks.length >= 2 && sans.length <= OPENING_BRANCH_MAX_PLY) {
      const moves = blacks.map((edge) => {
        const child = getNode(edge.to);
        return {
          uci: edge.uci,
          san: edge.san,
          baseProb: Number(edge.probability) || 0,
          name: child?.opening || null,
          eco: child?.eco || null,
          line: advLineToNextBranch(edge.to)
        };
      });
      out.push({ key: node.fen, fen: node.fen, sans: [...sans], moves });
    }
    if (sans.length < OPENING_BRANCH_MAX_PLY + 4) {
      for (const edge of outs) {
        if (!seen.has(edge.to)) {
          queue.push({ id: edge.to, sans: [...sans, edge.san] });
        }
      }
    }
  }
  advNodesCache = out;
  return out;
}

// Suite la plus probable depuis un nœud, jusqu'au prochain embranchement noir (ou cap).
function advLineToNextBranch(startId, maxPlies = 6) {
  const lineSans = [];
  let cur = startId;
  const visited = new Set();
  for (let i = 0; i < maxPlies; i += 1) {
    if (visited.has(cur)) {
      break;
    }
    visited.add(cur);
    const outs = getRawOutgoingEdges(cur);
    if (!outs.length) {
      break;
    }
    if (i > 0 && outs.filter((e) => e.color === 'b').length >= 2) {
      break; // prochain embranchement atteint
    }
    const best = outs.slice().sort((a, b) => (b.probability || 0) - (a.probability || 0))[0];
    if (!best) {
      break;
    }
    lineSans.push(best.san);
    cur = best.to;
  }
  return lineSans;
}

// Surpondère un coup : +5 % au coup choisi, et −5 %/(nombre d'autres coups) à chacun
// des autres (somme nulle). Coût 10 🪙, une seule fois par défaite. true si appliqué.
function advOverweightMove(node, chosenUci) {
  const adv = state.adventure;
  if (!adv || !node || !advInfluenceEnabled()) {
    return false;
  }
  if (state.advRun?.overweightUsed) {
    showAdventureToast({ icon: '🎚️', title: 'Déjà fait', text: 'Une seule surpondération par défaite.', kind: null });
    return false;
  }
  const moves = node.moves || [];
  if (moves.length < 2 || !moves.some((m) => m.uci === chosenUci)) {
    return false;
  }
  adv.openingWeights = adv.openingWeights || {};
  const bump = (uci, delta) => {
    const key = `${node.fen}|${uci}`;
    const next = clamp((Number(adv.openingWeights[key]) || 0) + delta, -OPENING_WEIGHT_MAX, OPENING_WEIGHT_MAX);
    if (Math.abs(next) < 1e-6) {
      delete adv.openingWeights[key];
    } else {
      adv.openingWeights[key] = next;
    }
  };
  const others = moves.filter((m) => m.uci !== chosenUci);
  bump(chosenUci, OPENING_WEIGHT_STEP);
  const per = OPENING_WEIGHT_STEP / others.length;
  for (const m of others) {
    bump(m.uci, -per);
  }
  // Gratuit : plus de coût en pièces (la monnaie reste pour d'autres fonctions).
  if (state.advRun) {
    state.advRun.overweightUsed = true;
  }
  saveAdventure();
  return true;
}

// Pondération (points de %) d'un coup noir donné — seulement en partie de boss.
// La surpondération peut être désactivée dans les réglages.
function advInfluenceEnabled() {
  return !state.adventure?.influenceDisabled;
}

function advBlackChoiceWeight(fen, uci) {
  const weights = state.adventure?.openingWeights;
  if (!weights || state.advRun?.kind !== 'boss' || !advInfluenceEnabled()) {
    return 0;
  }
  return Number(weights[`${fen}|${uci}`]) || 0;
}

function advOpeningWeightOf(key) {
  return Number(state.adventure?.openingWeights?.[key]) || 0;
}

function advOpeningLocks() {
  return state.adventure?.openingLocks || [];
}

function advOpeningLockIs(key) {
  return advOpeningLocks().includes(key);
}


// --- File de propositions (carrousel) + économie de pondération (boutique) ---
// File des propositions du carrousel. null → on (re)remplit avec TOUS les choix
// (cadenas en tête) ; un tableau (même vide) signifie « déjà parcourue » et n'est
// pas re-rempli avant une partie de boss.
function advEnsureOpeningDeck() {
  const adv = state.adventure;
  if (!adv) {
    return [];
  }
  const all = advInfluenceableChoices();
  const valid = new Set(all.map((choice) => choice.key));
  adv.openingLocks = (adv.openingLocks || []).filter((key) => valid.has(key));
  if (Array.isArray(adv.openingDeck)) {
    adv.openingDeck = adv.openingDeck.filter((key) => valid.has(key));
    return adv.openingDeck;
  }
  // (Re)remplissage : tous les choix, cadenas d'abord puis le reste dans l'ordre du livre.
  const locked = advOpeningLocks();
  const rest = all.map((c) => c.key).filter((key) => !locked.includes(key));
  adv.openingDeck = [...locked, ...rest];
  saveAdventure();
  return adv.openingDeck;
}

// Remise à zéro après une partie de boss : pondérations + propositions (cadenas gardés).
function advResetOpeningInfluence() {
  if (!state.adventure) {
    return;
  }
  state.adventure.openingWeights = {};
  state.adventure.openingDeck = null;
}

// Achat : ajuste la pondération d'un coup de ±5 % (10 🪙). Renvoie true si appliqué.
function advAdjustOpeningWeight(key, direction) {
  const adv = state.adventure;
  if (!adv || !advChoiceByKey(key)) {
    return false;
  }
  if (advCoins() < OPENING_WEIGHT_COST) {
    showAdventureToast({ icon: '🪙', title: 'Pas assez de pièces', text: `Il faut ${OPENING_WEIGHT_COST} 🪙.`, kind: null });
    return false;
  }
  const next = clamp(
    advOpeningWeightOf(key) + direction * OPENING_WEIGHT_STEP,
    -OPENING_WEIGHT_MAX,
    OPENING_WEIGHT_MAX
  );
  if (next === advOpeningWeightOf(key)) {
    return false; // borne atteinte
  }
  adv.openingWeights = adv.openingWeights || {};
  if (next === 0) {
    delete adv.openingWeights[key];
  } else {
    adv.openingWeights[key] = next;
  }
  adv.coins = Math.max(0, advCoins() - OPENING_WEIGHT_COST);
  saveAdventure();
  return true;
}

function advToggleOpeningLock(key) {
  const adv = state.adventure;
  if (!adv) {
    return;
  }
  adv.openingLocks = adv.openingLocks || [];
  if (adv.openingLocks.includes(key)) {
    adv.openingLocks = adv.openingLocks.filter((k) => k !== key);
  } else {
    adv.openingLocks.push(key);
    if (!(adv.openingDeck || []).includes(key)) {
      adv.openingDeck = [...(adv.openingDeck || []), key];
    }
  }
  saveAdventure();
}
export {
  OPENING_WEIGHT_STEP,
  OPENING_WEIGHT_COST,
  OPENING_WEIGHT_MAX,
  advInfluenceableChoices,
  advChoiceByKey,
  advInfluenceableNodes,
  advOverweightMove,
  advInfluenceEnabled,
  advBlackChoiceWeight,
  advOpeningWeightOf,
  advOpeningLocks,
  advOpeningLockIs,
  advEnsureOpeningDeck,
  advResetOpeningInfluence,
  advAdjustOpeningWeight,
  advToggleOpeningLock
};
