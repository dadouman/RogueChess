import { Chess } from './vendor/chess.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATE_SCORE_CP = 100000;
const DISPLAY_DEFAULT_FLOOR_MASS = 0.01;
const MATE_BRANCH_MIN_PROBABILITY = 0.01;
const PROBABILITY_TEMPERATURE_CP = 95;
const PROBABILITY_FLOOR_MASS = 0.01;
const FIRST_LEVEL_NUMBER = 1;
const FREE_SURVIVAL_TARGETS = [5, 7, 10, 13, 15];
const IMPORT_STOCKFISH_DEPTH = 5;
const STARTING_LIVES = 3;
const OPENING_FREE_BREAK_PLY = 14;
const OPENING_FREE_BREAK_PROBABILITY = 0.25;
const SURVIVAL_LIMIT_CP = -100;
const STOCKFISH_DEPTH = 8;
const DEFAULT_STOCKFISH_LEVEL = 5;
const STOCKFISH_LEVELS = {
  1: { level: 1, label: 'Débutant', elo: 1320, skill: 1, depth: 2, movetime: 80 },
  2: { level: 2, label: 'Facile', elo: 1450, skill: 3, depth: 3, movetime: 120 },
  3: { level: 3, label: 'Club faible', elo: 1600, skill: 5, depth: 4, movetime: 180 },
  4: { level: 4, label: 'Club', elo: 1750, skill: 7, depth: 5, movetime: 250 },
  5: { level: 5, label: 'Solide', elo: 1900, skill: 9, depth: 6, movetime: 350 },
  6: { level: 6, label: 'Fort', elo: 2100, skill: 12, depth: 7, movetime: 500 },
  7: { level: 7, label: 'Expert', elo: 2300, skill: 15, depth: 8, movetime: 700 },
  8: { level: 8, label: 'Maître', elo: 2500, skill: 17, depth: 10, movetime: 1000 },
  9: { level: 9, label: 'Trop fort', elo: 2800, skill: 19, depth: 12, movetime: 1400 },
  10: { level: 10, label: 'Stockfish pur', elo: null, skill: 20, depth: 14, movetime: null }
};
// Conversion automatique « cinématique » de la phase libre : dès que les Blancs
// dépassent +2, on avance la partie seul (meilleurs coups blancs vs défense Stockfish)
// jusqu'à voir un mat forcé, puis on rend la main au joueur pour conclure.
const VICTORY_CINEMATIC_TRIGGER_CP = 200;  // +2.00 : seuil de déclenchement
const VICTORY_CINEMATIC_KEEP_CP = 150;     // si l'avantage retombe sous +1.50, on rend la main
const VICTORY_CINEMATIC_DEPTH = 10;        // profondeur d'analyse pendant la conversion
const VICTORY_CINEMATIC_MAX_PLIES = 36;    // garde-fou : ~18 coups complets max
const VICTORY_CINEMATIC_STEP_MS = 650;     // tempo entre deux coups
const STANDARD_START_FEN = new Chess().fen();
const MATERIAL_VALUES_CP = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900
};
const PIECE_LABELS = {
  p: ['pion', 'pions'],
  n: ['cavalier', 'cavaliers'],
  b: ['fou', 'fous'],
  r: ['tour', 'tours'],
  q: ['dame', 'dames']
};

const elements = {
  shell: document.querySelector('.poc-shell'),
  summaryText: document.querySelector('#summaryText'),
  lineFilter: document.querySelector('#lineFilter'),
  pgnFileInput: document.querySelector('#pgnFileInput'),
  pgnTextInput: document.querySelector('#pgnTextInput'),
  buildPgnButton: document.querySelector('#buildPgnButton'),
  defaultPgnButton: document.querySelector('#defaultPgnButton'),
  pgnImportStatus: document.querySelector('#pgnImportStatus'),
  temperatureRange: document.querySelector('#temperatureRange'),
  temperatureValue: document.querySelector('#temperatureValue'),
  floorRange: document.querySelector('#floorRange'),
  floorValue: document.querySelector('#floorValue'),
  viewModeButton: document.querySelector('#viewModeButton'),
  newGameButton: document.querySelector('#newGameButton'),
  challengeModeButton: document.querySelector('#challengeModeButton'),
  explorationModeButton: document.querySelector('#explorationModeButton'),
  stockfishLevelRange: document.querySelector('#stockfishLevelRange'),
  stockfishLevelValue: document.querySelector('#stockfishLevelValue'),
  survivalLimitRange: document.querySelector('#survivalLimitRange'),
  survivalLimitValue: document.querySelector('#survivalLimitValue'),
  gameLevelLabel: document.querySelector('#gameLevelLabel'),
  lifeRow: document.querySelector('#lifeRow'),
  gameTitle: document.querySelector('#gameTitle'),
  gamePhase: document.querySelector('#gamePhase'),
  gameFreeRemaining: document.querySelector('#gameFreeRemaining'),
  gameEval: document.querySelector('#gameEval'),
  gameTurn: document.querySelector('#gameTurn'),
  moveForm: document.querySelector('#moveForm'),
  moveInputLabel: document.querySelector('#moveInputLabel'),
  moveInput: document.querySelector('#moveInput'),
  playMoveButton: document.querySelector('#playMoveButton'),
  gameMessage: document.querySelector('#gameMessage'),
  expectedMoveList: document.querySelector('#expectedMoveList'),
  opponentGraphMini: document.querySelector('#opponentGraphMini'),
  moveLogList: document.querySelector('#moveLogList'),
  freeReviewPanel: document.querySelector('#freeReviewPanel'),
  bestPathButton: document.querySelector('#bestPathButton'),
  randomPathButton: document.querySelector('#randomPathButton'),
  resetButton: document.querySelector('#resetButton'),
  nodesCount: document.querySelector('#nodesCount'),
  edgesCount: document.querySelector('#edgesCount'),
  branchingCount: document.querySelector('#branchingCount'),
  engineDepth: document.querySelector('#engineDepth'),
  selectedPathLabel: document.querySelector('#selectedPathLabel'),
  graphSvg: document.querySelector('#graphSvg'),
  graphTooltip: document.querySelector('#graphTooltip'),
  nodeTitle: document.querySelector('#nodeTitle'),
  nodeSubtitle: document.querySelector('#nodeSubtitle'),
  boardZoomButton: document.querySelector('#boardZoomButton'),
  boardZoomLayer: document.querySelector('#boardZoomLayer'),
  boardZoomPreview: document.querySelector('#boardZoomPreview'),
  boardZoomCloseButton: document.querySelector('#boardZoomCloseButton'),
  boardZoomTitle: document.querySelector('#boardZoomTitle'),
  boardPreview: document.querySelector('#boardPreview'),
  detailInfoContent: document.querySelector('#detailInfoContent'),
  graphInfoDrawer: document.querySelector('#graphInfoDrawer'),
  graphInfoContent: document.querySelector('#graphInfoContent'),
  resizeHandles: document.querySelectorAll('[data-resize-side]'),
  panelCollapseButtons: document.querySelectorAll('[data-collapse-side]'),
  segmentExplorer: document.querySelector('#segmentExplorer'),
  segmentProgress: document.querySelector('#segmentProgress'),
  segmentToggleButton: document.querySelector('#segmentToggleButton'),
  segmentPrevButton: document.querySelector('#segmentPrevButton'),
  segmentNextButton: document.querySelector('#segmentNextButton'),
  segmentStepList: document.querySelector('#segmentStepList'),
  nodeEval: document.querySelector('#nodeEval'),
  nodeFuture: document.querySelector('#nodeFuture'),
  nodeTurn: document.querySelector('#nodeTurn'),
  nodeComment: document.querySelector('#nodeComment'),
  choiceList: document.querySelector('#choiceList'),
  nodeSources: document.querySelector('#nodeSources'),
  liveEvalBar: document.querySelector('#liveEvalBar'),
  liveEvalBarFill: document.querySelector('#liveEvalBarFill'),
  liveMoveLog: document.querySelector('#liveMoveLog'),
  advBrainThinking: document.querySelector('#advBrainThinking')
};

const state = {
  data: null,
  view: null,
  nodesById: new Map(),
  edgesById: new Map(),
  nodesByFen: new Map(),
  nodesByPositionKey: new Map(),
  layout: new Map(),
  selectedNodeId: 'root',
  highlightedEdges: new Set(),
  highlightedNodes: new Set(['root']),
  selectedSegment: null,
  segmentStepIndex: 0,
  segmentExpanded: false,
  boardZoomed: false,
  currentPreviewNode: null,
  viewMode: 'human',
  playMode: 'challenge',
  campaignLevel: FIRST_LEVEL_NUMBER,
  stockfishLevel: DEFAULT_STOCKFISH_LEVEL,
  survivalLimitCp: SURVIVAL_LIMIT_CP,
  lineFilter: 'all',
  temperatureCp: 95,
  floorMass: DISPLAY_DEFAULT_FLOOR_MASS,
  stockfish: null,
  defaultData: null,
  isImportingPgn: false,
  activeResize: null,
  collapsedPanels: {
    left: false,
    right: false
  },
  panelWidthMemory: {
    left: 328,
    right: 340
  },
  screen: 'home',
  activeBook: 'default',
  adventure: null,
  advRun: null,
  advViewMode: 'board',
  game: null
};

function createSvgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getLevelObjective(level) {
  const target = FREE_SURVIVAL_TARGETS[level - 1];
  if (Number.isFinite(target)) {
    return { type: 'survival', target };
  }
  return { type: 'mate', target: Number.POSITIVE_INFINITY };
}

function isMateObjective(game) {
  return game?.objective?.type === 'mate';
}

function formatLevelObjective(level) {
  const objective = getLevelObjective(level);
  return objective.type === 'mate'
    ? "mater l'adversaire"
    : `tenir ${objective.target} coups complets libres`;
}

function formatSurvivalTarget(game) {
  return isMateObjective(game) ? "jusqu'au mat" : `${game.objective.target}`;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatEval(cpWhite) {
  if (!Number.isFinite(cpWhite)) {
    return '-';
  }
  if (Math.abs(cpWhite) >= MATE_SCORE_CP - 1000) {
    return cpWhite > 0 ? 'Mat blanc' : 'Mat noir';
  }
  return `${cpWhite >= 0 ? '+' : ''}${(cpWhite / 100).toFixed(2)}`;
}

function formatPercent(value) {
  const percent = Math.round(value * 100);
  if (value > 0 && percent === 0) {
    return '<1%';
  }
  return `${percent}%`;
}

function sideLabel(side) {
  if (side === 'w') {
    return 'Blancs';
  }
  if (side === 'b') {
    return 'Noirs';
  }
  return '-';
}

function getStockfishLevelProfile(level = state.stockfishLevel) {
  const safeLevel = clamp(Math.round(Number(level) || DEFAULT_STOCKFISH_LEVEL), 1, 10);
  return STOCKFISH_LEVELS[safeLevel] ?? STOCKFISH_LEVELS[DEFAULT_STOCKFISH_LEVEL];
}

function formatStockfishLevel(profile = getStockfishLevelProfile()) {
  const strength = profile.elo ? `${profile.elo} Elo` : 'force max';
  return `N${profile.level} ${profile.label} · ${strength}`;
}

function updateStockfishLevelUi() {
  const profile = getStockfishLevelProfile();
  elements.stockfishLevelRange.value = String(profile.level);
  elements.stockfishLevelValue.textContent = formatStockfishLevel(profile);
}

function updateSurvivalLimitUi() {
  elements.survivalLimitRange.value = String(state.survivalLimitCp);
  elements.survivalLimitValue.textContent = formatEval(state.survivalLimitCp);
}

function formatPieceCount(piece, count) {
  const [singular, plural] = PIECE_LABELS[piece] ?? ['pièce', 'pièces'];
  if (count === 1) {
    const article = piece === 'b' || piece === 'n' || piece === 'p' ? 'un' : 'une';
    return `${article} ${singular}`;
  }
  if (count === 2) {
    return `deux ${plural}`;
  }
  return `${count} ${plural}`;
}

function joinHumanList(items) {
  if (!items.length) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

function summarizeMaterial(fen) {
  const counts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
  };
  const board = fen.split(/\s+/)[0] ?? '';

  for (const char of board) {
    const piece = char.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MATERIAL_VALUES_CP, piece)) {
      continue;
    }
    const color = char === char.toUpperCase() ? 'w' : 'b';
    counts[color][piece] += 1;
  }

  let cpWhite = 0;
  const deficits = [];
  const surpluses = [];
  for (const piece of Object.keys(MATERIAL_VALUES_CP)) {
    const delta = counts.w[piece] - counts.b[piece];
    cpWhite += delta * MATERIAL_VALUES_CP[piece];
    if (delta < 0) {
      deficits.push({ piece, count: Math.abs(delta) });
    } else if (delta > 0) {
      surpluses.push({ piece, count: delta });
    }
  }

  return { cpWhite, deficits, surpluses };
}

function materialEquivalent(absCp) {
  if (absCp < 80) {
    return 'moins d’un pion';
  }
  if (absCp < 180) {
    return 'environ un pion';
  }
  if (absCp < 290) {
    return 'environ deux pions';
  }
  if (absCp < 430) {
    return 'environ une pièce légère';
  }
  if (absCp < 680) {
    return 'environ une tour';
  }
  if (absCp < 950) {
    return 'environ une tour et une pièce légère';
  }
  return 'environ une dame ou plus';
}

function materialComment(fen) {
  const material = summarizeMaterial(fen);
  if (material.cpWhite < -70) {
    const missing = material.deficits.map(({ piece, count }) => formatPieceCount(piece, count));
    const detail = missing.length ? ` Il manque notamment ${joinHumanList(missing)} côté blanc.` : '';
    return `Matériellement, les Blancs accusent ${materialEquivalent(Math.abs(material.cpWhite))}.${detail}`;
  }
  if (material.cpWhite > 70) {
    const surplus = material.surpluses.map(({ piece, count }) => formatPieceCount(piece, count));
    const detail = surplus.length ? ` Les Blancs ont même ${joinHumanList(surplus)} de plus.` : '';
    return `Le matériel n'explique pas la défaite.${detail} Le problème vient surtout de la sécurité du roi, de l'activité ou d'une menace tactique.`;
  }
  return "Le matériel est presque égal: la défaite vient plutôt d'une faiblesse tactique, du roi exposé ou d'une suite forcée.";
}

function getAdvantageLevel(absCp) {
  if (absCp < 40) {
    return { level: 'équilibrée', danger: 0 };
  }
  if (absCp < 120) {
    return { level: 'léger avantage', danger: 1 };
  }
  if (absCp < 250) {
    return { level: 'avantage net', danger: 2 };
  }
  if (absCp < 500) {
    return { level: 'gros avantage', danger: 3 };
  }
  return { level: 'position probablement gagnante', danger: 3 };
}

function formatAdvantagePhrase(level) {
  return level === 'position probablement gagnante'
    ? 'une position probablement gagnante'
    : `un ${level}`;
}

function formatMaterialAdvantageAmount(absCp) {
  const equivalent = materialEquivalent(absCp);
  return equivalent.startsWith('environ') ? `d'${equivalent}` : `de ${equivalent}`;
}

function sideSubject(color) {
  return color === 'w' ? 'Les Blancs' : 'Les Noirs';
}

function sideAdjective(color) {
  return color === 'w' ? 'blanc' : 'noir';
}

function oppositeColor(color) {
  return color === 'w' ? 'b' : 'w';
}

function safeChess(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function findKingSquare(fen, color) {
  const chess = safeChess(fen);
  if (!chess) {
    return null;
  }

  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type === 'k' && piece.color === color) {
        return piece.square;
      }
    }
  }
  return null;
}

function adjacentSquares(square) {
  if (!square) {
    return [];
  }
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const squares = [];
  for (let fileDelta = -1; fileDelta <= 1; fileDelta += 1) {
    for (let rankDelta = -1; rankDelta <= 1; rankDelta += 1) {
      if (fileDelta === 0 && rankDelta === 0) {
        continue;
      }
      const nextFile = fileIndex + fileDelta;
      const nextRank = rank + rankDelta;
      if (nextFile >= 0 && nextFile < 8 && nextRank >= 1 && nextRank <= 8) {
        squares.push(`${'abcdefgh'[nextFile]}${nextRank}`);
      }
    }
  }
  return squares;
}

function hasKingDanger(fen, favoredColor, evaluation = {}) {
  const chess = safeChess(fen);
  const targetColor = oppositeColor(favoredColor);
  const kingSquare = findKingSquare(fen, targetColor);
  if (!chess || !kingSquare) {
    return false;
  }

  const pv = String(evaluation.pv ?? '');
  if (/[+#]/.test(pv.split(/\s+/).slice(0, 3).join(' '))) {
    return true;
  }

  if (chess.isAttacked(kingSquare, favoredColor)) {
    return true;
  }

  const attackedShelter = adjacentSquares(kingSquare).filter(
    (square) => chess.attackers(square, favoredColor).length > 0
  );
  return attackedShelter.length >= 3;
}

function hasTacticalThreat(evaluation = {}) {
  const candidateMoves = String(evaluation.pv ?? '').split(/\s+/).slice(0, 3).join(' ');
  return /[x+#]/.test(candidateMoves);
}

function hasPassedPawn(fen, color) {
  const chess = safeChess(fen);
  if (!chess) {
    return false;
  }

  const pawns = [];
  const enemyPawns = [];
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type !== 'p') {
        continue;
      }
      const target = piece.color === color ? pawns : enemyPawns;
      target.push({
        file: piece.square.charCodeAt(0) - 97,
        rank: Number(piece.square[1])
      });
    }
  }

  return pawns.some((pawn) => {
    const isAdvanced = color === 'w' ? pawn.rank >= 5 : pawn.rank <= 4;
    if (!isAdvanced) {
      return false;
    }
    return !enemyPawns.some((enemy) => {
      const sameCorridor = Math.abs(enemy.file - pawn.file) <= 1;
      const ahead = color === 'w' ? enemy.rank > pawn.rank : enemy.rank < pawn.rank;
      return sameCorridor && ahead;
    });
  });
}

function mobilityForColor(fen, color) {
  const parts = String(fen ?? '').split(/\s+/);
  if (parts.length < 6) {
    return 0;
  }
  parts[1] = color;
  const chess = safeChess(parts.join(' '));
  return chess ? chess.moves().length : 0;
}

function developedMinorCount(fen, color) {
  const chess = safeChess(fen);
  if (!chess) {
    return 0;
  }
  const homeSquares = color === 'w' ? ['b1', 'c1', 'f1', 'g1'] : ['b8', 'c8', 'f8', 'g8'];
  return homeSquares.filter((square) => {
    const piece = chess.get(square);
    return !piece || piece.color !== color || !['b', 'n'].includes(piece.type);
  }).length;
}

function buildHumanEvalReasons(fen, evaluation, favoredColor) {
  const material = summarizeMaterial(fen);
  const materialCp = favoredColor === 'w' ? material.cpWhite : -material.cpWhite;
  const reasons = [];

  if (hasKingDanger(fen, favoredColor, evaluation)) {
    reasons.push({
      type: 'kingDanger',
      text: `le roi ${sideAdjective(oppositeColor(favoredColor))} est sous pression`
    });
  }

  if (materialCp > 70) {
    reasons.push({
      type: 'material',
      text: `ils ont un avantage matériel ${formatMaterialAdvantageAmount(materialCp)}`
    });
  }

  if (hasTacticalThreat(evaluation)) {
    reasons.push({
      type: 'tacticalThreat',
      text: 'la ligne Stockfish commence par une menace tactique'
    });
  }

  if (hasPassedPawn(fen, favoredColor)) {
    reasons.push({
      type: 'passedPawn',
      text: 'un pion passé peut devenir dangereux'
    });
  }

  const favoredMobility = mobilityForColor(fen, favoredColor);
  const opponentMobility = mobilityForColor(fen, oppositeColor(favoredColor));
  if (favoredMobility >= opponentMobility + 8) {
    reasons.push({
      type: 'activity',
      text: 'leurs pièces ont nettement plus d’activité'
    });
  }

  if (
    developedMinorCount(fen, favoredColor) >=
    developedMinorCount(fen, oppositeColor(favoredColor)) + 2
  ) {
    reasons.push({
      type: 'development',
      text: 'ils sont plus rapides dans le développement'
    });
  }

  return reasons;
}

function buildHumanEvalAdvice(favoredColor, reasons) {
  if (favoredColor === 'w') {
    return "Plan: conserve l'initiative, simplifie quand c'est favorable et évite de rendre le contre-jeu.";
  }

  if (reasons.some((reason) => reason.type === 'kingDanger')) {
    return 'Priorité: sécuriser le roi blanc et neutraliser les menaces directes.';
  }
  if (reasons.some((reason) => reason.type === 'material')) {
    return 'Priorité: récupérer du matériel ou forcer une activité suffisante en compensation.';
  }
  if (reasons.some((reason) => reason.type === 'tacticalThreat')) {
    return 'Priorité: répondre à la menace immédiate avant de chercher du contre-jeu.';
  }
  if (reasons.some((reason) => reason.type === 'activity')) {
    return 'Priorité: activer une pièce passive et contester les cases clés.';
  }
  return 'Priorité: défendre sobrement, échanger une pièce active adverse et éviter une deuxième faiblesse.';
}

function buildHumanEval(fen, evaluation = {}) {
  const cpWhite = evaluation.cpWhite;
  if (!Number.isFinite(cpWhite)) {
    return {
      side: 'Inconnu',
      level: 'incertain',
      danger: 2,
      sentence: 'Stockfish ne donne pas un score stable, mais la ligne indique un problème concret.',
      advice: 'Priorité: suivre la ligne critique et trouver la première menace adverse.'
    };
  }

  if (Math.abs(cpWhite) >= MATE_SCORE_CP - 1000) {
    const favoredColor = cpWhite > 0 ? 'w' : 'b';
    const targetColor = oppositeColor(favoredColor);
    return {
      side: sideLabel(favoredColor),
      level: 'mat forcé',
      danger: 3,
      sentence: `${sideSubject(favoredColor)} ont une attaque décisive: le roi ${sideAdjective(targetColor)} ne peut plus éviter le mat dans la ligne.`,
      advice:
        favoredColor === 'b'
          ? 'Priorité: chercher le premier coup qui empêche le mat, même au prix de matériel.'
          : 'Plan: garder les pièces actives autour du roi noir et ne pas offrir de fuite.'
    };
  }

  const absCp = Math.abs(cpWhite);
  if (absCp < 40) {
    return {
      side: 'Égalité',
      level: 'équilibrée',
      danger: 0,
      sentence: 'La position est équilibrée: aucun camp n’a d’avantage clair.',
      advice: 'Plan: améliorer les pièces et éviter les faiblesses inutiles.'
    };
  }

  const favoredColor = cpWhite > 0 ? 'w' : 'b';
  const { level, danger } = getAdvantageLevel(absCp);
  const reasons = buildHumanEvalReasons(fen, evaluation, favoredColor);
  const reasonText = reasons.length
    ? `: ${joinHumanList(reasons.slice(0, 2).map((reason) => reason.text))}`
    : '';
  return {
    side: sideLabel(favoredColor),
    level,
    danger,
    reasons,
    sentence: `${sideSubject(favoredColor)} ont ${formatAdvantagePhrase(level)}${reasonText}.`,
    advice: buildHumanEvalAdvice(favoredColor, reasons)
  };
}

function buildDefeatComment(fen, evaluation) {
  const evalText = formatEval(evaluation?.cpWhite);
  const humanEval = buildHumanEval(fen, evaluation);
  const material = materialComment(fen);
  const pv = evaluation?.pv ? ` Ligne critique: ${evaluation.pv}.` : '';
  return `Défaite en phase libre. ${humanEval.sentence} Score Stockfish: ${evalText}. ${humanEval.advice} ${material}${pv}`;
}

function scoreForSide(cpWhite, sideToMove) {
  return sideToMove === 'w' ? cpWhite : -cpWhite;
}

function getNode(id) {
  return state.nodesById.get(id);
}

function getEdge(id) {
  return state.edgesById.get(id);
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function normalizePgnText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitPgnGames(pgn) {
  const normalized = String(pgn ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }
  const games = normalized
    .split(/\n\s*\n(?=\[Event\s)/)
    .map((block) => block.trim())
    .filter(Boolean);
  return games.length ? games : [normalized];
}

function parsePgnHeaders(block) {
  const headers = {};
  for (const match of block.matchAll(/^\[(\w+)\s+"((?:\\"|[^"])*)"\]$/gm)) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return headers;
}

function stripPgnHeaders(block) {
  return block
    .split('\n')
    .filter((line) => !line.trim().startsWith('['))
    .join(' ')
    .trim();
}

function stripSanAnnotation(san) {
  return san
    .replace(/[!?]+$/g, '')
    .replace(/^[.]+/g, '')
    .trim();
}

function isMoveNumberToken(token) {
  return /^\d+\.(?:\.\.)?$/.test(token) || /^\d+\.\.\.$/.test(token);
}

function stripInlineMoveNumber(token) {
  return token.replace(/^\d+\.(?:\.\.)?/, '').trim();
}

function tokenizePgnMovetext(movetext) {
  const tokens = [];
  const tokenPattern = /\{[^}]*\}|\(|\)|[^\s{}()]+/g;

  for (const match of movetext.matchAll(tokenPattern)) {
    tokens.push(match[0]);
  }

  return tokens;
}

function cloneParsedMoves(moves) {
  return moves.map((move) => ({ ...move }));
}

function shouldSkipPgnToken(rawToken, token) {
  return (
    !token ||
    isMoveNumberToken(rawToken) ||
    RESULT_TOKENS.has(token) ||
    /^\$\d+$/.test(token) ||
    /^;/.test(token)
  );
}

function parsePgnMoveVariants(tokens) {
  const variationLines = [];

  function parseSequence(startIndex, baseMoves = []) {
    let index = startIndex;
    const moves = cloneParsedMoves(baseMoves);
    let pendingComment = '';

    while (index < tokens.length) {
      const rawToken = tokens[index];

      if (rawToken === ')') {
        return { index: index + 1, moves };
      }

      if (rawToken === '(') {
        const branchBase = cloneParsedMoves(moves.slice(0, Math.max(0, moves.length - 1)));
        const branch = parseSequence(index + 1, branchBase);
        if (branch.moves.length > branchBase.length) {
          variationLines.push(branch.moves);
        }
        index = branch.index;
        continue;
      }

      if (rawToken.startsWith('{')) {
        const comment = normalizePgnText(rawToken.slice(1, -1));
        if (moves.length > baseMoves.length) {
          const last = moves[moves.length - 1];
          last.comment = normalizePgnText([last.comment, comment].filter(Boolean).join(' '));
        } else {
          pendingComment = normalizePgnText([pendingComment, comment].filter(Boolean).join(' '));
        }
        index += 1;
        continue;
      }

      const token = stripInlineMoveNumber(rawToken);
      if (shouldSkipPgnToken(rawToken, token)) {
        index += 1;
        continue;
      }

      const san = stripSanAnnotation(token);
      if (!san) {
        index += 1;
        continue;
      }

      moves.push({
        rawSan: token,
        san,
        annotation: token.match(/[!?]+$/)?.[0] ?? '',
        comment: pendingComment
      });
      pendingComment = '';
      index += 1;
    }

    return { index, moves };
  }

  const mainLine = parseSequence(0, []).moves;
  const seen = new Set();
  return [mainLine, ...variationLines].filter((moves) => {
    if (!moves.length) {
      return false;
    }
    const key = moves.map((move) => move.rawSan).join(' ');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parsePgnGame(block, index) {
  const headers = parsePgnHeaders(block);
  const movetext = stripPgnHeaders(block);
  const tokens = tokenizePgnMovetext(movetext);
  const variants = parsePgnMoveVariants(tokens);
  const baseEvent = headers.Event ?? `Ligne ${index + 1}`;
  const baseId = `line_${String(index + 1).padStart(2, '0')}`;

  return variants.map((moves, variantIndex) => ({
    id: variants.length > 1
      ? `${baseId}_${String(variantIndex + 1).padStart(2, '0')}`
      : baseId,
    event: variants.length > 1
      ? `${baseEvent} · ${variantIndex === 0 ? 'ligne principale' : `variante ${variantIndex}`}`
      : baseEvent,
    opening: headers.Opening ?? '',
    eco: headers.ECO ?? '',
    result: headers.Result ?? '*',
    site: headers.Site ?? '',
    fen: headers.FEN ?? '',
    setup: headers.SetUp ?? '',
    chapterName: headers.ChapterName ?? '',
    moves
  }));
}

function makeLineEventsUnique(lines) {
  const counts = new Map();
  for (const line of lines) {
    const seen = counts.get(line.event) ?? 0;
    counts.set(line.event, seen + 1);
    if (seen > 0) {
      line.event = `${line.event} (${seen + 1})`;
    }
  }
  return lines;
}

function normalizeStartFen(fen) {
  if (!fen) {
    return STANDARD_START_FEN;
  }
  return new Chess(fen).fen();
}

function createImportedRootNode(fen = STANDARD_START_FEN) {
  const chess = new Chess(fen);
  return {
    id: 'root',
    fen: chess.fen(),
    ply: 0,
    moveNumber: Number(chess.fen().split(/\s+/)[5] ?? 1),
    sideToMove: chess.turn(),
    label: 'Départ',
    san: '',
    rawSan: '',
    uci: '',
    from: '',
    to: '',
    color: '',
    comments: [],
    sources: [],
    incoming: [],
    outgoing: [],
    terminal: false,
    legalMoves: chess.moves().length,
    evaluation: null,
    futureMeanCp: null
  };
}

function createImportedMoveNode(id, chess, move, parsedMove, line) {
  return {
    id,
    fen: chess.fen(),
    ply: chess.history().length,
    moveNumber: Math.ceil(chess.history().length / 2),
    sideToMove: chess.turn(),
    label: move.san,
    san: move.san,
    rawSan: parsedMove.rawSan,
    annotation: parsedMove.annotation,
    uci: moveToUci(move),
    from: move.from,
    to: move.to,
    color: move.color,
    comments: parsedMove.comment ? [parsedMove.comment] : [],
    sources: [line.event],
    opening: line.opening,
    eco: line.eco,
    incoming: [],
    outgoing: [],
    terminal: false,
    legalMoves: chess.moves().length,
    evaluation: null,
    futureMeanCp: null
  };
}

function addUnique(target, values) {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

function buildGraphFromPgnLines(lines) {
  const warnings = [];
  const playableLines = [];
  let rootFen = null;

  for (const line of lines) {
    let startFen;
    try {
      startFen = normalizeStartFen(line.fen);
    } catch (error) {
      warnings.push(`${line.event}: FEN ignoré (${error.message})`);
      continue;
    }

    if (!rootFen) {
      rootFen = startFen;
    }

    if (startFen !== rootFen) {
      warnings.push(`${line.event}: position de départ différente ignorée.`);
      continue;
    }

    playableLines.push({
      ...line,
      startFen
    });
  }

  const nodes = [createImportedRootNode(rootFen ?? STANDARD_START_FEN)];
  const nodeByFen = new Map([[nodes[0].fen, nodes[0]]]);
  const edgeByKey = new Map();

  for (const line of playableLines) {
    if (!line.moves.length) {
      warnings.push(`${line.event}: aucune suite de coups exploitable.`);
      continue;
    }

    const chess = new Chess(line.startFen);
    let parent = nodes[0];
    addUnique(parent.sources, [line.event]);

    for (const parsedMove of line.moves) {
      let move;
      try {
        move = chess.move(parsedMove.san);
      } catch (error) {
        warnings.push(`${line.event}: coup ignoré "${parsedMove.rawSan}" (${error.message})`);
        break;
      }

      const fen = chess.fen();
      let child = nodeByFen.get(fen);
      if (!child) {
        child = createImportedMoveNode(`n${nodes.length}`, chess, move, parsedMove, line);
        nodes.push(child);
        nodeByFen.set(fen, child);
      } else {
        addUnique(child.sources, [line.event]);
        addUnique(child.comments, parsedMove.comment ? [parsedMove.comment] : []);
      }

      const edgeKey = `${parent.id}|${child.id}|${move.san}`;
      let edge = edgeByKey.get(edgeKey);
      if (!edge) {
        edge = {
          id: `e${edgeByKey.size + 1}`,
          from: parent.id,
          to: child.id,
          san: move.san,
          rawSan: parsedMove.rawSan,
          annotation: parsedMove.annotation,
          uci: moveToUci(move),
          color: move.color,
          comments: parsedMove.comment ? [parsedMove.comment] : [],
          sources: [line.event],
          probability: 1,
          deltaCp: 0,
          pathMeanCp: null,
          isBest: false
        };
        edgeByKey.set(edgeKey, edge);
        parent.outgoing.push(edge.id);
        child.incoming.push(edge.id);
      } else {
        addUnique(edge.sources, [line.event]);
        addUnique(edge.comments, parsedMove.comment ? [parsedMove.comment] : []);
      }

      parent = child;
    }
  }

  const edges = [...edgeByKey.values()];
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));
  for (const node of nodes) {
    const chess = new Chess(node.fen);
    node.terminal = chess.isGameOver();
    node.legalMoves = chess.moves().length;
    node.outgoing = node.outgoing.filter((edgeId) => edgeMap.has(edgeId));
    node.incoming = node.incoming.filter((edgeId) => edgeMap.has(edgeId));
  }

  return { nodes, edges, warnings };
}

function computeGraphFutureMeans(graph) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const memo = new Map();

  function visit(nodeId, stack = new Set()) {
    if (memo.has(nodeId)) {
      return memo.get(nodeId);
    }
    if (stack.has(nodeId)) {
      const node = nodesById.get(nodeId);
      return node?.evaluation?.cpWhite ?? 0;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return 0;
    }

    stack.add(nodeId);
    const childMeans = node.outgoing
      .map((edgeId) => edgesById.get(edgeId))
      .filter(Boolean)
      .map((edge) => visit(edge.to, stack));
    stack.delete(nodeId);

    const ownCp = node.evaluation?.cpWhite ?? 0;
    const mean = childMeans.length
      ? (ownCp + childMeans.reduce((sum, value) => sum + value, 0)) / (childMeans.length + 1)
      : ownCp;

    node.futureMeanCp = Math.round(mean);
    memo.set(nodeId, node.futureMeanCp);
    return node.futureMeanCp;
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }
}

function assignGraphProbabilities(graph) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  for (const node of graph.nodes) {
    const outgoing = node.outgoing.map((edgeId) => edgesById.get(edgeId)).filter(Boolean);
    if (!outgoing.length) {
      continue;
    }
    if (outgoing.length === 1) {
      outgoing[0].probability = 1;
      outgoing[0].deltaCp = 0;
      outgoing[0].pathMeanCp = nodesById.get(outgoing[0].to)?.futureMeanCp ?? null;
      outgoing[0].isBest = true;
      continue;
    }

    const scored = outgoing.map((edge) => {
      const child = nodesById.get(edge.to);
      const pathMeanCp = child?.futureMeanCp ?? child?.evaluation?.cpWhite ?? 0;
      return {
        edge,
        pathMeanCp,
        score: scoreForSide(pathMeanCp, node.sideToMove)
      };
    });
    const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
    const bestScore = Math.max(...scored.map((item) => item.score));
    const rawWeights = scored.map((item) =>
      Math.exp(clamp(item.score - average, -800, 800) / PROBABILITY_TEMPERATURE_CP)
    );
    const rawTotal = rawWeights.reduce((sum, value) => sum + value, 0);

    scored.forEach((item, index) => {
      const softmax = rawWeights[index] / rawTotal;
      item.edge.probability =
        PROBABILITY_FLOOR_MASS / scored.length + (1 - PROBABILITY_FLOOR_MASS) * softmax;
      item.edge.deltaCp = Math.round(item.score - average);
      item.edge.pathMeanCp = Math.round(item.pathMeanCp);
      item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
      item.edge.endsInMate = isMateNode(nodesById.get(item.edge.to));
    });
    applyMinimumProbabilities(scored);
    normalizeScoredProbabilities(scored);
  }
}

function summarizeImportedGraph(graph, lines, depth, sourceName) {
  const evaluatedNodes = graph.nodes.filter((node) => node.evaluation).length;
  const branchingNodes = graph.nodes.filter((node) => node.outgoing.length > 1).length;
  const maxPly = Math.max(0, ...graph.nodes.map((node) => node.ply));
  return {
    title: sourceName,
    generatedAt: new Date().toISOString(),
    pgnPath: sourceName,
    sourceLines: lines.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    evaluatedNodes,
    branchingNodes,
    maxPly,
    stockfish: {
      engine: 'Stockfish 18 Lite WASM',
      depth
    },
    probabilityModel: {
      description:
        'Graphe généré dans le navigateur depuis un PGN importé, évalué par Stockfish puis pondéré par moyenne future.',
      temperatureCp: PROBABILITY_TEMPERATURE_CP,
      floorMass: PROBABILITY_FLOOR_MASS,
      perspective: 'Blanc maximise les centipawns, Noir les minimise.'
    }
  };
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cloneGraphData(data) {
  return JSON.parse(JSON.stringify(data));
}

function parseWhiteCentipawn(line, fen) {
  const match = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  if (!match) {
    return null;
  }

  const [, scoreType, rawScore] = match;
  const scoreValue = Number(rawScore);
  const sideToMove = fen.split(/\s+/)[1] ?? 'w';

  if (scoreType === 'mate') {
    const distancePenalty = Math.min(900, Math.abs(scoreValue) * 12);
    const winningColor = scoreValue >= 0 ? sideToMove : sideToMove === 'w' ? 'b' : 'w';
    return (winningColor === 'w' ? 1 : -1) * (MATE_SCORE_CP - distancePenalty);
  }

  return sideToMove === 'w' ? scoreValue : -scoreValue;
}

function parsePv(line) {
  return line.match(/\bpv\s+(.+)$/)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
}

function playUciOnChess(chess, uci) {
  if (!uci || uci.length < 4) {
    return null;
  }
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined
    });
  } catch {
    return null;
  }
}

function formatPvFromFen(fen, pvMoves, limit = 7) {
  const chess = new Chess(fen);
  const sanMoves = [];
  const uciMoves = [];
  for (const uci of pvMoves.slice(0, limit)) {
    const move = playUciOnChess(chess, uci);
    if (!move) {
      break;
    }
    sanMoves.push(move.san);
    uciMoves.push(uci);
  }
  return {
    san: sanMoves.join(' '),
    uci: uciMoves
  };
}

function terminalEvaluation(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return {
      cpWhite: chess.turn() === 'w' ? -MATE_SCORE_CP : MATE_SCORE_CP,
      bestMove: null,
      pv: '',
      pvUci: [],
      depth: 0,
      source: 'terminal'
    };
  }

  if (chess.isDraw()) {
    return {
      cpWhite: 0,
      bestMove: null,
      pv: '',
      pvUci: [],
      depth: 0,
      source: 'terminal'
    };
  }

  return null;
}

class BrowserStockfishEvaluator {
  constructor(depth = STOCKFISH_DEPTH) {
    this.depth = depth;
    this.worker = null;
    this.pending = null;
    this.readyPromise = null;
    this.modeKey = '';
  }

  async init() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      const workerUrl = new URL('./vendor/stockfish-18-lite-single.js', import.meta.url);
      this.worker = new Worker(workerUrl);
      this.worker.addEventListener('message', (event) => this.handleLine(String(event.data)));
      this.worker.addEventListener('error', (event) => {
        reject(new Error(`Stockfish worker: ${event.message}`));
      });

      this.waitFor((line) => line === 'uciok', () => this.send('uci'), 12000)
        .then(() => this.waitFor((line) => line === 'readyok', () => this.send('isready'), 12000))
        .then(() => {
          this.send('setoption name Hash value 32');
          this.send('setoption name MultiPV value 1');
          this.send('ucinewgame');
          resolve();
        })
        .catch(reject);
    });

    return this.readyPromise;
  }

  send(command) {
    this.worker?.postMessage(command);
  }

  waitFor(predicate, start, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error('Stockfish ne répond pas assez vite.'));
      }, timeoutMs);

      this.pending = {
        onLine: (line) => {
          if (predicate(line)) {
            clearTimeout(timeout);
            this.pending = null;
            resolve(line);
          }
        }
      };

      start();
    });
  }

  handleLine(line) {
    if (this.pending?.onLine) {
      this.pending.onLine(line);
    }
  }

  async configureForAnalysis() {
    await this.init();
    if (this.modeKey === 'analysis') {
      return;
    }

    this.send('setoption name UCI_LimitStrength value false');
    this.send('setoption name Skill Level value 20');
    await this.waitFor((line) => line === 'readyok', () => this.send('isready'), 12000);
    this.modeKey = 'analysis';
  }

  async configureForPlay(profile) {
    await this.init();
    const modeKey = `play:${profile.level}:${profile.elo ?? 'full'}:${profile.skill}`;
    if (this.modeKey === modeKey) {
      return;
    }

    if (profile.elo) {
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${profile.elo}`);
      this.send(`setoption name Skill Level value ${profile.skill}`);
    } else {
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
    }

    await this.waitFor((line) => line === 'readyok', () => this.send('isready'), 12000);
    this.modeKey = modeKey;
  }

  async search(fen, command, timeoutMs = 18000) {
    return new Promise((resolve, reject) => {
      let latestCpWhite = null;
      let latestDepth = 0;
      let latestPvMoves = [];
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error('Stockfish a mis trop longtemps à évaluer la position.'));
      }, timeoutMs);

      this.pending = {
        onLine: (line) => {
          if (line.startsWith('info ') && line.includes(' score ')) {
            const parsed = parseWhiteCentipawn(line, fen);
            const depthValue = Number(line.match(/\bdepth\s+(\d+)/)?.[1] ?? 0);
            if (parsed !== null && depthValue >= latestDepth) {
              latestCpWhite = parsed;
              latestDepth = depthValue;
              latestPvMoves = parsePv(line);
            }
          }

          if (line.startsWith('bestmove')) {
            clearTimeout(timeout);
            this.pending = null;
            const bestMove = line.match(/^bestmove\s+(\S+)/)?.[1] ?? null;
            const pv = formatPvFromFen(fen, latestPvMoves);
            resolve({
              cpWhite: latestCpWhite ?? 0,
              bestMove: bestMove === '(none)' ? null : bestMove,
              pv: pv.san,
              pvUci: pv.uci,
              depth: latestDepth,
              source: 'stockfish'
            });
          }
        }
      };

      this.send(`position fen ${fen}`);
      this.send(command);
    });
  }

  async evaluate(fen, depth = this.depth) {
    const terminal = terminalEvaluation(fen);
    if (terminal) {
      return terminal;
    }

    await this.configureForAnalysis();
    return this.search(fen, `go depth ${depth}`);
  }

  async pickMove(fen, profile = getStockfishLevelProfile()) {
    const terminal = terminalEvaluation(fen);
    if (terminal) {
      return terminal;
    }

    await this.configureForPlay(profile);
    const command = profile.movetime ? `go movetime ${profile.movetime}` : `go depth ${profile.depth}`;
    const timeoutMs = profile.movetime ? Math.max(8000, profile.movetime + 6000) : 18000;
    return this.search(fen, command, timeoutMs);
  }
}

async function ensureStockfishReady(showMessage = true) {
  if (!state.stockfish) {
    state.stockfish = new BrowserStockfishEvaluator();
  }
  if (showMessage && state.game) {
    state.game.message = 'Stockfish démarre sa table de calcul...';
    renderGamePanel();
  }
  await state.stockfish.init();
  return state.stockfish;
}

function nodeMatchesFilter(node) {
  return state.lineFilter === 'all' || node.sources.includes(state.lineFilter);
}

function edgeMatchesFilter(edge) {
  return state.lineFilter === 'all' || edge.sources.includes(state.lineFilter);
}

function getBranchValue(edge) {
  const target = getNode(edge.to);
  if (!target) {
    return 0;
  }
  if (target.terminal || !target.outgoing.length) {
    return target.evaluation?.cpWhite ?? target.futureMeanCp ?? 0;
  }
  return Number.isFinite(target.futureMeanCp)
    ? target.futureMeanCp
    : target.evaluation?.cpWhite ?? 0;
}

function isMateNode(node) {
  return Boolean(node?.terminal && Math.abs(node.evaluation?.cpWhite ?? 0) >= MATE_SCORE_CP - 1000);
}

function branchEventuallyEndsInMate(edge) {
  let current = getNode(edge?.to);
  let guard = 0;
  while (current && guard < 80) {
    if (isMateNode(current)) {
      return true;
    }
    if (current.outgoing.length !== 1) {
      return false;
    }
    const nextEdge = getEdge(current.outgoing[0]);
    current = nextEdge ? getNode(nextEdge.to) : null;
    guard += 1;
  }
  return false;
}

function applyMinimumProbabilities(scored) {
  const reserved = scored.map((item) => (item.edge.endsInMate ? MATE_BRANCH_MIN_PROBABILITY : 0));
  const reservedTotal = reserved.reduce((sum, value) => sum + value, 0);
  if (reservedTotal <= 0 || reservedTotal >= 0.95) {
    return;
  }

  let freeTotal = 0;
  for (const [index, item] of scored.entries()) {
    if (!item.edge.endsInMate) {
      freeTotal += item.edge.probability;
    } else if (item.edge.probability > reserved[index]) {
      freeTotal += item.edge.probability - reserved[index];
    }
  }

  if (freeTotal <= 0) {
    scored.forEach((item, index) => {
      item.edge.probability = reserved[index] || (1 - reservedTotal) / scored.length;
    });
    return;
  }

  const scale = (1 - reservedTotal) / freeTotal;
  scored.forEach((item, index) => {
    const reserve = reserved[index];
    const free = item.edge.endsInMate
      ? Math.max(0, item.edge.probability - reserve)
      : item.edge.probability;
    item.edge.probability = reserve + free * scale;
  });
}

function normalizeScoredProbabilities(scored) {
  if (!scored.length) {
    return;
  }

  const total = scored.reduce((sum, item) => sum + Math.max(0, item.edge.probability ?? 0), 0);
  if (total <= 0) {
    const equal = 1 / scored.length;
    scored.forEach((item) => {
      item.edge.probability = equal;
    });
    return;
  }

  scored.forEach((item) => {
    item.edge.probability = Math.max(0, item.edge.probability ?? 0) / total;
  });
}

function recomputeViewProbabilities(view) {
  for (const node of view.nodes) {
    const outgoing = node.outgoing.map((edgeId) => view.edgesById.get(edgeId)).filter(Boolean);
    if (!outgoing.length) {
      continue;
    }

    if (outgoing.length === 1) {
      outgoing[0].probability = 1;
      outgoing[0].deltaCp = 0;
      outgoing[0].isBest = true;
      continue;
    }

    const scored = outgoing.map((edge) => {
      const pathMean = getBranchValue(edge);
      return {
        edge,
        pathMean,
        score: scoreForSide(pathMean, node.raw.sideToMove)
      };
    });
    const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
    const bestScore = Math.max(...scored.map((item) => item.score));
    const raw = scored.map((item) =>
      Math.exp(clamp(item.score - average, -800, 800) / state.temperatureCp)
    );
    const rawTotal = raw.reduce((sum, value) => sum + value, 0);

    scored.forEach((item, index) => {
      const softmax = raw[index] / rawTotal;
      item.edge.probability =
        state.floorMass / scored.length + (1 - state.floorMass) * softmax;
      item.edge.deltaCp = Math.round(item.score - average);
      item.edge.pathMeanCp = Math.round(item.pathMean);
      item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
    });
    applyMinimumProbabilities(scored);
    normalizeScoredProbabilities(scored);
  }
}

function createCompressedView() {
  const visibleNodeIds = new Set();
  for (const node of state.data.nodes) {
    if (
      node.id === 'root' ||
      node.terminal ||
      node.outgoing.length !== 1 ||
      node.incoming.length !== 1
    ) {
      visibleNodeIds.add(node.id);
    }
  }

  const viewNodes = [...visibleNodeIds].map((nodeId) => ({
    id: nodeId,
    raw: getNode(nodeId),
    outgoing: [],
    incoming: [],
    collapsedIncomingPlyCount: 0
  }));
  const viewNodesById = new Map(viewNodes.map((node) => [node.id, node]));
  const viewEdges = [];

  function collectUnique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  for (const source of viewNodes) {
    const rawSource = source.raw;
    for (const firstEdgeId of rawSource.outgoing) {
      const firstEdge = getEdge(firstEdgeId);
      if (!firstEdge) {
        continue;
      }

      const pathEdgeIds = [firstEdge.id];
      const pathNodeIds = [firstEdge.to];
      const sources = [...firstEdge.sources];
      const comments = [...firstEdge.comments];
      let current = getNode(firstEdge.to);

      while (current && !visibleNodeIds.has(current.id)) {
        sources.push(...current.sources);
        comments.push(...current.comments);
        const nextEdge = getEdge(current.outgoing[0]);
        if (!nextEdge) {
          break;
        }
        pathEdgeIds.push(nextEdge.id);
        pathNodeIds.push(nextEdge.to);
        sources.push(...nextEdge.sources);
        comments.push(...nextEdge.comments);
        current = getNode(nextEdge.to);
      }

      if (!current) {
        continue;
      }

      const target = viewNodesById.get(current.id);
      if (!target) {
        continue;
      }

      const sequence = pathEdgeIds.map((edgeId) => getEdge(edgeId)?.san).filter(Boolean);
      const viewEdge = {
        id: `v${viewEdges.length + 1}`,
        from: rawSource.id,
        to: current.id,
        san: firstEdge.san,
        rawSan: firstEdge.rawSan,
        annotation: firstEdge.annotation,
        uci: firstEdge.uci,
        color: firstEdge.color,
        comments: collectUnique(comments),
        sources: collectUnique(sources),
        probability: 1,
        deltaCp: 0,
        pathMeanCp: getBranchValue({ to: current.id }),
        isBest: false,
        isCompressed: pathEdgeIds.length > 1,
        pathEdgeIds,
        pathNodeIds,
        sequence,
        sequenceLabel: sequence.join(' '),
        collapsedPlyCount: pathEdgeIds.length,
        endsInMate: isMateNode(current),
        terminal: current.terminal
      };

      viewEdges.push(viewEdge);
      source.outgoing.push(viewEdge.id);
      target.incoming.push(viewEdge.id);
      target.collapsedIncomingPlyCount = Math.max(
        target.collapsedIncomingPlyCount,
        viewEdge.collapsedPlyCount
      );
    }
  }

  const viewEdgesById = new Map(viewEdges.map((edge) => [edge.id, edge]));
  return { nodes: viewNodes, edges: viewEdges, nodesById: viewNodesById, edgesById: viewEdgesById };
}

function computeLayout(view) {
  const svg = elements.graphSvg;
  const rect = svg.getBoundingClientRect();
  const width = Math.max(640, rect.width || 960);
  const height = Math.max(430, rect.height || 620);
  const maxPly = Math.max(1, state.data.summary.maxPly);
  const padding = {
    left: 66,
    right: 66,
    top: 42,
    bottom: 48
  };
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const laneByNode = new Map();
  let nextLane = 0;

  state.layout.clear();

  function lineIndex(edge) {
    const index = state.data.lines.findIndex((line) => edge.sources.includes(line.event));
    return index < 0 ? 999 : index;
  }

  function sortedOutgoing(node) {
    return node.outgoing
      .map((edgeId) => view.edgesById.get(edgeId))
      .filter(Boolean)
      .sort((a, b) => {
        const lineDelta = lineIndex(a) - lineIndex(b);
        if (lineDelta) {
          return lineDelta;
        }
        const branchDelta = (b.probability ?? 0) - (a.probability ?? 0);
        return branchDelta || a.id.localeCompare(b.id, undefined, { numeric: true });
      });
  }

  function assignLane(node, active = new Set()) {
    if (laneByNode.has(node.id)) {
      return laneByNode.get(node.id);
    }
    if (active.has(node.id)) {
      return nextLane;
    }

    active.add(node.id);
    const children = sortedOutgoing(node)
      .map((edge) => view.nodesById.get(edge.to))
      .filter(Boolean);
    let lane;
    if (!children.length) {
      lane = nextLane;
      nextLane += 1;
    } else {
      const childLanes = children.map((child) => assignLane(child, active));
      lane = childLanes.reduce((sum, value) => sum + value, 0) / childLanes.length;
    }
    active.delete(node.id);
    laneByNode.set(node.id, lane);
    return lane;
  }

  assignLane(view.nodesById.get('root'));

  for (const node of view.nodes) {
    if (!laneByNode.has(node.id)) {
      assignLane(node);
    }
  }

  const laneCount = Math.max(1, nextLane);
  const laneStep = usableHeight / Math.max(1, laneCount - 1);
  for (const node of view.nodes) {
    const lane = laneByNode.get(node.id) ?? 0;
    const x = padding.left + (node.raw.ply / maxPly) * usableWidth;
    const softWave = Math.sin(node.raw.ply * 0.5 + lane * 0.4) * Math.min(10, laneStep * 0.22);
    const y = laneCount === 1 ? height / 2 : padding.top + lane * laneStep + softWave;
    state.layout.set(node.id, {
      x,
      y: clamp(y, padding.top, height - padding.bottom)
    });
  }

  return { width, height };
}

// Zoom « dans les lignes » (téléphone) : viewBox resserré autour du nœud ciblé, en
// laissant de la place à droite pour voir ses continuations.
function computeBrainFocusViewBox(focusId, fullW, fullH) {
  const p = state.layout?.get(focusId);
  if (!p) {
    return null;
  }
  const zoom = 2.4;
  const w = fullW / zoom;
  const h = fullH / zoom;
  let x = p.x - w * 0.32; // nœud à ~1/3 depuis la gauche, lignes vers la droite
  let y = p.y - h / 2;
  x = clamp(x, 0, Math.max(0, fullW - w));
  y = clamp(y, 0, Math.max(0, fullH - h));
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
}

// Positions (FEN + coup) de chaque demi-coup d'un arc compressé, rejouées depuis la source.
function computeEdgeSequencePositions(edge) {
  if (!edge?.isCompressed || !edge.sequence?.length) {
    return [];
  }
  const source = getNode(edge.from);
  if (!source?.fen) {
    return [];
  }
  const probe = new Chess(source.fen);
  const out = [];
  for (const san of edge.sequence) {
    let move = null;
    try {
      move = probe.move(san);
    } catch {
      move = null;
    }
    if (!move) {
      break;
    }
    out.push({ fen: probe.fen(), san: move.san, from: move.from, to: move.to });
  }
  return out;
}

function brainOutlinePath(width, height) {
  const left = width * 0.09;
  const right = width * 0.91;
  const top = height * 0.16;
  const bottom = height * 0.86;
  const mid = height * 0.52;
  return [
    `M ${left + 60} ${mid}`,
    `C ${left - 18} ${top + 94}, ${left + 120} ${top - 38}, ${width * 0.34} ${top + 26}`,
    `C ${width * 0.46} ${top - 52}, ${width * 0.61} ${top - 18}, ${width * 0.68} ${top + 48}`,
    `C ${right + 34} ${top + 44}, ${right + 30} ${mid - 34}, ${right - 26} ${mid}`,
    `C ${right + 56} ${mid + 106}, ${right - 100} ${bottom + 34}, ${width * 0.66} ${bottom - 30}`,
    `C ${width * 0.53} ${bottom + 42}, ${width * 0.38} ${bottom + 6}, ${width * 0.31} ${bottom - 56}`,
    `C ${left + 82} ${bottom - 24}, ${left - 34} ${mid + 102}, ${left + 60} ${mid}`,
    'Z'
  ].join(' ');
}

function edgeControlPoints(edge) {
  const source = state.layout.get(edge.from);
  const target = state.layout.get(edge.to);
  if (!source || !target) {
    return null;
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  return {
    p0: { x: source.x, y: source.y },
    c1: { x: source.x + dx * 0.62, y: source.y + dy * 0.08 },
    c2: { x: target.x - dx * 0.34, y: target.y - dy * 0.08 },
    p3: { x: target.x, y: target.y }
  };
}

function edgePath(edge) {
  const cp = edgeControlPoints(edge);
  if (!cp) {
    return '';
  }
  return `M ${cp.p0.x.toFixed(1)} ${cp.p0.y.toFixed(1)} C ${cp.c1.x.toFixed(1)} ${cp.c1.y.toFixed(1)}, ${cp.c2.x.toFixed(1)} ${cp.c2.y.toFixed(1)}, ${cp.p3.x.toFixed(1)} ${cp.p3.y.toFixed(1)}`;
}

// Point et tangente d'une courbe de Bézier cubique au paramètre t (pour poser les barreaux).
function cubicBezierAt(cp, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  const da = 3 * mt * mt;
  const db = 6 * mt * t;
  const dc = 3 * t * t;
  return {
    x: a * cp.p0.x + b * cp.c1.x + c * cp.c2.x + d * cp.p3.x,
    y: a * cp.p0.y + b * cp.c1.y + c * cp.c2.y + d * cp.p3.y,
    tx: da * (cp.c1.x - cp.p0.x) + db * (cp.c2.x - cp.c1.x) + dc * (cp.p3.x - cp.c2.x),
    ty: da * (cp.c1.y - cp.p0.y) + db * (cp.c2.y - cp.c1.y) + dc * (cp.p3.y - cp.c2.y)
  };
}

// Lettre de pièce (Merida) à partir d'un SAN : O-O→roi, sinon N/B/R/Q/K, défaut pion.
function sanPieceLetter(san) {
  const s = String(san ?? '');
  if (/^O-O/.test(s)) {
    return 'K';
  }
  const m = s.match(/^([NBRQK])/);
  return m ? m[1] : 'P';
}

// Couleur qui joue le i-ème coup d'une séquence compressée (alternance depuis edge.color).
function moveColorAt(edge, index) {
  const first = edge.color === 'b' ? 'b' : 'w';
  return index % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
}

function renderGraph() {
  if (!state.data) {
    return;
  }
  const view = createCompressedView();
  recomputeViewProbabilities(view);
  state.view = view;
  if (state.selectedSegment) {
    state.selectedSegment = view.edgesById.get(state.selectedSegment.id) ?? null;
  }
  state.gameViewNodeId = null; // (re)calculé par syncGameGraphSelection si une partie suit le graphe
  if (shouldFollowGameInGraph()) {
    syncGameGraphSelection(view);
  }
  state.scrubPoints = []; // points (nœuds + coups intermédiaires) défilables au doigt
  const { width, height } = computeLayout(view);
  const svg = elements.graphSvg;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const defs = createSvgElement('defs');
  const glow = createSvgElement('filter', { id: 'nodeGlow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
  glow.append(
    createSvgElement('feGaussianBlur', { stdDeviation: '4', result: 'blur' }),
    createSvgElement('feColorMatrix', {
      in: 'blur',
      type: 'matrix',
      values: '1 0 0 0 0.95  0 1 0 0 0.78  0 0 1 0 0.22  0 0 0 0.55 0'
    }),
    createSvgElement('feMerge')
  );
  glow.lastChild.append(createSvgElement('feMergeNode'), createSvgElement('feMergeNode', { in: 'SourceGraphic' }));
  defs.append(glow);
  svg.append(defs);

  svg.append(createSvgElement('path', { class: 'brain-outline', d: brainOutlinePath(width, height) }));

  const edgeLayer = createSvgElement('g', { class: 'edge-layer' });
  const rungLayer = createSvgElement('g', { class: 'rung-layer' });
  const nodeLayer = createSvgElement('g', { class: 'node-layer' });
  svg.append(edgeLayer, rungLayer, nodeLayer);

  const orderedEdges = [...view.edges].sort((a, b) => a.probability - b.probability);
  for (const edge of orderedEdges) {
    const matches = edgeMatchesFilter(edge);
    const isHighlighted = state.highlightedEdges.has(edge.id);
    const sourceNode = view.nodesById.get(edge.from);
    const isForced = (sourceNode?.outgoing.length ?? 0) <= 1;
    const strokeWidth = isHighlighted
      ? 5.4
      : isForced
        ? 2.65
        : 2.3 + edge.probability * 4.9;
    const edgeOpacity = isHighlighted
      ? 0.95
      : isForced
        ? 0.56
        : 0.46 + edge.probability * 0.42;
    const pathD = edgePath(edge);
    const casing = createSvgElement('path', {
      class: [
        'neural-edge-casing',
        !matches ? 'is-muted' : '',
        isHighlighted ? 'is-highlighted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      d: pathD,
      'stroke-width': String(strokeWidth + 4.2),
      opacity: String(matches ? (isHighlighted ? 0.92 : 0.58) : 0.1)
    });
    const moveSide = sourceNode?.raw?.sideToMove;
    const path = createSvgElement('path', {
      class: [
        'neural-edge',
        moveSide === 'w' ? 'is-white-move' : moveSide === 'b' ? 'is-black-move' : '',
        edge.isBest ? 'is-best' : '',
        isForced ? 'is-forced' : '',
        isAdventureEdgeMastered(edge) ? 'is-mastered' : '',
        !matches ? 'is-muted' : '',
        isHighlighted ? 'is-highlighted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      d: pathD,
      'stroke-width': String(strokeWidth),
      opacity: String(matches ? edgeOpacity : 0.08)
    });
    path.addEventListener('mouseenter', (event) => showEdgeTooltip(edge, event));
    path.addEventListener('mouseleave', hideTooltip);
    path.addEventListener('click', () => selectEdge(edge));
    edgeLayer.append(casing, path);

    // Barreaux d'échelle : un par coup intermédiaire d'un arc compressé. Survol = coup attendu + position.
    if (edge.isCompressed && matches) {
      const cp = edgeControlPoints(edge);
      const moveCount = edge.sequence?.length ?? 0;
      const seqPositions = computeEdgeSequencePositions(edge);
      if (cp && moveCount > 1) {
        for (let i = 0; i < moveCount; i += 1) {
          const pt = cubicBezierAt(cp, (i + 0.5) / moveCount);
          const len = Math.hypot(pt.tx, pt.ty) || 1;
          const nx = -pt.ty / len;
          const ny = pt.tx / len;
          const half = 5.5;
          const coords = {
            x1: (pt.x - nx * half).toFixed(1),
            y1: (pt.y - ny * half).toFixed(1),
            x2: (pt.x + nx * half).toFixed(1),
            y2: (pt.y + ny * half).toFixed(1)
          };
          const rungColor = moveColorAt(edge, i);
          const rungGroup = createSvgElement('g', {
            class: [
              'edge-rung-group',
              rungColor === 'w' ? 'is-white-move' : 'is-black-move',
              isHighlighted ? 'is-highlighted' : ''
            ].filter(Boolean).join(' ')
          });
          rungGroup.append(
            createSvgElement('line', { class: 'edge-rung-hit', ...coords }),
            createSvgElement('line', { class: 'edge-rung', ...coords })
          );
          const moveIndex = i;
          rungGroup.addEventListener('mouseenter', (event) => showRungTooltip(edge, moveIndex, event));
          rungGroup.addEventListener('mouseleave', hideTooltip);
          rungLayer.append(rungGroup);
          // Point défilable au doigt : le coup intermédiaire (position reconstruite).
          const seqPos = seqPositions[i];
          if (seqPos) {
            state.scrubPoints.push({
              x: pt.x,
              y: pt.y,
              fen: seqPos.fen,
              san: seqPos.san,
              from: seqPos.from,
              to: seqPos.to,
              moveColor: rungColor,
              label: `${seqPos.san} (${i + 1}/${moveCount})`,
              eval: undefined,
              nodeId: edge.to
            });
          }
        }
      }
    }
  }

  for (const viewNode of view.nodes) {
    const node = viewNode.raw;
    const point = state.layout.get(viewNode.id);
    if (!point) {
      continue;
    }
    // Point défilable au doigt pour ce nœud (mini-échiquier de la position).
    state.scrubPoints.push({
      x: point.x,
      y: point.y,
      fen: node.fen,
      san: node.san,
      from: node.from,
      to: node.to,
      moveColor: node.from ? (node.sideToMove === 'w' ? 'b' : 'w') : null,
      label: node.id === 'root' ? 'Départ' : node.san,
      eval: node.evaluation?.cpWhite,
      nodeId: node.id
    });
    const evalTone = clamp(((node.futureMeanCp ?? node.evaluation?.cpWhite ?? 0) + 250) / 500, 0, 1);
    const outgoing = viewNode.outgoing.length;
    const radius = node.id === 'root'
      ? 11
      : clamp(6.5 + outgoing * 2 + viewNode.collapsedIncomingPlyCount * 0.75, 7.5, 18);
    const matches = nodeMatchesFilter(node);
    const group = createSvgElement('g', {
      class: [
        'neural-node',
        node.sideToMove === 'w' ? 'is-white-turn' : node.sideToMove === 'b' ? 'is-black-turn' : '',
        outgoing > 1 ? 'is-branch' : '',
        viewNode.collapsedIncomingPlyCount > 1 ? 'is-compressed' : '',
        node.terminal ? 'is-terminal' : '',
        isAdventureMastered(node.id) ? 'is-mastered' : '',
        state.highlightedNodes.has(node.id) ? 'is-path' : '',
        state.gameViewNodeId === node.id ? 'is-current-position' : '',
        state.selectedNodeId === node.id ? 'is-selected' : '',
        !matches ? 'is-muted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`,
      'data-node-id': node.id
    });

    const pulse = createSvgElement('circle', {
      class: 'node-pulse',
      r: String(radius + 7),
      opacity: String(outgoing > 1 ? 0.65 : 0.28)
    });
    const circle = createSvgElement('circle', {
      r: String(radius),
      filter: state.highlightedNodes.has(node.id) ? 'url(#nodeGlow)' : '',
      style: `fill: color-mix(in srgb, var(--cyan) ${Math.round((1 - evalTone) * 38)}%, #1d231c);`
    });
    const label = createSvgElement('text', { y: String(radius + 17) });
    label.textContent = node.id === 'root' ? 'Start' : node.san;
    if (outgoing <= 1 && state.selectedNodeId !== node.id && !state.highlightedNodes.has(node.id)) {
      label.setAttribute('opacity', '0');
    }

    // Pastille « au trait » : blanche si les Blancs choisissent l'embranchement, sombre si les Noirs.
    const turnPip = createSvgElement('circle', {
      class: 'node-turn-pip',
      cy: String(-(radius + 5)),
      r: outgoing > 1 ? '5.4' : '4.2'
    });
    group.append(pulse, circle, turnPip, label);
    group.addEventListener('mouseenter', (event) => showNodeTooltip(node, event));
    group.addEventListener('mouseleave', hideTooltip);
    group.addEventListener('click', () => {
      if (suppressNextGraphClick) {
        suppressNextGraphClick = false;
        return;
      }
      // Téléphone (vue cerveau) : taper un nœud zoome dans ses lignes ; re-taper dézoome.
      if (isBrainScrubContext()) {
        state.brainFocus = state.brainFocus === node.id ? null : node.id;
      }
      selectNode(node.id, { clearPath: false });
    });
    nodeLayer.append(group);
  }

  // Zoom « dans les lignes » : on resserre le viewBox autour du nœud ciblé (téléphone).
  const focusBox = state.brainFocus ? computeBrainFocusViewBox(state.brainFocus, width, height) : null;
  if (focusBox) {
    svg.setAttribute('viewBox', focusBox);
  }
  document.body.classList.toggle('is-brain-focused', Boolean(focusBox));

  renderDetails();
}

function showNodeTooltip(node, event) {
  const comment = node.comments[0] ?? 'Aucune explication associée.';
  elements.graphTooltip.innerHTML = `
    <strong>${node.id === 'root' ? 'Départ' : node.san}</strong>
    <span>Eval ${formatEval(node.evaluation?.cpWhite)} · Futur ${formatEval(node.futureMeanCp)} · ${sideLabel(node.sideToMove)} au trait</span>
    <span>${escapeHtml(comment)}</span>
  `;
  positionTooltip(event);
}

function showEdgeTooltip(edge, event) {
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

function showRungTooltip(edge, index, event) {
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

function hideTooltip() {
  elements.graphTooltip.hidden = true;
}

// --- Vue cerveau au doigt : glisser sur le graphe pour révéler les positions ---
// (mini-échiquier de prévisualisation + infos + retour haptique au changement de noeud)

let brainScrub = null;
let suppressNextGraphClick = false;

function bindBrainScrubEvents() {
  elements.graphSvg?.addEventListener('pointerdown', onBrainPointerDown);
  // Taper le fond (hors nœud/arc) dézoome la vue cerveau.
  elements.graphSvg?.addEventListener('click', (event) => {
    if (suppressNextGraphClick) {
      return;
    }
    if (
      state.brainFocus &&
      !event.target.closest?.('.neural-node') &&
      !event.target.closest?.('.neural-edge')
    ) {
      state.brainFocus = null;
      renderGraph();
    }
  });
}

// Actif quand le graphe est la vue principale « cerveau » de l'Aventure.
function isBrainScrubContext() {
  return state.screen === 'adventure' && state.advViewMode === 'brain';
}

// Noeud du graphe le plus proche du point écran (converti en coordonnées du viewBox SVG).
function graphNearestNode(clientX, clientY) {
  const svg = elements.graphSvg;
  const ctm = svg?.getScreenCTM?.();
  if (!ctm || !state.layout?.size) {
    return null;
  }
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  let bestId = null;
  let bestDist = Infinity;
  for (const [id, p] of state.layout) {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

function onBrainPointerDown(event) {
  if (!isBrainScrubContext()) {
    return;
  }
  brainScrub = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    started: false,
    lastId: null
  };
  window.addEventListener('pointermove', onBrainPointerMove);
  window.addEventListener('pointerup', onBrainPointerUp);
  window.addEventListener('pointercancel', onBrainPointerUp);
}

function onBrainPointerMove(event) {
  if (!brainScrub || event.pointerId !== brainScrub.pointerId) {
    return;
  }
  if (!brainScrub.started) {
    if (Math.hypot(event.clientX - brainScrub.startX, event.clientY - brainScrub.startY) < 8) {
      return; // reste un tap potentiel (sélection de noeud)
    }
    brainScrub.started = true;
    showBrainScrub(true);
  }
  event.preventDefault();
  const point = graphNearestScrubPoint(event.clientX, event.clientY);
  const key = point?.fen;
  if (point && key !== brainScrub.lastId) {
    brainScrub.lastId = key;
    updateBrainScrub(point);
    navigator.vibrate?.(8); // retour haptique (Android) si supporté
  }
}

// Point défilable (nœud ou coup intermédiaire) le plus proche du doigt.
function graphNearestScrubPoint(clientX, clientY) {
  const svg = elements.graphSvg;
  const ctm = svg?.getScreenCTM?.();
  if (!ctm || !state.scrubPoints?.length) {
    return null;
  }
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  let best = null;
  let bestDist = Infinity;
  for (const sp of state.scrubPoints) {
    const d = Math.hypot(sp.x - pt.x, sp.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = sp;
    }
  }
  return best;
}

function onBrainPointerUp(event) {
  if (!brainScrub || event.pointerId !== brainScrub.pointerId) {
    return;
  }
  const wasScrubbing = brainScrub.started;
  brainScrub = null;
  window.removeEventListener('pointermove', onBrainPointerMove);
  window.removeEventListener('pointerup', onBrainPointerUp);
  window.removeEventListener('pointercancel', onBrainPointerUp);
  if (wasScrubbing) {
    // évite la sélection de noeud par le clic synthétique qui suit le scrub
    suppressNextGraphClick = true;
    setTimeout(() => {
      suppressNextGraphClick = false;
    }, 60);
  }
}

function showBrainScrub(show) {
  const panel = document.querySelector('#brainScrub');
  if (panel) {
    panel.classList.toggle('is-active', show);
    panel.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  if (!show) {
    clearScrubNodeHighlight();
  }
}

function updateBrainScrub(point) {
  if (!point) {
    return;
  }
  const boardEl = document.querySelector('#brainScrubBoard');
  if (boardEl) {
    renderBoard(
      { id: `scrub-${point.fen}`, fen: point.fen, from: point.from, to: point.to, san: point.san },
      boardEl
    );
  }
  const title = document.querySelector('#brainScrubTitle');
  if (title) {
    title.textContent = point.label || point.san || '—';
  }
  const meta = document.querySelector('#brainScrubMeta');
  if (meta) {
    const colorTxt =
      point.moveColor === 'w' ? '⬜ Coup blanc' : point.moveColor === 'b' ? '⬛ Coup noir' : 'Position de départ';
    const evalTxt = point.eval != null ? ` · Éval ${formatEval(point.eval)}` : '';
    meta.textContent = `${colorTxt}${evalTxt}`;
  }
  highlightScrubNode(point.nodeId);
}

function highlightScrubNode(id) {
  clearScrubNodeHighlight();
  elements.graphSvg
    ?.querySelector(`.neural-node[data-node-id="${CSS.escape(id)}"]`)
    ?.classList.add('is-scrub');
}

function clearScrubNodeHighlight() {
  for (const el of elements.graphSvg?.querySelectorAll('.neural-node.is-scrub') ?? []) {
    el.classList.remove('is-scrub');
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function selectEdge(edge) {
  state.highlightedEdges = new Set([edge.id]);
  state.highlightedNodes = new Set([edge.from, edge.to]);
  state.selectedNodeId = edge.to;
  state.selectedSegment = edge;
  state.segmentStepIndex = edge.isCompressed ? 0 : edge.pathNodeIds.length - 1;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent = edge.isCompressed
    ? `Segment: ${edge.sequenceLabel} (${formatPercent(edge.probability)})`
    : `Arc sélectionné: ${edge.san} (${formatPercent(edge.probability)})`;
  renderGraph();
}

function getCompressedIncomingSegment(nodeId) {
  const viewNode = state.view?.nodesById.get(nodeId);
  if (!viewNode || viewNode.incoming.length !== 1) {
    return null;
  }
  const edge = state.view.edgesById.get(viewNode.incoming[0]);
  return edge?.isCompressed ? edge : null;
}

function selectNode(nodeId, options = {}) {
  state.selectedNodeId = nodeId;
  const incomingSegment = getCompressedIncomingSegment(nodeId);
  if (incomingSegment && options.openCompressed !== false) {
    state.selectedSegment = incomingSegment;
    state.segmentStepIndex = incomingSegment.pathNodeIds.length - 1;
    state.segmentExpanded = false;
    state.highlightedEdges = new Set([incomingSegment.id]);
    state.highlightedNodes = new Set([incomingSegment.from, incomingSegment.to]);
    elements.selectedPathLabel.textContent = `Noeud compressé: ${incomingSegment.sequenceLabel}`;
  } else {
    state.selectedSegment = null;
    state.segmentStepIndex = 0;
    state.segmentExpanded = false;
  }
  if (options.clearPath !== false && !incomingSegment) {
    state.highlightedEdges.clear();
    state.highlightedNodes = new Set([nodeId]);
    elements.selectedPathLabel.textContent = nodeId === 'root' ? 'Départ sélectionné' : `Noeud sélectionné: ${getNode(nodeId)?.san ?? nodeId}`;
  }
  renderGraph();
}

function setInfoAnalysis(text, source = '') {
  elements.nodeComment.textContent = text || 'Aucune analyse pour cette position.';
  const sourceText = source && source !== '-' ? `Source: ${source}` : '';
  elements.nodeSources.textContent = sourceText;
  elements.nodeSources.hidden = !sourceText;
}

function renderDetails() {
  if (shouldRenderGameDetails()) {
    renderGameDetails();
    return;
  }

  const node = getNode(state.selectedNodeId) ?? getNode('root');
  if (!node) {
    return;
  }
  const incomingEdge = node.incoming.map(getEdge).find(Boolean);
  const selectedSegment = state.selectedSegment?.to === node.id ? state.selectedSegment : null;
  const previewNode = selectedSegment ? getSegmentPreviewNode(selectedSegment) : node;
  elements.nodeTitle.textContent = selectedSegment
    ? (previewNode?.san ?? selectedSegment.san)
    : node.id === 'root'
      ? 'Départ'
      : node.san;
  elements.nodeSubtitle.textContent = selectedSegment?.isCompressed
    ? `Segment vers ${node.san} · étape ${state.segmentStepIndex + 1}/${selectedSegment.pathNodeIds.length}.`
    : node.id === 'root'
      ? 'Position initiale avant de choisir une ligne.'
      : `${sideLabel(node.color)} vient de jouer ${node.from}-${node.to}.`;
  elements.nodeEval.textContent = formatEval(previewNode?.evaluation?.cpWhite);
  elements.nodeFuture.textContent = formatEval(previewNode?.futureMeanCp);
  elements.nodeTurn.textContent = sideLabel(previewNode?.sideToMove);
  setInfoAnalysis(
    previewNode?.comments?.[0] ??
    selectedSegment?.comments[0] ??
    node.comments[0] ??
    incomingEdge?.comments[0] ??
    'Aucune note pour cette position.',
    formatSourceList(selectedSegment?.sources ?? node.sources)
  );
  state.currentPreviewNode = previewNode ?? node;

  renderBoard(state.currentPreviewNode);
  renderZoomBoard(state.currentPreviewNode);
  renderSegmentExplorer(selectedSegment);
  renderChoices(node, selectedSegment);
}

function getSegmentPreviewNode(segment) {
  if (!segment?.pathNodeIds?.length) {
    return null;
  }
  const stepIndex = clamp(state.segmentStepIndex, 0, segment.pathNodeIds.length - 1);
  return getNode(segment.pathNodeIds[stepIndex]);
}

function renderSegmentExplorer(segment) {
  if (!segment?.isCompressed) {
    elements.segmentExplorer.hidden = true;
    elements.segmentStepList.replaceChildren();
    return;
  }

  const maxIndex = segment.pathNodeIds.length - 1;
  state.segmentStepIndex = clamp(state.segmentStepIndex, 0, maxIndex);
  elements.segmentExplorer.hidden = false;
  elements.segmentExplorer.classList.toggle('is-expanded', state.segmentExpanded);
  elements.segmentProgress.textContent = `${state.segmentStepIndex + 1}/${segment.pathNodeIds.length} · ${segment.collapsedPlyCount} coups`;
  elements.segmentToggleButton.textContent = state.segmentExpanded ? 'Compact' : 'Tous';
  elements.segmentToggleButton.setAttribute(
    'aria-label',
    state.segmentExpanded ? 'Afficher seulement le coup actif' : 'Afficher tous les coups'
  );
  elements.segmentPrevButton.disabled = state.segmentStepIndex <= 0;
  elements.segmentNextButton.disabled = state.segmentStepIndex >= maxIndex;
  elements.segmentStepList.replaceChildren();

  segment.pathNodeIds.forEach((nodeId, index) => {
    const stepNode = getNode(nodeId);
    const stepButton = document.createElement('button');
    stepButton.type = 'button';
    stepButton.className = `segment-step ${index === state.segmentStepIndex ? 'is-active' : ''}`;
    stepButton.innerHTML = `
      <strong>${index + 1}</strong>
      <span>${escapeHtml(stepNode?.san ?? segment.sequence[index] ?? '-')}</span>
      <em>${formatEval(stepNode?.evaluation?.cpWhite)}</em>
    `;
    stepButton.addEventListener('click', () => {
      state.segmentStepIndex = index;
      renderDetails();
    });
    elements.segmentStepList.append(stepButton);
  });
}

function formatSourceList(sources) {
  if (!sources.length) {
    return '-';
  }
  if (sources.length <= 4) {
    return sources.join(' · ');
  }
  return `${sources.slice(0, 3).join(' · ')} · +${sources.length - 3} lignes`;
}

function renderChoices(node, selectedSegment = null) {
  if (
    selectedSegment?.isCompressed &&
    state.segmentStepIndex < selectedSegment.pathNodeIds.length - 1
  ) {
    renderInternalSegmentChoice(selectedSegment);
    return;
  }

  const outgoing = (state.view?.nodesById.get(node.id)?.outgoing ?? [])
    .map((edgeId) => state.view?.edgesById.get(edgeId))
    .filter(Boolean)
    .sort((a, b) => b.probability - a.probability);
  elements.choiceList.replaceChildren();

  if (!outgoing.length) {
    const empty = document.createElement('p');
    empty.textContent = node.terminal ? 'Fin de ligne: aucune suite légale.' : 'Fin du livre PGN pour cette branche.';
    elements.choiceList.append(empty);
    return;
  }

  for (const edge of outgoing) {
    const child = getNode(edge.to);
    const detail = edge.isCompressed
      ? `${edge.collapsedPlyCount} coups: ${edge.sequenceLabel}`
      : edge.comments[0] ?? child?.comments[0] ?? 'Suite sans commentaire';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'choice-row';
    row.innerHTML = `
      <strong>${escapeHtml(edge.san)}</strong>
      <span>${escapeHtml(detail)}${edge.endsInMate ? ' · mat min. 1%' : ''}</span>
      <em>${formatPercent(edge.probability)}</em>
    `;
    row.addEventListener('click', () => selectEdge(edge));
    elements.choiceList.append(row);
  }
}

function renderInternalSegmentChoice(segment) {
  elements.choiceList.replaceChildren();

  const nextIndex = state.segmentStepIndex + 1;
  const nextNode = getNode(segment.pathNodeIds[nextIndex]);
  const nextRow = document.createElement('button');
  nextRow.type = 'button';
  nextRow.className = 'choice-row';
  nextRow.innerHTML = `
    <strong>${escapeHtml(nextNode?.san ?? segment.sequence[nextIndex] ?? '-')}</strong>
    <span>Coup suivant dans ce noeud compressé</span>
    <em>${nextIndex + 1}/${segment.pathNodeIds.length}</em>
  `;
  nextRow.addEventListener('click', () => {
    state.segmentStepIndex = nextIndex;
    renderDetails();
  });
  elements.choiceList.append(nextRow);

  const finishRow = document.createElement('button');
  finishRow.type = 'button';
  finishRow.className = 'choice-row';
  finishRow.innerHTML = `
    <strong>${escapeHtml(getNode(segment.to)?.san ?? 'Fin')}</strong>
    <span>Aller directement au point de décision</span>
    <em>fin</em>
  `;
  finishRow.addEventListener('click', () => {
    state.segmentStepIndex = segment.pathNodeIds.length - 1;
    renderDetails();
  });
  elements.choiceList.append(finishRow);
}

// Case du roi en échec (le camp au trait), ou null. Marche pour les deux couleurs.
function kingInCheckSquare(fen) {
  try {
    const probe = new Chess(fen);
    if (!probe.isCheck()) {
      return null;
    }
    const turn = probe.turn();
    for (const row of probe.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) {
          return cell.square;
        }
      }
    }
  } catch {
    /* FEN invalide : pas de surbrillance d'échec */
  }
  return null;
}

function renderBoard(node, container = elements.boardPreview) {
  const [boardPart] = node.fen.split(' ');
  const rows = boardPart.split('/');
  const from = node.from;
  const to = node.to;
  const interactive = isBoardInteractive(container);
  const openingArrows = getOpeningBoardArrows();
  const selectedSquare = interactive ? state.game.selectedSquare : null;
  const legalTargets = selectedSquare ? getLegalTargetsFromSquare(selectedSquare) : new Set();
  const playableColor = interactive ? getPlayableBoardColor() : null;
  const openingBookMode = interactive && isOpeningBookChoiceActive();
  const bookTargets =
    selectedSquare && openingBookMode ? getBookTargetsFromSquare(selectedSquare) : new Set();
  const checkSquare = kingInCheckSquare(node.fen);
  container.replaceChildren();
  container.classList.toggle('is-game-board', interactive);
  container.classList.toggle('has-opening-arrows', openingArrows.length > 0);

  const squareOptions = {
    interactive,
    selectedSquare,
    playableColor,
    legalTargets,
    bookTargets,
    openingBookMode,
    checkSquare
  };
  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        const empty = Number(char);
        for (let index = 0; index < empty; index += 1) {
          appendSquare(container, rankIndex, fileIndex, null, from, to, squareOptions);
          fileIndex += 1;
        }
      } else {
        appendSquare(container, rankIndex, fileIndex, char, from, to, squareOptions);
        fileIndex += 1;
      }
    }
  });

  renderBoardArrows(container, openingArrows);

  // Anime le glissement de la pièce du dernier coup (plateau de jeu uniquement).
  maybeAnimateGameMove(container, node);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// Pause (Promise) de `ms` millisecondes.
function pause(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// Durée de « réflexion » simulée de l'adversaire, tirée aléatoirement dans une fourchette (ms).
function randomThinkMs(minMs, maxMs) {
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

// Active/désactive l'état visuel « Stockfish réfléchit » (badge sur l'échiquier, halo,
// pulsation du cerveau). Piloté par la classe body pour cibler tout le tableau en CSS.
function setEngineThinking(isThinking) {
  document.body.classList.toggle('is-engine-thinking', Boolean(isThinking));
}

// Animation en cours du dernier coup (un seul fantôme à la fois sur le plateau).
let boardMoveAnim = null;

// Déclenche l'animation du dernier coup, mais seulement sur le plateau de jeu interactif
// (pas sur les aperçus du graphe) et seulement quand le coup change vraiment — sinon chaque
// re-rendu (sélection d'une case, mise à jour d'éval, repli d'une section) la relancerait.
function maybeAnimateGameMove(container, node) {
  if (container !== elements.boardPreview) {
    return;
  }
  const isGameNode =
    node.id === 'game' || node.id === 'cinematic' || node.id === 'free-review';
  if (!isGameNode) {
    cancelBoardMoveAnim();
    delete container.dataset.lastMoveKey;
    return;
  }
  const { from, to, fen } = node;
  if (!from || !to) {
    cancelBoardMoveAnim();
    container.dataset.lastMoveKey = `start-${fen}`;
    return;
  }
  const moveKey = `${from}-${to}-${fen}`;
  if (container.dataset.lastMoveKey === moveKey) {
    // Même position re-rendue (message « calcule… », sélection, éval) : le replaceChildren
    // a recréé une pièce d'arrivée visible. Si le fantôme glisse encore, on la re-masque
    // pour éviter de voir la pièce en double le temps du trajet.
    if (boardMoveAnim && boardMoveAnim.toSquare === to) {
      const img = container.querySelector(`[data-square="${to}"] img`);
      if (img) {
        img.style.opacity = '0';
      }
    }
    return;
  }
  container.dataset.lastMoveKey = moveKey;
  animateBoardMove(container, from, to);
}

function cancelBoardMoveAnim() {
  boardMoveAnim?.cleanup();
}

// Technique du « fantôme superposé » : on fait glisser une copie de la pièce de sa case
// d'origine vers sa case d'arrivée, pendant que la vraie pièce (déjà rendue à l'arrivée)
// reste masquée le temps du trajet. Le fantôme est posé sur .board-shell (parent du plateau)
// pour survivre aux re-rendus du plateau (replaceChildren) sans être coupé en plein vol.
function animateBoardMove(container, fromSquare, toSquare) {
  cancelBoardMoveAnim();
  if (prefersReducedMotion()) {
    return;
  }
  const anchor = container.parentElement;
  const fromEl = container.querySelector(`[data-square="${fromSquare}"]`);
  const toEl = container.querySelector(`[data-square="${toSquare}"]`);
  const pieceImg = toEl?.querySelector('img');
  if (!anchor || !fromEl || !toEl || !pieceImg) {
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const fromRect = fromEl.getBoundingClientRect();
  const imgRect = pieceImg.getBoundingClientRect();
  if (!anchorRect.width || !imgRect.width) {
    return;
  }

  // Point de départ = centre de la pièce sur la case d'origine ; arrivée = position réelle.
  const startLeft = fromRect.left - anchorRect.left + (fromRect.width - imgRect.width) / 2;
  const startTop = fromRect.top - anchorRect.top + (fromRect.height - imgRect.height) / 2;
  const endLeft = imgRect.left - anchorRect.left;
  const endTop = imgRect.top - anchorRect.top;
  const dx = endLeft - startLeft;
  const dy = endTop - startTop;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return;
  }

  const ghost = pieceImg.cloneNode(true);
  ghost.classList.add('board-move-ghost');
  ghost.style.left = `${startLeft}px`;
  ghost.style.top = `${startTop}px`;
  ghost.style.width = `${imgRect.width}px`;
  ghost.style.height = `${imgRect.height}px`;
  ghost.style.transform = 'translate(0, 0)';
  pieceImg.style.opacity = '0';
  anchor.append(ghost);

  const token = Symbol('board-move');
  let done = false;
  const cleanup = () => {
    if (done) {
      return;
    }
    done = true;
    ghost.remove();
    // Ré-afficher la pièce d'arrivée du plateau courant (recréée à chaque re-rendu).
    const liveImg = elements.boardPreview.querySelector(`[data-square="${toSquare}"] img`);
    if (liveImg) {
      liveImg.style.opacity = '';
    }
    if (boardMoveAnim?.token === token) {
      boardMoveAnim = null;
    }
  };
  boardMoveAnim = { token, toSquare, cleanup };

  // Forcer un reflow pour valider la position initiale, puis lancer la transition.
  ghost.getBoundingClientRect();
  ghost.style.transition = 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)';
  ghost.style.transform = `translate(${dx}px, ${dy}px)`;
  ghost.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, 380); // Filet de sécurité si transitionend ne se déclenche pas.
}

function getOpeningBoardArrows() {
  const game = state.game;
  const reviewEntry = getActiveFreeReviewEntry();
  if (
    !game ||
    game.status !== 'lost' ||
    game.phase !== 'opening' ||
    !game.expectedOpeningArrows.length ||
    (reviewEntry && reviewEntry.afterFen !== game.chess.fen())
  ) {
    return [];
  }
  return game.expectedOpeningArrows;
}

function squareCenter(square) {
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return {
    x: ((fileIndex + 0.5) / 8) * 100,
    y: ((8 - rank + 0.5) / 8) * 100
  };
}

function renderBoardArrows(container, arrows) {
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

function buildBoardArrowPath(start, end) {
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

function appendSquare(container, rankIndex, fileIndex, piece, from, to, options = {}) {
  const squareName = `${'abcdefgh'[fileIndex]}${8 - rankIndex}`;
  const pieceColor = piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null;
  const selectable = options.interactive && pieceColor === options.playableColor;
  const target = options.legalTargets?.has(squareName);
  const bookTarget = target && options.bookTargets?.has(squareName);
  const offbookTarget = target && options.openingBookMode && !bookTarget;
  const square = document.createElement('div');
  square.className = [
    'board-square',
    (rankIndex + fileIndex) % 2 === 0 ? 'light' : 'dark',
    squareName === from ? 'is-from' : '',
    squareName === to ? 'is-to' : '',
    options.interactive ? 'is-playable' : '',
    selectable ? 'is-selectable' : '',
    target ? 'is-target' : '',
    bookTarget ? 'is-book-target' : '',
    offbookTarget ? 'is-offbook-target' : '',
    target && piece ? 'is-capture-target' : '',
    squareName === options.checkSquare ? 'is-check' : '',
    squareName === options.selectedSquare ? 'is-selected' : ''
  ]
    .filter(Boolean)
    .join(' ');
  square.dataset.square = squareName;
  if (options.interactive) {
    square.setAttribute('role', 'button');
    square.setAttribute('tabindex', '0');
    square.setAttribute('aria-label', getBoardSquareLabel(squareName, piece, target));
    square.addEventListener('click', () => handleBoardSquareClick(squareName));
    square.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleBoardSquareClick(squareName);
      }
    });
  }

  if (piece) {
    const image = document.createElement('img');
    image.alt = `${pieceColor === 'w' ? 'Blanc' : 'Noir'} ${piece.toUpperCase()}`;
    image.src = `/pieces/merida/${pieceColor}${piece.toUpperCase()}.svg`;
    image.draggable = false; // évite le glisser-image natif (surbrillance parasite)
    square.append(image);
  }

  container.append(square);
}

function isBoardInteractive(container) {
  return Boolean(
    container === elements.boardPreview &&
      shouldRenderGameDetails() &&
      state.game?.active &&
      !state.game.locked &&
      state.game.historyView == null &&
      getPlayableBoardColor()
  );
}

function getInteractiveChess() {
  const reviewEntry = getActiveFreeReviewEntry();
  if (isPostGameReviewPlayable() && reviewEntry) {
    return new Chess(reviewEntry.afterFen);
  }
  return state.game?.chess ?? null;
}

function getPlayableBoardColor() {
  const game = state.game;
  if (!game) {
    return null;
  }
  const reviewEntry = getActiveFreeReviewEntry();
  if (isPostGameReviewPlayable() && reviewEntry) {
    return reviewEntry.afterFen.split(/\s+/)[1] ?? 'w';
  }
  if (game.status === 'playing' && !game.locked && game.chess.turn() === 'w') {
    return 'w';
  }
  return null;
}

function getLegalTargetsFromSquare(square) {
  const chess = getInteractiveChess();
  if (!chess || !square) {
    return new Set();
  }
  return new Set(chess.moves({ square, verbose: true }).map((move) => move.to));
}

function isOpeningBookChoiceActive() {
  return Boolean(
    state.game?.phase === 'opening' &&
      state.game.status === 'playing' &&
      getExpectedWhiteBookEdges().length
  );
}

function getBookTargetsFromSquare(square) {
  if (!state.game || !square || !isOpeningBookChoiceActive()) {
    return new Set();
  }
  return new Set(
    getExpectedWhiteBookEdges()
      .filter((edge) => edge.uci.slice(0, 2) === square)
      .map((edge) => edge.uci.slice(2, 4))
  );
}

function getBoardSquareLabel(squareName, piece, isTarget) {
  const pieceLabel = piece
    ? `${piece === piece.toUpperCase() ? 'pièce blanche' : 'pièce noire'} ${piece.toUpperCase()}`
    : 'case vide';
  return isTarget ? `${squareName}, destination légale` : `${squareName}, ${pieceLabel}`;
}

// Joue le coup from→to s'il est légal (auto-promotion en dame). Renvoie true si joué.
function attemptBoardMove(from, to) {
  const chess = getInteractiveChess();
  if (!chess) {
    return false;
  }
  const legalMoves = chess.moves({ square: from, verbose: true });
  const move =
    legalMoves.find((c) => c.to === to && (!c.promotion || c.promotion === 'q')) ??
    legalMoves.find((c) => c.to === to);
  if (!move) {
    return false;
  }
  submitHumanMove(`${from}${to}${move.promotion ?? ''}`);
  return true;
}

function handleBoardSquareClick(squareName) {
  // Ignore le clic synthétique qui suit un glisser-déposer.
  if (suppressNextBoardClick) {
    suppressNextBoardClick = false;
    return;
  }
  const game = state.game;
  const chess = getInteractiveChess();
  const playableColor = getPlayableBoardColor();
  if (!game || !chess || game.locked || !playableColor) {
    return;
  }

  const piece = chess.get(squareName);
  const selected = game.selectedSquare;

  if (!selected) {
    if (piece?.color === playableColor) {
      selectBoardSquare(squareName);
      return;
    }
    game.message = `Sélectionne une pièce ${playableColor === 'w' ? 'blanche' : 'noire'} pour jouer.`;
    renderGameDetails();
    return;
  }

  if (selected === squareName) {
    game.selectedSquare = null;
    game.message = 'Sélection annulée.';
    renderGameDetails();
    return;
  }

  if (attemptBoardMove(selected, squareName)) {
    return;
  }

  if (piece?.color === playableColor) {
    selectBoardSquare(squareName);
    return;
  }

  game.message = 'Cette destination n’est pas légale pour la pièce sélectionnée.';
  renderGameDetails();
}

function selectBoardSquare(squareName) {
  state.game.selectedSquare = squareName;
  const chess = getInteractiveChess();
  const legalMoves = chess?.moves({ square: squareName, verbose: true }) ?? [];
  const bookTargets = getBookTargetsFromSquare(squareName);
  if (!legalMoves.length) {
    state.game.message = `La pièce en ${squareName} n'a pas de coup légal.`;
  } else if (isOpeningBookChoiceActive() && bookTargets.size) {
    state.game.message =
      `Pièce sélectionnée en ${squareName}: les points dorés sont les coups de livre, ` +
      'les points gris sont légaux mais hors ligne.';
  } else if (isOpeningBookChoiceActive()) {
    state.game.message =
      `La pièce en ${squareName} n'a pas de coup de livre dans cette position. ` +
      'Les points gris sont légaux, mais ils sortent de la ligne actuelle.';
  } else {
    state.game.message = `Pièce sélectionnée en ${squareName}: choisis une destination.`;
  }
  renderGameDetails();
}

// --- Glisser-déposer des pièces (souris + tactile, via Pointer Events) ---

let boardDrag = null;
let suppressNextBoardClick = false;

function bindBoardDragEvents() {
  const board = elements.boardPreview;
  if (board) {
    board.addEventListener('pointerdown', onBoardPointerDown);
  }
}

function onBoardPointerDown(event) {
  if (event.button > 0) {
    return; // bouton gauche / tactile uniquement
  }
  const board = elements.boardPreview;
  if (!isBoardInteractive(board)) {
    return;
  }
  const squareEl = event.target.closest?.('.board-square');
  if (!squareEl || !board.contains(squareEl)) {
    return;
  }
  const from = squareEl.dataset.square;
  const chess = getInteractiveChess();
  const playableColor = getPlayableBoardColor();
  const piece = chess?.get(from);
  if (!chess || !playableColor || piece?.color !== playableColor) {
    return; // on ne glisse que ses propres pièces
  }
  boardDrag = {
    from,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    started: false
  };
  window.addEventListener('pointermove', onBoardPointerMove);
  window.addEventListener('pointerup', onBoardPointerUp);
  window.addEventListener('pointercancel', onBoardPointerUp);
}

function onBoardPointerMove(event) {
  if (!boardDrag || event.pointerId !== boardDrag.pointerId) {
    return;
  }
  if (!boardDrag.started) {
    if (Math.hypot(event.clientX - boardDrag.startX, event.clientY - boardDrag.startY) < 6) {
      return; // pas encore assez de mouvement : reste un clic potentiel
    }
    boardDrag.started = true;
    startBoardDragVisual(boardDrag.from);
    const liveImg = elements.boardPreview.querySelector(`[data-square="${boardDrag.from}"] img`);
    if (liveImg) {
      const rect = liveImg.getBoundingClientRect();
      const ghost = liveImg.cloneNode(true);
      ghost.className = 'board-drag-ghost';
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.append(ghost);
      liveImg.style.opacity = '0';
      boardDrag.ghost = ghost;
      boardDrag.liveImg = liveImg;
    }
  }
  if (boardDrag.ghost) {
    event.preventDefault();
    boardDrag.ghost.style.left = `${event.clientX}px`;
    boardDrag.ghost.style.top = `${event.clientY}px`;
    highlightDropTarget(event.clientX, event.clientY);
  }
}

function onBoardPointerUp(event) {
  if (!boardDrag || event.pointerId !== boardDrag.pointerId) {
    return;
  }
  const drag = boardDrag;
  boardDrag = null;
  window.removeEventListener('pointermove', onBoardPointerMove);
  window.removeEventListener('pointerup', onBoardPointerUp);
  window.removeEventListener('pointercancel', onBoardPointerUp);

  if (!drag.started) {
    return; // simple tap : le gestionnaire de clic gère la sélection
  }

  drag.ghost?.remove();
  if (drag.liveImg) {
    drag.liveImg.style.opacity = '';
  }
  // Empêche le clic synthétique qui suit le drag de re-sélectionner.
  suppressNextBoardClick = true;
  setTimeout(() => {
    suppressNextBoardClick = false;
  }, 60);

  const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.board-square');
  const to = targetEl && elements.boardPreview.contains(targetEl) ? targetEl.dataset.square : null;

  if (to && to !== drag.from && attemptBoardMove(drag.from, to)) {
    return; // coup joué : le re-rendu efface les surbrillances
  }
  clearDragTargets(); // drop annulé : nettoie sans re-rendre
}

// Surbrillances de sélection/cibles posées directement sur les cases (sans re-rendu,
// pour préserver la capture du pointeur tactile pendant le glissement).
function startBoardDragVisual(from) {
  const board = elements.boardPreview;
  if (!board) {
    return;
  }
  if (state.game) {
    state.game.selectedSquare = null;
  }
  clearDragTargets();
  const chess = getInteractiveChess();
  board.querySelector(`[data-square="${from}"]`)?.classList.add('is-selected');
  // Mêmes indicateurs qu'au clic : en ouverture, points dorés (coup de livre) vs gris
  // (légal mais hors livre), anneau pour les captures.
  const bookTargets = getBookTargetsFromSquare(from);
  const openingBookMode = isOpeningBookChoiceActive();
  for (const mv of chess?.moves({ square: from, verbose: true }) ?? []) {
    const el = board.querySelector(`[data-square="${mv.to}"]`);
    if (!el) {
      continue;
    }
    el.classList.add('is-target');
    if (bookTargets.has(mv.to)) {
      el.classList.add('is-book-target');
    } else if (openingBookMode) {
      el.classList.add('is-offbook-target');
    }
    if (mv.captured) {
      el.classList.add('is-capture-target');
    }
  }
}

function clearDragTargets() {
  for (const el of elements.boardPreview?.querySelectorAll(
    '.is-selected, .is-target, .is-capture-target, .is-book-target, .is-offbook-target, .is-drop-hover'
  ) ?? []) {
    el.classList.remove(
      'is-selected',
      'is-target',
      'is-capture-target',
      'is-book-target',
      'is-offbook-target',
      'is-drop-hover'
    );
  }
}

function highlightDropTarget(x, y) {
  for (const el of elements.boardPreview?.querySelectorAll('.is-drop-hover') ?? []) {
    el.classList.remove('is-drop-hover');
  }
  const el = document.elementFromPoint(x, y)?.closest?.('.board-square');
  if (el && elements.boardPreview.contains(el)) {
    el.classList.add('is-drop-hover');
  }
}

function renderZoomBoard(node = state.currentPreviewNode) {
  elements.boardZoomLayer.hidden = !state.boardZoomed;
  document.body.classList.toggle('is-board-zoomed', state.boardZoomed);
  elements.boardZoomButton.textContent = state.boardZoomed ? 'Réduire' : 'Agrandir';
  elements.boardZoomButton.setAttribute(
    'aria-label',
    state.boardZoomed ? "Réduire l'échiquier" : "Agrandir l'échiquier"
  );

  if (!state.boardZoomed || !node) {
    elements.boardZoomPreview.replaceChildren();
    return;
  }

  elements.boardZoomTitle.textContent = node.id === 'root' ? 'Position initiale' : node.san;
  renderBoard(node, elements.boardZoomPreview);
}

function setBoardZoomed(isZoomed) {
  state.boardZoomed = isZoomed;
  renderZoomBoard();
}

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

function clampPanelWidths() {
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
  window.requestAnimationFrame(() => renderGraph());
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

  window.requestAnimationFrame(() => renderGraph());
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
  renderGraph();
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
  renderGraph();
}

function bindPanelResizeHandles() {
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

function syncDetailInfoPlacement() {
  if (!elements.detailInfoContent || !elements.graphInfoContent || !elements.graphInfoDrawer) {
    return;
  }

  if (state.viewMode === 'human') {
    elements.graphInfoDrawer.hidden = false;
    if (elements.detailInfoContent.parentElement !== elements.graphInfoContent) {
      elements.graphInfoContent.append(elements.detailInfoContent);
    }
    return;
  }

  elements.graphInfoDrawer.hidden = true;
  if (elements.detailInfoContent.parentElement !== document.querySelector('.detail-panel')) {
    document.querySelector('.detail-panel')?.append(elements.detailInfoContent);
  }
}

function setViewMode(mode) {
  state.viewMode = mode === 'brain' ? 'brain' : 'human';
  if (state.viewMode === 'human' && state.boardZoomed) {
    setBoardZoomed(false);
  }
  document.body.classList.toggle('is-human-view', state.viewMode === 'human');
  document.body.classList.toggle('is-brain-view', state.viewMode === 'brain');
  syncDetailInfoPlacement();
  elements.viewModeButton.textContent =
    state.viewMode === 'human' ? 'Vue cerveau' : 'Vue joueur';
  elements.viewModeButton.setAttribute(
    'aria-label',
    state.viewMode === 'human'
      ? 'Basculer vers la vue cerveau'
      : 'Basculer vers la vue joueur'
  );
  window.requestAnimationFrame(() => renderGraph());
}

function toggleViewMode() {
  setViewMode(state.viewMode === 'human' ? 'brain' : 'human');
}

// --- Vue aventure : bascule échiquier ↔ cerveau ---

function setAdvViewMode(mode) {
  state.advViewMode = mode === 'board' ? 'board' : 'brain';
  showBrainScrub(false); // l'aperçu au doigt ne persiste pas d'une vue à l'autre
  state.brainFocus = null; // le zoom du cerveau ne persiste pas d'une vue à l'autre
  document.body.classList.toggle('is-adv-board-view', state.advViewMode === 'board');
  const btn = document.querySelector('#advViewToggle');
  if (btn) {
    btn.textContent = state.advViewMode === 'board' ? '🧠 Vue cerveau' : '🎮 Vue joueur';
    btn.setAttribute('aria-label',
      state.advViewMode === 'board'
        ? 'Basculer vers la vue cerveau'
        : 'Basculer vers la vue échiquier'
    );
  }
  updateAdvMobileBar();
  window.requestAnimationFrame(() => {
    renderGraph();
    if (state.game?.active) {
      renderGameDetails();
    }
  });
}

function toggleAdvViewMode() {
  setAdvViewMode(state.advViewMode === 'board' ? 'brain' : 'board');
}

// --- Retours visuels en vue échiquier ---

/** Fait réagir l'échiquier : vert (bon coup), rouge + secousse (mauvais),
 *  ou halo doré « apprentissage » quand le joueur illumine un nouveau neurone. */
function flashAdvBoard(type) {
  if (state.advViewMode !== 'board') {
    return;
  }
  const board = document.querySelector('#boardPreview');
  if (!board) {
    return;
  }
  const classByType = {
    good: 'is-flash-good',
    bad: 'is-flash-bad',
    learn: 'is-flash-learn'
  };
  const cls = classByType[type] ?? 'is-flash-good';
  board.classList.remove(...Object.values(classByType));
  void board.offsetWidth; // force reflow pour redémarrer l'animation
  board.classList.add(cls);
  setTimeout(() => board.classList.remove(cls), type === 'learn' ? 900 : 650);
}

/** Ajoute des points de suivi verts sur les cases-cibles des coups du livre. */
function applyAdvBoardHints() {
  if (!isAdventureRun() || state.advViewMode !== 'board') {
    return;
  }
  const game = state.game;
  if (!game || game.status !== 'playing' || game.chess.turn() !== 'w' || game.phase !== 'opening') {
    return;
  }
  const edges = getExpectedWhiteBookEdges();
  if (!edges.length) {
    return;
  }
  const toSquares  = new Set(edges.map(e => e.uci.slice(2, 4)));
  const fromSquares = new Set(edges.map(e => e.uci.slice(0, 2)));
  const board = document.querySelector('#boardPreview');
  if (!board) {
    return;
  }
  for (const sq of board.querySelectorAll('.board-square')) {
    const name = sq.dataset.square;
    sq.classList.toggle('is-book-hint', toSquares.has(name));
    sq.classList.toggle('is-book-from',  fromSquares.has(name));
  }
}

/** Met à jour l'aura de phase (ouverture / libre) et la légende flottante du board. */
function updateAdvBoardFeedback() {
  if (!isAdventureRun() || state.advViewMode !== 'board') {
    return;
  }
  const game = state.game;
  const board   = document.querySelector('#boardPreview');
  const caption = document.querySelector('#advBoardCaption');
  if (!game || !board) {
    return;
  }
  // Bandeau au-dessus de l'échiquier : contexte de la partie en cours.
  renderAdvBoardTop();
  // Aura coral en phase libre (mode boss : trouve l'échec et mat)
  board.classList.toggle('is-free-phase', game.phase === 'free' && game.status === 'playing');
  if (!caption) {
    return;
  }
  if (game.status !== 'playing') {
    caption.textContent = '';
    return;
  }
  if (game.phase === 'opening') {
    caption.textContent = game.chess.turn() === 'w' ? '⬜ Ton coup' : '⬛ Stockfish réfléchit…';
  } else {
    // Phase libre : objectif visuel
    const isMate = isAdventureRun() && state.advRun?.kind === 'boss';
    caption.textContent = isMate ? '⚔️ Trouve l\'échec et mat' : '⚡ Phase libre';
  }
}

/** Profondeur (en demi-coups) de la plus longue ligne de livre restant à partir
 *  du noeud courant — sert à annoncer « encore N coups à découvrir ». */
function advRemainingBookPlies() {
  const startId = state.game?.currentNodeId;
  if (!startId) {
    return 0;
  }
  const memo = new Map();
  const visiting = new Set();
  const depthFrom = (nodeId) => {
    if (memo.has(nodeId)) {
      return memo.get(nodeId);
    }
    if (visiting.has(nodeId)) {
      return 0; // garde-fou contre les transpositions cycliques
    }
    visiting.add(nodeId);
    const node = getNode(nodeId);
    let best = 0;
    for (const edgeId of node?.outgoing ?? []) {
      const edge = getEdge(edgeId);
      if (edge) {
        best = Math.max(best, 1 + depthFrom(edge.to));
      }
    }
    visiting.delete(nodeId);
    memo.set(nodeId, best);
    return best;
  };
  return depthFrom(startId);
}

/** Texte du bandeau au-dessus de l'échiquier (vue joueur aventure) :
 *  ouverture → nom de la ligne / coups restants ; sinon → Stockfish affronté. */
function advBoardTopText() {
  const game = state.game;
  if (!game || game.status !== 'playing') {
    return '';
  }
  // Conversion automatique en cours : bandeau dédié au-dessus de l'échiquier.
  if (game.victoryCinematic) {
    return '🎬 Conversion automatique vers le mat…';
  }
  const run = state.advRun;
  // Mode Pièges : on annonce l'objectif « livre le mat ».
  if (run?.trapsMode && game.phase === 'opening') {
    return '🎯 Piège : fais tomber Stockfish et mate-le';
  }
  // Boss : on annonce le Stockfish en face.
  if (run?.kind === 'boss') {
    const profile = getStockfishLevelProfile(run.bossLevel);
    const strength = profile.elo ? `${profile.elo} Elo` : 'force max';
    return `♟︎ Boss N${profile.level} · ${profile.label} · ${strength}`;
  }
  // Leçon / ouverture : combien de coups de livre restent à découvrir.
  if (game.phase === 'opening') {
    const remaining = advRemainingBookPlies();
    if (remaining <= 0) {
      return '📖 Fin de la ligne — sors du livre';
    }
    return `📖 Ouverture · encore ${remaining} coup${remaining > 1 ? 's' : ''} à découvrir`;
  }
  // Phase libre hors boss (ex. exploration) : objectif générique.
  return '⚡ Phase libre';
}

function renderAdvBoardTop() {
  const el = document.querySelector('#advBoardTop');
  if (el) {
    el.textContent = advBoardTopText();
  }
}

function isExplorationMode() {
  return state.game?.mode === 'exploration' || state.playMode === 'exploration';
}

function isBrainGraphExplorationActive() {
  return isExplorationMode() && state.viewMode === 'brain';
}

function shouldFollowGameInGraph() {
  return Boolean(state.game?.active && !isBrainGraphExplorationActive());
}

function shouldRenderGameDetails() {
  return Boolean(state.game?.active && !isBrainGraphExplorationActive());
}

function setPlayMode(mode) {
  const nextMode = mode === 'exploration' ? 'exploration' : 'challenge';
  if (state.playMode !== nextMode && nextMode === 'challenge') {
    state.campaignLevel = FIRST_LEVEL_NUMBER;
  }
  state.playMode = nextMode;
  syncPlayModeButtons();
  startNewGame();
}

function syncPlayModeButtons() {
  elements.challengeModeButton.classList.toggle('is-active', state.playMode === 'challenge');
  elements.explorationModeButton.classList.toggle('is-active', state.playMode === 'exploration');
}

function fenPositionKey(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}

function createInitialReviewEntry(chess, evaluation) {
  const cpWhite = evaluation?.cpWhite ?? 0;
  return {
    index: 0,
    text: 'Départ',
    san: 'Départ',
    uci: '',
    color: chess.turn(),
    label: 'Position initiale',
    phase: 'start',
    beforeFen: chess.fen(),
    afterFen: chess.fen(),
    from: '',
    to: '',
    beforeEvalCp: cpWhite,
    afterEvalCp: cpWhite,
    parentIndex: null,
    branchLabel: 'Partie',
    depth: evaluation?.depth ?? 0,
    pv: evaluation?.pv ?? '',
    pvUci: evaluation?.pvUci ?? [],
    status: 'start',
    analysis: `Position initiale. Éval ${formatEval(cpWhite)}. La revue permet de rejouer mentalement toute la partie, livre et survie compris.`
  };
}

function createInitialGameState(level = state.campaignLevel) {
  const exploration = state.playMode === 'exploration';
  const isAdventureBoss = state.screen === 'adventure' && state.advRun?.kind === 'boss';
  const objective = isAdventureBoss
    ? { type: 'mate', target: Number.POSITIVE_INFINITY }
    : getLevelObjective(exploration ? FIRST_LEVEL_NUMBER : level);
  const rootNode = getNode('root');
  const chess = new Chess(rootNode?.fen ?? STANDARD_START_FEN);
  const rootEvaluation = rootNode?.evaluation ?? { cpWhite: 0 };
  return {
    active: true,
    mode: state.playMode,
    level: exploration ? FIRST_LEVEL_NUMBER : level,
    objective,
    nextLevel: null,
    finalVictory: false,
    chess,
    currentNodeId: 'root',
    currentPathNodeIds: ['root'],
    currentPathEdgeIds: [],
    phase: 'opening',
    status: 'playing',
    lives: STARTING_LIVES,
    freeRemaining:
      exploration || objective.type === 'mate' ? Number.POSITIVE_INFINITY : objective.target,
    freeRoundPending: false,
    openingBlackMoves: 0,
    currentEvalCp: rootEvaluation.cpWhite ?? 0,
    currentPv: rootEvaluation.pv ?? '',
    currentDepth: rootEvaluation.depth ?? 0,
    locked: false,
    selectedSquare: null,
    message: exploration
      ? "Mode exploration: teste les lignes ou sors du livre sans perdre de vie."
      : `Niveau ${level}: ${formatLevelObjective(level)} après l'ouverture.`,
    lastMove: null,
    moveLog: [],
    freeReviewMoves: [createInitialReviewEntry(chess, rootEvaluation)],
    freeReview: {
      active: false,
      index: -1,
      preferredChildByParent: {}
    },
    failureFen: null,
    failureEvaluation: null,
    defeatComment: '',
    expectedOpeningArrows: [],
    defeatLineRecorded: false,
    cinematic: null,
    cinematicTimer: null,
    victoryCinematic: false, // conversion automatique vers le mat en cours
    victoryConverted: false  // déjà déclenchée une fois pour cette partie
  };
}

function getGameNode() {
  if (!state.game) {
    return null;
  }
  return getNode(state.game.currentNodeId) ?? state.nodesByFen.get(state.game.chess.fen()) ?? null;
}

function getGameNodeByFen() {
  if (!state.game) {
    return null;
  }
  return (
    state.nodesByFen.get(state.game.chess.fen()) ??
    state.nodesByPositionKey.get(fenPositionKey(state.game.chess.fen())) ??
    null
  );
}

function getRawOutgoingEdges(nodeId, color = null) {
  const node = getNode(nodeId);
  if (!node) {
    return [];
  }
  return node.outgoing
    .map(getEdge)
    .filter((edge) => edge && (!color || edge.color === color));
}

function buildRawPathToNode(nodeId) {
  if (!nodeId || (nodeId !== 'root' && !getNode(nodeId))) {
    return { nodeIds: ['root'], edgeIds: [] };
  }

  const nodeIds = [];
  const edgeIds = [];
  let currentId = nodeId;
  const visited = new Set();
  let guard = 0;

  while (currentId && currentId !== 'root' && guard < 180) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    nodeIds.push(currentId);
    const node = getNode(currentId);
    const incomingEdge = node?.incoming.map(getEdge).find(Boolean);
    if (!incomingEdge) {
      break;
    }
    edgeIds.push(incomingEdge.id);
    currentId = incomingEdge.from;
    guard += 1;
  }

  nodeIds.push('root');
  return {
    nodeIds: nodeIds.reverse(),
    edgeIds: edgeIds.reverse()
  };
}

function setGameGraphPathToNode(nodeId) {
  if (!state.game) {
    return;
  }
  const path = buildRawPathToNode(nodeId);
  state.game.currentPathNodeIds = path.nodeIds;
  state.game.currentPathEdgeIds = path.edgeIds;
}

function appendGameGraphPathEdge(edge) {
  const game = state.game;
  if (!game) {
    return;
  }

  if (!Array.isArray(game.currentPathNodeIds) || !Array.isArray(game.currentPathEdgeIds)) {
    setGameGraphPathToNode(edge.from);
  }

  const lastNodeId = game.currentPathNodeIds[game.currentPathNodeIds.length - 1];
  if (lastNodeId !== edge.from) {
    setGameGraphPathToNode(edge.from);
  }

  if (game.currentPathEdgeIds[game.currentPathEdgeIds.length - 1] !== edge.id) {
    game.currentPathEdgeIds.push(edge.id);
  }
  if (game.currentPathNodeIds[game.currentPathNodeIds.length - 1] !== edge.to) {
    game.currentPathNodeIds.push(edge.to);
  }
}

function isEdgeLegalInGame(edge) {
  if (!state.game || !edge) {
    return false;
  }
  const chess = new Chess(state.game.chess.fen());
  return Boolean(playUciOnChess(chess, edge.uci));
}

function buildLiveBookEdgesForNode(nodeId, color = null, { legalInCurrentGame = false } = {}) {
  const node = getNode(nodeId);
  if (!node) {
    return [];
  }

  const outgoing = getRawOutgoingEdges(nodeId, color).filter(
    (edge) => !legalInCurrentGame || isEdgeLegalInGame(edge)
  );
  if (!outgoing.length) {
    return [];
  }

  if (outgoing.length === 1) {
    const edge = { ...outgoing[0] };
    edge.probability = 1;
    edge.deltaCp = 0;
    edge.pathMeanCp = getBranchValue(edge);
    edge.isBest = true;
    edge.endsInMate = branchEventuallyEndsInMate(edge);
    return [edge];
  }

  const temperature = Math.max(1, state.temperatureCp || PROBABILITY_TEMPERATURE_CP);
  const floorMass = clamp(state.floorMass ?? DISPLAY_DEFAULT_FLOOR_MASS, 0, 0.95);
  const scored = outgoing.map((rawEdge) => {
    const edge = { ...rawEdge };
    const pathMean = getBranchValue(edge);
    return {
      edge,
      pathMean,
      score: scoreForSide(pathMean, node.sideToMove)
    };
  });
  const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
  const bestScore = Math.max(...scored.map((item) => item.score));
  const rawWeights = scored.map((item) =>
    Math.exp(clamp(item.score - average, -800, 800) / temperature)
  );
  const rawTotal = rawWeights.reduce((sum, value) => sum + value, 0);

  scored.forEach((item, index) => {
    const softmax = rawTotal > 0 ? rawWeights[index] / rawTotal : 1 / scored.length;
    item.edge.probability = floorMass / scored.length + (1 - floorMass) * softmax;
    item.edge.deltaCp = Math.round(item.score - average);
    item.edge.pathMeanCp = Math.round(item.pathMean);
    item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
    item.edge.endsInMate = branchEventuallyEndsInMate(item.edge);
  });
  applyMinimumProbabilities(scored);
  normalizeScoredProbabilities(scored);
  return scored.map((item) => item.edge);
}

// Un nœud terminal sur un mat livré par les Blancs (cœur d'un piège d'ouverture).
function isWhiteMateBookNode(node) {
  return Boolean(node?.terminal) && (node?.evaluation?.cpWhite ?? 0) >= MATE_SCORE_CP - 1000;
}

let trapReachCache = null;

// Le sous-arbre issu de ce nœud mène-t-il à un mat des Blancs ? (mémoïsé par livre)
function bookNodeReachesMate(nodeId) {
  if (!trapReachCache) {
    trapReachCache = new Map();
  }
  const visiting = new Set();
  const walk = (id) => {
    if (trapReachCache.has(id)) {
      return trapReachCache.get(id);
    }
    if (visiting.has(id)) {
      return false; // garde anti-cycle (transpositions)
    }
    visiting.add(id);
    const node = getNode(id);
    let reaches = isWhiteMateBookNode(node);
    if (!reaches && node) {
      for (const edgeId of node.outgoing) {
        const edge = getEdge(edgeId);
        if (edge && walk(edge.to)) {
          reaches = true;
          break;
        }
      }
    }
    visiting.delete(id);
    trapReachCache.set(id, reaches);
    return reaches;
  };
  return walk(nodeId);
}

// Y a-t-il au moins une ligne de piège (mat) dans tout le livre ?
function bookHasTrapLines() {
  return (state.data?.nodes ?? []).some((node) => isWhiteMateBookNode(node));
}

function getExpectedWhiteBookEdges() {
  if (!state.game || state.game.phase !== 'opening') {
    return [];
  }
  const edges = getRawOutgoingEdges(state.game.currentNodeId, 'w').filter(isEdgeLegalInGame);
  // Mode Pièges : on guide le joueur vers les coups qui mènent au mat.
  if (state.advRun?.trapsMode && edges.length > 1) {
    const trapEdges = edges.filter((edge) => bookNodeReachesMate(edge.to));
    if (trapEdges.length) {
      return trapEdges;
    }
  }
  return edges;
}

function getExpectedWhiteBookArrows() {
  return getExpectedWhiteBookEdges().map((edge) => ({
    from: edge.uci.slice(0, 2),
    to: edge.uci.slice(2, 4),
    san: edge.san
  }));
}

function getBlackBookEdges() {
  if (!state.game || state.game.phase !== 'opening') {
    return [];
  }
  return buildLiveBookEdgesForNode(state.game.currentNodeId, 'b', { legalInCurrentGame: true });
}

/**
 * Réponses du livre que l'adversaire peut réellement jouer pour le run en cours.
 * En mode apprentissage, on retire les lignes déjà découvertes (« tombées ») afin de
 * pousser le joueur vers du neuf. On ne touche pas aux poids relatifs des autres :
 * comme les lignes tombées ne peuvent plus sortir, les restantes se renormalisent
 * naturellement (elles deviennent plus probables). Quand tout est découvert à ce
 * nœud, on relâche le filtre : tout peut de nouveau tomber.
 */
function getOpponentBookEdgesForRun() {
  const edges = getBlackBookEdges();
  if (!isAdventureLesson() || edges.length <= 1) {
    return edges;
  }
  // Mode Pièges : on oriente l'adversaire vers les lignes qui finissent sur un mat
  // (il « tombe » dans le piège), en alternant les pièges déjà vus.
  if (state.advRun?.trapsMode) {
    const trapEdges = edges.filter((edge) => bookNodeReachesMate(edge.to));
    const pool = trapEdges.length ? trapEdges : edges;
    const freshTraps = pool.filter((edge) => !isAdventureEdgeMastered(edge));
    return freshTraps.length ? freshTraps : pool;
  }
  const fresh = edges.filter((edge) => !isAdventureEdgeMastered(edge));
  return fresh.length ? fresh : edges;
}

function normalizeSanForCompare(san) {
  return String(san ?? '')
    .replace(/[!?]+$/g, '')
    .replace(/[+#]+$/g, '')
    .trim();
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function tryMoveInput(chess, rawInput) {
  const input = String(rawInput ?? '').trim();
  if (!input) {
    return null;
  }

  try {
    return chess.move(input);
  } catch {
    const uci = input.toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      return null;
    }
    try {
      return chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || 'q'
      });
    } catch {
      return null;
    }
  }
}

function findMatchingBookEdge(rawInput) {
  const expected = getExpectedWhiteBookEdges();
  const chess = new Chess(state.game.chess.fen());
  const move = tryMoveInput(chess, rawInput);
  if (!move) {
    return { legal: false, move: null, edge: null };
  }

  const uci = moveToUci(move);
  const san = normalizeSanForCompare(move.san);
  const edge = expected.find(
    (candidate) =>
      candidate.uci === uci || normalizeSanForCompare(candidate.san) === san
  );
  return { legal: true, move, edge: edge ?? null };
}

function getKnownWhiteBookMoveHint(move) {
  if (!state.data || !move) {
    return null;
  }
  const uci = moveToUci(move);
  const san = normalizeSanForCompare(move.san);
  const expectedIds = new Set(getExpectedWhiteBookEdges().map((edge) => edge.id));
  const matches = state.data.edges.filter(
    (edge) =>
      edge.color === 'w' &&
      !expectedIds.has(edge.id) &&
      (edge.uci === uci || normalizeSanForCompare(edge.san) === san)
  );
  if (!matches.length) {
    return null;
  }

  return {
    sources: [...new Set(matches.flatMap((edge) => edge.sources ?? []))],
    count: matches.length
  };
}

function buildOpeningMismatchMessage(move) {
  const expected = getExpectedWhiteBookEdges();
  const expectedText = expected.length
    ? ` Ici, le livre attend ${joinHumanList(expected.map((edge) => edge.san))}.`
    : '';
  const hint = getKnownWhiteBookMoveHint(move);
  if (hint) {
    const sourceText = hint.sources.length
      ? ` (${formatSourceList(hint.sources)})`
      : '';
    return (
      `${move.san} existe dans une autre branche du livre${sourceText}, ` +
      `mais pas depuis cette position.${expectedText} Retour utilisé, rejoue un coup d'ouverture.`
    );
  }

  return `Ce coup sort du livre attendu.${expectedText} Retour utilisé, rejoue un coup d'ouverture.`;
}

function normalizeWeightedCandidates(candidates) {
  if (!candidates.length) {
    return [];
  }

  const total = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.probability ?? 0),
    0
  );
  if (total <= 0) {
    const equal = 1 / candidates.length;
    return candidates.map((candidate) => ({ ...candidate, probability: equal }));
  }

  return candidates.map((candidate) => ({
    ...candidate,
    probability: Math.max(0, candidate.probability ?? 0) / total
  }));
}

function randomUnit() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }
  return Math.random();
}

function pickWeightedCandidate(candidates) {
  const normalized = normalizeWeightedCandidates(candidates);
  if (!normalized.length) {
    return null;
  }

  const weighted = normalized.map((candidate) => ({
    ...candidate,
    lotteryWeight: candidate.probability
  }));

  const total = weighted.reduce((sum, candidate) => sum + candidate.lotteryWeight, 0);
  let roll = randomUnit() * total;
  let selected = weighted[weighted.length - 1];
  for (const candidate of weighted) {
    roll -= candidate.lotteryWeight;
    if (roll <= 0) {
      selected = candidate;
      break;
    }
  }

  return selected;
}

function canOpponentLeaveBookAtPly(ply) {
  return ply >= OPENING_FREE_BREAK_PLY;
}

function buildOpponentBookCandidates(bookEdges, ply = state.game?.chess.history().length ?? 0) {
  if (!bookEdges.length) {
    return [];
  }

  const canLeave = canOpponentLeaveBookAtPly(ply) && !isAdventureLesson();
  const bookMass = canLeave ? 1 - OPENING_FREE_BREAK_PROBABILITY : 1;
  return normalizeWeightedCandidates([
    ...bookEdges.map((edge) => ({
      id: `book:${edge.id}`,
      type: 'book',
      edge: { ...edge, probability: edge.probability * bookMass },
      probability: edge.probability * bookMass
    })),
    ...(canLeave
      ? [
          {
            id: 'free:stockfish',
            type: 'free',
            label: 'Sortie libre',
            probability: OPENING_FREE_BREAK_PROBABILITY
          }
        ]
      : [])
  ]).map((candidate) =>
    candidate.edge
      ? {
          ...candidate,
          edge: { ...candidate.edge, probability: candidate.probability }
        }
      : candidate
  );
}

function applyGameEdge(edge) {
  const beforeFen = state.game.chess.fen();
  const beforeEvalCp = state.game.currentEvalCp;
  const move = playUciOnChess(state.game.chess, edge.uci);
  if (!move) {
    return null;
  }
  state.game.historyView = null; // un nouveau coup ramène toujours à la position en cours
  state.game.lastMove = move;
  state.game.currentNodeId = edge.to;
  appendGameGraphPathEdge(edge);
  const node = getNode(edge.to);
  const evaluation = node?.evaluation ?? {
    cpWhite: state.game.currentEvalCp,
    depth: state.game.currentDepth,
    pv: state.game.currentPv
  };
  state.game.currentEvalCp = evaluation.cpWhite ?? state.game.currentEvalCp;
  state.game.currentPv = evaluation.pv ?? '';
  state.game.currentDepth = evaluation.depth ?? state.game.currentDepth;
  appendGameMove(move, edge.color === 'b' ? 'Livre adverse' : 'Livre blanc');
  recordFreeReviewMove({
    move,
    label: edge.color === 'b' ? 'Livre adverse' : 'Livre blanc',
    phase: 'opening',
    beforeFen,
    beforeEvalCp,
    evaluation,
    status: 'book'
  });
  adventureLightEdge(edge);
  return move;
}

function applyFreeMove(move, label) {
  state.game.historyView = null; // un nouveau coup ramène toujours à la position en cours
  state.game.lastMove = move;
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
  }
  appendGameMove(move, label);
}

function appendGameMove(move, label) {
  const parsedMoveNumber = Number(move.before?.split(/\s+/)[5] ?? 1);
  const moveNumber = Number.isFinite(parsedMoveNumber) ? parsedMoveNumber : 1;
  const prefix = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
  state.game.moveLog.unshift({
    text: `${prefix} ${move.san}`,
    label,
    color: move.color
  });
  state.game.moveLog = state.game.moveLog.slice(0, 8);
}

function getMoveText(move) {
  const parsedMoveNumber = Number(move.before?.split(/\s+/)[5] ?? 1);
  const moveNumber = Number.isFinite(parsedMoveNumber) ? parsedMoveNumber : 1;
  const prefix = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
  return `${prefix} ${move.san}`;
}

function formatEvalDelta(deltaCp) {
  if (!Number.isFinite(deltaCp)) {
    return '-';
  }
  return `${deltaCp >= 0 ? '+' : ''}${(deltaCp / 100).toFixed(2)}`;
}

function buildReviewMoveAnalysis(entry) {
  if (entry.phase === 'start') {
    return entry.analysis;
  }

  const delta = entry.afterEvalCp - entry.beforeEvalCp;
  const evalText = `Éval ${formatEval(entry.beforeEvalCp)} → ${formatEval(entry.afterEvalCp)} (${formatEvalDelta(delta)}).`;
  let verdict;
  if (entry.phase === 'opening') {
    verdict =
      entry.color === 'w'
        ? "Coup du livre blanc: la partie reste dans l'arbre d'ouverture attendu."
        : "Réponse du livre adverse: l'adversaire suit encore une branche préparée.";
  } else if (entry.phase === 'engine-line') {
    verdict =
      entry.color === 'w'
        ? 'Suite Stockfish côté blanc: la ligne forcée montre pourquoi la position reste difficile à sauver.'
        : 'Suite Stockfish côté noir: la punition se précise dans la variante calculée.';
  } else if (entry.color === 'w') {
    if (delta >= 45) {
      verdict = 'Très bon coup libre: tu améliores nettement la position.';
    } else if (delta >= 12) {
      verdict = 'Bon coup libre: la position progresse sans prendre de risque majeur.';
    } else if (delta > -15) {
      verdict = 'Coup stable: la position reste dans la même zone.';
    } else if (delta > -55) {
      verdict = 'Petite concession: la position baisse, mais reste encore jouable.';
    } else {
      verdict = 'Coup coûteux: Stockfish voit une chute claire de la position blanche.';
    }
  } else if (delta <= -45) {
    verdict = 'Réponse noire forte: Stockfish creuse le déficit côté blanc.';
  } else if (delta <= -12) {
    verdict = 'Réponse noire utile: la pression augmente contre les Blancs.';
  } else if (delta < 15) {
    verdict = 'Réponse noire neutre: l’équilibre d’évaluation bouge peu.';
  } else {
    verdict = 'Stockfish relâche un peu: l’évaluation remonte pour les Blancs.';
  }

  const thresholdText =
    entry.phase === 'free' && entry.color === 'w' && entry.afterEvalCp < state.survivalLimitCp
      ? ` Le coup passe sous le seuil ${formatEval(state.survivalLimitCp)}.`
      : '';
  const statusText = entry.status === 'returned'
    ? ' Retour consommé: cette tentative a été annulée sur l’échiquier de partie.'
    : entry.status === 'losing'
      ? ' Coup de défaite immédiate: le seuil de survie est franchi.'
      : entry.status === 'evaluating'
        ? ' Évaluation détaillée en cours: le score affiché est provisoire.'
      : '';
  const pvText =
    entry.phase !== 'opening' && entry.pv ? ` Ligne Stockfish: ${entry.pv}.` : '';
  const humanEval =
    entry.phase !== 'opening' && Math.abs(entry.afterEvalCp) >= 80
      ? buildHumanEval(entry.afterFen, {
          cpWhite: entry.afterEvalCp,
          pv: entry.pv,
          pvUci: entry.pvUci
        })
      : null;
  const adviceText =
    humanEval && (entry.status === 'losing' || entry.phase === 'engine-line')
      ? ` ${humanEval.advice}`
      : '';
  const humanEvalText = humanEval
    ? ` Lecture humaine: ${humanEval.sentence}${adviceText}`
    : '';
  return `${verdict} ${evalText}${thresholdText}${statusText}${humanEvalText}${pvText}`;
}

function ensureReviewTree(game = state.game) {
  if (!game?.freeReviewMoves?.length) {
    return;
  }

  if (!game.freeReview.preferredChildByParent) {
    game.freeReview.preferredChildByParent = {};
  }

  game.freeReviewMoves.forEach((entry, index) => {
    entry.index = index;
    if (index === 0) {
      entry.parentIndex = null;
      entry.branchLabel = entry.branchLabel || 'Partie';
      return;
    }

    if (
      !Number.isFinite(entry.parentIndex) ||
      entry.parentIndex < 0 ||
      entry.parentIndex >= index
    ) {
      entry.parentIndex = index - 1;
    }
  });
}

function getReviewChildren(parentIndex) {
  const game = state.game;
  if (!game?.freeReviewMoves?.length || !Number.isFinite(parentIndex)) {
    return [];
  }
  ensureReviewTree(game);
  return game.freeReviewMoves.filter((entry) => entry.parentIndex === parentIndex);
}

function getReviewParent(entry) {
  const game = state.game;
  if (!game || !entry || !Number.isFinite(entry.parentIndex)) {
    return null;
  }
  ensureReviewTree(game);
  return game.freeReviewMoves[entry.parentIndex] ?? null;
}

function getPreferredReviewChild(entry) {
  const game = state.game;
  if (!game || !entry) {
    return null;
  }

  const children = getReviewChildren(entry.index);
  if (!children.length) {
    return null;
  }

  const preferredIndex = game.freeReview.preferredChildByParent?.[entry.index];
  return children.find((child) => child.index === preferredIndex) ?? children[0];
}

function rememberReviewChild(entry) {
  const game = state.game;
  if (!game || !entry || !Number.isFinite(entry.parentIndex)) {
    return;
  }

  if (!game.freeReview.preferredChildByParent) {
    game.freeReview.preferredChildByParent = {};
  }
  game.freeReview.preferredChildByParent[entry.parentIndex] = entry.index;
}

function getReviewPath(entry) {
  const game = state.game;
  if (!game || !entry) {
    return [];
  }

  ensureReviewTree(game);
  const path = [];
  const seen = new Set();
  let current = entry;
  while (current && !seen.has(current.index)) {
    path.unshift(current);
    seen.add(current.index);
    current = getReviewParent(current);
  }
  return path;
}

function inferReviewBranchLabel(parentIndex) {
  const siblings = getReviewChildren(parentIndex);
  if (!siblings.length) {
    return '';
  }
  return `Variante ${siblings.length + 1}`;
}

function recordFreeReviewMove({
  move,
  label,
  beforeFen,
  beforeEvalCp,
  evaluation,
  phase = 'free',
  status = 'played',
  parentIndex = null,
  branchLabel = ''
}) {
  const game = state.game;
  if (!game || !move || !Number.isFinite(beforeEvalCp) || !evaluation) {
    return null;
  }

  ensureReviewTree(game);
  const safeParentIndex = Number.isFinite(parentIndex)
    ? clamp(Math.round(parentIndex), 0, Math.max(0, game.freeReviewMoves.length - 1))
    : game.freeReviewMoves.length
      ? game.freeReviewMoves.length - 1
      : null;
  const entry = {
    index: game.freeReviewMoves.length,
    text: getMoveText(move),
    san: move.san,
    uci: moveToUci(move),
    color: move.color,
    label,
    phase,
    beforeFen,
    afterFen: move.after ?? game.chess.fen(),
    from: move.from,
    to: move.to,
    beforeEvalCp,
    afterEvalCp: evaluation.cpWhite,
    parentIndex: safeParentIndex,
    branchLabel: branchLabel || inferReviewBranchLabel(safeParentIndex),
    depth: evaluation.depth,
    pv: evaluation.pv,
    pvUci: evaluation.pvUci ?? [],
    status
  };
  entry.analysis = buildReviewMoveAnalysis(entry);
  game.freeReviewMoves.push(entry);
  rememberReviewChild(entry);
  if (game.status !== 'playing') {
    game.freeReview.index = entry.index;
  }
  return entry;
}

function appendDefeatLineReview(fen, evaluation) {
  const game = state.game;
  if (!game || game.defeatLineRecorded || !evaluation?.pvUci?.length) {
    return;
  }

  game.defeatLineRecorded = true;
  const chess = new Chess(fen);
  let beforeEvalCp = evaluation.cpWhite;
  const addedEntries = [];

  for (const uci of evaluation.pvUci.slice(0, 7)) {
    const beforeFen = chess.fen();
    const move = playUciOnChess(chess, uci);
    if (!move) {
      break;
    }

    const terminal = terminalEvaluation(chess.fen());
    const provisionalEvaluation = terminal ?? {
      cpWhite: beforeEvalCp,
      depth: evaluation.depth,
      pv: '',
      pvUci: [],
      source: 'stockfish-line'
    };
    const entry = recordFreeReviewMove({
      move,
      label: 'Suite Stockfish',
      phase: 'engine-line',
      beforeFen,
      beforeEvalCp,
      evaluation: provisionalEvaluation,
      status: terminal ? 'engine-line' : 'evaluating'
    });

    if (entry) {
      entry.analysis = buildReviewMoveAnalysis(entry);
      addedEntries.push(entry);
      beforeEvalCp = entry.afterEvalCp;
    }
  }

  if (addedEntries.length) {
    hydrateDefeatLineEvaluations(game, addedEntries, evaluation.cpWhite);
  }
}

async function hydrateDefeatLineEvaluations(game, entries, initialCpWhite) {
  try {
    const evaluator = await ensureStockfishReady(false);
    let beforeEvalCp = initialCpWhite;
    for (const entry of entries) {
      if (state.game !== game || game.status === 'playing') {
        return;
      }
      entry.beforeEvalCp = beforeEvalCp;
      const evaluation = await evaluator.evaluate(entry.afterFen);
      entry.afterEvalCp = evaluation.cpWhite;
      entry.depth = evaluation.depth;
      entry.pv = evaluation.pv;
      entry.pvUci = evaluation.pvUci;
      entry.status = 'engine-line';
      entry.analysis = buildReviewMoveAnalysis(entry);
      beforeEvalCp = entry.afterEvalCp;
      if (game.freeReview.active) {
        renderGameDetails();
      } else {
        renderFreeReviewPanel();
      }
    }
  } catch (error) {
    for (const entry of entries) {
      if (entry.status === 'evaluating') {
        entry.status = 'engine-line';
        entry.analysis = `${entry.analysis} Évaluation détaillée indisponible: ${error.message}`;
      }
    }
    if (state.game === game && game.status !== 'playing') {
      renderFreeReviewPanel();
    }
  }
}

function hasPostGameFreeReview() {
  return Boolean(
    state.game &&
      state.game.status !== 'playing' &&
      state.game.freeReviewMoves.length
  );
}

function isPostGameReviewPlayable() {
  const game = state.game;
  return Boolean(
    game &&
      game.status !== 'playing' &&
      game.freeReview?.active &&
      getActiveFreeReviewEntry() &&
      !game.locked &&
      !game.cinematic?.active
  );
}

function getActiveFreeReviewEntry() {
  const game = state.game;
  if (!game?.freeReview?.active || !game.freeReviewMoves.length) {
    return null;
  }
  ensureReviewTree(game);
  const index = clamp(game.freeReview.index, 0, game.freeReviewMoves.length - 1);
  return game.freeReviewMoves[index] ?? null;
}

function setFreeReviewIndex(index) {
  const game = state.game;
  if (!game?.freeReviewMoves.length) {
    return;
  }
  clearGameCinematic();
  ensureReviewTree(game);
  game.freeReview.active = true;
  game.freeReview.index = clamp(index, 0, game.freeReviewMoves.length - 1);
  game.selectedSquare = null;
  rememberReviewChild(game.freeReviewMoves[game.freeReview.index]);
  renderGameDetails();
}

function stopFreeReview() {
  if (!state.game) {
    return;
  }
  state.game.freeReview.active = false;
  renderGameDetails();
}

async function launchPostGameFreeAnalysis() {
  const game = state.game;
  if (!game || game.status === 'playing' || !game.freeReviewMoves.length) {
    return;
  }

  clearGameCinematic();
  const originEntry =
    getActiveFreeReviewEntry() ?? game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const chess = new Chess(originEntry.afterFen);
  const originEntries = game.freeReviewMoves
    .slice(0, originEntry.index + 1)
    .map((entry, index) => ({ ...entry, index }));
  const originNode =
    state.nodesByFen.get(chess.fen()) ??
    state.nodesByPositionKey.get(fenPositionKey(chess.fen()));

  state.playMode = 'exploration';
  syncPlayModeButtons();
  game.mode = 'exploration';
  game.status = 'playing';
  game.phase = 'free';
  game.locked = false;
  game.chess = chess;
  game.currentNodeId = originNode?.id ?? game.currentNodeId ?? 'root';
  setGameGraphPathToNode(game.currentNodeId);
  game.objective = getLevelObjective(FIRST_LEVEL_NUMBER);
  game.freeRemaining = Number.POSITIVE_INFINITY;
  game.freeRoundPending = false;
  game.currentEvalCp = originEntry.afterEvalCp;
  game.currentPv = originEntry.pv ?? '';
  game.currentDepth = originEntry.depth ?? 0;
  game.lastMove = originEntry.uci
    ? {
        san: originEntry.san,
        from: originEntry.from,
        to: originEntry.to,
        color: originEntry.color,
        before: originEntry.beforeFen,
        after: originEntry.afterFen,
        promotion: originEntry.uci.length > 4 ? originEntry.uci.slice(4) : undefined
      }
    : null;
  game.freeReviewMoves = originEntries;
  game.freeReview.active = false;
  game.freeReview.index = -1;
  game.failureFen = null;
  game.failureEvaluation = null;
  game.defeatComment = '';
  game.expectedOpeningArrows = [];
  game.defeatLineRecorded = false;
  game.moveLog = originEntries
    .filter((entry) => entry.phase !== 'start')
    .slice(-8)
    .reverse()
    .map((entry) => ({
      text: entry.text,
      label: entry.label,
      color: entry.color
    }));
  game.message = `Analyse libre depuis ${originEntry.text}: joue n'importe quel coup légal, Stockfish répondra sans pénalité.`;

  renderGraph();
  renderGameDetails();

  if (game.chess.turn() === 'b') {
    setGameLocked(true);
    try {
      await advanceOpponentTurn();
    } catch (error) {
      game.message = `Analyse libre lancée, mais Stockfish n'a pas pu répondre: ${error.message}`;
    } finally {
      setGameLocked(false);
      renderGraph();
      renderGameDetails();
    }
  }
}

function clearGameCinematic() {
  if (state.game?.cinematicTimer) {
    clearInterval(state.game.cinematicTimer);
  }
  if (state.game) {
    state.game.cinematicTimer = null;
    state.game.cinematic = null;
  }
}

function startNewGame(level = state.campaignLevel) {
  clearGameCinematic();
  setEngineThinking(false);
  document.body.classList.remove('is-game-lost');
  if (state.playMode === 'challenge') {
    state.campaignLevel = Math.max(FIRST_LEVEL_NUMBER, level);
  }
  state.game = createInitialGameState(state.campaignLevel);
  state.highlightedEdges.clear();
  state.highlightedNodes = new Set(['root']);
  state.selectedNodeId = 'root';
  state.selectedSegment = null;
  state.segmentStepIndex = 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent =
    state.playMode === 'exploration'
      ? 'Exploration: livre italien actif'
      : `Niveau ${state.game.level}: ${formatLevelObjective(state.game.level)}`;
  renderGraph();
  ensureStockfishReady(false).catch((error) => {
    if (!state.game || state.game.status !== 'playing') {
      return;
    }
    state.game.message = `Stockfish indisponible pour l'instant: ${error.message}`;
    renderGamePanel();
  });
}

function handleNewGameAction() {
  const game = state.game;
  if (
    game?.mode === 'challenge' &&
    game.status === 'won' &&
    !game.finalVictory &&
    Number.isFinite(game.nextLevel)
  ) {
    startNewGame(game.nextLevel);
    return;
  }

  if (game?.mode === 'challenge' && game.status === 'won' && game.finalVictory) {
    state.campaignLevel = FIRST_LEVEL_NUMBER;
  }
  startNewGame();
}

function finishCampaignByMate(message = null) {
  const game = state.game;
  if (!game) {
    return;
  }
  game.finalVictory = true;
  game.nextLevel = null;
  finishGame(
    'won',
    message ?? `Échec et mat: campagne terminée au niveau ${game.level}.`
  );
}

function finishSurvivalLevel() {
  const game = state.game;
  if (!game) {
    return;
  }
  const nextLevel = game.level + 1;
  game.nextLevel = nextLevel;
  finishGame(
    'won',
    `Niveau ${game.level} validé: tu as survécu à ${game.objective.target} coups complets libres. Prochain objectif: ${formatLevelObjective(nextLevel)}.`
  );
}

// Libellé court du type de nulle (pat, répétition, matériel insuffisant…) pour les messages.
function drawKindLabel(chess) {
  return chess?.isStalemate?.() ? 'Pat' : 'Partie nulle';
}

// Nulle (le plus souvent un pat) : aucun camp n'est maté. L'objectif est de mater,
// donc une nulle n'est PAS une victoire — on termine en demandant de refaire la partie.
function finishGameByStalemate(chess) {
  finishGame(
    'lost',
    `${drawKindLabel(chess)} : aucun camp n'est maté. Tu n'as pas réussi le mat, il faut refaire la partie.`
  );
}

function finishTerminalPosition(message = 'La partie est terminée.') {
  const game = state.game;
  if (!game) {
    return;
  }
  if (game.chess.isCheckmate()) {
    if (game.chess.turn() === 'b') {
      finishCampaignByMate(`Échec et mat: campagne terminée au niveau ${game.level}.`);
    } else {
      finishGame('lost', message);
    }
    return;
  }
  // Aucun coup légal sans être en échec = pat (nulle) : ce n'est pas un mat, donc pas une victoire.
  if (game.chess.isDraw()) {
    finishGameByStalemate(game.chess);
    return;
  }
  finishGame('won', message);
}

async function submitReviewVariationMove(rawInput = elements.moveInput.value) {
  const game = state.game;
  const parentEntry = getActiveFreeReviewEntry();
  if (!game || !parentEntry) {
    return;
  }

  const input = String(rawInput ?? '').trim();
  if (!input) {
    game.message = 'Entre un coup légal pour créer une variante.';
    renderGamePanel();
    return;
  }

  const chess = new Chess(parentEntry.afterFen);
  const beforeFen = chess.fen();
  const move = tryMoveInput(chess, input);
  if (!move) {
    game.message = `Coup illégal depuis ${parentEntry.text}.`;
    renderGameDetails();
    return;
  }

  game.selectedSquare = null;
  setGameLocked(true);
  try {
    const evaluator = await ensureStockfishReady(false);
    const evaluation = await evaluator.evaluate(chess.fen());
    const entry = recordFreeReviewMove({
      move,
      label: 'Analyse variante',
      phase: 'analysis',
      beforeFen,
      beforeEvalCp: parentEntry.afterEvalCp,
      evaluation,
      parentIndex: parentEntry.index
    });

    if (entry) {
      game.freeReview.active = true;
      game.freeReview.index = entry.index;
      game.message = `Variante créée depuis ${parentEntry.text}: ${move.san}.`;
      renderGameDetails();
    }
  } catch (error) {
    game.message = `Impossible de créer la variante: ${error.message}`;
    renderGameDetails();
  } finally {
    setGameLocked(false);
    renderGameDetails();
  }
}

async function submitHumanMove(rawInput = elements.moveInput.value) {
  const game = state.game;
  if (!game || game.locked) {
    return;
  }

  if (isPostGameReviewPlayable()) {
    await submitReviewVariationMove(rawInput);
    elements.moveInput.value = '';
    return;
  }

  if (game.status !== 'playing') {
    return;
  }

  if (game.chess.turn() !== 'w') {
    game.message = 'Attends la réponse noire.';
    renderGamePanel();
    return;
  }

  const input = String(rawInput ?? '').trim();
  if (!input) {
    game.message = 'Entre un coup blanc en SAN ou en UCI.';
    renderGamePanel();
    return;
  }

  game.selectedSquare = null;
  setGameLocked(true);
  try {
    if (game.phase === 'opening' && getExpectedWhiteBookEdges().length) {
      await submitOpeningMove(input);
    } else {
      if (game.phase === 'opening') {
        enterFreePhase(
          isExplorationMode()
            ? "Le livre blanc est terminé: l'exploration continue en libre."
            : 'Le livre blanc est terminé: survie libre.'
        );
      }
      await submitFreeMove(input);
    }
  } finally {
    setGameLocked(false);
    elements.moveInput.value = '';
    renderGraph();
  }
}

async function submitOpeningMove(input) {
  const result = findMatchingBookEdge(input);
  if (!result.legal) {
    state.game.message = 'Coup illégal ou illisible. Essaie en SAN (Nf3) ou UCI (g1f3).';
    return;
  }

  if (!result.edge) {
    if (isExplorationMode()) {
      state.game.expectedOpeningArrows = [];
      await submitExplorationMove(input, "Sortie du livre explorée: l'adversaire passe au calcul libre.");
      return;
    }
    state.game.expectedOpeningArrows = getExpectedWhiteBookArrows();
    if (state.screen === 'adventure') {
      adventureOnWrongBook();
    }
    consumeLife(buildOpeningMismatchMessage(result.move));
    return;
  }

  state.game.expectedOpeningArrows = [];
  applyGameEdge(result.edge);
  if (state.screen === 'adventure') {
    adventureOnCorrectWhiteBook(result.edge);
  }
  if (!isExplorationMode() && state.game.chess.isCheckmate()) {
    // Mat dans le livre : en leçon/pièges c'est un succès de leçon, sinon fin de campagne.
    if (isAdventureLesson()) {
      adventureOnTrapSolved();
    } else {
      finishCampaignByMate();
    }
    return;
  }
  state.game.message = isExplorationMode()
    ? `Ligne suivie: ${result.edge.san}.`
    : `Bien: ${result.edge.san} reste dans l'ouverture.`;
  // Affiche (et anime) le coup blanc avant que l'adversaire ne réponde.
  renderGameDetails();
  await advanceOpponentTurn();
}

async function submitExplorationMove(input, message) {
  const move = tryMoveInput(state.game.chess, input);
  if (!move) {
    state.game.message = 'Coup illégal ou illisible.';
    return;
  }

  applyFreeMove(move, 'Exploration blanche');
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
  }
  enterFreePhase(message);
  if (state.game.chess.turn() === 'b') {
    await advanceOpponentTurn();
  }
}

async function submitFreeMove(input) {
  if (!state.game || state.game.status !== 'playing') {
    return;
  }
  const beforeFen = state.game.chess.fen();
  const beforeEvalCp = state.game.currentEvalCp;
  const move = tryMoveInput(state.game.chess, input);
  if (!move) {
    state.game.message = 'Coup libre illégal ou illisible.';
    return;
  }

  applyFreeMove(move, isExplorationMode() ? 'Exploration blanche' : 'Survie blanche');
  state.game.message = 'Stockfish évalue ton coup libre...';
  renderGamePanel();
  renderGameDetails();
  const evaluator = await ensureStockfishReady();
  const evaluation = await evaluator.evaluate(state.game.chess.fen());
  state.game.currentEvalCp = evaluation.cpWhite;
  state.game.currentPv = evaluation.pv;
  state.game.currentDepth = evaluation.depth;

  const deficitLimitCp = isAdventureRun() ? advRunDeficitThresholdCp() : state.survivalLimitCp;
  if (!isExplorationMode() && evaluation.cpWhite < deficitLimitCp) {
    recordFreeReviewMove({
      move,
      label: 'Survie blanche',
      beforeFen,
      beforeEvalCp,
      evaluation,
      status: 'losing'
    });
    state.game.failureFen = state.game.chess.fen();
    state.game.failureEvaluation = evaluation;
    finishGame(
      'lost',
      isAdventureRun()
        ? `Gaffe fatale : la position s'effondre à ${formatEval(evaluation.cpWhite)} (seuil ${formatEval(deficitLimitCp)}).`
        : `Erreur en survie: la position tombe à ${formatEval(evaluation.cpWhite)}.`,
      state.game.chess.fen(),
      evaluation
    );
    return;
  }

  recordFreeReviewMove({
    move,
    label: isExplorationMode() ? 'Exploration blanche' : 'Survie blanche',
    beforeFen,
    beforeEvalCp,
    evaluation
  });

  if (!isExplorationMode() && state.game.chess.isCheckmate()) {
    finishCampaignByMate(`Échec et mat: campagne terminée au niveau ${state.game.level}.`);
    return;
  }

  // Pat (ou nulle) après ton coup : tu n'as pas maté → il faut refaire la partie.
  if (!isExplorationMode() && state.game.chess.isDraw()) {
    finishGameByStalemate(state.game.chess);
    return;
  }

  // Avantage décisif (> +2) : on enclenche la conversion cinématique vers le mat,
  // puis on rendra la main au joueur pour conclure.
  if (
    !isExplorationMode() &&
    state.game.phase === 'free' &&
    !state.game.victoryConverted &&
    evaluation.cpWhite >= VICTORY_CINEMATIC_TRIGGER_CP &&
    !isMateScore(evaluation.cpWhite)
  ) {
    await runVictoryConversion();
    return;
  }

  state.game.message = isExplorationMode()
    ? `Position explorée à ${formatEval(evaluation.cpWhite)}. Stockfish répond.`
    : `Coup accepté (${formatEval(evaluation.cpWhite)}). Stockfish répond.`;
  state.game.freeRoundPending = !isExplorationMode();
  renderGamePanel();
  await advanceOpponentTurn();
}

async function advanceOpponentTurn() {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  if (game.phase === 'opening') {
    const blackBookEdges = getOpponentBookEdgesForRun();
    const decision = blackBookEdges.length
      ? pickWeightedCandidate(
          buildOpponentBookCandidates(blackBookEdges)
        )
      : null;

    if (decision?.type === 'book') {
      const edge = decision.edge;
      // Coup de livre : petite réflexion (pas trop) avant de répondre, le temps aussi
      // que l'animation du coup blanc se termine.
      game.message = 'Les Noirs consultent le livre…';
      renderGamePanel();
      await pause(randomThinkMs(350, 850));
      if (state.game !== game || game.status !== 'playing') {
        return;
      }
      applyGameEdge(edge);
      game.openingBlackMoves += 1;
      game.message = `Les Noirs suivent le livre: ${edge.san} (${formatPercent(edge.probability)}).`;
      if (!getExpectedWhiteBookEdges().length) {
        enterFreePhase(
          isExplorationMode()
            ? "Fin de branche: l'exploration continue en coups libres."
            : 'Tu as tenu le livre: début de la survie libre.'
        );
      }
      return;
    }

    enterFreePhase(
      decision?.type === 'free'
        ? "Les Noirs cassent le livre et passent aux coups Stockfish."
        : "La branche d'ouverture est terminée: les Noirs passent à Stockfish."
    );
  }

  await playStockfishBlackMove();
}

async function playStockfishBlackMove() {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  const profile = getStockfishLevelProfile();
  const stockfishLabel = formatStockfishLevel(profile);
  game.message = `Stockfish ${stockfishLabel} calcule la réponse noire...`;
  setEngineThinking(true);
  renderGamePanel();
  renderGameDetails();
  // Réflexion perçue, tirée au sort entre 1 et 5 s (en plus du vrai calcul s'il est plus court).
  const thinkStart = performance.now();
  const thinkTarget = randomThinkMs(1000, 5000);
  const evaluator = await ensureStockfishReady(false);
  const beforeFen = game.chess.fen();
  const beforeEvaluation = await evaluator.evaluate(beforeFen);
  const moveSearch = await evaluator.pickMove(beforeFen, profile);
  const beforeEvalCp = beforeEvaluation.cpWhite;
  if (!moveSearch.bestMove) {
    finishTerminalPosition('La partie est terminée.');
    return;
  }

  // Complète le temps de calcul réel pour que la réponse arrive après la durée de réflexion.
  await pause(thinkTarget - (performance.now() - thinkStart));
  setEngineThinking(false);
  if (state.game !== game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  const move = playUciOnChess(game.chess, moveSearch.bestMove);
  if (!move) {
    finishGame('won', 'Stockfish ne trouve aucun coup légal.');
    return;
  }

  applyFreeMove(move, `Stockfish ${stockfishLabel}`);
  const afterEvaluation = await evaluator.evaluate(game.chess.fen());
  game.currentEvalCp = afterEvaluation.cpWhite;
  game.currentPv = afterEvaluation.pv;
  game.currentDepth = afterEvaluation.depth;
  recordFreeReviewMove({
    move,
    label: `Stockfish ${stockfishLabel}`,
    beforeFen,
    beforeEvalCp,
    evaluation: afterEvaluation
  });
  if (!isExplorationMode() && game.freeRoundPending && Number.isFinite(game.freeRemaining)) {
    game.freeRemaining = Math.max(0, game.freeRemaining - 1);
  }
  game.freeRoundPending = false;

  if (!isExplorationMode() && game.chess.isCheckmate()) {
    finishGame('lost', 'Échec et mat: la survie s’arrête ici.', game.chess.fen(), afterEvaluation);
    return;
  }

  // Pat infligé par Stockfish : la partie est nulle, l'objectif de mat échoue → refaire la partie.
  if (!isExplorationMode() && game.chess.isDraw()) {
    finishGameByStalemate(game.chess);
    return;
  }

  const replyDeficitLimitCp = isAdventureRun() ? advRunDeficitThresholdCp() : state.survivalLimitCp;
  if (!isExplorationMode() && afterEvaluation.cpWhite < replyDeficitLimitCp) {
    finishGame(
      'lost',
      isAdventureRun()
        ? `Stockfish punit la gaffe : la position chute à ${formatEval(afterEvaluation.cpWhite)} (seuil ${formatEval(replyDeficitLimitCp)}).`
        : `La réponse Stockfish punit l'erreur: la position tombe à ${formatEval(afterEvaluation.cpWhite)}.`,
      game.chess.fen(),
      afterEvaluation
    );
    return;
  }

  if (!isExplorationMode() && !isMateObjective(game) && game.freeRemaining <= 0) {
    finishSurvivalLevel();
    return;
  }

  game.message = isExplorationMode()
    ? `Réponse Stockfish ${stockfishLabel}: ${move.san}. Exploration libre, seuil indicatif: ${formatEval(state.survivalLimitCp)}.`
    : isAdventureRun()
    ? `Réponse Stockfish ${stockfishLabel}: ${move.san}. Cherche le mat sans passer sous ${formatEval(replyDeficitLimitCp)}.`
    : isMateObjective(game)
    ? `Réponse Stockfish ${stockfishLabel}: ${move.san}. Objectif final: trouve le mat sans passer sous ${formatEval(state.survivalLimitCp)}.`
    : `Réponse Stockfish ${stockfishLabel}: ${move.san}. Il reste ${game.freeRemaining} coups complets à tenir.`;
}

function enterFreePhase(message) {
  state.game.phase = 'free';
  if (isAdventureRun() && state.advRun?.kind === 'boss') {
    state.game.message = `Tu as tenu le livre. À l'attaque : cherche le mat sans laisser l'éval passer sous ${formatEval(advRunDeficitThresholdCp())}.`;
  } else if (isExplorationMode()) {
    state.game.message = `${message} Le seuil ${formatEval(state.survivalLimitCp)} reste affiché comme repère, sans pénalité.`;
  } else {
    state.game.message = `${message} Ne laisse pas l'évaluation passer sous ${formatEval(state.survivalLimitCp)}.`;
  }
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
    setGameGraphPathToNode(node.id);
  }
  if (state.screen === 'adventure' && state.advRun?.kind === 'lesson') {
    adventureOnLessonReachedFree();
  }
}

function consumeLife(message) {
  const game = state.game;
  if (isExplorationMode()) {
    game.message = `${message} Aucune vie consommée en exploration.`;
    return;
  }
  game.lives = Math.max(0, game.lives - 1);
  if (game.lives <= 0) {
    finishGame('lost', `${message} Plus aucun retour disponible.`, game.failureFen, game.failureEvaluation);
    return;
  }
  game.message = `${message} Vies restantes: ${game.lives}.`;
}

function finishGame(result, message, failureFen = null, failureEvaluation = null) {
  const game = state.game;
  if (!game) {
    return;
  }
  setEngineThinking(false);
  document.body.classList.toggle('is-game-lost', result === 'lost');
  game.status = result;
  game.locked = false;
  game.victoryCinematic = false;
  game.defeatComment =
    result === 'lost' && failureFen && failureEvaluation
      ? buildDefeatComment(failureFen, failureEvaluation)
      : '';
  game.message = game.defeatComment ? `${message} ${game.defeatComment}` : message;
  if (result === 'lost' && game.phase === 'opening' && game.expectedOpeningArrows.length) {
    game.message = `${game.message} Les flèches indiquent les coups d'ouverture attendus.`;
  }
  const startsCinematic = result === 'lost' && failureFen && failureEvaluation?.pvUci?.length;
  if (startsCinematic) {
    appendDefeatLineReview(failureFen, failureEvaluation);
  }
  if (game.freeReviewMoves.length) {
    game.freeReview.index = game.freeReviewMoves.length - 1;
    game.freeReview.active = !startsCinematic;
  }
  if (startsCinematic) {
    startDeficitCinematic(failureFen, failureEvaluation, game.defeatComment);
  }
  if (state.screen === 'adventure') {
    adventureOnGameFinished(result);
  }
}

function startDeficitCinematic(fen, evaluation, defeatComment = '') {
  clearGameCinematic();
  const chess = new Chess(fen);
  state.game.cinematic = {
    active: true,
    chess,
    moves: evaluation.pvUci.slice(0, 7),
    index: 0,
    lastMove: null
  };
  state.game.message = defeatComment
    ? `${defeatComment} La ligne Stockfish défile: ${evaluation.pv || 'suite forcée'}.`
    : `Déficit à ${formatEval(evaluation.cpWhite)}. La ligne Stockfish défile: ${evaluation.pv || 'suite forcée'}.`;
  state.game.cinematicTimer = setInterval(() => {
    const cinematic = state.game?.cinematic;
    if (!cinematic || cinematic.index >= cinematic.moves.length) {
      clearGameCinematic();
      if (state.game?.freeReviewMoves.length) {
        state.game.freeReview.active = true;
        state.game.freeReview.index = state.game.freeReviewMoves.length - 1;
      }
      renderGameDetails();
      renderGamePanel();
      return;
    }
    const move = playUciOnChess(cinematic.chess, cinematic.moves[cinematic.index]);
    cinematic.index += 1;
    cinematic.lastMove = move;
    renderGameDetails();
  }, 900);
}

function setGameLocked(isLocked) {
  if (!state.game) {
    return;
  }
  state.game.locked = isLocked;
  renderGamePanel();
}

// Un score Stockfish encode un mat forcé quand il frôle MATE_SCORE_CP.
function isMateScore(cpWhite) {
  return Number.isFinite(cpWhite) && Math.abs(cpWhite) >= MATE_SCORE_CP - 1000;
}

// Reconstruit le « mat en X » à partir du score encodé (cf. parseWhiteCentipawn).
function mateMovesFromCp(cpWhite) {
  const penalty = MATE_SCORE_CP - Math.abs(cpWhite);
  return Math.max(1, Math.round(penalty / 12));
}

/**
 * Conversion « cinématique » de la phase libre. Dès que les Blancs dépassent +2,
 * on enchaîne automatiquement meilleurs coups blancs + défense Stockfish, en animant
 * chaque coup, jusqu'à détecter un mat forcé pour les Blancs ; on rend alors la main
 * au joueur pour qu'il porte l'estocade. Garde-fous : on s'arrête si l'avantage
 * retombe, si la partie se termine, ou après un nombre maximal de demi-coups.
 */
async function runVictoryConversion() {
  const game = state.game;
  if (!game) {
    return;
  }
  game.victoryConverted = true;
  game.victoryCinematic = true;
  setGameLocked(true);
  game.message = 'Position gagnante : conversion automatique vers le mat…';
  renderGamePanel();
  renderGameDetails();

  const evaluator = await ensureStockfishReady(false);
  const profile = getStockfishLevelProfile();
  let mateFound = null;

  try {
  for (let ply = 0; ply < VICTORY_CINEMATIC_MAX_PLIES; ply++) {
    if (state.game !== game || game.status !== 'playing') {
      return; // partie changée ou terminée ailleurs
    }

    if (game.chess.turn() === 'w') {
      // Trait aux Blancs (le joueur) : un mat est-il déjà forcé ?
      const evalNow = await evaluator.evaluate(game.chess.fen(), VICTORY_CINEMATIC_DEPTH);
      if (state.game !== game || game.status !== 'playing') {
        return;
      }
      game.currentEvalCp = evalNow.cpWhite;
      game.currentPv = evalNow.pv;
      game.currentDepth = evalNow.depth;
      if (isMateScore(evalNow.cpWhite) && evalNow.cpWhite > 0) {
        mateFound = evalNow;
        break; // mat détecté → on rend la main au joueur
      }
      if (evalNow.cpWhite < VICTORY_CINEMATIC_KEEP_CP) {
        break; // l'avantage s'est évaporé → on rend la main
      }
      if (!evalNow.bestMove) {
        break;
      }
      const wmove = playUciOnChess(game.chess, evalNow.bestMove);
      if (!wmove) {
        break;
      }
      applyFreeMove(wmove, 'Conversion auto');
      game.message = `Conversion automatique… (${formatEval(evalNow.cpWhite)})`;
      renderGamePanel();
      renderGameDetails();
      if (game.chess.isCheckmate()) {
        finishCampaignByMate('Mat ! La conversion automatique a conclu la partie.');
        return;
      }
      if (game.chess.isDraw()) {
        finishGameByStalemate(game.chess);
        return;
      }
      await pause(VICTORY_CINEMATIC_STEP_MS);
    } else {
      // Trait aux Noirs : défense de Stockfish au niveau du boss.
      const search = await evaluator.pickMove(game.chess.fen(), profile);
      if (state.game !== game || game.status !== 'playing') {
        return;
      }
      if (!search.bestMove) {
        break;
      }
      const bmove = playUciOnChess(game.chess, search.bestMove);
      if (!bmove) {
        break;
      }
      applyFreeMove(bmove, `Stockfish ${formatStockfishLevel(profile)}`);
      const evalNow = await evaluator.evaluate(game.chess.fen(), VICTORY_CINEMATIC_DEPTH);
      if (state.game !== game || game.status !== 'playing') {
        return;
      }
      game.currentEvalCp = evalNow.cpWhite;
      game.currentPv = evalNow.pv;
      game.currentDepth = evalNow.depth;
      renderGamePanel();
      renderGameDetails();
      if (game.chess.isCheckmate()) {
        // Les Noirs matent (très improbable depuis une position gagnante).
        finishGame('lost', 'Échec et mat subi pendant la conversion.', game.chess.fen(), evalNow);
        return;
      }
      if (game.chess.isDraw()) {
        finishGameByStalemate(game.chess);
        return;
      }
      await pause(VICTORY_CINEMATIC_STEP_MS);
    }
  }

  // Fin de la conversion : on déverrouille et on rend la main — jamais au trait noir.
  if (state.game !== game) {
    return;
  }
  game.victoryCinematic = false;
  setGameLocked(false);
  game.freeRoundPending = false;
  if (game.status !== 'playing') {
    return;
  }

  // Filet anti-softlock : si la séquence s'arrête alors que c'est aux Noirs (cap
  // atteint, coup introuvable…), Stockfish joue sa défense pour rendre la main aux
  // Blancs au lieu de laisser le joueur bloqué.
  if (game.chess.turn() === 'b') {
    game.message = 'À toi de conclure : Stockfish défend, puis tu joues le mat.';
    renderGamePanel();
    renderGameDetails();
    await advanceOpponentTurn();
    return;
  }

  if (mateFound) {
    const x = mateMovesFromCp(mateFound.cpWhite);
    game.message = `Position gagnante : mat en ${x}. À toi de conclure !`;
  } else {
    game.message = `Avantage décisif (${formatEval(game.currentEvalCp)}). À toi de porter l'estocade !`;
  }
  renderGamePanel();
  renderGameDetails();
  } catch (err) {
    // Sécurité : une erreur du moteur (timeout…) ne doit jamais bloquer le joueur.
    if (state.game === game) {
      game.victoryCinematic = false;
      setGameLocked(false);
      if (game.status === 'playing') {
        game.message = 'Conversion interrompue. À toi de jouer.';
        renderGamePanel();
        renderGameDetails();
        if (game.chess.turn() === 'b') {
          await advanceOpponentTurn();
        }
      }
    }
  }
}

function getGameRawPathToCurrentNode() {
  const game = state.game;
  if (!game) {
    return { nodeIds: ['root'], edgeIds: [] };
  }

  const currentId = game.currentNodeId ?? 'root';
  const storedNodeIds = Array.isArray(game.currentPathNodeIds) ? game.currentPathNodeIds : [];
  const storedEdgeIds = Array.isArray(game.currentPathEdgeIds) ? game.currentPathEdgeIds : [];
  const endsAtCurrent = storedNodeIds[storedNodeIds.length - 1] === currentId;
  const validStoredPath =
    storedNodeIds.length > 0 &&
    endsAtCurrent &&
    storedNodeIds.every((nodeId) => nodeId === 'root' || getNode(nodeId)) &&
    storedEdgeIds.every((edgeId) => getEdge(edgeId));

  if (validStoredPath) {
    return {
      nodeIds: [...storedNodeIds],
      edgeIds: [...storedEdgeIds]
    };
  }

  return buildRawPathToNode(currentId);
}

function projectRawPathToView(view, rawPath) {
  const rawEdgeIds = new Set(rawPath.edgeIds);
  const rawNodeIds = new Set(rawPath.nodeIds);
  const highlightedEdges = [];
  const highlightedNodes = new Set(['root']);

  for (const edge of view.edges) {
    if (!edge.pathEdgeIds.some((edgeId) => rawEdgeIds.has(edgeId))) {
      continue;
    }
    highlightedEdges.push(edge.id);
    highlightedNodes.add(edge.from);
    highlightedNodes.add(edge.to);
  }

  for (const nodeId of rawNodeIds) {
    if (view.nodesById.has(nodeId)) {
      highlightedNodes.add(nodeId);
    }
  }

  return {
    edgeIds: highlightedEdges,
    nodeIds: [...highlightedNodes]
  };
}

function findCurrentViewSegment(view, currentId, rawPath) {
  const lastRawEdgeId = rawPath.edgeIds[rawPath.edgeIds.length - 1];
  return (
    view.edges.find((edge) => edge.pathEdgeIds.includes(lastRawEdgeId)) ??
    view.edges.find((edge) => edge.pathNodeIds.includes(currentId)) ??
    null
  );
}

function syncGameGraphSelection(view) {
  const game = state.game;
  if (!game?.active || !view) {
    return;
  }

  const currentId = game.currentNodeId;
  const rawPath = getGameRawPathToCurrentNode();
  const highlightedPath = projectRawPathToView(view, rawPath);
  state.highlightedEdges = new Set(highlightedPath.edgeIds);
  state.highlightedNodes = new Set(highlightedPath.nodeIds);

  const directNode = view.nodesById.get(currentId);
  const containingSegment = findCurrentViewSegment(view, currentId, rawPath);
  const currentNode = getNode(currentId);
  const currentLabel = currentId === 'root' ? 'départ' : currentNode?.san ?? currentId;
  // Nœud du graphe correspondant à la position en cours de la partie (« vous êtes ici »).
  state.gameViewNodeId = containingSegment ? containingSegment.to : directNode ? currentId : null;
  if (containingSegment) {
    state.selectedNodeId = containingSegment.to;
    state.selectedSegment = containingSegment;
    state.segmentStepIndex = Math.max(0, containingSegment.pathNodeIds.indexOf(currentId));
    elements.selectedPathLabel.textContent = `Jeu: ${rawPath.edgeIds.length} coups jusqu'à ${currentLabel}`;
    return;
  }

  if (directNode) {
    state.selectedNodeId = currentId;
    state.selectedSegment = null;
    state.segmentStepIndex = 0;
    elements.selectedPathLabel.textContent =
      currentId === 'root' ? 'Jeu: départ' : `Jeu: ${directNode.raw.san}`;
  }
}

function makeGameBoardNode() {
  const game = state.game;
  const reviewEntry = getActiveFreeReviewEntry();
  if (reviewEntry) {
    return {
      id: 'free-review',
      san: reviewEntry.san,
      fen: reviewEntry.afterFen,
      from: reviewEntry.from,
      to: reviewEntry.to,
      sideToMove: reviewEntry.afterFen.split(/\s+/)[1] ?? 'w'
    };
  }

  const cinematic = game?.cinematic;
  if (cinematic?.active) {
    return {
      id: 'cinematic',
      san: cinematic.lastMove?.san ?? 'Déficit',
      fen: cinematic.chess.fen(),
      from: cinematic.lastMove?.from ?? '',
      to: cinematic.lastMove?.to ?? '',
      sideToMove: cinematic.chess.turn()
    };
  }

  // Revue de l'historique : on prévisualise une position passée (lecture seule).
  if (game && game.historyView != null) {
    return makeHistoryBoardNode(game);
  }

  return {
    id: 'game',
    san: game.lastMove?.san ?? 'Départ',
    fen: game.chess.fen(),
    from: game.lastMove?.from ?? '',
    to: game.lastMove?.to ?? '',
    sideToMove: game.chess.turn()
  };
}

// Reconstruit la position après `game.historyView` demi-coups (rejoués depuis le départ).
function makeHistoryBoardNode(game) {
  const history = game.chess.history({ verbose: true });
  const idx = clamp(game.historyView, 0, history.length);
  const probe = new Chess();
  let last = null;
  for (let i = 0; i < idx; i += 1) {
    last = probe.move(history[i]);
  }
  return {
    id: 'history',
    san: last?.san ?? 'Départ',
    fen: probe.fen(),
    from: last?.from ?? '',
    to: last?.to ?? '',
    sideToMove: probe.turn()
  };
}

function formatGamePanelMessage(game, reviewEntry = null) {
  if (reviewEntry) {
    return isPostGameReviewPlayable()
      ? `Variante depuis ${reviewEntry.text}: joue un coup légal.`
      : `Revue de partie: ${reviewEntry.text}. Utilise les flèches pour naviguer.`;
  }

  if (game.status === 'lost') {
    return "Partie terminée. L'analyse détaillée est dans Infos position.";
  }

  if (game.status === 'won') {
    return game.finalVictory
      ? "Campagne terminée. L'analyse détaillée est dans Infos position."
      : "Niveau réussi. L'analyse détaillée est dans Infos position.";
  }

  return game.message;
}

function getGameInfoAnalysis(game, currentNode = null) {
  if (game.status !== 'playing') {
    return game.message;
  }

  if (currentNode?.comments?.[0]) {
    return currentNode.comments[0];
  }

  if (game.phase === 'opening') {
    return "Position de livre: choisis un coup blanc attendu pour rester dans le répertoire.";
  }

  if (isExplorationMode()) {
    return "Position libre: teste une idée, Stockfish répondra sans pénalité.";
  }

  return `Position de survie: garde l'évaluation à ${formatEval(state.survivalLimitCp)} ou mieux.`;
}

function renderGameDetails() {
  const game = state.game;
  if (!game) {
    return;
  }

  const boardNode = makeGameBoardNode();
  const reviewEntry = getActiveFreeReviewEntry();
  const currentNode = getGameNode();
  const phaseLabel = formatGamePhase(game);
  elements.nodeTitle.textContent =
    reviewEntry
      ? 'Revue de partie'
      : game.status === 'won'
      ? game.finalVictory
        ? 'Campagne terminée'
        : 'Niveau réussi'
      : game.status === 'lost'
        ? 'Partie perdue'
        : game.chess.turn() === 'w'
          ? 'Aux Blancs'
          : 'Réponse noire';
  elements.nodeSubtitle.textContent =
    reviewEntry
      ? `${reviewEntry.text} · ${reviewEntry.label} · ${reviewEntry.index + 1}/${game.freeReviewMoves.length}`
      : game.phase === 'opening'
      ? "Reste dans les coups d'ouverture attendus."
      : isExplorationMode()
        ? 'Exploration libre: teste la position contre Stockfish.'
        : isMateObjective(game)
          ? `Objectif final: mater sans passer sous ${formatEval(state.survivalLimitCp)}.`
          : `Survie Stockfish: ${game.freeRemaining}/${game.objective.target} coups complets restants.`;
  elements.nodeEval.textContent = reviewEntry ? formatEval(reviewEntry.afterEvalCp) : formatEval(game.currentEvalCp);
  elements.nodeFuture.textContent =
    reviewEntry
      ? formatEvalDelta(reviewEntry.afterEvalCp - reviewEntry.beforeEvalCp)
      : game.phase === 'free'
      ? formatFreeRemaining(game)
      : formatEval(currentNode?.futureMeanCp);
  elements.nodeTurn.textContent = sideLabel(reviewEntry ? boardNode.sideToMove : game.chess.turn());
  setInfoAnalysis(
    reviewEntry ? reviewEntry.analysis : getGameInfoAnalysis(game, currentNode),
    reviewEntry
      ? reviewEntry.phase === 'opening'
        ? 'Livre d’ouverture + évaluation pré-calculée'
        : reviewEntry.phase === 'start'
          ? 'Position initiale'
          : reviewEntry.phase === 'engine-line'
            ? `Suite Stockfish d${reviewEntry.depth || STOCKFISH_DEPTH}`
            : `Stockfish d${reviewEntry.depth || STOCKFISH_DEPTH}`
      : formatSourceList(currentNode?.sources ?? [])
  );
  state.currentPreviewNode = boardNode;

  renderBoard(boardNode);
  renderZoomBoard(boardNode);
  renderSegmentExplorer(null);
  renderGameChoices();
  renderGamePanel(phaseLabel);
  // Rail d'infos de la vue joueur aventure : barre d'éval + coups joués
  updateLiveEvalBar(reviewEntry ? reviewEntry.afterEvalCp : game.currentEvalCp);
  renderRailMoveLog();
  // Indices visuels propres à la vue joueur aventure
  applyAdvBoardHints();
  updateAdvBoardFeedback();
  // Effet « cinématique » pendant la conversion automatique vers le mat.
  document.body.classList.toggle('is-victory-cinematic', Boolean(game.victoryCinematic));
}

function renderGamePanel(phaseLabel = null) {
  const game = state.game;
  if (!game) {
    return;
  }

  const reviewEntry = getActiveFreeReviewEntry();
  const phase = phaseLabel ?? formatGamePhase(game);
  elements.gameLevelLabel.textContent = isExplorationMode()
    ? 'Exploration'
    : `Niveau ${game.level}`;
  elements.gameTitle.textContent =
    game.status === 'won'
      ? game.finalVictory
        ? 'Campagne terminée'
        : 'Niveau réussi'
      : game.status === 'lost'
        ? 'Fin de partie'
        : isExplorationMode()
          ? 'Mode exploration'
          : game.phase === 'opening'
            ? "Livre d'ouverture"
            : isMateObjective(game)
              ? 'Objectif mat'
              : 'Survie contre Stockfish';
  elements.gamePhase.textContent = phase;
  elements.gameFreeRemaining.textContent = formatFreeRemaining(game);
  elements.gameEval.textContent = formatEval(reviewEntry?.afterEvalCp ?? game.currentEvalCp);
  elements.gameTurn.textContent = sideLabel(reviewEntry ? reviewEntry.afterFen.split(/\s+/)[1] : game.chess.turn());
  elements.gameMessage.textContent = formatGamePanelMessage(game, reviewEntry);
  const reviewPlayable = isPostGameReviewPlayable();
  elements.playMoveButton.disabled =
    game.locked || !(reviewPlayable || (game.status === 'playing' && game.chess.turn() === 'w'));
  elements.moveInput.disabled = elements.playMoveButton.disabled;
  const inputSide = reviewPlayable
    ? sideLabel(reviewEntry.afterFen.split(/\s+/)[1])
    : 'Blancs';
  elements.moveInputLabel.textContent = reviewPlayable ? `Coup des ${inputSide}` : 'Coup blanc';
  elements.moveInput.placeholder = reviewPlayable
    ? `${inputSide}: SAN ou UCI`
    : 'ex. Nf3 ou g1f3';
  elements.newGameButton.textContent =
    game.status === 'playing'
      ? isExplorationMode()
        ? 'Réinitialiser'
        : 'Recommencer'
      : game.status === 'won' && !game.finalVictory && !isExplorationMode()
        ? 'Niveau suivant'
        : game.status === 'lost' && !isExplorationMode()
          ? 'Réessayer'
          : 'Nouvelle partie';

  elements.lifeRow.replaceChildren();
  if (isExplorationMode()) {
    const pip = document.createElement('span');
    pip.className = 'life-pip is-live is-exploration';
    pip.textContent = 'Sans perte de vie';
    elements.lifeRow.append(pip);
  } else if (game.phase === 'free') {
    const pip = document.createElement('span');
    pip.className = 'life-pip is-live is-sudden-death';
    pip.textContent = 'Mort subite';
    elements.lifeRow.append(pip);
  } else {
    for (let index = 0; index < STARTING_LIVES; index += 1) {
      const pip = document.createElement('span');
      pip.className = `life-pip ${index < game.lives ? 'is-live' : 'is-empty'}`;
      pip.textContent = `Vie ${index + 1}`;
      elements.lifeRow.append(pip);
    }
  }

  renderExpectedMoveList();
  renderOpponentGraphMini();
  renderMoveLog();
  renderFreeReviewPanel();
  if (state.screen === 'adventure') {
    renderAdventureHud();
  }
}

function formatGamePhase(game) {
  if (game.mode === 'exploration') {
    return game.phase === 'opening' ? 'Exploration livre' : 'Exploration libre';
  }
  return game.phase === 'opening' ? 'Ouverture' : 'Survie libre';
}

function formatFreeRemaining(game) {
  if (game.mode === 'exploration') {
    return 'libre';
  }
  if (game.phase !== 'free') {
    return isMateObjective(game) ? "objectif mat" : `objectif ${formatSurvivalTarget(game)}`;
  }
  return isMateObjective(game)
    ? "jusqu'au mat"
    : `${game.freeRemaining}/${game.objective.target}`;
}

function renderExpectedMoveList() {
  const game = state.game;
  elements.expectedMoveList.replaceChildren();
  if (isPostGameReviewPlayable()) {
    const reviewEntry = getActiveFreeReviewEntry();
    const chess = new Chess(reviewEntry.afterFen);
    const free = document.createElement('span');
    free.className = 'expected-pill is-free';
    free.textContent = `Analyse ${sideLabel(chess.turn())}`;
    elements.expectedMoveList.append(free);
    for (const san of chess.moves().slice(0, 6)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'expected-pill';
      button.textContent = san;
      button.addEventListener('click', () => submitHumanMove(san));
      elements.expectedMoveList.append(button);
    }
    return;
  }

  if (!game || game.status !== 'playing') {
    return;
  }

  if (game.locked) {
    const pill = document.createElement('span');
    pill.className = 'expected-pill is-muted';
    pill.textContent = 'Stockfish calcule';
    elements.expectedMoveList.append(pill);
    return;
  }

  if (game.chess.turn() !== 'w') {
    const pill = document.createElement('span');
    pill.className = 'expected-pill is-muted';
    pill.textContent = 'Réponse noire';
    elements.expectedMoveList.append(pill);
    return;
  }

  const expected = getExpectedWhiteBookEdges();
  if (game.phase === 'opening' && expected.length) {
    if (isExplorationMode()) {
      const free = document.createElement('span');
      free.className = 'expected-pill is-free';
      free.textContent = 'Livre conseillé';
      elements.expectedMoveList.append(free);
    }
    for (const edge of expected) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'expected-pill';
      button.textContent = edge.san;
      button.addEventListener('click', () => submitHumanMove(edge.san));
      elements.expectedMoveList.append(button);
    }
    return;
  }

  const free = document.createElement('span');
  free.className = 'expected-pill is-free';
  free.textContent = isExplorationMode()
    ? `Coup libre: seuil indicatif ${formatEval(state.survivalLimitCp)}`
    : isMateObjective(game)
      ? `Objectif mat: reste >= ${formatEval(state.survivalLimitCp)}`
      : `Coup libre: reste >= ${formatEval(state.survivalLimitCp)}`;
  elements.expectedMoveList.append(free);
  for (const san of game.chess.moves().slice(0, 6)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expected-pill';
    button.textContent = san;
    button.addEventListener('click', () => submitHumanMove(san));
    elements.expectedMoveList.append(button);
  }
}

function renderOpponentGraphMini() {
  const game = state.game;
  elements.opponentGraphMini.replaceChildren();
  if (!game) {
    return;
  }

  const title = document.createElement('strong');
  title.textContent = 'Plan adverse';
  elements.opponentGraphMini.append(title);

  let rows = [];
  if (game.phase === 'opening' && game.chess.turn() === 'b') {
    rows = buildOpponentBookCandidates(getOpponentBookEdgesForRun()).map((candidate) => ({
      label: candidate.type === 'free' ? candidate.label : candidate.edge.san,
      value: formatPercent(candidate.probability)
    }));
  } else if (game.phase === 'opening') {
    rows = getExpectedWhiteBookEdges()
      .flatMap((whiteEdge) => {
        const childEdges = buildLiveBookEdgesForNode(whiteEdge.to, 'b');
        const childPly = game.chess.history().length + 1;
        return buildOpponentBookCandidates(childEdges, childPly).map((candidate) => ({
          label:
            candidate.type === 'free'
              ? `${whiteEdge.san} → Stockfish`
              : `${whiteEdge.san} → ${candidate.edge.san}`,
          value: formatPercent(candidate.probability)
        }));
      })
      .slice(0, 4);
  } else {
    rows = [
      {
        label: 'Stockfish libre',
        value: formatStockfishLevel()
      }
    ];
  }

  if (!rows.length) {
    rows.push({ label: 'Fin de branche', value: 'Stockfish' });
  }

  for (const row of rows.slice(0, 5)) {
    const item = document.createElement('span');
    item.innerHTML = `<span>${escapeHtml(row.label)}</span><em>${escapeHtml(row.value)}</em>`;
    elements.opponentGraphMini.append(item);
  }
}

function renderMoveLog() {
  elements.moveLogList.replaceChildren();
  const reviewEntry = getActiveFreeReviewEntry();
  const moves = reviewEntry
    ? getReviewPath(reviewEntry)
        .filter((entry) => entry.phase !== 'start')
        .slice(-8)
        .reverse()
        .map((entry) => ({
          text: entry.text,
          label: entry.branchLabel ? `${entry.label} · ${entry.branchLabel}` : entry.label,
          color: entry.color
        }))
    : state.game?.moveLog ?? [];
  for (const item of moves) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.label)}</span>`;
    elements.moveLogList.append(row);
  }
}

// --- Vue joueur aventure : barre d'éval + journal compact du rail ---

/** Convertit une éval (centipions, côté blanc) en pourcentage [0..100] pour la barre. */
function evalToBarPct(cpWhite) {
  const v = Math.max(-1200, Math.min(1200, Number(cpWhite) || 0));
  return Math.round((Math.tanh(v / 400) + 1) * 50);
}

/** Met à jour la largeur de la barre d'évaluation du rail (part des Blancs). */
function updateLiveEvalBar(cpWhite) {
  const fill = elements.liveEvalBarFill;
  if (!fill) {
    return;
  }
  fill.style.width = `${evalToBarPct(cpWhite)}%`;
}

/** Remplit le journal compact « Coups joués » du rail à partir de moveLog. */
function renderRailMoveLog() {
  const list = elements.liveMoveLog;
  if (!list) {
    return;
  }
  list.replaceChildren();
  const moves = state.game?.moveLog ?? [];
  for (const item of moves) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.label)}</span>`;
    list.append(row);
  }
}

function renderFreeReviewPanel() {
  const game = state.game;
  const inAdventure = state.screen === 'adventure';
  const host = inAdventure ? document.querySelector('#advReviewPanel') : elements.freeReviewPanel;
  // Masque le panneau de l'autre mode pour éviter tout doublon.
  const idle = inAdventure ? elements.freeReviewPanel : document.querySelector('#advReviewPanel');
  if (idle) {
    idle.replaceChildren();
    idle.hidden = true;
  }
  if (!host) {
    return;
  }
  host.replaceChildren();
  // En aventure, on n'ouvre l'analyse rapide qu'après une vraie partie
  // (au-delà de la simple position de départ).
  const reviewReady =
    hasPostGameFreeReview() && (!inAdventure || game.freeReviewMoves.length > 1);
  if (!reviewReady) {
    host.hidden = true;
    return;
  }

  host.hidden = false;
  ensureReviewTree(game);
  const activeEntry = getActiveFreeReviewEntry() ?? game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const parentEntry = getReviewParent(activeEntry);
  const nextEntry = getPreferredReviewChild(activeEntry);
  const childEntries = getReviewChildren(activeEntry.index);
  const header = document.createElement('div');
  header.className = 'free-review-header';
  header.innerHTML = `
    <div>
      <span class="kicker">${inAdventure ? 'Analyse rapide' : isPostGameReviewPlayable() ? 'Analyse libre' : 'Revue de partie'}</span>
      <strong>${escapeHtml(activeEntry.text)}</strong>
    </div>
    <em>${activeEntry.index + 1}/${game.freeReviewMoves.length}</em>
  `;

  const controls = document.createElement('div');
  controls.className = 'free-review-controls';
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.textContent = '‹';
  prevButton.setAttribute('aria-label', 'Position précédente');
  prevButton.disabled = !parentEntry;
  prevButton.addEventListener('click', () => {
    if (parentEntry) {
      setFreeReviewIndex(parentEntry.index);
    }
  });

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '›';
  nextButton.setAttribute('aria-label', 'Position suivante');
  nextButton.disabled = !nextEntry;
  nextButton.addEventListener('click', () => {
    if (nextEntry) {
      setFreeReviewIndex(nextEntry.index);
    }
  });

  const finalButton = document.createElement('button');
  finalButton.type = 'button';
  finalButton.textContent = game.freeReview.active ? 'Finale' : 'Revoir';
  finalButton.addEventListener('click', () => {
    if (game.freeReview.active) {
      stopFreeReview();
      return;
    }
    setFreeReviewIndex(activeEntry.index);
  });
  controls.append(prevButton, finalButton, nextButton);

  const branches = document.createElement('div');
  branches.className = 'free-review-branches';
  if (childEntries.length) {
    const label = document.createElement('strong');
    label.textContent = 'Suites depuis ici';
    branches.append(label);
    for (const child of childEntries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = nextEntry?.index === child.index ? 'is-active' : '';
      button.innerHTML = `
        <span>${escapeHtml(child.san || child.text)}</span>
        <em>${escapeHtml(child.branchLabel || 'suite')}</em>
      `;
      button.addEventListener('click', () => setFreeReviewIndex(child.index));
      branches.append(button);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'free-review-actions';
  const analysisButton = document.createElement('button');
  analysisButton.type = 'button';
  analysisButton.className = 'free-review-analysis-button';
  analysisButton.textContent = 'Jouer contre Stockfish depuis ici';
  analysisButton.addEventListener('click', () => {
    launchPostGameFreeAnalysis().catch((error) => {
      if (state.game) {
        state.game.message = `Impossible de lancer l'analyse libre: ${error.message}`;
        renderGamePanel();
      }
    });
  });
  actions.append(analysisButton);

  const list = document.createElement('div');
  list.className = 'free-review-list';
  for (const entry of game.freeReviewMoves) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = entry.index === activeEntry.index ? 'is-active' : '';
    button.innerHTML = `
      <span>${escapeHtml(entry.text)}</span>
      <em>${escapeHtml(entry.branchLabel || formatEval(entry.afterEvalCp))}</em>
    `;
    button.addEventListener('click', () => setFreeReviewIndex(entry.index));
    list.append(button);
  }

  host.append(header, controls);
  if (childEntries.length) {
    host.append(branches);
  }
  // Le bouton « Jouer contre Stockfish depuis ici » s'appuie sur le mode
  // exploration, lequel masque le plateau dans la vue cerveau de l'aventure.
  // On l'omet en aventure et on conserve la navigation pas-à-pas + variantes
  // jouables sur l'échiquier comme analyse rapide.
  if (!inAdventure) {
    host.append(actions);
  }
  host.append(list);
}

function renderGameChoices() {
  const game = state.game;
  elements.choiceList.replaceChildren();
  if (!game) {
    return;
  }

  if (isPostGameReviewPlayable()) {
    const reviewEntry = getActiveFreeReviewEntry();
    const chess = new Chess(reviewEntry.afterFen);
    const intro = document.createElement('p');
    intro.textContent = `Créer une variante depuis ${reviewEntry.text}.`;
    elements.choiceList.append(intro);
    for (const san of chess.moves().slice(0, 10)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'choice-row';
      row.innerHTML = `
        <strong>${escapeHtml(san)}</strong>
        <span>Créer une variante depuis cette position</span>
        <em>${escapeHtml(sideLabel(chess.turn()))}</em>
      `;
      row.addEventListener('click', () => submitHumanMove(san));
      elements.choiceList.append(row);
    }
    return;
  }

  if (game.status !== 'playing') {
    const summary = document.createElement('p');
    summary.textContent =
      game.freeReviewMoves.length > 1
        ? `${game.message} Utilise la revue de partie pour revenir sur chaque position jouée.`
        : game.message;
    elements.choiceList.append(summary);
    return;
  }

  if (game.chess.turn() !== 'w' || game.locked) {
    const waiting = document.createElement('p');
    waiting.textContent = 'Les Noirs réfléchissent.';
    elements.choiceList.append(waiting);
    return;
  }

  const expected = getExpectedWhiteBookEdges();
  if (game.phase === 'opening' && expected.length) {
    if (isExplorationMode()) {
      const free = document.createElement('p');
      free.textContent = 'Exploration: les coups du livre sont proposés, mais tu peux aussi jouer directement sur l’échiquier pour sortir de la ligne.';
      elements.choiceList.append(free);
    }
    for (const edge of expected) {
      const child = getNode(edge.to);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'choice-row';
      row.innerHTML = `
        <strong>${escapeHtml(edge.san)}</strong>
        <span>${escapeHtml(edge.comments[0] ?? child?.comments[0] ?? "Coup d'ouverture attendu")}</span>
        <em>livre</em>
      `;
      row.addEventListener('click', () => submitHumanMove(edge.san));
      elements.choiceList.append(row);
    }
    return;
  }

  const free = document.createElement('p');
  free.textContent = isExplorationMode()
    ? `Exploration libre: joue n’importe quel coup légal, le seuil ${formatEval(state.survivalLimitCp)} sert seulement de repère.`
    : isMateObjective(game)
      ? `Objectif mat: joue un coup légal qui garde l’évaluation à ${formatEval(state.survivalLimitCp)} ou mieux jusqu’au mat.`
      : `Coup libre: joue un coup légal qui garde l’évaluation à ${formatEval(state.survivalLimitCp)} ou mieux.`;
  elements.choiceList.append(free);
  for (const san of game.chess.moves().slice(0, 10)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'choice-row';
    row.innerHTML = `
      <strong>${escapeHtml(san)}</strong>
      <span>Coup légal disponible en phase libre</span>
      <em>libre</em>
    `;
    row.addEventListener('click', () => submitHumanMove(san));
    elements.choiceList.append(row);
  }
}

function pickWeightedViewEdge(viewNode, view) {
  const outgoing = viewNode.outgoing.map((edgeId) => view.edgesById.get(edgeId)).filter(Boolean);
  if (!outgoing.length) {
    return null;
  }
  const selected = pickWeightedCandidate(
    outgoing.map((edge) => ({ id: edge.id, type: 'edge', edge, probability: edge.probability }))
  );
  return selected?.edge ?? null;
}

function buildPath(mode) {
  const view = createCompressedView();
  recomputeViewProbabilities(view);
  const edgeIds = [];
  const nodeIds = ['root'];
  let current = view.nodesById.get('root');
  let guard = 0;

  while (current?.outgoing.length && guard < 80) {
    const outgoing = current.outgoing.map((edgeId) => view.edgesById.get(edgeId)).filter(Boolean);
    const edge =
      mode === 'best'
        ? outgoing.sort((a, b) => b.probability - a.probability)[0]
        : pickWeightedViewEdge(current, view);
    if (!edge) {
      break;
    }
    edgeIds.push(edge.id);
    nodeIds.push(edge.to);
    current = view.nodesById.get(edge.to);
    guard += 1;
  }

  state.highlightedEdges = new Set(edgeIds);
  state.highlightedNodes = new Set(nodeIds);
  state.selectedNodeId = nodeIds[nodeIds.length - 1] ?? 'root';
  state.selectedSegment = edgeIds.length ? view.edgesById.get(edgeIds[edgeIds.length - 1]) : null;
  state.segmentStepIndex = state.selectedSegment?.isCompressed
    ? state.selectedSegment.pathNodeIds.length - 1
    : 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent =
    mode === 'best'
      ? `Meilleur chemin: ${edgeIds.length} décisions`
      : `Chemin simulé: ${edgeIds.length} décisions`;
  renderGraph();
}

function resetHighlight() {
  state.highlightedEdges.clear();
  state.highlightedNodes = new Set([state.selectedNodeId]);
  state.selectedSegment = null;
  state.segmentStepIndex = 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent = 'Aucun chemin sélectionné';
  renderGraph();
}

function setGraphData(data, selectedPathLabel = 'Aucun chemin sélectionné') {
  state.data = data;
  trapReachCache = null; // le cache « mène à un mat » dépend du livre courant
  state.nodesById = new Map(state.data.nodes.map((node) => [node.id, node]));
  state.edgesById = new Map(state.data.edges.map((edge) => [edge.id, edge]));
  state.nodesByFen = new Map(state.data.nodes.map((node) => [node.fen, node]));
  state.nodesByPositionKey = new Map(
    state.data.nodes.map((node) => [fenPositionKey(node.fen), node])
  );
  state.lineFilter = 'all';
  state.highlightedEdges.clear();
  state.highlightedNodes = new Set(['root']);
  state.selectedNodeId = 'root';
  state.selectedSegment = null;
  state.segmentStepIndex = 0;
  state.segmentExpanded = false;
  elements.selectedPathLabel.textContent = selectedPathLabel;
  populateControls();
  startNewGame(FIRST_LEVEL_NUMBER);
  elements.selectedPathLabel.textContent = selectedPathLabel;
}

function setImportBusy(isBusy, statusText = '') {
  state.isImportingPgn = isBusy;
  elements.buildPgnButton.disabled = isBusy;
  elements.defaultPgnButton.disabled = isBusy || !state.defaultData;
  elements.pgnFileInput.disabled = isBusy;
  elements.pgnTextInput.disabled = isBusy;
  if (statusText) {
    elements.pgnImportStatus.textContent = statusText;
  }
}

async function buildGraphDataFromPgn(pgn, sourceName = 'PGN importé') {
  const blocks = splitPgnGames(pgn);
  const lines = makeLineEventsUnique(blocks.flatMap(parsePgnGame)).filter(
    (line) => line.moves.length
  );
  if (!lines.length) {
    throw new Error('Aucune ligne PGN jouable trouvée.');
  }

  const graph = buildGraphFromPgnLines(lines);
  if (graph.nodes.length <= 1 || !graph.edges.length) {
    throw new Error('Le PGN ne contient pas de coups légaux exploitables.');
  }

  const evaluator = await ensureStockfishReady(false);
  for (const [index, node] of graph.nodes.entries()) {
    elements.pgnImportStatus.textContent = `Éval ${index + 1}/${graph.nodes.length}`;
    node.evaluation = await evaluator.evaluate(node.fen, IMPORT_STOCKFISH_DEPTH);
    if (index % 4 === 0) {
      await yieldToBrowser();
    }
  }

  computeGraphFutureMeans(graph);
  assignGraphProbabilities(graph);

  return {
    summary: summarizeImportedGraph(graph, lines, IMPORT_STOCKFISH_DEPTH, sourceName),
    lines: lines.map(({ moves, ...line }) => ({
      ...line,
      plies: moves.length
    })),
    nodes: graph.nodes,
    edges: graph.edges,
    warnings: graph.warnings
  };
}

async function importPgnFromInput() {
  const pgn = elements.pgnTextInput.value.trim();
  if (!pgn) {
    elements.pgnImportStatus.textContent = 'PGN vide';
    return;
  }

  setImportBusy(true, 'Lecture PGN');
  try {
    const data = await buildGraphDataFromPgn(pgn, 'PGN importé');
    setGraphData(data, 'PGN importé: graphe prêt');
    state.activeBook = 'custom';
    elements.pgnImportStatus.textContent = `Prêt d${IMPORT_STOCKFISH_DEPTH}`;
  } catch (error) {
    elements.pgnImportStatus.textContent = 'Erreur PGN';
    elements.summaryText.textContent = error.message;
  } finally {
    setImportBusy(false);
  }
}

async function restoreDefaultGraph() {
  if (!state.defaultData) {
    return;
  }
  setImportBusy(true, 'Livre italien');
  setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
  state.activeBook = 'default';
  elements.pgnImportStatus.textContent = 'Livre actif';
  setImportBusy(false);
}

function populateControls() {
  const summary = state.data.summary;
  const model = summary.probabilityModel ?? {};
  state.temperatureCp = model.temperatureCp ?? PROBABILITY_TEMPERATURE_CP;
  state.floorMass = DISPLAY_DEFAULT_FLOOR_MASS;

  elements.temperatureRange.value = String(state.temperatureCp);
  elements.floorRange.value = String(Math.round(state.floorMass * 100));
  elements.temperatureValue.textContent = `${state.temperatureCp} cp`;
  elements.floorValue.textContent = `${Math.round(state.floorMass * 100)}%`;

  elements.lineFilter.replaceChildren();
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'Toutes les lignes';
  elements.lineFilter.append(all);
  for (const line of state.data.lines) {
    const option = document.createElement('option');
    option.value = line.event;
    option.textContent = `${line.id.replace('line_', '#')} · ${line.event}`;
    elements.lineFilter.append(option);
  }

  const warningText = state.data.warnings.length
    ? ` ${state.data.warnings.length} anomalie PGN signalée.`
    : '';
  elements.summaryText.textContent = `${summary.sourceLines} lignes PGN fusionnées en ${summary.nodes} positions évaluées.${warningText}`;
  elements.nodesCount.textContent = String(summary.nodes);
  elements.edgesCount.textContent = String(summary.edges);
  elements.branchingCount.textContent = String(summary.branchingNodes);
  elements.engineDepth.textContent = `d${summary.stockfish.depth}`;
}

/* =====================================================================
   Mode Aventure : cerveau RPG (apprentissage + domination Stockfish)
   ===================================================================== */
const ADV_STORAGE_KEY = 'roguechess-adventure-v1';
const ADV_ACT2_UNLOCK = 0.5;
const ADV_LESSONS = [
  { id: 'l1', target: 0.25, title: 'Premiers neurones', icon: '🌱' },
  { id: 'l2', target: 0.5, title: 'Réseau en éveil', icon: '✨' },
  { id: 'l3', target: 0.75, title: 'Cortex dense', icon: '🔆' },
  { id: 'l4', target: 1, title: 'Cerveau complet', icon: '🧠' }
];
const ADV_XP_PER_SYNAPSE = 8;
const ADV_XP_BOOK_MOVE = 4;
const ADV_XP_LESSON = 50;
let advSurgeTimer = null;

function createAdventureState() {
  return {
    xp: 0,
    nodes: new Set(),
    lessons: {},
    bosses: {},
    highestBoss: 0,
    act2Announced: false
  };
}

function loadAdventure() {
  const base = createAdventureState();
  try {
    const raw = localStorage.getItem(ADV_STORAGE_KEY);
    if (!raw) {
      return base;
    }
    const data = JSON.parse(raw);
    base.xp = Number(data.xp) || 0;
    base.nodes = new Set(Array.isArray(data.nodes) ? data.nodes : []);
    base.lessons = data.lessons && typeof data.lessons === 'object' ? data.lessons : {};
    base.bosses = data.bosses && typeof data.bosses === 'object' ? data.bosses : {};
    base.highestBoss = Number(data.highestBoss) || 0;
    base.act2Announced = Boolean(data.act2Announced);
  } catch {
    return createAdventureState();
  }
  return base;
}

function saveAdventure() {
  if (!state.adventure) {
    return;
  }
  try {
    localStorage.setItem(
      ADV_STORAGE_KEY,
      JSON.stringify({
        xp: state.adventure.xp,
        nodes: [...state.adventure.nodes],
        lessons: state.adventure.lessons,
        bosses: state.adventure.bosses,
        highestBoss: state.adventure.highestBoss,
        act2Announced: state.adventure.act2Announced
      })
    );
  } catch {
    /* stockage indisponible: on continue en mémoire */
  }
}

function advTotalSynapseNodes() {
  return state.data ? state.data.nodes.filter((node) => node.id !== 'root').length : 0;
}

function advCoverage() {
  const total = advTotalSynapseNodes();
  return total ? Math.min(1, state.adventure.nodes.size / total) : 0;
}

function advCoveragePct() {
  return Math.round(advCoverage() * 100);
}

function advLevelSpan(level) {
  return 260 + (level - 1) * 120;
}

function advBrainProgress() {
  let level = 1;
  let remaining = state.adventure ? state.adventure.xp : 0;
  while (remaining >= advLevelSpan(level)) {
    remaining -= advLevelSpan(level);
    level += 1;
  }
  return { level, into: remaining, span: advLevelSpan(level) };
}

function advBossXp(level) {
  return 120 + level * 40;
}

function advAct2Unlocked() {
  return advCoverage() >= ADV_ACT2_UNLOCK;
}

function advBossUnlocked(level) {
  return advAct2Unlocked() && level <= state.adventure.highestBoss + 1;
}

function isAdventureRun() {
  return state.screen === 'adventure' && Boolean(state.advRun);
}

// Seuil de déficit toléré en aventure, fonction de la difficulté choisie.
// La difficulté la plus basse (N1) tolère jusqu'à -5 ; la plus haute (N10)
// n'autorise plus qu'un déficit de -1 avant la cinématique de défaite.
function advDeficitThresholdCp(level) {
  const safe = clamp(Math.round(Number(level) || 1), 1, 10);
  const easiestCp = -500; // -5 pions au niveau le plus facile
  const hardestCp = -100; // -1 pion au niveau le plus difficile
  const t = (safe - 1) / 9;
  return Math.round((easiestCp + (hardestCp - easiestCp) * t) / 10) * 10;
}

// Difficulté de la partie d'aventure courante (niveau du boss, sinon la force
// Stockfish active pour une leçon).
function advRunDifficultyLevel() {
  const run = state.advRun;
  if (!run) {
    return state.stockfishLevel;
  }
  return run.kind === 'boss' ? run.bossLevel : state.stockfishLevel;
}

function advRunDeficitThresholdCp() {
  return advDeficitThresholdCp(advRunDifficultyLevel());
}

function isAdventureMastered(id) {
  return state.screen === 'adventure' && Boolean(state.adventure?.nodes.has(id));
}

function isAdventureLesson() {
  return isAdventureRun() && state.advRun?.kind === 'lesson';
}

function isAdventureEdgeMastered(edge) {
  if (state.screen !== 'adventure' || !state.adventure || !edge) {
    return false;
  }
  if (edge.from && edge.from !== 'root' && !state.adventure.nodes.has(edge.from)) {
    return false;
  }
  const ids = edge.pathNodeIds?.length ? edge.pathNodeIds : [edge.to];
  return ids.every((id) => state.adventure.nodes.has(id));
}

function showAdventureToast({ icon = '✨', title = '', text = '', kind = '' } = {}) {
  const host = document.querySelector('#adventureToasts');
  if (!host) {
    return;
  }
  const toast = document.createElement('div');
  toast.className = `adv-toast${kind ? ` is-${kind}` : ''}`;
  toast.setAttribute('role', 'status');

  const iconEl = document.createElement('div');
  iconEl.className = 'adv-toast-icon';
  iconEl.textContent = icon;

  const body = document.createElement('div');
  body.className = 'adv-toast-body';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  body.append(titleEl);
  if (text) {
    const textEl = document.createElement('span');
    textEl.textContent = text;
    body.append(textEl);
  }

  toast.append(iconEl, body);
  host.append(toast);

  // Retire le toast après l'animation de sortie (var(--toast-life) 2.4s + 0.36s).
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function advAddXp(amount) {
  if (!amount || !state.adventure) {
    return;
  }
  const before = advBrainProgress().level;
  state.adventure.xp += amount;
  const after = advBrainProgress().level;
  if (after > before) {
    showAdventureToast({
      icon: '🧠',
      title: `Cerveau niveau ${after} !`,
      text: 'Nouveau palier neuronal atteint.',
      kind: 'levelup'
    });
  }
}

function triggerBrainSurge() {
  document.body.classList.remove('is-brain-surge');
  void document.body.offsetWidth;
  document.body.classList.add('is-brain-surge');
  clearTimeout(advSurgeTimer);
  advSurgeTimer = setTimeout(() => document.body.classList.remove('is-brain-surge'), 720);
}

function checkLessonMilestones() {
  const coverage = advCoverage();
  for (const lesson of ADV_LESSONS) {
    if (!state.adventure.lessons[lesson.id] && coverage + 1e-9 >= lesson.target) {
      state.adventure.lessons[lesson.id] = 3;
      advAddXp(ADV_XP_LESSON);
      showAdventureToast({
        icon: lesson.icon,
        title: `Leçon validée : ${lesson.title}`,
        text: `${Math.round(lesson.target * 100)} % du cortex illuminé.`,
        kind: 'synapse'
      });
    }
  }
  if (coverage >= ADV_ACT2_UNLOCK && !state.adventure.act2Announced) {
    state.adventure.act2Announced = true;
    showAdventureToast({
      icon: '⚔️',
      title: 'Arène déverrouillée !',
      text: 'Acte 2 : affronte Stockfish niveau par niveau.',
      kind: 'boss'
    });
  }
}

function adventureLightEdge(edge) {
  if (state.screen !== 'adventure' || !state.adventure || !edge) {
    return;
  }
  let lit = 0;
  for (const id of [edge.from, edge.to]) {
    if (id && id !== 'root' && !state.adventure.nodes.has(id)) {
      state.adventure.nodes.add(id);
      lit += 1;
    }
  }
  if (lit) {
    advAddXp(lit * ADV_XP_PER_SYNAPSE);
    triggerBrainSurge();
    flashAdvBoard('learn'); // écho de l'apprentissage sur l'échiquier (vue joueur)
    checkLessonMilestones();
    updateHomeProgress();
    saveAdventure();
  }
}

function adventureOnCorrectWhiteBook() {
  const run = state.advRun;
  if (!run) {
    return;
  }
  run.streak = (run.streak || 0) + 1;
  run.bookMoves = (run.bookMoves || 0) + 1;
  const combo = Math.min(run.streak, 6);
  advAddXp(ADV_XP_BOOK_MOVE + (run.streak >= 3 ? combo : 0));
  flashAdvBoard('good');
  saveAdventure();
}

function adventureOnWrongBook() {
  const run = state.advRun;
  if (!run) {
    return;
  }
  run.streak = 0;
  run.wrongMoves = (run.wrongMoves || 0) + 1;
  flashAdvBoard('bad');
}

function adventureOnLessonReachedFree() {
  const run = state.advRun;
  if (!run || run.kind !== 'lesson' || run.completed) {
    return;
  }
  run.completed = true;
  finishGame('won', `Ligne maîtrisée ! Cortex illuminé à ${advCoveragePct()} %.`);
}

// Mat livré dans l'ouverture pendant une leçon (typiquement un piège) : succès de la
// leçon, et non fin de campagne.
function adventureOnTrapSolved() {
  const run = state.advRun;
  if (run) {
    run.completed = true;
  }
  triggerBrainSurge();
  finishGame(
    'won',
    state.advRun?.trapsMode
      ? `Piège réussi ! Échec et mat dans l'ouverture. Cortex à ${advCoveragePct()} %.`
      : `Mat dans l'ouverture ! Cortex à ${advCoveragePct()} %.`
  );
}

function adventureOnGameFinished(result) {
  const run = state.advRun;
  if (!state.adventure || !run) {
    return;
  }
  if (run.kind === 'boss') {
    if (result === 'won' && !run.resolved) {
      run.resolved = true;
      const level = run.bossLevel;
      const firstWin = !state.adventure.bosses[level];
      state.adventure.bosses[level] = 3;
      if (level > state.adventure.highestBoss) {
        state.adventure.highestBoss = level;
      }
      if (firstWin) {
        advAddXp(advBossXp(level));
      }
      const profile = getStockfishLevelProfile(level);
      showAdventureToast({
        icon: '👑',
        title: `Boss N${level} maté !`,
        text:
          level < 10
            ? `${profile.label} tombe. Adversaire suivant débloqué.`
            : `${profile.label} tombe. Cortex souverain !`,
        kind: 'boss'
      });
    } else if (result === 'lost') {
      const chess = state.game?.chess;
      const drawn = Boolean(chess?.isDraw?.());
      const matedReally = Boolean(chess?.isCheckmate?.());
      showAdventureToast({
        icon: drawn ? '🤝' : '💥',
        title: drawn
          ? `${drawKindLabel(chess)} — pas de mat`
          : matedReally
          ? 'Échec et mat subi'
          : 'Position effondrée',
        text: drawn
          ? 'Tu n’as pas maté (partie nulle). Il faut refaire la partie.'
          : matedReally
          ? 'Le boss te mate. Relance l’assaut.'
          : 'Ta position est tombée trop bas. Relance l’assaut.',
        kind: null
      });
    }
  }
  saveAdventure();
  updateHomeProgress();
}

function setScreen(screen) {
  state.screen = screen;
  setEngineThinking(false);
  closeAdvAnalyseSheet();
  showBrainScrub(false);
  document.body.classList.toggle('screen-home', screen === 'home');
  document.body.classList.toggle('screen-creative', screen === 'creative');
  document.body.classList.toggle('screen-adventure', screen === 'adventure');
  if (screen !== 'adventure') {
    closeAdventureMap();
  }
  if (screen === 'home') {
    updateHomeProgress();
  }
  if (screen === 'adventure') {
    renderAdventureHud();
  }
  renderGraph();
}

function enterAdventure() {
  state.advRun = null;
  if (state.activeBook !== 'default' && state.defaultData) {
    setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
    state.activeBook = 'default';
    elements.pgnImportStatus.textContent = 'Livre actif';
  }
  state.playMode = 'challenge';
  syncPlayModeButtons();
  setViewMode('brain');
  setAdvViewMode(state.advViewMode); // applique la vue par défaut (joueur) dès l'entrée
  setScreen('adventure');
  openAdventureMap();
}

function enterCreative() {
  const from = state.screen;
  // Une partie d'aventure (leçon/boss) reste chargée tant que state.advRun existe,
  // même après un détour par l'accueil. On repart alors sur une partie créative neuve
  // pour ne pas hériter d'une position d'aventure. Une partie créative en cours
  // (advRun nul) est préservée.
  const hadAdventureGame = from === 'adventure' || Boolean(state.advRun);
  state.advRun = null;
  setScreen('creative');
  if (hadAdventureGame) {
    state.playMode = 'challenge';
    syncPlayModeButtons();
    startNewGame(FIRST_LEVEL_NUMBER);
  }
}

function openAdventureMap() {
  closeAdvAnalyseSheet();
  const map = document.querySelector('#adventureMap');
  if (map) {
    map.hidden = false;
  }
  renderAdventureMap();
}

function closeAdventureMap() {
  const map = document.querySelector('#adventureMap');
  if (map) {
    map.hidden = true;
  }
}

function resetAdventureProgress() {
  state.adventure = createAdventureState();
  saveAdventure();
  updateHomeProgress();
  if (state.screen === 'adventure') {
    renderAdventureHud();
    renderAdventureMap();
    renderGraph();
  }
  showAdventureToast({
    icon: '🧼',
    title: 'Progression réinitialisée',
    text: 'Le cortex est de nouveau vierge.',
    kind: null
  });
}

function focusAdvInput() {
  window.requestAnimationFrame(() => {
    const input = document.querySelector('#advMoveInput');
    if (input && !input.disabled) {
      input.focus();
    }
  });
}

function launchLesson() {
  state.advRun = { kind: 'lesson', streak: 0, wrongMoves: 0, bookMoves: 0, completed: false };
  state.playMode = 'challenge';
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.message =
      'Suis le livre : chaque bon coup allume un neurone. Va jusqu’au bout de la ligne.';
  }
  renderAdventureHud();
  focusAdvInput();
}

// Catégorie « Pièges » : débloquée une fois toutes les lignes apprises (100 % du
// cortex = dernière leçon validée) et seulement si le livre contient des mats.
function advTrapsUnlocked() {
  return Boolean(state.adventure?.lessons?.l4) && bookHasTrapLines();
}

function launchTrapsLesson() {
  if (!advTrapsUnlocked()) {
    return;
  }
  state.advRun = {
    kind: 'lesson',
    trapsMode: true,
    streak: 0,
    wrongMoves: 0,
    bookMoves: 0,
    completed: false
  };
  state.playMode = 'challenge';
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    state.game.message =
      'Mode Pièges : suis la ligne, fais tomber Stockfish dans le piège et livre le mat !';
  }
  renderAdventureHud();
  focusAdvInput();
}

function launchBoss(level) {
  if (!advBossUnlocked(level)) {
    return;
  }
  state.advRun = { kind: 'boss', bossLevel: level, streak: 0, wrongMoves: 0, resolved: false };
  state.playMode = 'challenge';
  state.stockfishLevel = level;
  updateStockfishLevelUi();
  closeAdventureMap();
  setViewMode('brain');
  setAdvViewMode('board');
  startNewGame(FIRST_LEVEL_NUMBER);
  if (state.game) {
    const profile = getStockfishLevelProfile(level);
    state.game.message = `Boss N${level} · ${profile.label}. Sors du livre puis cherche l’échec et mat.`;
  }
  renderAdventureHud();
  focusAdvInput();
}

function submitAdventureMove() {
  const input = document.querySelector('#advMoveInput');
  if (!input) {
    return;
  }
  const value = input.value;
  input.value = '';
  submitHumanMove(value);
}

// --- Version portable : feuille d'analyse + barreau de coups en 1er niveau ---

function openAdvAnalyseSheet() {
  renderAdvAnalyseSheet();
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
  }
}

function closeAdvAnalyseSheet() {
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }
}

// Reprend l'éval détaillée + le commentaire déjà calculés (éléments du rail) dans la feuille.
function renderAdvAnalyseSheet() {
  const game = state.game;
  // Message d'évaluation / feedback en cours (ce qui apparaissait avant sur l'échiquier) —
  // c'est la première info utile : « Coup accepté (+0.38)… », combos, raison de défaite, etc.
  const message = document.querySelector('#advSheetMessage');
  if (message) {
    const text = game?.message ?? '';
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('is-defeat', game?.status === 'lost');
  }
  const evalDl = document.querySelector('#advSheetEval');
  if (evalDl) {
    // Quand un mat forcé est en vue, on remplace « Moyenne future » par le nombre
    // de coups avant le mat (info clé après la conversion automatique).
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
  // Commentaire de position (note du livre) : secondaire, masqué s'il double le message.
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

// Coups jouables (livre) affichés en 1er niveau : pièce + notation, sans texte autour.
function renderAdvMovesStrip() {
  const host = document.querySelector('#advMovesStrip');
  if (!host) {
    return;
  }
  host.replaceChildren();
  const game = state.game;
  const reviewing = Boolean(game && game.historyView != null);
  const inPlay = Boolean(game && game.status === 'playing' && !reviewing);

  // 1) Coups blancs jouables (selectionnables) pendant l'ouverture.
  const whitePlayable = inPlay && game.chess.turn() === 'w' && !game.locked && game.phase === 'opening';
  const whiteEdges = whitePlayable ? getExpectedWhiteBookEdges() : [];
  for (const edge of whiteEdges) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-move-key';
    btn.dataset.uci = edge.uci;
    btn.innerHTML =
      `<img class="adv-move-key-piece" src="/pieces/merida/w${sanPieceLetter(edge.san)}.svg" alt="" aria-hidden="true">` +
      `<span class="adv-move-key-san">${escapeHtml(edge.san)}</span>`;
    host.append(btn);
  }

  // 2) Reponses de Stockfish encore dans la theorie : touches "fantomes" non
  //    cliquables, avec la proba en discret (on voit le coup sans pouvoir le jouer).
  let ghosts = [];
  if (!whiteEdges.length && inPlay && game.chess.turn() === 'b' && game.phase === 'opening') {
    ghosts = buildOpponentBookCandidates(getOpponentBookEdgesForRun());
  }
  for (const cand of ghosts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'adv-move-key is-ghost';
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    const prob = `<span class="adv-move-key-prob">${escapeHtml(formatPercent(cand.probability))}</span>`;
    if (cand.type === 'free') {
      btn.classList.add('is-ghost-free');
      btn.innerHTML = `<span class="adv-move-key-san">Imprevu</span>${prob}`;
    } else {
      const san = cand.edge.san;
      btn.innerHTML =
        `<img class="adv-move-key-piece" src="/pieces/merida/b${sanPieceLetter(san)}.svg" alt="" aria-hidden="true">` +
        `<span class="adv-move-key-san">${escapeHtml(san)}</span>${prob}`;
    }
    host.append(btn);
  }
  // Zone réservée en permanence : quand aucun coup de livre n'est dispo (au tour de
  // Stockfish, ou hors livre), on garde la place avec un libellé — l'échiquier ne bouge plus.
  const hasContent = whiteEdges.length || ghosts.length;
  if (!hasContent) {
    const ph = document.createElement('span');
    ph.className = 'adv-moves-placeholder';
    ph.textContent = game?.victoryCinematic
      ? 'Conversion automatique en cours…'
      : game?.status === 'playing' && game.chess.turn() === 'b'
        ? 'Au tour de Stockfish…'
        : game?.status === 'playing' && game.phase !== 'opening'
          ? 'Hors du livre : joue ton coup sur l’échiquier'
          : ' ';
    host.append(ph);
  }
  host.classList.toggle('is-empty', !hasContent);
}

// Rafraîchit la barre portable (libellé de vue + barreau de coups + feuille d'analyse ouverte).
function updateAdvMobileBar() {
  const label = document.querySelector('#advBarViewLabel');
  if (label) {
    label.textContent = state.advViewMode === 'board' ? 'Cerveau' : 'Échiquier';
  }
  const ico = document.querySelector('#advBarView .adv-bar-ico');
  if (ico) {
    ico.textContent = state.advViewMode === 'board' ? '🧠' : '🎮';
  }
  renderAdvMovesStrip();
  renderAdvHistory();
  if (document.querySelector('#advAnalyseSheet')?.classList.contains('is-open')) {
    renderAdvAnalyseSheet();
  }
}

// --- Historique : navigation ‹/› + prévisualisation des positions passées ---

function advHistoryLength() {
  const game = state.game;
  return game?.chess ? game.chess.history().length : 0;
}

// Place la revue à un index de demi-coups (null/au-delà du total = position en cours).
function advHistoryGoto(index) {
  const game = state.game;
  if (!game) {
    return;
  }
  const total = advHistoryLength();
  game.historyView = index == null || index >= total ? null : clamp(index, 0, total);
  game.selectedSquare = null;
  // Revoir la partie via ‹/› doit fonctionner même après la fin : on désactive la
  // revue libre (qui sinon impose sa position à l'échiquier) tant qu'on navigue.
  if (game.historyView != null && game.freeReview?.active) {
    game.freeReview.active = false;
  }
  renderGameDetails();
}

function advHistoryStep(delta) {
  const game = state.game;
  if (!game) {
    return;
  }
  const current = game.historyView ?? advHistoryLength(); // position en cours = total demi-coups
  advHistoryGoto(current + delta);
}

// Affiche/masque la bande d'historique ; en la masquant on revient à la position en cours.
function toggleAdvHistory() {
  const hidden = document.body.classList.toggle('is-history-hidden');
  if (hidden && state.game?.historyView != null) {
    advHistoryGoto(null);
  }
}

// Libellé « N. san » / « N… san » du coup amenant à la position `idx`.
function formatHistoryMoveLabel(game, idx) {
  const move = game.chess.history({ verbose: true })[idx - 1];
  if (!move) {
    return 'Départ';
  }
  const moveNumber = Math.ceil(idx / 2);
  return move.color === 'w' ? `${moveNumber}. ${move.san}` : `${moveNumber}… ${move.san}`;
}

function renderAdvHistory() {
  const host = document.querySelector('#advHistory');
  if (!host) {
    return;
  }
  const game = state.game;
  const total = advHistoryLength();
  const prev = document.querySelector('#advHistPrev');
  const next = document.querySelector('#advHistNext');
  const label = document.querySelector('#advHistLabel');
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
  if (next) next.disabled = !reviewing; // déjà à la position en cours
}

function advSetText(selector, text) {
  const el = document.querySelector(selector);
  if (el) {
    el.textContent = text;
  }
}

function advSetWidth(selector, pct) {
  const el = document.querySelector(selector);
  if (el) {
    el.style.width = `${clamp(pct, 0, 100)}%`;
  }
}

function advStarString(count) {
  const filled = clamp(Math.round(count), 0, 3);
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
}

function updateHomeProgress() {
  const el = document.querySelector('#homeAdventureProgress');
  if (!el || !state.adventure) {
    return;
  }
  const progress = advBrainProgress();
  el.textContent = `Cerveau Nv.${progress.level} · ${advCoveragePct()} % du cortex · ${state.adventure.highestBoss}/10 boss`;
}

function advResultButton(label, handler, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  if (primary) {
    button.className = 'is-primary';
  }
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderAdventureResult(el, game, run) {
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

  if (run.kind === 'boss') {
    if (win) {
      heading.textContent = `Boss N${run.bossLevel} vaincu !`;
      stars.textContent = advStarString(state.adventure.bosses[run.bossLevel] || 3);
      note.textContent = 'Échec et mat livré. Le cortex gagne en puissance.';
      if (run.bossLevel < 10 && advBossUnlocked(run.bossLevel + 1)) {
        actions.append(
          advResultButton(`Boss N${run.bossLevel + 1} ▸`, () => launchBoss(run.bossLevel + 1), true)
        );
      }
    } else {
      const mated = Boolean(game.chess?.isCheckmate?.());
      heading.textContent = mated ? 'Échec et mat subi' : 'Position effondrée';
      note.textContent = mated
        ? 'Le boss t’a maté. Rejoue la chute ci-dessous, puis relance l’attaque.'
        : `La position est passée sous ${formatEval(advDeficitThresholdCp(run.bossLevel))}. Rejoue la chute ci-dessous, puis relance l’attaque.`;
      actions.append(advResultButton('🔁 Recommencer le boss', () => launchBoss(run.bossLevel), true));
    }
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

  actions.append(advResultButton('Carte du cerveau', () => openAdventureMap()));
  el.append(heading, stars, note, actions);
}

function renderAdventureHud() {
  if (!state.adventure) {
    return;
  }
  const progress = advBrainProgress();
  const coveragePct = advCoveragePct();
  advSetText('#advBrainLevel', String(progress.level));
  advSetText('#advXpLabel', `${Math.round(progress.into)} / ${progress.span} XP`);
  advSetWidth('#advXpFill', progress.span ? (progress.into / progress.span) * 100 : 0);
  advSetText('#advSynapseValue', `${coveragePct} %`);
  advSetWidth('#advSynapseFill', coveragePct);
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
  const moveInput = document.querySelector('#advMoveInput');
  const moveButton = document.querySelector('#advMoveButton');

  updateAdvMobileBar();

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

  if (run.kind === 'lesson') {
    if (kicker) kicker.textContent = 'Acte 1 · Apprentissage';
    if (title) title.textContent = 'Apprends la ligne';
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
        // Vue joueur : flammes proportionnelles au streak (max 5)
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
    if (game.status === 'won' || game.status === 'lost') {
      renderAdventureResult(result, game, run);
    } else {
      result.hidden = true;
    }
  }

  const canMove = game.status === 'playing' && game.chess.turn() === 'w' && !game.locked;
  if (moveInput) moveInput.disabled = !canMove;
  if (moveButton) moveButton.disabled = !canMove;
}

function makeAdventureStageRow(options) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `adv-stage${options.cls ? ` ${options.cls}` : ''}`;
  if (options.disabled) {
    button.disabled = true;
  }
  const node = document.createElement('span');
  node.className = 'adv-stage-node';
  node.textContent = options.icon;
  const info = document.createElement('div');
  info.className = 'adv-stage-info';
  const title = document.createElement('strong');
  title.textContent = options.title;
  const desc = document.createElement('span');
  desc.textContent = options.desc;
  info.append(title, desc);
  const stars = document.createElement('span');
  stars.className = 'adv-stage-stars';
  stars.textContent = options.showStars ? advStarString(options.stars) : '';
  button.append(node, info, stars);
  if (!options.disabled && options.onClick) {
    button.addEventListener('click', options.onClick);
  }
  return button;
}

function renderAdventureMap() {
  if (!state.adventure) {
    return;
  }
  const coveragePct = advCoveragePct();
  const progress = advBrainProgress();
  const ring = document.querySelector('#advBrainRing');
  if (ring) {
    ring.style.setProperty('--pct', String(coveragePct));
  }
  advSetText('#advRingValue', `${coveragePct} %`);
  advSetText('#advStatLevel', String(progress.level));
  advSetText('#advStatXp', String(Math.round(state.adventure.xp)));
  advSetText('#advStatSynapse', `${coveragePct} %`);
  advSetText('#advStatPower', `N${state.adventure.highestBoss}`);

  const act1 = document.querySelector('#advAct1Stages');
  if (act1) {
    act1.replaceChildren();
    const currentLesson = ADV_LESSONS.find((lesson) => !state.adventure.lessons[lesson.id]);
    for (const lesson of ADV_LESSONS) {
      const done = Boolean(state.adventure.lessons[lesson.id]);
      const isCurrent = currentLesson && lesson.id === currentLesson.id;
      act1.append(
        makeAdventureStageRow({
          icon: done ? '✓' : lesson.icon,
          title: lesson.title,
          desc: `Illumine ${Math.round(lesson.target * 100)} % du cortex`,
          stars: state.adventure.lessons[lesson.id] || 0,
          showStars: done,
          cls: done ? 'is-done' : isCurrent ? 'is-current' : '',
          disabled: false,
          onClick: () => launchLesson()
        })
      );
    }
    // Catégorie « Pièges » : débloquée une fois toutes les lignes apprises.
    if (bookHasTrapLines()) {
      const trapsUnlocked = advTrapsUnlocked();
      act1.append(
        makeAdventureStageRow({
          icon: trapsUnlocked ? '🎯' : '🔒',
          title: 'Pièges d’ouverture',
          desc: trapsUnlocked
            ? 'Fais tomber Stockfish et livre le mat'
            : 'Verrouillé : illumine 100 % du cortex',
          stars: 0,
          showStars: false,
          cls: trapsUnlocked ? '' : 'is-locked',
          disabled: !trapsUnlocked,
          onClick: () => launchTrapsLesson()
        })
      );
    }
  }

  const act2Section = document.querySelector('#advAct2Section');
  const act2 = document.querySelector('#advAct2Stages');
  const lock = document.querySelector('#advAct2Lock');
  const unlocked = advAct2Unlocked();
  if (act2Section) {
    act2Section.classList.toggle('is-locked', !unlocked);
  }
  if (lock) {
    lock.textContent = unlocked
      ? 'Arène ouverte : mate chaque niveau pour libérer le suivant.'
      : `Verrouillé : illumine ${Math.round(ADV_ACT2_UNLOCK * 100)} % du cortex (actuel ${coveragePct} %).`;
  }
  if (act2) {
    act2.replaceChildren();
    for (let level = 1; level <= 10; level += 1) {
      const profile = getStockfishLevelProfile(level);
      const done = Boolean(state.adventure.bosses[level]);
      const open = advBossUnlocked(level);
      const isCurrent = open && !done && level === state.adventure.highestBoss + 1;
      act2.append(
        makeAdventureStageRow({
          icon: done ? '✓' : open ? `N${level}` : '🔒',
          title: `Boss N${level} · ${profile.label}`,
          desc: profile.elo ? `${profile.elo} Elo · échec et mat requis` : 'Force max · échec et mat requis',
          stars: state.adventure.bosses[level] || 0,
          showStars: done,
          cls: done ? 'is-done' : isCurrent ? 'is-current' : open ? '' : 'is-locked',
          disabled: !open,
          onClick: () => launchBoss(level)
        })
      );
    }
  }
}

function bindAdventureEvents() {
  const bind = (selector, handler) => {
    const el = document.querySelector(selector);
    if (el) {
      el.addEventListener('click', handler);
    }
  };
  bind('#homeAdventureButton', enterAdventure);
  bind('#homeCreativeButton', enterCreative);
  bind('#homeResetAdventure', () => {
    if (window.confirm('Réinitialiser toute la progression Aventure ?')) {
      resetAdventureProgress();
    }
  });
  bind('#advHomeButton', () => setScreen('home'));
  bind('#advMapButton', openAdventureMap);
  bind('#advViewToggle', toggleAdvViewMode);
  bind('#advMapClose', closeAdventureMap);
  // Barre d'actions portable : Niveau / Analyse / Cerveau
  bind('#advBarMenu', openAdventureMap);
  bind('#advBarAnalyse', openAdvAnalyseSheet);
  bind('#advBarView', toggleAdvViewMode);
  // Historique : navigation ‹/› + masquer/afficher
  bind('#advHistPrev', () => advHistoryStep(-1));
  bind('#advHistNext', () => advHistoryStep(1));
  bind('#advHistToggle', toggleAdvHistory);
  // Feuille d'analyse : fermeture (croix / backdrop)
  const sheet = document.querySelector('#advAnalyseSheet');
  if (sheet) {
    sheet.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-close]')) {
        closeAdvAnalyseSheet();
      }
    });
  }
  // Barreau de coups en 1er niveau : touche = jouer le coup.
  const movesStrip = document.querySelector('#advMovesStrip');
  if (movesStrip) {
    movesStrip.addEventListener('click', (event) => {
      const btn = event.target.closest('.adv-move-key');
      // Les touches « fantômes » (réponses de Stockfish) n'ont pas d'UCI : non jouables.
      if (btn && !btn.disabled && btn.dataset.uci) {
        submitHumanMove(btn.dataset.uci);
      }
    });
  }
  bind('#advMapHomeButton', () => {
    closeAdventureMap();
    setScreen('home');
  });
  const form = document.querySelector('#advMoveForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitAdventureMove();
    });
  }
  // Rail d'infos (vue joueur aventure) : replier/déplier les sections de 2e niveau.
  if (elements.detailInfoContent) {
    elements.detailInfoContent.addEventListener('click', (event) => {
      if (state.screen !== 'adventure' || !document.body.classList.contains('is-adv-board-view')) {
        return;
      }
      const title = event.target.closest('.detail-section > h3');
      if (!title || !elements.detailInfoContent.contains(title)) {
        return;
      }
      title.parentElement.classList.toggle('is-open');
    });
  }
}

function bindEvents() {
  bindPanelResizeHandles();
  bindBoardDragEvents();
  bindBrainScrubEvents();

  elements.temperatureRange.addEventListener('input', () => {
    state.temperatureCp = Number(elements.temperatureRange.value);
    elements.temperatureValue.textContent = `${state.temperatureCp} cp`;
    renderGraph();
  });

  elements.floorRange.addEventListener('input', () => {
    state.floorMass = Number(elements.floorRange.value) / 100;
    elements.floorValue.textContent = `${elements.floorRange.value}%`;
    renderGraph();
  });

  elements.lineFilter.addEventListener('change', () => {
    state.lineFilter = elements.lineFilter.value;
    renderGraph();
  });

  elements.pgnFileInput.addEventListener('change', async () => {
    const file = elements.pgnFileInput.files?.[0];
    if (!file) {
      return;
    }
    elements.pgnImportStatus.textContent = 'Fichier chargé';
    elements.pgnTextInput.value = await file.text();
  });
  elements.buildPgnButton.addEventListener('click', () => {
    importPgnFromInput();
  });
  elements.defaultPgnButton.addEventListener('click', () => {
    restoreDefaultGraph();
  });

  elements.stockfishLevelRange.addEventListener('input', () => {
    state.stockfishLevel = getStockfishLevelProfile(elements.stockfishLevelRange.value).level;
    updateStockfishLevelUi();
    renderGamePanel();
  });

  elements.survivalLimitRange.addEventListener('input', () => {
    state.survivalLimitCp = Number(elements.survivalLimitRange.value);
    updateSurvivalLimitUi();
    renderGamePanel();
  });

  elements.bestPathButton.addEventListener('click', () => buildPath('best'));
  elements.randomPathButton.addEventListener('click', () => buildPath('random'));
  elements.resetButton.addEventListener('click', resetHighlight);
  elements.viewModeButton.addEventListener('click', toggleViewMode);
  elements.challengeModeButton.addEventListener('click', () => setPlayMode('challenge'));
  elements.explorationModeButton.addEventListener('click', () => setPlayMode('exploration'));
  elements.newGameButton.addEventListener('click', handleNewGameAction);
  elements.moveForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitHumanMove();
  });
  elements.boardZoomButton.addEventListener('click', () => setBoardZoomed(!state.boardZoomed));
  elements.boardZoomCloseButton.addEventListener('click', () => setBoardZoomed(false));
  elements.segmentToggleButton.addEventListener('click', () => {
    state.segmentExpanded = !state.segmentExpanded;
    renderDetails();
  });
  elements.segmentPrevButton.addEventListener('click', () => {
    state.segmentStepIndex = Math.max(0, state.segmentStepIndex - 1);
    renderDetails();
  });
  elements.segmentNextButton.addEventListener('click', () => {
    const maxIndex = Math.max(0, (state.selectedSegment?.pathNodeIds.length ?? 1) - 1);
    state.segmentStepIndex = Math.min(maxIndex, state.segmentStepIndex + 1);
    renderDetails();
  });
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
    if (isTyping) {
      return;
    }
    if (event.key.toLowerCase() === 'd') {
      event.preventDefault();
      toggleViewMode();
    }
  });
  window.addEventListener('resize', () => {
    clampPanelWidths();
    renderGraph();
  });
}

async function init() {
  const response = await fetch('./opening-graph.json');
  if (!response.ok) {
    throw new Error(`Impossible de charger opening-graph.json (${response.status})`);
  }
  state.defaultData = await response.json();
  state.adventure = loadAdventure();
  bindEvents();
  bindAdventureEvents();
  updateStockfishLevelUi();
  updateSurvivalLimitUi();
  setViewMode('human');
  setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
  state.activeBook = 'default';
  elements.pgnImportStatus.textContent = 'Livre actif';
  setScreen('home');
  updateHomeProgress();
}

init().catch((error) => {
  elements.summaryText.textContent = error.message;
  elements.selectedPathLabel.textContent = 'Le JSON du graphe est introuvable';
  console.error(error);
});
