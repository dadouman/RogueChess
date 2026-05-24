import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const initStockfish = require('stockfish');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_PGN_PATH = 'C:\\Users\\Jocelyn\\Downloads\\italian_opening_PK7F0mR6_lignes_detaillees.pgn';
const DEFAULT_OUTPUT_PATH = path.join(repoRoot, 'site', 'opening-neural-poc', 'opening-graph.json');
const MATE_SCORE_CP = 100000;
const DEFAULT_DEPTH = 8;
const PROBABILITY_TEMPERATURE_CP = 95;
const PROBABILITY_FLOOR_MASS = 0.01;

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitGames(pgn) {
  return pgn
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n(?=\[Event\s)/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseHeaders(block) {
  const headers = {};
  for (const match of block.matchAll(/^\[(\w+)\s+"((?:\\"|[^"])*)"\]$/gm)) {
    headers[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return headers;
}

function stripHeaders(block) {
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

function isMoveNumber(token) {
  return /^\d+\.(?:\.\.)?$/.test(token) || /^\d+\.\.\.$/.test(token);
}

function tokenizeMovetext(movetext) {
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

function parseGame(block, index) {
  const headers = parseHeaders(block);
  const movetext = stripHeaders(block);
  const tokens = tokenizeMovetext(movetext);
  const moves = [];
  let pendingComment = '';

  for (const token of tokens) {
    if (token.startsWith('{')) {
      const comment = normalizeText(token.slice(1, -1));
      if (moves.length) {
        const last = moves[moves.length - 1];
        last.comment = normalizeText([last.comment, comment].filter(Boolean).join(' '));
      } else {
        pendingComment = normalizeText([pendingComment, comment].filter(Boolean).join(' '));
      }
      continue;
    }

    if (
      isMoveNumber(token) ||
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

function createRootNode() {
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

function createMoveNode(id, chess, move, parsedMove, line) {
  const fen = chess.fen();
  return {
    id,
    fen,
    ply: chess.history().length,
    moveNumber: Math.ceil(chess.history().length / 2),
    sideToMove: chess.turn(),
    label: move.san,
    san: move.san,
    rawSan: parsedMove.rawSan,
    annotation: parsedMove.annotation,
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
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
    evaluation: null,
    futureMeanCp: null
  };
}

function buildOpeningGraph(lines) {
  const nodes = [createRootNode()];
  const nodeByFen = new Map([[nodes[0].fen, nodes[0]]]);
  const edgeByKey = new Map();
  const warnings = [];

  for (const line of lines) {
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
        child = createMoveNode(`n${nodes.length}`, chess, move, parsedMove, line);
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
          uci: `${move.from}${move.to}${move.promotion ?? ''}`,
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

function formatPvFromFen(fen, pvMoves, limit = 7) {
  const chess = new Chess(fen);
  const sanMoves = [];
  for (const uci of pvMoves.slice(0, limit)) {
    const move = playUciMove(chess, uci);
    if (!move) {
      break;
    }
    sanMoves.push(move.san);
  }
  return sanMoves.join(' ');
}

function playUciMove(chess, uci) {
  if (!uci || uci.length < 4) {
    return null;
  }
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4]
    });
  } catch {
    return null;
  }
}

function terminalEvaluation(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return {
      cpWhite: chess.turn() === 'w' ? -MATE_SCORE_CP : MATE_SCORE_CP,
      bestMove: null,
      pv: '',
      depth: 0,
      source: 'terminal'
    };
  }

  if (chess.isDraw()) {
    return {
      cpWhite: 0,
      bestMove: null,
      pv: '',
      depth: 0,
      source: 'terminal'
    };
  }

  return null;
}

class StockfishEvaluator {
  constructor(depth) {
    this.depth = depth;
    this.engine = null;
    this.pending = null;
  }

  async init() {
    this.engine = await initStockfish('lite-single');
    this.engine.listener = (line) => this.handleLine(String(line));
    await this.waitFor((line) => line === 'uciok', () => this.send('uci'), 7000);
    await this.waitFor((line) => line === 'readyok', () => this.send('isready'), 7000);
    this.send('setoption name Hash value 32');
    this.send('setoption name MultiPV value 1');
    this.send('ucinewgame');
  }

  send(command) {
    this.engine.sendCommand(command);
  }

  waitFor(predicate, start, timeoutMs) {
    return new Promise((resolve, reject) => {
      const previous = this.pending;
      const timeout = setTimeout(() => {
        this.pending = previous;
        reject(new Error(`Stockfish timeout while waiting for ${predicate.toString()}`));
      }, timeoutMs);

      this.pending = {
        onLine: (line) => {
          if (predicate(line)) {
            clearTimeout(timeout);
            this.pending = previous;
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

  async evaluate(fen) {
    const terminal = terminalEvaluation(fen);
    if (terminal) {
      return terminal;
    }

    return new Promise((resolve, reject) => {
      let latestCpWhite = null;
      let latestDepth = 0;
      let latestPvMoves = [];
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Stockfish evaluation timeout for ${fen}`));
      }, 12000);

      this.pending = {
        onLine: (line) => {
          if (line.startsWith('info ') && line.includes(' score ')) {
            const parsed = parseWhiteCentipawn(line, fen);
            const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] ?? 0);
            if (parsed !== null && depth >= latestDepth) {
              latestCpWhite = parsed;
              latestDepth = depth;
              latestPvMoves = parsePv(line);
            }
          }

          if (line.startsWith('bestmove')) {
            clearTimeout(timeout);
            this.pending = null;
            const bestMove = line.match(/^bestmove\s+(\S+)/)?.[1] ?? null;
            resolve({
              cpWhite: latestCpWhite ?? 0,
              bestMove: bestMove === '(none)' ? null : bestMove,
              pv: formatPvFromFen(fen, latestPvMoves),
              depth: latestDepth,
              source: 'stockfish'
            });
          }
        }
      };

      this.send(`position fen ${fen}`);
      this.send(`go depth ${this.depth}`);
    });
  }

  quit() {
    try {
      this.send('quit');
    } catch {
      // The WASM wrapper may already be closed; generation is complete either way.
    }
  }
}

function scoreForSide(cpWhite, sideToMove) {
  if (!Number.isFinite(cpWhite)) {
    return 0;
  }
  return sideToMove === 'w' ? cpWhite : -cpWhite;
}

function computeFutureMeans(graph) {
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

function assignProbabilities(graph) {
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
      Math.exp(Math.max(-800, Math.min(800, item.score - average)) / PROBABILITY_TEMPERATURE_CP)
    );
    const rawTotal = rawWeights.reduce((sum, value) => sum + value, 0);

    scored.forEach((item, index) => {
      const softmax = rawWeights[index] / rawTotal;
      item.edge.probability =
        PROBABILITY_FLOOR_MASS / scored.length + (1 - PROBABILITY_FLOOR_MASS) * softmax;
      item.edge.deltaCp = Math.round(item.score - average);
      item.edge.pathMeanCp = Math.round(item.pathMeanCp);
      item.edge.isBest = Math.abs(item.score - bestScore) < 0.001;
    });
  }
}

function summarize(graph, lines, depth, pgnPath) {
  const evaluatedNodes = graph.nodes.filter((node) => node.evaluation).length;
  const branchingNodes = graph.nodes.filter((node) => node.outgoing.length > 1).length;
  const maxPly = Math.max(...graph.nodes.map((node) => node.ply));
  return {
    title: 'Italian Opening Neural Solo POC',
    generatedAt: new Date().toISOString(),
    pgnPath,
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
        'Pour chaque position, les chemins enfants sont comparés sur leur moyenne future, puis transformés en probabilités par softmax avec masse minimale non nulle.',
      temperatureCp: PROBABILITY_TEMPERATURE_CP,
      floorMass: PROBABILITY_FLOOR_MASS,
      perspective: 'Blanc maximise les centipawns, Noir les minimise.'
    }
  };
}

async function main() {
  const pgnPath = path.resolve(getArgValue('pgn', DEFAULT_PGN_PATH));
  const outputPath = path.resolve(getArgValue('out', DEFAULT_OUTPUT_PATH));
  const depth = Number(getArgValue('depth', process.env.STOCKFISH_DEPTH ?? DEFAULT_DEPTH));

  const pgn = await fs.readFile(pgnPath, 'utf8');
  const lines = splitGames(pgn).map(parseGame);
  const graph = buildOpeningGraph(lines);

  console.log(`PGN: ${lines.length} lignes, ${graph.nodes.length} noeuds, ${graph.edges.length} arcs.`);
  console.log(`Stockfish: profondeur ${depth}.`);

  const evaluator = new StockfishEvaluator(depth);
  await evaluator.init();

  try {
    for (const [index, node] of graph.nodes.entries()) {
      node.evaluation = await evaluator.evaluate(node.fen);
      const cp = node.evaluation.cpWhite;
      const label = node.id === 'root' ? 'depart' : node.san;
      console.log(
        `${String(index + 1).padStart(3, '0')}/${graph.nodes.length} ${label.padEnd(8)} ${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
      );
    }
  } finally {
    evaluator.quit();
  }

  computeFutureMeans(graph);
  assignProbabilities(graph);

  const output = {
    summary: summarize(graph, lines, depth, pgnPath),
    lines: lines.map(({ moves, ...line }) => ({
      ...line,
      plies: moves.length
    })),
    nodes: graph.nodes,
    edges: graph.edges,
    warnings: graph.warnings
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Graphe ecrit: ${outputPath}`);

  // The stockfish.js wrapper sometimes keeps timers alive after quit.
  setTimeout(() => process.exit(0), 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
