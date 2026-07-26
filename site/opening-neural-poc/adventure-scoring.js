// Score d'apprentissage du mode Aventure. Par coup : points de temps (100 pts à
// ≤1 s → 1 pt à ≥30 s, linéaire) moins 50 pts par erreur sur ce coup. Le nombre de
// coups scorés est CONSTANT par mode (fixé au lancement) pour que les scores
// restent comparables entre sessions. Opère sur l'objet run + lit l'état ;
// dépend de advScoreTimePoints (adventure-utils). Acyclique, pas de DI.
import { state } from './state.js';
import { advScoreTimePoints } from './adventure-utils.js';

const ADV_SCORE_MOVE_COUNT = 10; // leçon libre / piège
const ADV_SCORE_ERROR_PENALTY = 50;
let humanPlayerColor = () => 'w';

export function initAdventureScoring(deps = {}) {
  humanPlayerColor = deps.humanPlayerColor ?? humanPlayerColor;
}

function advScoreInit(run, target) {
  run.scoreTarget = target;
  run.scoreTotal = 0;
  run.scorePlayed = 0;
  run.scoreMoveStart = null;
  run.scoreMoveErrors = 0;
}

// Enregistre le score du coup courant (temps − erreurs×50) puis réarme.
function advScoreRegisterMove(run, elapsedMs) {
  if (!run || run.scoreTarget == null || (run.scorePlayed || 0) >= run.scoreTarget) {
    return;
  }
  const pts = advScoreTimePoints(elapsedMs) - (run.scoreMoveErrors || 0) * ADV_SCORE_ERROR_PENALTY;
  run.scoreTotal = (run.scoreTotal || 0) + pts;
  run.scorePlayed = (run.scorePlayed || 0) + 1;
  run.scoreMoveStart = null;
  run.scoreMoveErrors = 0;
}

// Le chrono du coup démarre quand le trait revient aux Blancs (leçons/pièges).
function advScoreArmTimer() {
  const run = state.advRun;
  const game = state.game;
  if (!run || run.scoreTarget == null || run.revisionMode || !game) {
    return;
  }
  if (game.status !== 'playing' || game.locked || game.chess.turn() !== humanPlayerColor()) {
    return;
  }
  if (run.scoreMoveStart == null) {
    run.scoreMoveStart = Date.now();
  }
}

function advScoreKey(run) {
  return run.revisionMode || (run.trapsMode ? 'trap' : 'lesson');
}

// Ligne d'affichage du score (résultat de fin) — lecture seule, le record est
// mis à jour une seule fois dans adventureOnGameFinished.
function advScoreResultLine(run) {
  if (!run || run.scoreTarget == null || !(run.scorePlayed > 0)) {
    return '';
  }
  const total = Math.round(run.scoreTotal || 0);
  const max = run.scoreTarget * 100;
  const best = Number(state.adventure?.bestScores?.[advScoreKey(run)]);
  const rec = run.scoreIsRecord
    ? ' · 🏆 record !'
    : Number.isFinite(best)
      ? ` · record ${best}`
      : '';
  return ` ⚡ Score : ${total}/${max} (${run.scorePlayed}/${run.scoreTarget} coups)${rec}`;
}

export {
  ADV_SCORE_MOVE_COUNT,
  advScoreInit,
  advScoreRegisterMove,
  advScoreArmTimer,
  advScoreKey,
  advScoreResultLine
};
