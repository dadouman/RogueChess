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
  gameLevelLabel: document.querySelector('#gameLevelLabel'),
  lifeRow: document.querySelector('#lifeRow'),
  gameTitle: document.querySelector('#gameTitle'),
  gamePhase: document.querySelector('#gamePhase'),
  gameFreeRemaining: document.querySelector('#gameFreeRemaining'),
  gameEval: document.querySelector('#gameEval'),
  gameTurn: document.querySelector('#gameTurn'),
  moveForm: document.querySelector('#moveForm'),
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
  nodeSources: document.querySelector('#nodeSources')
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
  lineFilter: 'all',
  temperatureCp: 95,
  floorMass: DISPLAY_DEFAULT_FLOOR_MASS,
  stockfish: null,
  defaultData: null,
  isImportingPgn: false,
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
    : `tenir ${objective.target} réponses libres`;
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

function evaluationSeverity(cpWhite) {
  if (!Number.isFinite(cpWhite)) {
    return 'Stockfish ne donne pas de score exploitable, mais la position est perdue dans la ligne calculée.';
  }
  if (Math.abs(cpWhite) >= MATE_SCORE_CP - 1000) {
    return cpWhite < 0
      ? 'Stockfish annonce un mat forcé contre les Blancs.'
      : 'La position est gagnante pour les Blancs malgré la ligne affichée.';
  }
  if (cpWhite <= -900) {
    return 'Le déficit est écrasant et pratiquement irrattrapable.';
  }
  if (cpWhite <= -500) {
    return 'Le déficit est majeur: il faut une grosse erreur adverse pour revenir.';
  }
  if (cpWhite <= -300) {
    return 'Le déficit est sérieux: les Noirs ont une conversion très confortable.';
  }
  if (cpWhite <= SURVIVAL_LIMIT_CP) {
    return 'Le déficit dépasse le seuil de survie du niveau.';
  }
  return 'La position reste proche du seuil, mais la condition du niveau est rompue.';
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

function buildDefeatComment(fen, evaluation) {
  const evalText = formatEval(evaluation?.cpWhite);
  const severity = evaluationSeverity(evaluation?.cpWhite);
  const material = materialComment(fen);
  const pv = evaluation?.pv ? ` Ligne critique: ${evaluation.pv}.` : '';
  return `Défaite en phase libre: Stockfish évalue la position à ${evalText}. ${severity} ${material}${pv}`;
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
  let variationDepth = 0;

  for (const match of movetext.matchAll(tokenPattern)) {
    const token = match[0];
    if (token === '(') {
      variationDepth += 1;
      continue;
    }
    if (token === ')') {
      variationDepth = Math.max(0, variationDepth - 1);
      continue;
    }
    if (variationDepth > 0) {
      continue;
    }
    tokens.push(token);
  }

  return tokens;
}

function parsePgnGame(block, index) {
  const headers = parsePgnHeaders(block);
  const movetext = stripPgnHeaders(block);
  const tokens = tokenizePgnMovetext(movetext);
  const moves = [];
  let pendingComment = '';

  for (const rawToken of tokens) {
    if (rawToken.startsWith('{')) {
      const comment = normalizePgnText(rawToken.slice(1, -1));
      if (moves.length) {
        const last = moves[moves.length - 1];
        last.comment = normalizePgnText([last.comment, comment].filter(Boolean).join(' '));
      } else {
        pendingComment = normalizePgnText([pendingComment, comment].filter(Boolean).join(' '));
      }
      continue;
    }

    const token = stripInlineMoveNumber(rawToken);
    if (
      !token ||
      isMoveNumberToken(rawToken) ||
      RESULT_TOKENS.has(token) ||
      /^\$\d+$/.test(token) ||
      /^;/.test(token)
    ) {
      continue;
    }

    moves.push({
      rawSan: token,
      san: stripSanAnnotation(token),
      annotation: token.match(/[!?]+$/)?.[0] ?? '',
      comment: pendingComment
    });
    pendingComment = '';
  }

  return {
    id: `line_${String(index + 1).padStart(2, '0')}`,
    event: headers.Event ?? `Ligne ${index + 1}`,
    opening: headers.Opening ?? '',
    eco: headers.ECO ?? '',
    result: headers.Result ?? '*',
    site: headers.Site ?? '',
    moves
  };
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

function createImportedRootNode() {
  const chess = new Chess();
  return {
    id: 'root',
    fen: chess.fen(),
    ply: 0,
    moveNumber: 1,
    sideToMove: 'w',
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
  const nodes = [createImportedRootNode()];
  const nodeByFen = new Map([[nodes[0].fen, nodes[0]]]);
  const edgeByKey = new Map();
  const warnings = [];

  for (const line of lines) {
    if (!line.moves.length) {
      warnings.push(`${line.event}: aucune suite de coups exploitable.`);
      continue;
    }

    const chess = new Chess();
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

  async evaluate(fen, depth = this.depth) {
    const terminal = terminalEvaluation(fen);
    if (terminal) {
      return terminal;
    }

    await this.init();

    return new Promise((resolve, reject) => {
      let latestCpWhite = null;
      let latestDepth = 0;
      let latestPvMoves = [];
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error('Stockfish a mis trop longtemps à évaluer la position.'));
      }, 18000);

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
      this.send(`go depth ${depth}`);
    });
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

function edgePath(edge) {
  const source = state.layout.get(edge.from);
  const target = state.layout.get(edge.to);
  if (!source || !target) {
    return '';
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const c1x = source.x + dx * 0.62;
  const c2x = target.x - dx * 0.34;
  const c1y = source.y + dy * 0.08;
  const c2y = target.y - dy * 0.08;
  return `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${target.x.toFixed(1)} ${target.y.toFixed(1)}`;
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
  if (shouldFollowGameInGraph()) {
    syncGameGraphSelection(view);
  }
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
  const nodeLayer = createSvgElement('g', { class: 'node-layer' });
  svg.append(edgeLayer, nodeLayer);

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
    const path = createSvgElement('path', {
      class: [
        'neural-edge',
        edge.isBest ? 'is-best' : '',
        isForced ? 'is-forced' : '',
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
  }

  for (const viewNode of view.nodes) {
    const node = viewNode.raw;
    const point = state.layout.get(viewNode.id);
    if (!point) {
      continue;
    }
    const evalTone = clamp(((node.futureMeanCp ?? node.evaluation?.cpWhite ?? 0) + 250) / 500, 0, 1);
    const outgoing = viewNode.outgoing.length;
    const radius = node.id === 'root'
      ? 11
      : clamp(6.5 + outgoing * 2 + viewNode.collapsedIncomingPlyCount * 0.75, 7.5, 18);
    const matches = nodeMatchesFilter(node);
    const group = createSvgElement('g', {
      class: [
        'neural-node',
        outgoing > 1 ? 'is-branch' : '',
        viewNode.collapsedIncomingPlyCount > 1 ? 'is-compressed' : '',
        node.terminal ? 'is-terminal' : '',
        state.highlightedNodes.has(node.id) ? 'is-path' : '',
        state.selectedNodeId === node.id ? 'is-selected' : '',
        !matches ? 'is-muted' : ''
      ]
        .filter(Boolean)
        .join(' '),
      transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`
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

    group.append(pulse, circle, label);
    group.addEventListener('mouseenter', (event) => showNodeTooltip(node, event));
    group.addEventListener('mouseleave', hideTooltip);
    group.addEventListener('click', () => selectNode(node.id, { clearPath: false }));
    nodeLayer.append(group);
  }

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

function positionTooltip(event) {
  const stageRect = elements.graphSvg.getBoundingClientRect();
  elements.graphTooltip.hidden = false;
  elements.graphTooltip.style.left = `${clamp(event.clientX - stageRect.left + 14, 12, stageRect.width - 298)}px`;
  elements.graphTooltip.style.top = `${clamp(event.clientY - stageRect.top + 14, 82, stageRect.height - 126)}px`;
}

function hideTooltip() {
  elements.graphTooltip.hidden = true;
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
  elements.nodeComment.textContent =
    previewNode?.comments?.[0] ??
    selectedSegment?.comments[0] ??
    node.comments[0] ??
    incomingEdge?.comments[0] ??
    'Aucune note pour cette position.';
  elements.nodeSources.textContent = formatSourceList(selectedSegment?.sources ?? node.sources);
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

function renderBoard(node, container = elements.boardPreview) {
  const [boardPart] = node.fen.split(' ');
  const rows = boardPart.split('/');
  const from = node.from;
  const to = node.to;
  const interactive = isBoardInteractive(container);
  const openingArrows = getOpeningBoardArrows();
  const selectedSquare = interactive ? state.game.selectedSquare : null;
  const legalTargets = selectedSquare ? getLegalTargetsFromSquare(selectedSquare) : new Set();
  const openingBookMode = interactive && isOpeningBookChoiceActive();
  const bookTargets =
    selectedSquare && openingBookMode ? getBookTargetsFromSquare(selectedSquare) : new Set();
  container.replaceChildren();
  container.classList.toggle('is-game-board', interactive);
  container.classList.toggle('has-opening-arrows', openingArrows.length > 0);

  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        const empty = Number(char);
        for (let index = 0; index < empty; index += 1) {
          appendSquare(container, rankIndex, fileIndex, null, from, to, {
            interactive,
            selectedSquare,
            legalTargets,
            bookTargets,
            openingBookMode
          });
          fileIndex += 1;
        }
      } else {
        appendSquare(container, rankIndex, fileIndex, char, from, to, {
          interactive,
          selectedSquare,
          legalTargets,
          bookTargets,
          openingBookMode
        });
        fileIndex += 1;
      }
    }
  });

  renderBoardArrows(container, openingArrows);
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
  const selectable = options.interactive && pieceColor === 'w';
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
    square.append(image);
  }

  container.append(square);
}

function isBoardInteractive(container) {
  return Boolean(
    container === elements.boardPreview &&
      shouldRenderGameDetails() &&
      state.game?.active &&
      state.game.status === 'playing' &&
      !state.game.locked &&
      state.game.chess.turn() === 'w'
  );
}

function getLegalTargetsFromSquare(square) {
  if (!state.game || !square) {
    return new Set();
  }
  return new Set(state.game.chess.moves({ square, verbose: true }).map((move) => move.to));
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

function handleBoardSquareClick(squareName) {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.locked || game.chess.turn() !== 'w') {
    return;
  }

  const piece = game.chess.get(squareName);
  const selected = game.selectedSquare;

  if (!selected) {
    if (piece?.color === 'w') {
      selectBoardSquare(squareName);
      return;
    }
    game.message = 'Sélectionne une pièce blanche pour jouer.';
    renderGameDetails();
    return;
  }

  if (selected === squareName) {
    game.selectedSquare = null;
    game.message = 'Sélection annulée.';
    renderGameDetails();
    return;
  }

  const legalMoves = game.chess.moves({ square: selected, verbose: true });
  const move = legalMoves.find(
    (candidate) =>
      candidate.to === squareName &&
      (!candidate.promotion || candidate.promotion === 'q')
  ) ?? legalMoves.find((candidate) => candidate.to === squareName);

  if (move) {
    const uci = `${selected}${squareName}${move.promotion ?? ''}`;
    submitHumanMove(uci);
    return;
  }

  if (piece?.color === 'w') {
    selectBoardSquare(squareName);
    return;
  }

  game.message = 'Cette destination n’est pas légale pour la pièce sélectionnée.';
  renderGameDetails();
}

function selectBoardSquare(squareName) {
  state.game.selectedSquare = squareName;
  const legalMoves = state.game.chess.moves({ square: squareName, verbose: true });
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

function setViewMode(mode) {
  state.viewMode = mode === 'brain' ? 'brain' : 'human';
  document.body.classList.toggle('is-human-view', state.viewMode === 'human');
  document.body.classList.toggle('is-brain-view', state.viewMode === 'brain');
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
  elements.challengeModeButton.classList.toggle('is-active', state.playMode === 'challenge');
  elements.explorationModeButton.classList.toggle('is-active', state.playMode === 'exploration');
  startNewGame();
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
    depth: evaluation?.depth ?? 0,
    pv: evaluation?.pv ?? '',
    status: 'start',
    analysis: `Position initiale. Éval ${formatEval(cpWhite)}. La revue permet de rejouer mentalement toute la partie, livre et survie compris.`
  };
}

function createInitialGameState(level = state.campaignLevel) {
  const exploration = state.playMode === 'exploration';
  const objective = getLevelObjective(exploration ? FIRST_LEVEL_NUMBER : level);
  const chess = new Chess();
  const rootEvaluation = getNode('root')?.evaluation ?? { cpWhite: 0 };
  return {
    active: true,
    mode: state.playMode,
    level: exploration ? FIRST_LEVEL_NUMBER : level,
    objective,
    nextLevel: null,
    finalVictory: false,
    chess,
    currentNodeId: 'root',
    phase: 'opening',
    status: 'playing',
    lives: STARTING_LIVES,
    freeRemaining:
      exploration || objective.type === 'mate' ? Number.POSITIVE_INFINITY : objective.target,
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
      index: -1
    },
    failureFen: null,
    failureEvaluation: null,
    defeatComment: '',
    expectedOpeningArrows: [],
    defeatLineRecorded: false,
    cinematic: null,
    cinematicTimer: null
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

function isEdgeLegalInGame(edge) {
  if (!state.game || !edge) {
    return false;
  }
  const chess = new Chess(state.game.chess.fen());
  return Boolean(playUciOnChess(chess, edge.uci));
}

function getExpectedWhiteBookEdges() {
  if (!state.game || state.game.phase !== 'opening') {
    return [];
  }
  return getRawOutgoingEdges(state.game.currentNodeId, 'w').filter(isEdgeLegalInGame);
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
  return getRawOutgoingEdges(state.game.currentNodeId, 'b').filter(isEdgeLegalInGame);
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

function pickWeightedRawEdge(edges) {
  if (!edges.length) {
    return null;
  }
  const total = edges.reduce((sum, edge) => sum + Math.max(0, edge.probability ?? 0), 0);
  if (total <= 0) {
    return edges[Math.floor(Math.random() * edges.length)];
  }
  let roll = Math.random() * total;
  for (const edge of edges) {
    roll -= Math.max(0, edge.probability ?? 0);
    if (roll <= 0) {
      return edge;
    }
  }
  return edges[edges.length - 1];
}

function shouldOpponentLeaveBook() {
  if (!state.game) {
    return false;
  }
  return (
    state.game.chess.history().length >= OPENING_FREE_BREAK_PLY &&
    Math.random() < OPENING_FREE_BREAK_PROBABILITY
  );
}

function applyGameEdge(edge) {
  const beforeFen = state.game.chess.fen();
  const beforeEvalCp = state.game.currentEvalCp;
  const move = playUciOnChess(state.game.chess, edge.uci);
  if (!move) {
    return null;
  }
  state.game.lastMove = move;
  state.game.currentNodeId = edge.to;
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
  return move;
}

function applyFreeMove(move, label) {
  state.game.lastMove = move;
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
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
    entry.phase === 'free' && entry.color === 'w' && entry.afterEvalCp < SURVIVAL_LIMIT_CP
      ? ` Le coup passe sous le seuil ${formatEval(SURVIVAL_LIMIT_CP)}.`
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
  return `${verdict} ${evalText}${thresholdText}${statusText}${pvText}`;
}

function recordFreeReviewMove({ move, label, beforeFen, beforeEvalCp, evaluation, phase = 'free', status = 'played' }) {
  const game = state.game;
  if (!game || !move || !Number.isFinite(beforeEvalCp) || !evaluation) {
    return null;
  }

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
    depth: evaluation.depth,
    pv: evaluation.pv,
    status
  };
  entry.analysis = buildReviewMoveAnalysis(entry);
  game.freeReviewMoves.push(entry);
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

function getActiveFreeReviewEntry() {
  const game = state.game;
  if (!game?.freeReview?.active || !game.freeReviewMoves.length) {
    return null;
  }
  const index = clamp(game.freeReview.index, 0, game.freeReviewMoves.length - 1);
  return game.freeReviewMoves[index] ?? null;
}

function setFreeReviewIndex(index) {
  const game = state.game;
  if (!game?.freeReviewMoves.length) {
    return;
  }
  clearGameCinematic();
  game.freeReview.active = true;
  game.freeReview.index = clamp(index, 0, game.freeReviewMoves.length - 1);
  renderGameDetails();
}

function stopFreeReview() {
  if (!state.game) {
    return;
  }
  state.game.freeReview.active = false;
  renderGameDetails();
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
    `Niveau ${game.level} validé: tu as survécu à ${game.objective.target} réponses libres. Prochain objectif: ${formatLevelObjective(nextLevel)}.`
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
  finishGame('won', message);
}

async function submitHumanMove(rawInput = elements.moveInput.value) {
  const game = state.game;
  if (!game || game.locked || game.status !== 'playing') {
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
    consumeLife(buildOpeningMismatchMessage(result.move));
    return;
  }

  state.game.expectedOpeningArrows = [];
  applyGameEdge(result.edge);
  if (!isExplorationMode() && state.game.chess.isCheckmate()) {
    finishCampaignByMate();
    return;
  }
  state.game.message = isExplorationMode()
    ? `Ligne suivie: ${result.edge.san}.`
    : `Bien: ${result.edge.san} reste dans l'ouverture.`;
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
  const beforeFen = state.game.chess.fen();
  const beforeEvalCp = state.game.currentEvalCp;
  const move = tryMoveInput(state.game.chess, input);
  if (!move) {
    state.game.message = 'Coup libre illégal ou illisible.';
    return;
  }

  applyFreeMove(move, 'Survie blanche');
  state.game.message = 'Stockfish évalue ton coup libre...';
  renderGamePanel();
  renderGameDetails();
  const evaluator = await ensureStockfishReady();
  const evaluation = await evaluator.evaluate(state.game.chess.fen());
  state.game.currentEvalCp = evaluation.cpWhite;
  state.game.currentPv = evaluation.pv;
  state.game.currentDepth = evaluation.depth;

  if (!isExplorationMode() && evaluation.cpWhite < SURVIVAL_LIMIT_CP) {
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
      `Erreur en survie: la position tombe à ${formatEval(evaluation.cpWhite)}.`,
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

  state.game.message = isExplorationMode()
    ? `Position explorée à ${formatEval(evaluation.cpWhite)}. Stockfish répond.`
    : `Coup accepté (${formatEval(evaluation.cpWhite)}). Stockfish répond.`;
  renderGamePanel();
  await advanceOpponentTurn();
}

async function advanceOpponentTurn() {
  const game = state.game;
  if (!game || game.status !== 'playing' || game.chess.turn() !== 'b') {
    return;
  }

  if (game.phase === 'opening') {
    const blackBookEdges = getBlackBookEdges();
    if (blackBookEdges.length && !shouldOpponentLeaveBook()) {
      const edge = pickWeightedRawEdge(blackBookEdges);
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
      blackBookEdges.length
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

  game.message = 'Stockfish calcule la réponse noire...';
  renderGamePanel();
  renderGameDetails();
  const evaluator = await ensureStockfishReady(false);
  const evaluation = await evaluator.evaluate(game.chess.fen());
  const beforeFen = game.chess.fen();
  const beforeEvalCp = evaluation.cpWhite;
  if (!evaluation.bestMove) {
    finishTerminalPosition('La partie est terminée.');
    return;
  }

  const move = playUciOnChess(game.chess, evaluation.bestMove);
  if (!move) {
    finishGame('won', 'Stockfish ne trouve aucun coup légal.');
    return;
  }

  applyFreeMove(move, 'Stockfish noir');
  const afterEvaluation = await evaluator.evaluate(game.chess.fen());
  game.currentEvalCp = afterEvaluation.cpWhite;
  game.currentPv = afterEvaluation.pv;
  game.currentDepth = afterEvaluation.depth;
  recordFreeReviewMove({
    move,
    label: 'Stockfish noir',
    beforeFen,
    beforeEvalCp,
    evaluation: afterEvaluation
  });
  if (!isExplorationMode() && Number.isFinite(game.freeRemaining)) {
    game.freeRemaining = Math.max(0, game.freeRemaining - 1);
  }

  if (!isExplorationMode() && game.chess.isCheckmate()) {
    finishGame('lost', 'Échec et mat: la survie s’arrête ici.', game.chess.fen(), afterEvaluation);
    return;
  }

  if (!isExplorationMode() && afterEvaluation.cpWhite < SURVIVAL_LIMIT_CP) {
    finishGame(
      'lost',
      `La réponse Stockfish punit l'erreur: la position tombe à ${formatEval(afterEvaluation.cpWhite)}.`,
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
    ? `Réponse Stockfish: ${move.san}. Exploration libre, seuil indicatif: -1.00.`
    : isMateObjective(game)
    ? `Réponse Stockfish: ${move.san}. Objectif final: trouve le mat sans passer sous -1.00.`
    : `Réponse Stockfish: ${move.san}. Il reste ${game.freeRemaining} coups libres à tenir.`;
}

function enterFreePhase(message) {
  state.game.phase = 'free';
  state.game.message = isExplorationMode()
    ? `${message} Le seuil -1.00 reste affiché comme repère, sans pénalité.`
    : `${message} Ne laisse pas l'évaluation passer sous -1.00.`;
  const node = getGameNodeByFen();
  if (node) {
    state.game.currentNodeId = node.id;
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
  game.status = result;
  game.locked = false;
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

function syncGameGraphSelection(view) {
  const game = state.game;
  if (!game?.active || !view) {
    return;
  }

  const currentId = game.currentNodeId;
  const directNode = view.nodesById.get(currentId);
  const containingSegment = view.edges.find((edge) => edge.pathNodeIds.includes(currentId));
  if (containingSegment) {
    state.selectedNodeId = containingSegment.to;
    state.selectedSegment = containingSegment;
    state.segmentStepIndex = containingSegment.pathNodeIds.indexOf(currentId);
    state.highlightedEdges = new Set([containingSegment.id]);
    state.highlightedNodes = new Set([containingSegment.from, containingSegment.to]);
    elements.selectedPathLabel.textContent = `Jeu: ${containingSegment.sequenceLabel}`;
    return;
  }

  if (directNode) {
    state.selectedNodeId = currentId;
    state.selectedSegment = null;
    state.segmentStepIndex = 0;
    state.highlightedNodes = new Set([currentId]);
    state.highlightedEdges.clear();
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

  return {
    id: 'game',
    san: game.lastMove?.san ?? 'Départ',
    fen: game.chess.fen(),
    from: game.lastMove?.from ?? '',
    to: game.lastMove?.to ?? '',
    sideToMove: game.chess.turn()
  };
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
          ? "Objectif final: mater sans passer sous -1.00."
          : `Survie Stockfish: ${game.freeRemaining}/${game.objective.target} réponses noires restantes.`;
  elements.nodeEval.textContent = reviewEntry ? formatEval(reviewEntry.afterEvalCp) : formatEval(game.currentEvalCp);
  elements.nodeFuture.textContent =
    reviewEntry
      ? formatEvalDelta(reviewEntry.afterEvalCp - reviewEntry.beforeEvalCp)
      : game.phase === 'free'
      ? formatFreeRemaining(game)
      : formatEval(currentNode?.futureMeanCp);
  elements.nodeTurn.textContent = sideLabel(reviewEntry ? boardNode.sideToMove : game.chess.turn());
  elements.nodeComment.textContent = reviewEntry ? reviewEntry.analysis : game.message;
  elements.nodeSources.textContent = reviewEntry
    ? reviewEntry.phase === 'opening'
      ? 'Livre d’ouverture + évaluation pré-calculée'
      : reviewEntry.phase === 'start'
        ? 'Position initiale'
        : reviewEntry.phase === 'engine-line'
          ? `Suite Stockfish d${reviewEntry.depth || STOCKFISH_DEPTH}`
          : `Stockfish d${reviewEntry.depth || STOCKFISH_DEPTH}`
    : formatSourceList(currentNode?.sources ?? []);
  state.currentPreviewNode = boardNode;

  renderBoard(boardNode);
  renderZoomBoard(boardNode);
  renderSegmentExplorer(null);
  renderGameChoices();
  renderGamePanel(phaseLabel);
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
  elements.gameMessage.textContent = reviewEntry ? reviewEntry.analysis : game.message;
  elements.playMoveButton.disabled =
    game.locked || game.status !== 'playing' || game.chess.turn() !== 'w';
  elements.moveInput.disabled = elements.playMoveButton.disabled;
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
    ? 'Coup libre: seuil indicatif -1.00'
    : isMateObjective(game)
      ? 'Objectif mat: reste >= -1.00'
      : 'Coup libre: reste >= -1.00';
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
    rows = getBlackBookEdges().map((edge) => ({
      label: edge.san,
      value: formatPercent(edge.probability)
    }));
  } else if (game.phase === 'opening') {
    rows = getExpectedWhiteBookEdges()
      .flatMap((whiteEdge) => {
        const child = getNode(whiteEdge.to);
        return (child?.outgoing ?? [])
          .map(getEdge)
          .filter((edge) => edge?.color === 'b')
          .map((edge) => ({
            label: `${whiteEdge.san} → ${edge.san}`,
            value: formatPercent(edge.probability)
          }));
      })
      .slice(0, 4);
  } else {
    rows = [
      {
        label: 'Stockfish libre',
        value: `d${STOCKFISH_DEPTH}`
      }
    ];
  }

  if (
    game.phase === 'opening' &&
    game.chess.history().length >= OPENING_FREE_BREAK_PLY
  ) {
    rows.push({ label: 'Sortie libre', value: formatPercent(OPENING_FREE_BREAK_PROBABILITY) });
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
  const moves = state.game?.moveLog ?? [];
  for (const item of moves) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.label)}</span>`;
    elements.moveLogList.append(row);
  }
}

function renderFreeReviewPanel() {
  const game = state.game;
  elements.freeReviewPanel.replaceChildren();
  if (!hasPostGameFreeReview()) {
    elements.freeReviewPanel.hidden = true;
    return;
  }

  elements.freeReviewPanel.hidden = false;
  const activeEntry = getActiveFreeReviewEntry() ?? game.freeReviewMoves[game.freeReviewMoves.length - 1];
  const header = document.createElement('div');
  header.className = 'free-review-header';
  header.innerHTML = `
    <div>
      <span class="kicker">Revue de partie</span>
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
  prevButton.disabled = activeEntry.index <= 0;
  prevButton.addEventListener('click', () => setFreeReviewIndex(activeEntry.index - 1));

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = '›';
  nextButton.setAttribute('aria-label', 'Position suivante');
  nextButton.disabled = activeEntry.index >= game.freeReviewMoves.length - 1;
  nextButton.addEventListener('click', () => setFreeReviewIndex(activeEntry.index + 1));

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

  const summary = document.createElement('p');
  summary.className = 'free-review-analysis';
  summary.textContent = activeEntry.analysis;

  const list = document.createElement('div');
  list.className = 'free-review-list';
  for (const entry of game.freeReviewMoves) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = entry.index === activeEntry.index ? 'is-active' : '';
    button.innerHTML = `
      <span>${escapeHtml(entry.text)}</span>
      <em>${formatEval(entry.afterEvalCp)}</em>
    `;
    button.addEventListener('click', () => setFreeReviewIndex(entry.index));
    list.append(button);
  }

  elements.freeReviewPanel.append(header, controls, summary, list);
}

function renderGameChoices() {
  const game = state.game;
  elements.choiceList.replaceChildren();
  if (!game) {
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
    ? 'Exploration libre: joue n’importe quel coup légal, le seuil -1.00 sert seulement de repère.'
    : isMateObjective(game)
      ? "Objectif mat: joue un coup légal qui garde l'évaluation à -1.00 ou mieux jusqu'au mat."
      : 'Coup libre: joue un coup légal qui garde l’évaluation à -1.00 ou mieux.';
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
  let roll = Math.random();
  for (const edge of outgoing) {
    roll -= edge.probability;
    if (roll <= 0) {
      return edge;
    }
  }
  return outgoing[outgoing.length - 1];
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
  const lines = makeLineEventsUnique(blocks.map(parsePgnGame)).filter((line) => line.moves.length);
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

function bindEvents() {
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
  window.addEventListener('resize', () => renderGraph());
}

async function init() {
  const response = await fetch('./opening-graph.json');
  if (!response.ok) {
    throw new Error(`Impossible de charger opening-graph.json (${response.status})`);
  }
  state.defaultData = await response.json();
  bindEvents();
  setViewMode('human');
  setGraphData(cloneGraphData(state.defaultData), 'Livre italien actif');
  elements.pgnImportStatus.textContent = 'Livre actif';
}

init().catch((error) => {
  elements.summaryText.textContent = error.message;
  elements.selectedPathLabel.textContent = 'Le JSON du graphe est introuvable';
  console.error(error);
});
