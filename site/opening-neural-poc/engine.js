// Module moteur : profils de niveau Stockfish + wrapper du Web Worker.
// Dépend de chess.js (via chess-utils), de l'état (niveau courant) et de helpers.
import { state } from './state.js';
import { DEFAULT_STOCKFISH_LEVEL } from './constants.js';
import { clamp } from './utils.js';
import {
  parseWhiteCentipawn,
  parsePv,
  formatPvFromFen,
  terminalEvaluation
} from './chess-utils.js';

export const STOCKFISH_DEPTH = 8;

export const STOCKFISH_LEVELS = {
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

export function getStockfishLevelProfile(level = state.stockfishLevel) {
  const safeLevel = clamp(Math.round(Number(level) || DEFAULT_STOCKFISH_LEVEL), 1, 10);
  return STOCKFISH_LEVELS[safeLevel] ?? STOCKFISH_LEVELS[DEFAULT_STOCKFISH_LEVEL];
}

export function formatStockfishLevel(profile = getStockfishLevelProfile()) {
  const strength = profile.elo ? `${profile.elo} Elo` : 'force max';
  return `N${profile.level} ${profile.label} · ${strength}`;
}

export class BrowserStockfishEvaluator {
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
      // Moteur servi tel quel depuis public/engine/ (le .js localise son .wasm
      // voisin via currentScript) ; non bundlé par Vite.
      this.worker = new Worker('/engine/stockfish-18-lite-single.js');
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
