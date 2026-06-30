// UI de l'historique des parties (M) : bilan victoires/défaites (puces + barres
// data-viz par boss/ouverture) et liste des parties d'arène cliquables (→ revue).
// Rendu pur (lecture de l'état via adventure-history) ; aucune injection. Acyclique.
import { escapeHtml } from './utils.js';
import { advGameStats, advFormatGameOpponent } from './adventure-history.js';
import { advOpeningDisplayLabel } from './graph.js';
import { advFormatRelativeTime } from './adventure-utils.js';
import { openGameReview } from './game-review.js';

function makeAdvTallyChip(title, won, lost) {
  const chip = document.createElement('span');
  chip.className = 'adv-tally-chip';
  const total = won + lost;
  const rate = total ? Math.round((won / total) * 100) : 0;
  chip.classList.toggle('is-positive', won > lost);
  chip.classList.toggle('is-negative', lost > won);
  chip.innerHTML = `<b>${title}</b><em>${won}–${lost}</em><i>${rate}%</i>`;
  chip.title = `${title} : ${won} victoire(s), ${lost} défaite(s) — ${rate}% de réussite`;
  return chip;
}

// Barre data-viz victoires/défaites : segment vert (V) + rouge (D) proportionnels,
// libellé court à gauche, score V–D à droite. Lecture immédiate.
function makeWinLossBar(label, won, lost) {
  const total = won + lost;
  const rate = total ? Math.round((won / total) * 100) : 0;
  const row = document.createElement('div');
  row.className = 'adv-wl-bar';
  row.innerHTML =
    `<span class="adv-wl-label">${escapeHtml(label)}</span>` +
    `<span class="adv-wl-track">` +
    `<span class="adv-wl-win" style="flex:${won}"></span>` +
    `<span class="adv-wl-loss" style="flex:${lost}"></span>` +
    `</span>` +
    `<span class="adv-wl-count">${won}<i>–</i>${lost}</span>`;
  row.title = `${label} : ${won} V / ${lost} D — ${rate}% de réussite`;
  return row;
}

// M — Affiche l'historique des parties (tallies par adversaire/ouverture + liste).
// Seules les parties d'arène (boss) sont listées : les leçons « illuminer le
// cerveau » sont de l'entraînement et n'apparaissent pas dans l'historique.
function renderAdvGameHistory() {
  const stats = advGameStats((g) => g.kind === 'boss');
  const summary = document.querySelector('#advHistorySummary');
  const tallies = document.querySelector('#advHistoryTallies');
  const list = document.querySelector('#advHistoryList');

  if (summary) {
    summary.textContent = stats.games.length
      ? `${stats.won} victoire${stats.won > 1 ? 's' : ''} · ${stats.lost} défaite${
          stats.lost > 1 ? 's' : ''
        } sur ${stats.games.length} partie${stats.games.length > 1 ? 's' : ''}.`
      : "Aucune partie jouée pour l'instant.";
  }

  if (tallies) {
    tallies.replaceChildren();

    // Bilan global : une barre V/D pour un coup d'œil immédiat.
    if (stats.games.length) {
      const group = document.createElement('div');
      group.className = 'adv-tally-group';
      group.innerHTML = '<span class="adv-tally-label">Bilan</span>';
      const bars = document.createElement('div');
      bars.className = 'adv-wl-bars';
      bars.append(makeWinLossBar('Total', stats.won, stats.lost));
      group.append(bars);
      tallies.append(group);
    }

    // Par boss : data-viz V/D par niveau (N1 → N10), l'info clé demandée.
    const bosses = stats.byOpponent
      .filter((p) => p.kind === 'boss')
      .sort((a, b) => (a.level || 0) - (b.level || 0));
    if (bosses.length) {
      const group = document.createElement('div');
      group.className = 'adv-tally-group';
      group.innerHTML = '<span class="adv-tally-label">Par boss</span>';
      const bars = document.createElement('div');
      bars.className = 'adv-wl-bars';
      for (const b of bosses) {
        bars.append(makeWinLossBar(`N${b.level}`, b.won, b.lost));
      }
      group.append(bars);
      tallies.append(group);
    }

    if (stats.byOpening.length) {
      const group = document.createElement('div');
      group.className = 'adv-tally-group';
      group.innerHTML = '<span class="adv-tally-label">Par ouverture</span>';
      for (const o of stats.byOpening.slice(0, 6)) {
        group.append(makeAdvTallyChip(advOpeningDisplayLabel(o.lineSans, o.label), o.won, o.lost));
      }
      tallies.append(group);
    }
  }

  if (list) {
    list.replaceChildren();
    for (const g of stats.games.slice(0, 12)) {
      const li = document.createElement('li');
      const reviewable = Array.isArray(g.moves) && g.moves.length > 0;
      li.className = `adv-history-row is-${g.result}${reviewable ? ' is-reviewable' : ''}`;
      const icon = g.result === 'won' ? '✅' : '❌';
      const mateBadge = g.mate ? '<span class="adv-history-mate">mat</span>' : '';
      const chevron = reviewable
        ? '<span class="adv-history-chevron" aria-hidden="true">▸</span>'
        : '';
      const openingText = advOpeningDisplayLabel(g.lineSans, g.openingLabel);
      li.innerHTML = `
        <span class="adv-history-result">${icon}</span>
        <span class="adv-history-main">
          <b>${escapeHtml(advFormatGameOpponent(g))}</b>${mateBadge}
          <i>${escapeHtml(openingText)}</i>
        </span>
        <span class="adv-history-meta">${g.plies} c · ${advFormatRelativeTime(g.ts)}</span>${chevron}`;
      if (reviewable) {
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `Revoir la partie : ${advFormatGameOpponent(g)}`);
        li.addEventListener('click', () => openGameReview(g));
        li.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openGameReview(g);
          }
        });
      }
      list.append(li);
    }
  }
}

export { renderAdvGameHistory };
