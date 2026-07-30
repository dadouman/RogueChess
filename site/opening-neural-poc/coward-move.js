// Détection des « coups pleutres » (BAP — Brigade Anti-Pleutre).
// Un coup du joueur est jugé pleutre s'il correspond à un jeu passif/craintif,
// selon trois critères (il suffit d'en remplir un) :
//   1. Retraite injustifiée : la pièce recule vers son camp alors qu'elle
//      n'était pas attaquée (et le coup n'est ni capture, ni échec).
//   2. Refus de capture favorable : une capture nettement gagnante en matériel
//      était disponible, mais le joueur joue un coup passif à la place.
//   3. Coup de crabe : coup qui ne capture pas, ne fait pas échec, ne développe
//      aucune pièce, et fait perdre de l'évaluation alors que la position était
//      favorable.
// Module pur (chess.js seulement) : aucune dépendance à l'état global, testable
// en isolation. Utilisé par app.js sur les coups libres du joueur quand le mode
// anti-pleutre est activé.
import { Chess } from './vendor/chess.js';
import { COWARD_CRAB_EVAL_LOSS_CP } from './adventure-config.js';

// Valeurs matérielles standard (en pions) pour juger une capture favorable.
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// Rang « vers l'avant » : pour les Blancs, un rang plus haut ; pour les Noirs,
// un rang plus bas. Sert à détecter une retraite (mouvement vers son camp).
function rankOf(square) {
  return Number(square[1]);
}

function isRetreatDirection(move) {
  const delta = rankOf(move.to) - rankOf(move.from);
  return move.color === 'w' ? delta < 0 : delta > 0;
}

// La pièce jouée était-elle attaquée par l'adversaire avant le coup ?
function wasPieceAttacked(beforeFen, move) {
  try {
    const probe = new Chess(beforeFen);
    const opponent = move.color === 'w' ? 'b' : 'w';
    return probe.isAttacked(move.from, opponent);
  } catch {
    return false;
  }
}

// Critère 1 — Retraite injustifiée : recul non forcé d'une pièce (pas le roi,
// pour ne pas pénaliser les mises à l'abri), sans capture ni échec, alors
// qu'elle n'était pas attaquée.
function isUnjustifiedRetreat(beforeFen, move) {
  if (move.piece === 'k' || move.captured || move.san.includes('+') || move.san.includes('#')) {
    return false;
  }
  if (!isRetreatDirection(move)) {
    return false;
  }
  return !wasPieceAttacked(beforeFen, move);
}

// Meilleur gain matériel net offert par une capture disponible dans la position
// (valeur de la pièce prise, moins la pièce engagée si la case est défendue).
function bestCaptureGain(beforeFen) {
  let best = 0;
  try {
    const probe = new Chess(beforeFen);
    const mover = probe.turn();
    const opponent = mover === 'w' ? 'b' : 'w';
    for (const cand of probe.moves({ verbose: true })) {
      if (!cand.captured) {
        continue;
      }
      const gain = PIECE_VALUE[cand.captured] || 0;
      // Si la case de capture est reprise par l'adversaire, on paie la pièce engagée.
      const defended = probe.isAttacked(cand.to, opponent);
      const net = defended ? gain - (PIECE_VALUE[cand.piece] || 0) : gain;
      if (net > best) {
        best = net;
      }
    }
  } catch {
    return 0;
  }
  return best;
}

// Critère 2 — Refus de capture favorable : une capture nettement gagnante
// (gain net ≥ 2 pions, évite les faux positifs sur échanges équilibrés) était
// disponible, et le joueur joue un coup passif (ni capture, ni échec).
function isCaptureRefusal(beforeFen, move) {
  if (move.captured || move.san.includes('+') || move.san.includes('#')) {
    return false;
  }
  return bestCaptureGain(beforeFen) >= 2;
}

// Un coup « développe »-t-il ? Approximation : pousser un pion vers l'avant,
// sortir une pièce de sa rangée de départ, ou roquer.
function isDevelopingMove(move) {
  if (move.san === 'O-O' || move.san === 'O-O-O') {
    return true;
  }
  if (!isRetreatDirection(move) && rankOf(move.to) !== rankOf(move.from)) {
    return true; // avance vers le camp adverse
  }
  const homeRank = move.color === 'w' ? 1 : 8;
  return move.piece !== 'p' && rankOf(move.from) === homeRank;
}

// Critère 3 — Coup de crabe : ni capture, ni échec, ni développement, et perte
// d'évaluation (≥ seuil) alors que le joueur était en position favorable.
function isCrabMove(move, beforeEvalCp, afterEvalCp) {
  if (move.captured || move.san.includes('+') || move.san.includes('#')) {
    return false;
  }
  if (isDevelopingMove(move)) {
    return false;
  }
  if (!Number.isFinite(beforeEvalCp) || !Number.isFinite(afterEvalCp)) {
    return false;
  }
  const perspective = move.color === 'w' ? 1 : -1;
  const before = beforeEvalCp * perspective;
  const after = afterEvalCp * perspective;
  return before > 0 && before - after >= COWARD_CRAB_EVAL_LOSS_CP;
}

// Point d'entrée : le coup est-il pleutre, et pourquoi ? Renvoie null si le
// coup est honorable, sinon { reason, label } pour l'affichage BAP.
export function detectCowardMove({ beforeFen, move, beforeEvalCp, afterEvalCp }) {
  if (!move || !beforeFen) {
    return null;
  }
  if (isUnjustifiedRetreat(beforeFen, move)) {
    return { reason: 'retreat', label: 'Retraite injustifiée' };
  }
  if (isCaptureRefusal(beforeFen, move)) {
    return { reason: 'capture-refusal', label: 'Refus de capture favorable' };
  }
  if (isCrabMove(move, beforeEvalCp, afterEvalCp)) {
    return { reason: 'crab', label: 'Coup de crabe' };
  }
  return null;
}
