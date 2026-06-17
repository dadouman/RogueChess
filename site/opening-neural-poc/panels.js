// Volets latéraux redimensionnables (vue créatif/cerveau, desktop > 1060px) :
// largeur via variables CSS --left-panel / --right-panel, repli/expansion,
// poignées de glissement (souris + clavier). Couplé à l'état (largeurs mémorisées,
// volets repliés) et au DOM (elements, document). Le re-rendu du graphe est
// injecté (requestRender) pour éviter une dépendance circulaire avec app.js.
import { elements } from './elements.js';
import { state } from './state.js';
import { clamp } from './utils.js';

// Re-rendu du graphe, injecté par app.js au binding (cf. bindPanelResizeHandles).
let requestRender = () => {};

function getPanelWidthVar(name, fallback) {
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setPanelWidthVar(name, value) {
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

function panelWidthVariable(side) {
  return side === 'left' ? '--left-panel' : '--right-panel';
}

function panelDefaultWidth(side) {
  return side === 'left' ? 328 : 340;
}

function panelMinimumWidth(side) {
  return side === 'left' ? 220 : 240;
}

function setPanelWidth(side, width) {
  setPanelWidthVar(panelWidthVariable(side), width);
}

export function clampPanelWidths() {
  if (!elements.shell || window.innerWidth <= 1060) {
    return;
  }

  const rect = elements.shell.getBoundingClientRect();
  const centerMin = 360;
  const leftMin = panelMinimumWidth('left');
  const rightMin = panelMinimumWidth('right');
  let left = getPanelWidthVar('--left-panel', 328);
  let right = getPanelWidthVar('--right-panel', 340);

  if (state.collapsedPanels.left) {
    left = 0;
  }
  if (state.collapsedPanels.right) {
    right = 0;
  }

  if (!state.collapsedPanels.left) {
    left = clamp(
      left,
      leftMin,
      Math.max(leftMin, rect.width - (state.collapsedPanels.right ? 0 : rightMin) - centerMin)
    );
  }
  if (!state.collapsedPanels.right) {
    right = clamp(
      right,
      rightMin,
      Math.max(rightMin, rect.width - left - centerMin)
    );
  }
  if (!state.collapsedPanels.left) {
    left = clamp(left, leftMin, Math.max(leftMin, rect.width - right - centerMin));
  }

  setPanelWidthVar('--left-panel', left);
  setPanelWidthVar('--right-panel', right);
}

function updatePanelCollapseUi() {
  document.body.classList.toggle('is-left-panel-collapsed', state.collapsedPanels.left);
  document.body.classList.toggle('is-right-panel-collapsed', state.collapsedPanels.right);

  for (const button of elements.panelCollapseButtons) {
    const side = button.dataset.collapseSide;
    const collapsed = Boolean(state.collapsedPanels[side]);
    button.textContent =
      side === 'left'
        ? collapsed ? '›' : '‹'
        : collapsed ? '‹' : '›';
    button.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    button.setAttribute(
      'aria-label',
      `${collapsed ? 'Afficher' : 'Masquer'} le volet ${side === 'left' ? 'gauche' : 'droit'}`
    );
  }
}

function setPanelCollapsed(side, collapsed) {
  if (!['left', 'right'].includes(side)) {
    return;
  }

  const variableName = panelWidthVariable(side);
  if (collapsed) {
    const currentWidth = getPanelWidthVar(variableName, panelDefaultWidth(side));
    if (currentWidth > 0) {
      state.panelWidthMemory[side] = currentWidth;
    }
    state.collapsedPanels[side] = true;
    setPanelWidth(side, 0);
  } else {
    state.collapsedPanels[side] = false;
    setPanelWidth(side, Math.max(panelMinimumWidth(side), state.panelWidthMemory[side]));
  }

  updatePanelCollapseUi();
  clampPanelWidths();
  window.requestAnimationFrame(() => requestRender());
}

function setPanelWidthFromPointer(side, clientX) {
  if (!elements.shell || window.innerWidth <= 1060) {
    return;
  }

  if (state.collapsedPanels[side]) {
    state.collapsedPanels[side] = false;
    setPanelWidth(side, Math.max(panelMinimumWidth(side), state.panelWidthMemory[side]));
    updatePanelCollapseUi();
  }

  const rect = elements.shell.getBoundingClientRect();
  const centerMin = 360;
  const leftMin = panelMinimumWidth('left');
  const rightMin = panelMinimumWidth('right');
  const leftMax = 520;
  const rightMax = 560;
  const currentLeft = getPanelWidthVar('--left-panel', 328);
  const currentRight = getPanelWidthVar('--right-panel', 340);

  if (side === 'left') {
    const maxLeft = Math.min(leftMax, rect.width - currentRight - centerMin);
    setPanelWidthVar('--left-panel', clamp(clientX - rect.left, leftMin, Math.max(leftMin, maxLeft)));
  } else {
    const maxRight = Math.min(rightMax, rect.width - currentLeft - centerMin);
    setPanelWidthVar('--right-panel', clamp(rect.right - clientX, rightMin, Math.max(rightMin, maxRight)));
  }

  window.requestAnimationFrame(() => requestRender());
}

function startPanelResize(event) {
  const side = event.currentTarget.dataset.resizeSide;
  if (!side || window.innerWidth <= 1060) {
    return;
  }

  event.preventDefault();
  state.activeResize = side;
  document.body.classList.add('is-resizing-panels');
  event.currentTarget.setPointerCapture?.(event.pointerId);
  setPanelWidthFromPointer(side, event.clientX);
}

function movePanelResize(event) {
  if (!state.activeResize) {
    return;
  }
  setPanelWidthFromPointer(state.activeResize, event.clientX);
}

function stopPanelResize() {
  if (!state.activeResize) {
    return;
  }
  state.activeResize = null;
  document.body.classList.remove('is-resizing-panels');
  clampPanelWidths();
  requestRender();
}

function resizePanelWithKeyboard(event) {
  const side = event.currentTarget.dataset.resizeSide;
  if (!side || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const step = event.shiftKey ? 40 : 16;
  if (state.collapsedPanels[side]) {
    setPanelCollapsed(side, false);
    return;
  }
  const variableName = panelWidthVariable(side);
  const fallback = panelDefaultWidth(side);
  const multiplier = side === 'left' ? direction : -direction;
  setPanelWidthVar(variableName, getPanelWidthVar(variableName, fallback) + step * multiplier);
  clampPanelWidths();
  requestRender();
}

export function bindPanelResizeHandles(render) {
  requestRender = render ?? requestRender;
  for (const handle of elements.resizeHandles) {
    handle.addEventListener('pointerdown', startPanelResize);
    handle.addEventListener('keydown', resizePanelWithKeyboard);
  }
  for (const button of elements.panelCollapseButtons) {
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const side = event.currentTarget.dataset.collapseSide;
      setPanelCollapsed(side, !state.collapsedPanels[side]);
    });
  }
  window.addEventListener('pointermove', movePanelResize);
  window.addEventListener('pointerup', stopPanelResize);
  window.addEventListener('pointercancel', stopPanelResize);
  updatePanelCollapseUi();
}
