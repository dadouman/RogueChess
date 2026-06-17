// Import PGN → graphe d'ouvertures. Parsing pur du texte PGN (en-têtes, movetext,
// variantes), construction du graphe de nœuds/arêtes et résumé de l'import. Aucune
// dépendance à l'état global ni au DOM : texte en entrée, structure de données en
// sortie. Le calcul des moyennes/probabilités de branche et l'orchestration (UI,
// état, yield navigateur) restent dans app.js.
import { Chess } from './vendor/chess.js';
import { STANDARD_START_FEN, moveToUci } from './chess-utils.js';
import { PROBABILITY_TEMPERATURE_CP, PROBABILITY_FLOOR_MASS } from './constants.js';

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

export {
  splitPgnGames,
  parsePgnGame,
  makeLineEventsUnique,
  buildGraphFromPgnLines,
  summarizeImportedGraph
};
