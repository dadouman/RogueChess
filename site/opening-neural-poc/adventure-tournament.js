import { Chess } from './vendor/chess.js';
import { state } from './state.js';
import { FIRST_LEVEL_NUMBER } from './constants.js';
import { getRawOutgoingEdges } from './graph.js';
import { playUciOnChess } from './chess-utils.js';
import { getStockfishLevelProfile } from './engine.js';
import { openOpeningViewer } from './opening-viewer.js';
import { advPickBookEdge } from './adventure-utils.js';
import {
  advSyncGlobalLives,
  advCanFightBots,
  advNotifyNoLives,
  advConsumeGlobalLife
} from './adventure-lives.js';
import { updateStockfishLevelUi } from './ui-settings.js';

// Injectés par app.js (cf. initAdventureTournament) : navigation carte, lancement
// de partie et rendu HUD. Acyclique sinon.
let ensureStockfishReady = async () => null;
let closeAdventureMap = () => {};
let setViewMode = () => {};
let setAdvViewMode = () => {};
let startNewGame = () => {};
let focusAdvInput = () => {};
let renderAdventureHud = () => {};

export function initAdventureTournament(deps) {
  ensureStockfishReady = deps.ensureStockfishReady ?? ensureStockfishReady;
  closeAdventureMap = deps.closeAdventureMap ?? closeAdventureMap;
  setViewMode = deps.setViewMode ?? setViewMode;
  setAdvViewMode = deps.setAdvViewMode ?? setAdvViewMode;
  startNewGame = deps.startNewGame ?? startNewGame;
  focusAdvInput = deps.focusAdvInput ?? focusAdvInput;
  renderAdventureHud = deps.renderAdventureHud ?? renderAdventureHud;
}

// ===================== Mode Tournoi (élimination directe) =====================
// 8 participants : le joueur (toujours Blancs, seed 2) + 7 bots de niveaux distincts.
// Seeding : le bot le plus fort (seed 1) est dans la moitié opposée au joueur, et les
// bots faibles jalonnent le parcours du joueur → la finale oppose (presque toujours)
// le meilleur bot au joueur. Matchs entre bots simulés (Stockfish vs Stockfish) et
// regardables, en respectant le livre d'ouverture.
const TOURNAMENT_PLAYER_SEED = 2;
const TOURNAMENT_BOT_LEVELS = { 1: 10, 3: 7, 4: 8, 5: 6, 6: 5, 7: 4, 8: 3 };
const TOURNAMENT_QF_PAIRS = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7]
];
export const TOURNAMENT_ROUND_LABELS = ['Quarts de finale', 'Demi-finales', 'Finale'];
const TOURNAMENT_SIM_BOOK_PLIES = 10;
const TOURNAMENT_SIM_MAX_PLIES = 36;
const TOURNAMENT_SIM_RESIGN_CP = 600;
let tournamentSimming = false;

function advTournamentParticipantLabel(seed) {
  const p = state.tournament?.participants?.[seed];
  if (!p) {
    return '—';
  }
  return p.isPlayer ? 'Toi (Blancs)' : `Bot N${p.level}`;
}

function advMatchIsPlayer(match) {
  const t = state.tournament;
  return Boolean(t && (t.participants[match.a]?.isPlayer || t.participants[match.b]?.isPlayer));
}

// Bouton « Tournoi » : reprend un tournoi en cours, sinon en démarre un nouveau.
function advOpenOrStartTournament() {
  if (state.tournament && state.tournament.status === 'active') {
    openAdvTournament();
    advRenderTournament();
    advTournamentEnsureBotSims();
    return;
  }
  // Affronter des bots exige des vies (apprends d'abord).
  advSyncGlobalLives();
  if (!advCanFightBots()) {
    advNotifyNoLives();
    return;
  }
  advStartTournament();
}

function advStartTournament() {
  const participants = {};
  for (let seed = 1; seed <= 8; seed += 1) {
    participants[seed] =
      seed === TOURNAMENT_PLAYER_SEED
        ? { seed, isPlayer: true, level: null }
        : { seed, isPlayer: false, level: TOURNAMENT_BOT_LEVELS[seed] };
  }
  const mk = (round, slot, a, b) => ({
    round,
    slot,
    a,
    b,
    winner: null,
    result: null,
    sans: [],
    simulating: false,
    playerRetryUsed: false
  });
  const rounds = [
    TOURNAMENT_QF_PAIRS.map(([a, b], i) => mk(0, i, a, b)),
    [mk(1, 0, null, null), mk(1, 1, null, null)],
    [mk(2, 0, null, null)]
  ];
  state.tournament = { participants, rounds, currentRound: 0, status: 'active' };
  openAdvTournament();
  advRenderTournament();
  advTournamentEnsureBotSims();
}

function openAdvTournament() {
  const overlay = document.querySelector('#advTournament');
  if (overlay) {
    overlay.hidden = false;
  }
  document.body.classList.add('is-adv-tournament-open');
}

function closeAdvTournament() {
  const overlay = document.querySelector('#advTournament');
  if (overlay) {
    overlay.hidden = true;
  }
  document.body.classList.remove('is-adv-tournament-open');
}

// Simule un match bot-vs-bot : ouverture suivie du livre, puis playout Stockfish des
// deux camps (à leur niveau) jusqu'au mat / résignation / plafond. Vainqueur réel.
async function advSimulateBotMatch(whiteLevel, blackLevel) {
  const fallback = whiteLevel >= blackLevel ? 'w' : 'b';
  let chess;
  try {
    chess = new Chess();
  } catch {
    return { winner: fallback, sans: [] };
  }
  const sans = [];
  let nodeId = 'root';
  for (let ply = 0; ply < TOURNAMENT_SIM_BOOK_PLIES; ply += 1) {
    const edges = getRawOutgoingEdges(nodeId).filter((e) => e.color === chess.turn());
    if (!edges.length) {
      break;
    }
    const edge = advPickBookEdge(edges);
    const mv = playUciOnChess(chess, edge.uci);
    if (!mv) {
      break;
    }
    sans.push(mv.san);
    nodeId = edge.to;
    if (chess.isGameOver()) {
      break;
    }
  }
  let winner = null;
  try {
    const evaluator = await ensureStockfishReady(false);
    const wProfile = getStockfishLevelProfile(whiteLevel);
    const bProfile = getStockfishLevelProfile(blackLevel);
    while (sans.length < TOURNAMENT_SIM_MAX_PLIES && !chess.isGameOver()) {
      const profile = chess.turn() === 'w' ? wProfile : bProfile;
      const search = await evaluator.pickMove(chess.fen(), profile);
      if (!search?.bestMove) {
        break;
      }
      const mv = playUciOnChess(chess, search.bestMove);
      if (!mv) {
        break;
      }
      sans.push(mv.san);
      if (chess.isGameOver()) {
        break;
      }
      const evalNow = await evaluator.evaluate(chess.fen());
      if (
        Number.isFinite(evalNow.cpWhite) &&
        Math.abs(evalNow.cpWhite) >= TOURNAMENT_SIM_RESIGN_CP
      ) {
        winner = evalNow.cpWhite > 0 ? 'w' : 'b';
        break;
      }
    }
    if (!winner) {
      if (chess.isCheckmate()) {
        winner = chess.turn() === 'w' ? 'b' : 'w';
      } else {
        const evalFinal = await evaluator.evaluate(chess.fen());
        winner =
          Number.isFinite(evalFinal.cpWhite) && Math.abs(evalFinal.cpWhite) >= 60
            ? evalFinal.cpWhite > 0
              ? 'w'
              : 'b'
            : fallback;
      }
    }
  } catch {
    winner = fallback;
  }
  return { winner, sans };
}

// Simule (en arrière-plan) les matchs entre bots du round courant, puis avance si prêt.
async function advTournamentEnsureBotSims() {
  const t = state.tournament;
  if (!t || t.status !== 'active' || tournamentSimming) {
    return;
  }
  tournamentSimming = true;
  try {
    const round = t.rounds[t.currentRound];
    for (const match of round) {
      if (state.tournament !== t || t.status !== 'active') {
        return;
      }
      if (match.winner != null || match.a == null || match.b == null || advMatchIsPlayer(match)) {
        continue;
      }
      match.simulating = true;
      advRenderTournament();
      const sim = await advSimulateBotMatch(
        t.participants[match.a].level,
        t.participants[match.b].level
      );
      if (state.tournament !== t) {
        return;
      }
      match.simulating = false;
      match.sans = sim.sans;
      match.winner = sim.winner === 'w' ? match.a : match.b;
      match.result = sim.winner;
      advRenderTournament();
    }
  } finally {
    tournamentSimming = false;
  }
  advTournamentAdvanceIfReady();
}

function advTournamentAdvanceIfReady() {
  const t = state.tournament;
  if (!t || t.status !== 'active') {
    return;
  }
  const round = t.rounds[t.currentRound];
  if (round.some((m) => m.winner == null)) {
    return; // tous les matchs du round ne sont pas finis
  }
  if (t.currentRound >= t.rounds.length - 1) {
    const finalMatch = round[0];
    t.status = t.participants[finalMatch.winner]?.isPlayer ? 'won' : 'eliminated';
    advRenderTournament();
    return;
  }
  const next = t.rounds[t.currentRound + 1];
  for (const m of round) {
    const target = next[Math.floor(m.slot / 2)];
    if (m.slot % 2 === 0) {
      target.a = m.winner;
    } else {
      target.b = m.winner;
    }
  }
  t.currentRound += 1;
  advRenderTournament();
  advTournamentEnsureBotSims();
}

// Lance le match en direct du joueur (Blancs) contre le bot adverse (mécanique boss).
function advTournamentPlayMatch() {
  const t = state.tournament;
  if (!t || t.status !== 'active') {
    return;
  }
  const round = t.rounds[t.currentRound];
  const match = round.find((m) => advMatchIsPlayer(m) && m.winner == null);
  if (!match || match.a == null || match.b == null) {
    return;
  }
  advSyncGlobalLives();
  if (!advCanFightBots()) {
    advNotifyNoLives();
    return;
  }
  const oppSeed = t.participants[match.a].isPlayer ? match.b : match.a;
  const oppLevel = t.participants[oppSeed].level;
  state.advRun = {
    kind: 'boss',
    bossLevel: oppLevel,
    streak: 0,
    wrongMoves: 0,
    resolved: false,
    tournament: { round: match.round, slot: match.slot }
  };
  state.playMode = 'challenge';
  state.stockfishLevel = oppLevel;
  updateStockfishLevelUi();
  closeAdvTournament();
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.message = `${TOURNAMENT_ROUND_LABELS[match.round]} · Toi (Blancs) vs Bot N${oppLevel}. Sors du livre puis cherche le mat.`;
  }
  renderAdventureHud();
  focusAdvInput();
}

// Résolution du match du joueur après la partie : victoire → avance ; défaite → 1 seul
// réessai, puis élimination.
function advTournamentResolveMatch(result) {
  const t = state.tournament;
  const ref = state.advRun?.tournament;
  state.advRun = null;
  const resultEl = document.querySelector('#advResult');
  if (resultEl) {
    resultEl.hidden = true;
  }
  document.body.classList.remove('is-game-over', 'is-game-lost');
  if (t && ref) {
    const match = t.rounds[ref.round]?.[ref.slot];
    if (match) {
      if (result === 'won') {
        match.winner = TOURNAMENT_PLAYER_SEED;
        match.result = 'player';
      } else if (!match.playerRetryUsed) {
        match.playerRetryUsed = true; // une dernière chance
      } else {
        t.status = 'eliminated';
        advConsumeGlobalLife(); // élimination du tournoi = défaite contre les bots
      }
    }
  }
  openAdvTournament();
  advRenderTournament();
  advTournamentEnsureBotSims();
  advTournamentAdvanceIfReady();
}

function advTournamentWatch(round, slot) {
  const match = state.tournament?.rounds?.[round]?.[slot];
  if (!match || !match.sans?.length) {
    return;
  }
  const title = `${advTournamentParticipantLabel(match.a)} vs ${advTournamentParticipantLabel(match.b)}`;
  openOpeningViewer(
    match.sans,
    title,
    `Vainqueur : ${advTournamentParticipantLabel(match.winner)}`,
    null,
    match.sans.length
  );
}

function advRenderTournamentMatch(match, isCurrent) {
  const t = state.tournament;
  const el = document.createElement('div');
  el.className = 'adv-tour-match';
  const sideRow = (seed) => {
    const row = document.createElement('div');
    const p = seed == null ? null : t.participants[seed];
    row.className = 'adv-tour-side';
    row.classList.toggle('is-player', Boolean(p?.isPlayer));
    row.classList.toggle('is-winner', match.winner != null && match.winner === seed);
    row.classList.toggle('is-out', match.winner != null && seed != null && match.winner !== seed);
    row.textContent = seed == null ? '—' : advTournamentParticipantLabel(seed);
    return row;
  };
  el.append(sideRow(match.a), sideRow(match.b));

  const actions = document.createElement('div');
  actions.className = 'adv-tour-actions';
  const playable =
    advMatchIsPlayer(match) &&
    match.winner == null &&
    isCurrent &&
    t.status === 'active' &&
    match.a != null &&
    match.b != null;
  if (match.simulating) {
    const s = document.createElement('span');
    s.className = 'adv-tour-status';
    s.textContent = '⏳ Simulation…';
    actions.append(s);
  } else if (playable) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-tour-play';
    btn.textContent = match.playerRetryUsed ? '🔁 Rejouer (dernière chance)' : '▶ Jouer mon match';
    btn.addEventListener('click', advTournamentPlayMatch);
    actions.append(btn);
  } else if (match.winner != null && match.sans?.length) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-ghost adv-tour-watch';
    btn.textContent = '👁 Voir';
    btn.addEventListener('click', () => advTournamentWatch(match.round, match.slot));
    actions.append(btn);
  }
  if (actions.childElementCount) {
    el.append(actions);
  }
  return el;
}

function advRenderTournament() {
  const t = state.tournament;
  const host = document.querySelector('#advTournamentBody');
  if (!host) {
    return;
  }
  host.replaceChildren();
  if (!t) {
    return;
  }
  if (t.status !== 'active') {
    const banner = document.createElement('div');
    banner.className = `adv-tour-banner is-${t.status}`;
    banner.textContent =
      t.status === 'won' ? '🏆 Champion ! Tu remportes le tournoi.' : '❌ Éliminé du tournoi.';
    host.append(banner);
  }
  t.rounds.forEach((round, rIdx) => {
    const section = document.createElement('section');
    section.className = `adv-tour-round${rIdx === t.currentRound && t.status === 'active' ? ' is-current' : ''}`;
    const h = document.createElement('h3');
    h.textContent = TOURNAMENT_ROUND_LABELS[rIdx];
    section.append(h);
    for (const match of round) {
      section.append(advRenderTournamentMatch(match, rIdx === t.currentRound));
    }
    host.append(section);
  });
  if (t.status !== 'active') {
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'adv-bottom-btn';
    restart.textContent = '🔁 Nouveau tournoi';
    restart.addEventListener('click', advStartTournament);
    host.append(restart);
  }
}

export {
  advTournamentParticipantLabel,
  advMatchIsPlayer,
  advOpenOrStartTournament,
  advStartTournament,
  openAdvTournament,
  closeAdvTournament,
  advSimulateBotMatch,
  advTournamentEnsureBotSims,
  advTournamentAdvanceIfReady,
  advTournamentPlayMatch,
  advTournamentResolveMatch,
  advTournamentWatch,
  advRenderTournamentMatch,
  advRenderTournament
};
