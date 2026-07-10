import { state } from './state.js';
import { advCurrentDifficulty } from './adventure-progress.js';

// Injecté par app.js (cf. initAdventureAids) : re-rendu des détails de partie.
let renderGameDetails = () => {};

export function initAdventureAids(deps) {
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
}

// Niveaux de difficulté Aventure : chaque niveau active un sous-ensemble d'aides.
//  - moveChoices : coups suggérés (touches + indices dorés du bon coup)
//  - legalDots   : points (cases légales) quand on sélectionne une pièce
//  - evaluation  : barre / chiffres d'évaluation
//  - takeback    : retour arrière (annuler son dernier coup)
// Cases légales (« points verts ») : visibles aux niveaux faciles, masquées en
// Normal mais révélées après 5 s de réflexion ou après une erreur (Q), et jamais
// affichées en Difficile. Les niveaux se distinguent aussi par les autres aides.
export const FULL_AIDS = { moveChoices: true, legalDots: true, evaluation: true, takeback: false };

// Aides actives : selon la difficulté en Aventure, complètes ailleurs (Atelier).
function advAids() {
  if (state.screen !== 'adventure') {
    return FULL_AIDS;
  }
  const difficulty = advCurrentDifficulty();
  // Q : en Normal, les cases légales sont masquées mais révélées après 5 s ou
  // une erreur (state.game.revealLegalDots). En Difficile : jamais.
  if (difficulty.legalDotsRevealable && state.game?.revealLegalDots) {
    return { ...difficulty.aids, legalDots: true };
  }
  return difficulty.aids;
}

// Q — La difficulté courante masque-t-elle les cases légales de façon révélable ?
function legalDotsRevealable() {
  return state.screen === 'adventure' && Boolean(advCurrentDifficulty()?.legalDotsRevealable);
}

let legalDotsTimer = null;

// Réinitialise la révélation des cases légales pour le tour courant (masquées,
// minuteur 5 s relancé au prochain rendu).
function resetLegalDotsReveal() {
  if (legalDotsTimer) {
    clearTimeout(legalDotsTimer);
    legalDotsTimer = null;
  }
  if (state.game) {
    state.game.revealLegalDots = false;
  }
}

// Révèle immédiatement les cases légales (déclenché par une erreur du joueur).
function revealLegalDotsNow() {
  if (legalDotsTimer) {
    clearTimeout(legalDotsTimer);
    legalDotsTimer = null;
  }
  if (state.game && legalDotsRevealable() && !state.game.revealLegalDots) {
    state.game.revealLegalDots = true;
    renderGameDetails();
  }
}

// Arme le minuteur 5 s de révélation si c'est au joueur de jouer (appelé au rendu
// du plateau interactif). Les gardes évitent de relancer le minuteur à chaque rendu.
function maybeArmLegalDotsTimer() {
  if (
    !legalDotsRevealable() ||
    !state.game ||
    state.game.revealLegalDots ||
    legalDotsTimer ||
    state.game.status !== 'playing' ||
    state.game.locked ||
    state.game.historyView != null ||
    state.game.chess.turn() !== 'w'
  ) {
    return;
  }
  legalDotsTimer = setTimeout(() => {
    legalDotsTimer = null;
    if (state.game && legalDotsRevealable() && state.game.status === 'playing') {
      state.game.revealLegalDots = true;
      renderGameDetails();
    }
  }, 5000);
}

// Classes sur <body> pour piloter l'affichage (éval, touches, retour arrière) en CSS.
function applyDifficultyClasses() {
  const aids = advAids();
  document.body.classList.toggle('aid-no-eval', !aids.evaluation);
  document.body.classList.toggle('aid-no-choices', !aids.moveChoices);
  document.body.classList.toggle('aid-takeback', Boolean(aids.takeback));
}

export {
  advAids,
  legalDotsRevealable,
  resetLegalDotsReveal,
  revealLegalDotsNow,
  maybeArmLegalDotsTimer,
  applyDifficultyClasses
};
