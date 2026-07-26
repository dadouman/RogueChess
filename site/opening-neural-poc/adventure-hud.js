import { state } from './state.js';
import { advSetText, advSetWidth } from './dom.js';
import { advBrainProgress } from './adventure-progress.js';
import { advAids } from './adventure-aids.js';
import {
  ADV_BOSS_STARS,
  advCoveragePct,
  advBossStreakCount,
  advBossConquered,
  advBossUnlocked,
  advBossStarsMarkup,
  advDefeatEvalLine
} from './adventure-status.js';
import { advScoreResultLine } from './adventure-scoring.js';
import { advRefreshRecordedMoves, buildGameReviewMoves } from './adventure-history.js';
import { advInfluenceEnabled } from './opening-weight.js';
import { buildMoveStatsRow } from './move-verdict.js';
import { openAdventureMap } from './adventure-map.js';
import { TOURNAMENT_ROUND_LABELS, advTournamentResolveMatch } from './adventure-tournament.js';
import { openGameReview } from './game-review.js';
import { getStockfishLevelProfile } from './engine.js';

let advResultButton = () => {};
let advUndoDefeat = () => {};
let advSkipDefeatCinematic = () => {};
let openAdvInfluence = () => {};
let advMateTolerance = () => 0;
let launchBoss = () => {};
let launchRevision = () => {};
let launchTrapsLesson = () => {};
let launchLesson = () => {};
let updateAdvMobileBar = () => {};
let getExpectedWhiteBookEdges = () => [];
let humanPlayerColor = () => 'w';

export function initAdventureHud(deps) {
  advResultButton = deps.advResultButton ?? advResultButton;
  advUndoDefeat = deps.advUndoDefeat ?? advUndoDefeat;
  advSkipDefeatCinematic = deps.advSkipDefeatCinematic ?? advSkipDefeatCinematic;
  openAdvInfluence = deps.openAdvInfluence ?? openAdvInfluence;
  advMateTolerance = deps.advMateTolerance ?? advMateTolerance;
  launchBoss = deps.launchBoss ?? launchBoss;
  launchRevision = deps.launchRevision ?? launchRevision;
  launchTrapsLesson = deps.launchTrapsLesson ?? launchTrapsLesson;
  launchLesson = deps.launchLesson ?? launchLesson;
  updateAdvMobileBar = deps.updateAdvMobileBar ?? updateAdvMobileBar;
  getExpectedWhiteBookEdges = deps.getExpectedWhiteBookEdges ?? getExpectedWhiteBookEdges;
  humanPlayerColor = deps.humanPlayerColor ?? humanPlayerColor;
}

function renderBossDefeatResult(el, game, run) {
  el.classList.remove('is-win');
  el.classList.add('is-loss');
  el.replaceChildren();
  const heading = document.createElement('strong');
  const actions = document.createElement('div');
  actions.className = 'adv-result-actions';
  const level = run.bossLevel;

  if (game.mateResolution?.active) {
    el.hidden = false;
    heading.textContent = 'Résolution du mat…';
    const note = document.createElement('p');
    note.textContent = Number.isFinite(game.mateResolution.expectedX)
      ? `À toi de mater en ${game.mateResolution.expectedX}+${advMateTolerance()} — Stockfish défend.`
      : 'À toi de conclure côté Noir : porte l’estocade ! Stockfish défend.';
    el.append(heading, note, actions);
    return;
  }

  if (game.mateResolutionFailed) {
    el.hidden = false;
    heading.textContent = "⚠️ Fin critique : vous n'avez pas réussi, rejouez.";
    const note = document.createElement('p');
    note.textContent = 'Le boss reste invaincu. Repars au combat.';
    actions.append(advResultButton(`🔁 Rejouer le boss N${level}`, () => launchBoss(level), true));
    el.append(heading, note, actions);
    return;
  }

  // --- Phase A : la punition se déroule (ou se prépare encore côté moteur).
  if (game.cinematic || game.defeatCinematicPending) {
    el.hidden = false;
    heading.textContent = 'Défaite — la chute se rejoue…';
    const finalLives = game.finalMateLives || 0;
    const canComeback =
      game.chess.history().length > 0 &&
      ((advAids().takeback && !game.takebackLocked) || finalLives > 0);
    if (canComeback) {
      const label =
        finalLives > 0
          ? `↶ Dernière chance (${finalLives} vie${finalLives > 1 ? 's' : ''})`
          : '↶ Revenir en arrière';
      actions.append(advResultButton(label, () => advUndoDefeat(), true));
    }
    actions.append(
      advResultButton('⏩ Avance rapide', () => advSkipDefeatCinematic(), !canComeback)
    );
    el.append(heading, actions);
    return;
  }

  // --- Phase B : choix d'influence (carton masqué, la touche « Terminer » clôt).
  const influenceLoss = advInfluenceEnabled() && game.mateResolved && !game.influenceDone;
  if (influenceLoss && !game.influence) {
    el.hidden = false;
    heading.textContent = 'Mat résolu !';
    const note = document.createElement('p');
    note.textContent = 'Passe à l’influence des ouvertures.';
    actions.append(advResultButton('Continuer ▸', () => openAdvInfluence(), true));
    el.append(heading, note, actions);
    return;
  }
  if (influenceLoss && game.influence) {
    el.hidden = true;
    return;
  }

  // --- Phase C : CTA finaux uniquement.
  el.hidden = false;
  heading.textContent = game.chess?.isCheckmate?.() ? 'Échec et mat subi' : 'Position effondrée';
  actions.append(advResultButton(`🔁 Rejouer le boss N${level}`, () => launchBoss(level), true));
  if (level < 10 && advBossUnlocked(level + 1)) {
    actions.append(advResultButton(`Boss N${level + 1} ▸`, () => launchBoss(level + 1)));
  }
  if (game.recordRef && Array.isArray(game.recordRef.moves) && game.recordRef.moves.length) {
    actions.append(
      advResultButton('🔍 Analyser la partie', () => {
        advRefreshRecordedMoves(game);
        openGameReview(game.recordRef);
      })
    );
  }
  el.append(heading, actions);
}

function renderAdventureResult(el, game, run) {
  if (
    run.kind === 'boss' &&
    !run.tournament &&
    (game.status === 'lost' || game.mateResolution?.active)
  ) {
    renderBossDefeatResult(el, game, run);
    return;
  }
  el.hidden = false;
  const win = game.status === 'won';
  el.classList.toggle('is-win', win);
  el.classList.toggle('is-loss', !win);
  el.replaceChildren();

  const heading = document.createElement('strong');
  const stars = document.createElement('div');
  stars.className = 'adv-stars';
  const note = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'adv-result-actions';

  if (run.kind === 'boss' && run.tournament) {
    const ref = run.tournament;
    const t = state.tournament;
    const match = t?.rounds?.[ref.round]?.[ref.slot];
    const roundLabel = TOURNAMENT_ROUND_LABELS[ref.round] || 'Match';
    if (win) {
      heading.textContent = `Match gagné — ${roundLabel}`;
      note.textContent =
        ref.round >= (t ? t.rounds.length - 1 : 2)
          ? 'La couronne est à toi !'
          : 'Tu avances dans le tableau.';
    } else {
      const mated = Boolean(game.chess?.isCheckmate?.());
      const lastChance = !match?.playerRetryUsed;
      heading.textContent = mated ? 'Échec et mat subi' : 'Position effondrée';
      note.textContent = lastChance
        ? 'Tu as droit à un seul réessai de ce match.'
        : 'Réessai déjà utilisé : tu es éliminé du tournoi.';
    }
    actions.append(
      advResultButton('🏆 Continuer le tournoi', () => advTournamentResolveMatch(game.status), true)
    );
  } else if (run.kind === 'boss') {
    const level = run.bossLevel;
    const streak = advBossStreakCount(level);
    const conquered = advBossConquered(level);
    stars.innerHTML = advBossStarsMarkup(level);
    if (conquered) {
      heading.textContent = `Boss N${level} maîtrisé !`;
      note.textContent = "Trois victoires d'affilée — le cortex gagne en puissance.";
    } else {
      heading.textContent = `Victoire ${streak}/${ADV_BOSS_STARS} contre N${level}`;
      note.textContent = `Enchaîne ${ADV_BOSS_STARS - streak} victoire(s) d'affilée pour le maîtriser.`;
    }
    actions.append(advResultButton(`🔁 Rejouer le boss N${level}`, () => launchBoss(level), true));
    if (level < 10 && advBossUnlocked(level + 1)) {
      actions.append(advResultButton(`Boss N${level + 1} ▸`, () => launchBoss(level + 1)));
    }
  } else if (run.revisionMode) {
    const total = run.steps?.length || 0;
    const score = run.correctCount || 0;
    heading.textContent = `Révision : ${score}/${total}`;
    note.textContent =
      score === total
        ? 'Sans faute ! Vies rechargées — les bots n’ont qu’à bien se tenir.'
        : 'Révision terminée, les lignes rentrent. Vies rechargées.';
    actions.append(
      advResultButton('Encore une révision ▸', () => launchRevision(run.revisionMode), true)
    );
  } else if (run.trapsMode) {
    if (win) {
      heading.textContent = 'Piège livré !';
      note.textContent = `Échec et mat dans l'ouverture. Cortex à ${advCoveragePct()} %.`;
      actions.append(advResultButton('Un autre piège ▸', () => launchTrapsLesson(), true));
    } else {
      heading.textContent = 'Piège manqué';
      note.textContent = 'Le piège n’a pas abouti. Réessaie de faire tomber Stockfish.';
      actions.append(advResultButton('🔁 Recommencer', () => launchTrapsLesson(), true));
    }
  } else if (win) {
    heading.textContent = 'Ligne maîtrisée !';
    note.textContent = `Cortex illuminé à ${advCoveragePct()} %.`;
    actions.append(advResultButton('Apprendre une autre ligne ▸', () => launchLesson(), true));
  } else {
    heading.textContent = 'Ligne interrompue';
    note.textContent = 'Reprends une ligne du livre pour illuminer plus de neurones.';
    actions.append(advResultButton('🔁 Recommencer', () => launchLesson(), true));
  }

  const scoreLine = advScoreResultLine(run);
  if (scoreLine) {
    note.textContent += scoreLine;
  }

  const finalLives = game.finalMateLives || 0;
  const canComeback =
    game.status === 'lost' &&
    game.chess.history().length > 0 &&
    ((advAids().takeback && !game.takebackLocked) || finalLives > 0);
  if (canComeback) {
    const label =
      finalLives > 0
        ? `↶ Dernière chance (${finalLives} vie${finalLives > 1 ? 's' : ''})`
        : '↶ Revenir en arrière';
    actions.prepend(advResultButton(label, () => advUndoDefeat(), true));
  }
  const evalEl = document.createElement('p');
  evalEl.className = 'adv-result-eval';
  if (!win) {
    const line = advDefeatEvalLine(game);
    if (line) {
      evalEl.textContent = line;
    } else {
      evalEl.hidden = true;
    }
  } else {
    evalEl.hidden = true;
  }

  if (
    !win &&
    game.recordRef &&
    Array.isArray(game.recordRef.moves) &&
    game.recordRef.moves.length
  ) {
    actions.append(
      advResultButton('🔍 Analyser la partie', () => {
        const record = game.recordRef;
        advRefreshRecordedMoves(game);
        openGameReview(record);
      })
    );
  }

  const analysisMoves =
    (game.recordRef && Array.isArray(game.recordRef.moves) && game.recordRef.moves.length
      ? game.recordRef.moves
      : buildGameReviewMoves(game)) || [];
  const statsRow = buildMoveStatsRow(analysisMoves);
  if (statsRow) {
    statsRow.hidden = true;
    const analyseBtn = advResultButton('📊 Analyse', () => {
      statsRow.hidden = !statsRow.hidden;
      analyseBtn.classList.toggle('is-active', !statsRow.hidden);
    });
    actions.append(analyseBtn);
  }

  actions.append(advResultButton('Carte du cerveau', () => openAdventureMap()));

  el.append(heading, stars, evalEl, note, actions);
  if (statsRow) {
    el.append(statsRow);
  }
}

export function renderAdventureHud() {
  if (!state.adventure) {
    return;
  }
  const progress = advBrainProgress();
  const coveragePct = advCoveragePct();
  advSetText('#advBrainLevel', String(progress.level));
  advSetText('#advXpLabel', `${Math.round(progress.into)} / ${progress.span} XP`);
  advSetWidth('#advXpFill', progress.span ? (progress.into / progress.span) * 100 : 0);
  advSetText('#advPowerValue', `N${state.adventure.highestBoss} / N10`);
  advSetWidth('#advPowerFill', state.adventure.highestBoss * 10);

  const run = state.advRun;
  const game = state.game;
  const kicker = document.querySelector('#advStageKicker');
  const title = document.querySelector('#advStageTitle');
  const starsEl = document.querySelector('#advStars');
  const objective = document.querySelector('#advObjective');
  const streak = document.querySelector('#advStreak');
  const message = document.querySelector('#advMessage');
  const expected = document.querySelector('#advExpected');
  const result = document.querySelector('#advResult');
  const moveInputLabel = document.querySelector('#advMoveInputLabel');
  const moveInput = document.querySelector('#advMoveInput');
  const moveButton = document.querySelector('#advMoveButton');

  updateAdvMobileBar();
  if (moveInputLabel) {
    const playerColor = game?.mateResolution?.active
      ? (game.mateResolution.playerColor ?? 'w')
      : humanPlayerColor();
    moveInputLabel.textContent = playerColor === 'b' ? 'Ton coup (Noirs)' : 'Ton coup (Blancs)';
  }

  if (starsEl) {
    starsEl.textContent = '';
  }

  if (!run || !game) {
    if (kicker) kicker.textContent = 'Mode Aventure';
    if (title) title.textContent = 'Choisis une étape';
    if (objective)
      objective.textContent = 'Ouvre la carte du cerveau pour lancer une leçon ou un boss.';
    if (streak) streak.hidden = true;
    if (expected) expected.replaceChildren();
    if (result) result.hidden = true;
    if (message) message.textContent = 'Bienvenue, cerveau. Ouvre la carte pour commencer.';
    if (moveInput) moveInput.disabled = true;
    if (moveButton) moveButton.disabled = true;
    return;
  }

  if (run.kind === 'lesson' && run.revisionMode) {
    const total = run.steps?.length || 0;
    if (kicker)
      kicker.textContent =
        run.revisionMode === 'mate'
          ? `Révision · Refaire un mat${run.revisionLabel ? ' · ' + run.revisionLabel : ''}`
          : 'Révision · Quiz';
    if (title)
      title.textContent = `Coup ${Math.min(run.stepIndex + 1, total)} / ${total} · ⚡ ${Math.round(run.scoreTotal || 0)}`;
    if (objective) {
      objective.textContent = `Trouve le bon coup des ${
        humanPlayerColor() === 'w' ? 'Blancs' : 'Noirs'
      } pour recharger tes vies.`;
    }
  } else if (run.kind === 'lesson') {
    if (kicker) kicker.textContent = 'Acte 1 · Apprentissage';
    if (title)
      title.textContent =
        run.scoreTarget != null
          ? `Apprends la ligne · ⚡ ${Math.round(run.scoreTotal || 0)} (${run.scorePlayed || 0}/${run.scoreTarget})`
          : 'Apprends la ligne';
    if (objective)
      objective.textContent = `Reste dans le livre jusqu’au bout. Cortex actuel : ${coveragePct} %.`;
  } else {
    const profile = getStockfishLevelProfile(run.bossLevel);
    if (kicker) kicker.textContent = `Acte 2 · Boss N${run.bossLevel}`;
    if (title) title.textContent = `Mater ${profile.label}`;
    if (objective)
      objective.textContent = `Sors du livre puis cherche l’échec et mat contre Stockfish N${run.bossLevel}.`;
  }

  if (streak) {
    if (game.status === 'playing' && (run.streak || 0) >= 2) {
      streak.hidden = false;
      if (state.advViewMode === 'board') {
        streak.textContent = '🔥'.repeat(Math.min(run.streak, 5));
        streak.dataset.streakCount = run.streak;
      } else {
        streak.textContent = `🔥 Combo x${run.streak}`;
        delete streak.dataset.streakCount;
      }
    } else {
      streak.hidden = true;
    }
  }

  if (expected) {
    expected.replaceChildren();
    if (game.status === 'playing' && game.phase === 'opening') {
      for (const edge of getExpectedWhiteBookEdges()) {
        const chip = document.createElement('span');
        chip.className = 'adv-expected-chip';
        chip.textContent = edge.san;
        expected.append(chip);
      }
    }
  }

  if (message) {
    message.textContent = game.message;
  }

  if (result) {
    if (game.status === 'won' || game.status === 'lost' || game.mateResolution?.active) {
      renderAdventureResult(result, game, run);
    } else {
      result.hidden = true;
    }
  }

  const canMove =
    game.status === 'playing' && game.chess.turn() === humanPlayerColor() && !game.locked;
  if (moveInput) moveInput.disabled = !canMove;
  if (moveButton) moveButton.disabled = !canMove;
}
