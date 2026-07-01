// Rendu des flèches d'ouverture sur l'échiquier (géométrie pure + SVG).
import { clamp } from './utils.js';
import { createSvgElement } from './svg.js';

// Centre d'une case (coordonnées 0-100, orientation blancs en bas).
export function squareCenter(square) {
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return {
    x: ((fileIndex + 0.5) / 8) * 100,
    y: ((8 - rank + 0.5) / 8) * 100
  };
}

export function buildBoardArrowPath(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return '';
  }

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const trimStart = Math.min(5.4, length * 0.36);
  const trimEnd = Math.min(1.8, length * 0.12);
  const tip = {
    x: end.x - ux * trimEnd,
    y: end.y - uy * trimEnd
  };
  const tail = {
    x: start.x + ux * trimStart,
    y: start.y + uy * trimStart
  };
  const visibleLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
  const headLength = clamp(visibleLength * 0.34, 4.8, 7.4);
  const shaftWidth = clamp(visibleLength * 0.12, 2.1, 3.0);
  const headWidth = shaftWidth * 2.05;
  const headBase = {
    x: tip.x - ux * headLength,
    y: tip.y - uy * headLength
  };
  const shaftHalf = shaftWidth / 2;
  const headHalf = headWidth / 2;
  const points = [
    [tail.x + nx * shaftHalf, tail.y + ny * shaftHalf],
    [headBase.x + nx * shaftHalf, headBase.y + ny * shaftHalf],
    [headBase.x + nx * headHalf, headBase.y + ny * headHalf],
    [tip.x, tip.y],
    [headBase.x - nx * headHalf, headBase.y - ny * headHalf],
    [headBase.x - nx * shaftHalf, headBase.y - ny * shaftHalf],
    [tail.x - nx * shaftHalf, tail.y - ny * shaftHalf]
  ];

  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
    .concat(' Z');
}

export function renderBoardArrows(container, arrows) {
  if (!arrows.length) {
    return;
  }

  const svg = createSvgElement('svg', {
    class: 'board-arrow-layer',
    viewBox: '0 0 100 100',
    'aria-hidden': 'true'
  });

  arrows.forEach((arrow) => {
    const start = squareCenter(arrow.from);
    const end = squareCenter(arrow.to);
    const d = buildBoardArrowPath(start, end);
    if (!d) {
      return;
    }
    const arrowPath = createSvgElement('path', {
      class: 'board-opening-arrow',
      d
    });
    svg.append(arrowPath);
  });

  container.append(svg);
}
