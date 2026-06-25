// Historique des parties (méta) du mode Aventure : enregistrement persistant des
// parties d'arène (boss), signature d'ouverture, version compacte des coups pour la
// revue, et agrégats victoires/défaites par ouverture/adversaire (M). Lit/écrit
// l'état Aventure. getReviewParent (infra arbre de revue) est INJECTÉ par app.js
// (initAdventureHistory) pour éviter une dépendance circulaire. Acyclique sinon.
import { state } from './state.js';
import { saveAdventure } from './adventure-state.js';
import {
  ADV_MAX_REVIEW_MOVES,
  ADV_MAX_GAMES,
  DEFAULT_ADV_DIFFICULTY
} from './adventure-config.js';
import { advRunDifficultyLevel } from './adventure-status.js';
import { getStockfishLevelProfile } from './engine.js';

// M — Libellé court de l'adversaire d'une partie enregistrée.
export function advFormatGameOpponent(g) {
  if (g.kind === 'boss') {
    return `Boss N${g.bossLevel}`;
  }
  if (g.trapsMode) {
    return `Piège · N${g.opponentLevel}`;
  }
  const profile = getStockfishLevelProfile(g.opponentLevel);
  return profile?.label || `Leçon N${g.opponentLevel}`;
}

// Résolution du parent d'un coup dans l'arbre de revue, injectée par app.js.
let getReviewParent = () => null;

export function initAdventureHistory(deps) {
  getReviewParent = deps.getReviewParent ?? getReviewParent;
}

// M — Signature de l'ouverture jouée : libellé PGN compact (« 1.e4 e5 2.Nf3 »)
// pour l'affichage, et clé = enchaînement des coups BLANCS (le choix du joueur)
// pour regrouper les parties par ouverture (et alimenter le masquage N).
function advOpeningSignature(game) {
  const openingEntries = (game?.freeReviewMoves || []).filter((e) => e.phase === 'opening');
  if (!openingEntries.length) {
    return { key: 'hors-livre', label: 'Hors livre' };
  }
  let label = '';
  let moveNo = 0;
  const whiteSans = [];
  const sans = [];
  for (const entry of openingEntries) {
    sans.push(entry.san);
    if (entry.color === 'w') {
      moveNo += 1;
      whiteSans.push(entry.san);
      label += `${label ? ' ' : ''}${moveNo}.${entry.san}`;
    } else {
      label += ` ${entry.san}`;
    }
  }
  return {
    key: whiteSans.join(' ') || 'hors-livre',
    label: label || 'Hors livre',
    sans // suite complète (deux couleurs) pour le préfixe des lignes (N)
  };
}

// M — Enregistre une partie terminée dans l'historique persistant.
// Coups joués (avec évals) d'une partie, version compacte persistable, pour la
// revue + analyse a posteriori. Construite depuis freeReviewMoves à la fin.
function buildGameReviewMoves(game) {
  const entries = (game?.freeReviewMoves || []).filter((e) => e.phase && e.phase !== 'start');
  return entries.slice(0, ADV_MAX_REVIEW_MOVES).map((entry) => {
    const best =
      entry.color === 'w' && (entry.phase === 'free' || entry.phase === 'opening')
        ? String(getReviewParent(entry)?.pv || '')
            .trim()
            .split(/\s+/)[0] || ''
        : '';
    return {
      san: entry.san,
      color: entry.color,
      phase: entry.phase,
      before: Number.isFinite(entry.beforeEvalCp) ? Math.round(entry.beforeEvalCp) : null,
      after: Number.isFinite(entry.afterEvalCp) ? Math.round(entry.afterEvalCp) : null,
      best
    };
  });
}

function advRecordGame(result) {
  const game = state.game;
  const run = state.advRun;
  if (!state.adventure || !game || !run || game.gameRecorded) {
    return;
  }
  // « Illuminer le cerveau » (leçons libres + pièges) = entraînement : ces parties
  // ne sont PAS enregistrées dans l'historique. Seule l'arène (boss) y figure.
  // Les matchs de tournoi ne polluent pas non plus l'historique de l'arène.
  if (run.kind !== 'boss' || run.tournament) {
    game.gameRecorded = true;
    return;
  }
  game.gameRecorded = true;
  const opening = advOpeningSignature(game);
  const plies = (game.freeReviewMoves || []).filter(
    (e) => e.phase !== 'start' && e.phase !== 'engine-line'
  ).length;
  state.adventure.games = state.adventure.games || [];
  const record = {
    ts: Date.now(),
    result, // 'won' | 'lost'
    kind: run.kind, // 'lesson' | 'boss'
    bossLevel: run.kind === 'boss' ? run.bossLevel : null,
    opponentLevel: advRunDifficultyLevel(),
    trapsMode: Boolean(run.trapsMode),
    openingKey: opening.key,
    openingLabel: opening.label,
    lineSans: opening.sans, // suite d'ouverture complète (N : préfixe de ligne)
    moves: buildGameReviewMoves(game), // revue + analyse a posteriori
    plies,
    mate: Boolean(game.chess?.isCheckmate?.()),
    difficulty: state.adventure.difficulty || DEFAULT_ADV_DIFFICULTY
  };
  state.adventure.games.unshift(record);
  // La suite de défaite est ajoutée plus tard (asynchrone) : on garde un lien vers
  // ce record pour y réintégrer les coups auto une fois la suite enregistrée.
  game.recordRef = record;
  if (state.adventure.games.length > ADV_MAX_GAMES) {
    state.adventure.games.length = ADV_MAX_GAMES;
  }
}

// Met à jour les coups sauvegardés du dernier record (ex. après l'ajout async de
// la suite de défaite) pour que la revue d'historique inclue les coups auto.
function advRefreshRecordedMoves(game) {
  if (game?.recordRef && state.adventure?.games?.includes(game.recordRef)) {
    game.recordRef.moves = buildGameReviewMoves(game);
    saveAdventure();
  }
}

// M — Agrégats victoires/défaites par adversaire et par ouverture.
function advGameStats(gameFilter = null) {
  const source = state.adventure?.games || [];
  const games = gameFilter ? source.filter(gameFilter) : source;
  const byOpening = new Map();
  const byOpponent = new Map();
  let won = 0;
  let lost = 0;
  for (const g of games) {
    const isWin = g.result === 'won';
    if (isWin) won += 1;
    else lost += 1;

    const oKey = g.openingKey || 'hors-livre';
    const o = byOpening.get(oKey) || {
      key: oKey,
      label: g.openingLabel || oKey,
      lineSans: Array.isArray(g.lineSans) ? g.lineSans : null, // pour nom d'ouverture + mini-échiquier
      won: 0,
      lost: 0
    };
    if (!o.lineSans && Array.isArray(g.lineSans)) {
      o.lineSans = g.lineSans;
    }
    if (isWin) o.won += 1;
    else o.lost += 1;
    byOpening.set(oKey, o);

    const pKey = g.kind === 'boss' ? `boss-${g.bossLevel}` : `lesson-${g.opponentLevel}`;
    const p = byOpponent.get(pKey) || {
      key: pKey,
      kind: g.kind,
      level: g.kind === 'boss' ? g.bossLevel : g.opponentLevel,
      won: 0,
      lost: 0
    };
    if (isWin) p.won += 1;
    else p.lost += 1;
    byOpponent.set(pKey, p);
  }
  const sortByGames = (a, b) => b.won + b.lost - (a.won + a.lost);
  return {
    games,
    won,
    lost,
    byOpening: [...byOpening.values()].sort(sortByGames),
    byOpponent: [...byOpponent.values()].sort((a, b) => (a.level || 0) - (b.level || 0))
  };
}

export {
  buildGameReviewMoves,
  advRecordGame,
  advRefreshRecordedMoves,
  advGameStats
};
