// Infobulles du graphe cerveau : contenu HTML au survol d'un nœud, d'une arête ou
// d'un barreau (demi-coup d'une séquence compressée), + positionnement et masquage.
// Pur rendu DOM : lit les objets nœud/arête passés en argument, écrit dans
// elements.graphTooltip. Aucune dépendance à l'état global ni au re-rendu du graphe.
import { elements } from './elements.js';
import { formatEval } from './eval-commentary.js';
import {
  sideLabel,
  escapeHtml,
  formatPercent,
  moveColorAt,
  sanPieceLetter,
  clamp
} from './utils.js';

export function showNodeTooltip(node, event) {
  const comment = node.comments[0] ?? 'Aucune explication associée.';
  elements.graphTooltip.innerHTML = `
    <strong>${node.id === 'root' ? 'Départ' : node.san}</strong>
    <span>Eval ${formatEval(node.evaluation?.cpWhite)} · Futur ${formatEval(node.futureMeanCp)} · ${sideLabel(node.sideToMove)} au trait</span>
    <span>${escapeHtml(comment)}</span>
  `;
  positionTooltip(event);
}

export function showEdgeTooltip(edge, event) {
  const compressedText = edge.isCompressed
    ? `<span>Séquence compressée: ${escapeHtml(edge.sequenceLabel)}</span>`
    : '';
  const mateText = edge.endsInMate
    ? '<span>Branche de mat: probabilité minimale 1%.</span>'
    : '';
  elements.graphTooltip.innerHTML = `
    <strong>${edge.san} · ${formatPercent(edge.probability)}</strong>
    <span>Delta ${edge.deltaCp >= 0 ? '+' : ''}${edge.deltaCp} cp vs moyenne des suites</span>
    <span>Moyenne du chemin: ${formatEval(edge.pathMeanCp)}</span>
    ${compressedText}
    ${mateText}
  `;
  positionTooltip(event);
}

export function showRungTooltip(edge, index, event) {
  const san = edge.sequence?.[index] ?? '';
  const total = edge.sequence?.length ?? 0;
  const color = moveColorAt(edge, index);
  const img = `/pieces/merida/${color}${sanPieceLetter(san)}.svg`;
  elements.graphTooltip.innerHTML = `
    <strong><img class="tooltip-piece" src="${img}" alt="" aria-hidden="true"> Coup ${index + 1}/${total} : ${escapeHtml(san)}</strong>
    <span>${sideLabel(color)} au trait · séquence ${escapeHtml(edge.sequenceLabel)}</span>
  `;
  positionTooltip(event);
}

function positionTooltip(event) {
  const stageRect = elements.graphSvg.getBoundingClientRect();
  elements.graphTooltip.hidden = false;
  elements.graphTooltip.style.left = `${clamp(event.clientX - stageRect.left + 14, 12, stageRect.width - 298)}px`;
  elements.graphTooltip.style.top = `${clamp(event.clientY - stageRect.top + 14, 82, stageRect.height - 126)}px`;
}

export function hideTooltip() {
  elements.graphTooltip.hidden = true;
}
