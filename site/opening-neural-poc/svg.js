// Helpers SVG partagés : création d'éléments namespacés.
export const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}
