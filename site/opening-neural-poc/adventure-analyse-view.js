import { state } from './state.js';
import { clamp, escapeHtml, formatPercent, sanPieceLetter } from './utils.js';
import { isMateScore, mateMovesFromCp } from './chess-utils.js';
import { formatHistoryMoveLabel } from './game-history-view.js';
import { advAids } from './adventure-aids.js';
import { advOpeningWeightOf } from './opening-weight.js';
import { renderAdvTakeBack, renderAdvPlayerBadge } from './adventure-progress-hud.js';

let renderGameDetails = () => {};
let advInfluenceViewedNode = () => null;
let getExpectedWhiteBookEdges = () => [];
let buildOpponentBookCandidates = () => [];
let getOpponentBookEdgesForRun = () => [];
let humanPlayerColor = () => 'w';
let opponentTurnColor = () => 'b';
let influenceArrowColors = [];

export function initAdventureAnalyseView(deps = {}) {
  renderGameDetails = deps.renderGameDetails ?? renderGameDetails;
  advInfluenceViewedNode = deps.advInfluenceViewedNode ?? advInfluenceViewedNode;
  getExpectedWhiteBookEdges = deps.getExpectedWhiteBookEdges ?? getExpectedWhiteBookEdges;
  buildOpponentBookCandidates = deps.buildOpponentBookCandidates ?? buildOpponentBookCandidates;
  getOpponentBookEdgesForRun = deps.getOpponentBookEdgesForRun ?? getOpponentBookEdgesForRun;
  humanPlayerColor = deps.humanPlayerColor ?? humanPlayerColor;
  opponentTurnColor = deps.opponentTurnColor ?? opponentTurnColor;
  influenceArrowColors = deps.influenceArrowColors ?? influenceArrowColors;
}

export function openAdvAnalyseSheet() {
  renderAdvAnalyseSheet();
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
  }
}

export function closeAdvAnalyseSheet() {
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }
}

export function openAdvQuickMenu() {
  closeAdvAnalyseSheet();
  renderAdvPlayerBadge();
  const menu = document.querySelector('#advQuickMenu');
  if (menu) {
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
  }
}

export function closeAdvQuickMenu() {
  const menu = document.querySelector('#advQuickMenu');
  if (menu) {
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
  }
}

export function renderAdvAnalyseSheet() {
  const game = state.game;
  const message = document.querySelector('#advSheetMessage');
  if (message) {
    const text = game?.message ?? '';
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('is-defeat', game?.status === 'lost');
  }
  const evalDl = document.querySelector('#advSheetEval');
  if (evalDl) {
    const cp = game?.currentEvalCp;
    const mateMoves = isMateScore(cp) ? mateMovesFromCp(cp) : null;
    const secondRow = mateMoves
      ? ['Mat en', `${mateMoves} coup${mateMoves > 1 ? 's' : ''}`]
      : ['Moyenne future', document.querySelector('#nodeFuture')?.textContent ?? '-'];
    const rows = [
      ['Évaluation', document.querySelector('#nodeEval')?.textContent ?? '-'],
      secondRow,
      ['Trait', document.querySelector('#nodeTurn')?.textContent ?? '-']
    ];
    evalDl.replaceChildren();
    for (const [key, value] of rows) {
      const div = document.createElement('div');
      div.innerHTML = `<dt>${key}</dt><dd>${escapeHtml(value)}</dd>`;
      evalDl.append(div);
    }
  }
  const comment = document.querySelector('#advSheetComment');
  if (comment) {
    const txt = document.querySelector('#nodeComment')?.textContent ?? '';
    comment.textContent = txt;
    comment.hidden = !txt || txt === (game?.message ?? '');
    comment.classList.remove('is-defeat');
  }
  const sources = document.querySelector('#advSheetSources');
  if (sources) {
    const txt = document.querySelector('#nodeSources')?.textContent ?? '';
    sources.textContent = txt;
    sources.hidden = !txt || txt === '-';
  }
}

export function renderAdvMovesStrip() {
  const host = document.querySelector('#advMovesStrip');
  if (!host) {
    return;
  }
  host.replaceChildren();
  const game = state.game;
  const rev = state.advRun?.revisionMode ? game?.revision : null;
  if (rev && game?.status === 'playing') {
    const showKeys =
      (rev.phase === 'question' || rev.phase === 'feedback') && rev.step && rev.keysRevealed;
    if (showKeys) {
      for (const opt of rev.step.options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'adv-move-key';
        btn.dataset.revUci = opt.uci;
        btn.innerHTML =
          // FIX côté Noir : utiliser la couleur réelle du joueur pour l'icône de pièce en révision.
          `<img class="adv-move-key-piece" src="/pieces/merida/${humanPlayerColor()}${sanPieceLetter(opt.san)}.svg" alt="" aria-hidden="true">` +
          `<span class="adv-move-key-san">${escapeHtml(opt.san)}</span>`;
        if (rev.phase === 'feedback') {
          btn.disabled = true;
          if (opt.uci === rev.step.correctUci) {
            btn.classList.add('is-correct');
          } else if (opt.uci === rev.answerUci) {
            btn.classList.add('is-wrong');
          }
        }
        host.append(btn);
      }
    } else {
      const ph = document.createElement('span');
      ph.className = 'adv-moves-placeholder';
      ph.textContent =
        rev.phase === 'question'
          ? '🧠 Joue le bon coup sur l’échiquier'
          : rev.phase === 'feedback'
            ? rev.answerUci === rev.step?.correctUci
              ? `✅ ${rev.step?.correctSan} !`
              : `❌ Le bon coup : ${rev.step?.correctSan}`
            : '⏩ Rejeu accéléré…';
      host.append(ph);
    }
    return;
  }
  if (game?.influence) {
    const node = advInfluenceViewedNode();
    if (node) {
      const used = Boolean(state.advRun?.overweightUsed);
      node.moves.forEach((move, index) => {
        const color = influenceArrowColors[index % influenceArrowColors.length];
        const selected = move.uci === game.influence.selectedUci;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `adv-move-key is-influence${selected ? ' is-influence-selected' : ''}`;
        btn.style.setProperty('--key-color', color);
        btn.dataset.inflUci = move.uci;
        btn.disabled = used;
        const weight = advOpeningWeightOf(`${node.fen}|${move.uci}`);
        const tag =
          weight > 0.01
            ? `+${Math.round(weight)}%`
            : weight < -0.01
              ? `${Math.round(weight)}%`
              : `${Math.round(move.baseProb * 100)}%`;
        btn.innerHTML =
          // FIX côté Noir : utiliser la couleur réelle de l'adversaire pour l'icône d'influence.
          `<img class="adv-move-key-piece" src="/pieces/merida/${opponentTurnColor()}${sanPieceLetter(move.san)}.svg" alt="" aria-hidden="true">` +
          `<span class="adv-move-key-san">${escapeHtml(move.san)}</span>` +
          `<span class="adv-move-key-prob">${escapeHtml(tag)}</span>`;
        host.append(btn);
      });
      const selectedMove =
        !used && node.moves.find((move) => move.uci === game.influence.selectedUci);
      if (selectedMove) {
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'adv-move-key is-influence-validate';
        ok.dataset.inflValidate = '1';
        ok.innerHTML = `<span class="adv-move-key-san">✓ ${escapeHtml(selectedMove.san)} +5%</span>`;
        host.append(ok);
      }
    } else {
      const ph = document.createElement('span');
      ph.className = 'adv-moves-placeholder';
      ph.textContent = `‹ › Navigue jusqu’à un choix des ${
        opponentTurnColor() === 'w' ? 'Blancs' : 'Noirs'
      } pour influencer`;
      host.append(ph);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'adv-move-key is-influence-done';
    done.dataset.inflDone = '1';
    done.innerHTML = '<span class="adv-move-key-san">Terminer ›</span>';
    host.append(done);
    return;
  }
  const reviewing = Boolean(game && game.historyView != null);
  const inPlay = Boolean(game && game.status === 'playing' && !reviewing);
  const playerColor = game?.mateResolution?.active
    ? (game.mateResolution.playerColor ?? 'w')
    : humanPlayerColor();
  const opponentColor = opponentTurnColor();
  const showChoices = advAids().moveChoices;
  const playerPlayable =
    inPlay && game.chess.turn() === playerColor && !game.locked && game.phase === 'opening';
  const playerEdges = playerPlayable && showChoices ? getExpectedWhiteBookEdges() : [];
  for (const edge of playerEdges) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-move-key';
    btn.dataset.uci = edge.uci;
    btn.innerHTML =
          // FIX côté Noir : utiliser la couleur réelle du joueur pour les coups d'ouverture.
          `<img class="adv-move-key-piece" src="/pieces/merida/${playerColor}${sanPieceLetter(edge.san)}.svg" alt="" aria-hidden="true">` +
          `<span class="adv-move-key-san">${escapeHtml(edge.san)}</span>`;
    host.append(btn);
  }
  let ghosts = [];
  if (
    showChoices &&
    !playerEdges.length &&
    inPlay &&
    game.chess.turn() === opponentColor &&
    game.phase === 'opening'
  ) {
    ghosts = buildOpponentBookCandidates(getOpponentBookEdgesForRun());
  }
  for (const candidate of ghosts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-move-key is-ghost';
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const probability = `<span class="adv-move-key-prob">${escapeHtml(formatPercent(candidate.probability))}</span>`;
    if (candidate.type === 'free') {
      btn.classList.add('is-ghost-free');
      btn.innerHTML = `<span class="adv-move-key-san">Imprevu</span>${probability}`;
    } else {
      const san = candidate.edge.san;
        btn.innerHTML =
            // FIX côté Noir : utiliser la couleur réelle de l'adversaire pour les coups fantômes.
            `<img class="adv-move-key-piece" src="/pieces/merida/${opponentColor}${sanPieceLetter(san)}.svg" alt="" aria-hidden="true">` +
            `<span class="adv-move-key-san">${escapeHtml(san)}</span>${probability}`;
    }
    host.append(btn);
  }
  const hasContent = playerEdges.length || ghosts.length;
  if (!hasContent) {
    const ph = document.createElement('span');
    ph.className = 'adv-moves-placeholder';
    const yourTurnNoAid =
      !showChoices &&
      game?.status === 'playing' &&
      game.chess.turn() === playerColor &&
      !game.locked;
    ph.textContent = yourTurnNoAid
      ? 'À toi de jouer sur l’échiquier'
      : game?.victoryCinematic
        ? 'Conversion automatique en cours…'
        : game?.status === 'playing' && game.chess.turn() === opponentColor
          ? 'Au tour de Stockfish…'
          : game?.status === 'playing' && game.phase !== 'opening'
            ? 'Hors du livre : joue ton coup sur l’échiquier'
            : ' ';
    host.append(ph);
  }
  host.classList.toggle('is-empty', !hasContent);
}

export function updateAdvMobileBar() {
  const label = document.querySelector('#advBarViewLabel');
  if (label) {
    label.textContent = state.advViewMode === 'board' ? 'Cerveau' : 'Échiquier';
  }
  const icon = document.querySelector('#advBarView .adv-bar-ico');
  if (icon) {
    icon.textContent = state.advViewMode === 'board' ? '🧠' : '🎮';
  }
  renderAdvMovesStrip();
  renderAdvHistory();
  renderAdvTakeBack();
  renderAdvPlayerBadge();
  if (document.querySelector('#advAnalyseSheet')?.classList.contains('is-open')) {
    renderAdvAnalyseSheet();
  }
}

export function advHistoryLength() {
  const game = state.game;
  return game?.chess ? game.chess.history().length : 0;
}

export function advHistoryGoto(index) {
  const game = state.game;
  if (!game) {
    return;
  }
  const total = advHistoryLength();
  game.historyView = index == null || index >= total ? null : clamp(index, 0, total);
  game.selectedSquare = null;
  if (game.historyView != null && game.freeReview?.active) {
    game.freeReview.active = false;
  }
  renderGameDetails();
}

export function advHistoryStep(delta) {
  const game = state.game;
  if (!game) {
    return;
  }
  if (game.influence?.lineSans) {
    const length = game.influence.lineSans.length;
    game.influence.lineIndex = clamp((game.influence.lineIndex ?? length) + delta, 0, length);
    renderGameDetails();
    return;
  }
  const current = game.historyView ?? advHistoryLength();
  advHistoryGoto(current + delta);
}

export function toggleAdvHistory() {
  const hidden = document.body.classList.toggle('is-history-hidden');
  if (hidden && state.game?.historyView != null) {
    advHistoryGoto(null);
  }
}

export function renderAdvHistory() {
  const host = document.querySelector('#advHistory');
  if (!host) {
    return;
  }
  const game = state.game;
  const total = advHistoryLength();
  const prev = document.querySelector('#advHistPrev');
  const next = document.querySelector('#advHistNext');
  const label = document.querySelector('#advHistLabel');
  const influence = game?.influence?.lineSans ? game.influence : null;
  if (influence) {
    const length = influence.lineSans.length;
    const current = clamp(influence.lineIndex ?? length, 0, length);
    document.body.classList.toggle('is-reviewing-history', current < length);
    host.classList.toggle('is-reviewing', true);
    if (label) {
      const san = current > 0 ? influence.lineSans[current - 1] : null;
      const moveNumber = Math.ceil(current / 2);
      const moveLabel = san
        ? current % 2 === 1
          ? `${moveNumber}. ${san}`
          : `${moveNumber}… ${san}`
        : 'Départ';
      label.textContent = `${moveLabel} · ${current}/${length}`;
    }
    if (prev) prev.disabled = current <= 0;
    if (next) next.disabled = current >= length;
    return;
  }
  const reviewing = Boolean(game && game.historyView != null);
  document.body.classList.toggle('is-reviewing-history', reviewing);
  host.classList.toggle('is-reviewing', reviewing);
  if (!game || total === 0) {
    if (label) label.textContent = 'Aucun coup';
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }
  const current = game.historyView ?? total;
  if (label) {
    label.textContent = `${formatHistoryMoveLabel(game, current)} · ${current}/${total}`;
  }
  if (prev) prev.disabled = current <= 0;
  if (next) next.disabled = !reviewing;
}
