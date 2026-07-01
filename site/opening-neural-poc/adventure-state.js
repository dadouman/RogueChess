// Persistance du mode Aventure : création de l'état initial, chargement et
// sauvegarde (localStorage). S'appuie sur l'état partagé, un util (clamp) et
// la configuration aventure (validation des champs).
import { state } from './state.js';
import { clamp } from './utils.js';
import {
  ADV_DIFFICULTIES,
  DEFAULT_ADV_DIFFICULTY,
  TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  ADV_STORAGE_KEY,
  ADV_MAX_GAMES,
  ADV_GLOBAL_LIVES_MAX,
  MATE_HANDOVER_OPTIONS,
  DEFAULT_MATE_HANDOVER,
  MATE_TOLERANCE_OPTIONS,
  DEFAULT_MATE_TOLERANCE
} from './adventure-config.js';

export function createAdventureState() {
  return {
    xp: 0,
    nodes: new Set(),
    lessons: {},
    bosses: {}, // record d'étoiles par boss (0-3) : « déjà acquises », permanent
    bossStreaks: {}, // série de victoires en cours par boss (0-3), remise à 0 à la défaite
    highestBoss: 0,
    act2Announced: false,
    movesPlayed: 0, // temps de jeu : coups BLANCS joués (toutes parties)
    playerXp: 0, // XP joueur pondérée par la qualité des coups → niveau joueur
    games: [], // historique des parties terminées (M) : résultat, adversaire, ouverture
    difficulty: DEFAULT_ADV_DIFFICULTY,
    timeControl: DEFAULT_TIME_CONTROL, // U : cadence de la pendule
    customClockMinutes: 10, // U : minutes/camp de la cadence personnalisée
    coins: 0, // Boutique : pièces gagnées par victoire
    boostedLines: [], // (héritage) ancien système de surpondération de ligne
    // O — pondération des choix d'ouverture de Stockfish (±5%), valable pour le
    // prochain boss puis remise à zéro. Clé = `${fenAvantCoupNoir}|${uci}`.
    openingWeights: {}, // { clé: pourcentage } (réinitialisé après chaque partie de boss)
    openingDeck: null, // file des propositions restantes (null = à (re)remplir, [] = épuisée)
    openingLocks: [], // cadenas : propositions non consommées (cumulables)
    threatsEnabled: false, // R : aide « voir les menaces » activée
    mateHandover: DEFAULT_MATE_HANDOVER, // « mat en X » : seuil de fin de conversion
    mateTolerance: DEFAULT_MATE_TOLERANCE, // tolérance « mat qui s'éloigne »
    influenceDisabled: false, // surpondération d'ouverture désactivée par le joueur
    influenceMode: 'random', // 'random' = nœud tiré au hasard ; 'game' = nœuds de la partie jouée
    // Vies globales : nombre de défaites possibles contre les bots. 0 au départ ;
    // 3 débloquées à 50 % d'apprentissage ; -1 par défaite ; rechargées par la
    // révision ou le lendemain.
    globalLives: 0,
    livesUnlocked: false, // a déjà atteint 50 % une fois
    livesDate: null, // YYYY-MM-DD du dernier remplissage (reset quotidien)
    bestScores: {} // records du score d'apprentissage par mode (lesson/trap/quiz/mate)
  };
}

export function loadAdventure() {
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
    base.bossStreaks =
      data.bossStreaks && typeof data.bossStreaks === 'object' ? data.bossStreaks : {};
    base.highestBoss = Number(data.highestBoss) || 0;
    base.act2Announced = Boolean(data.act2Announced);
    base.movesPlayed = Number(data.movesPlayed) || 0;
    base.playerXp = Number(data.playerXp) || 0;
    base.games = Array.isArray(data.games) ? data.games.slice(0, ADV_MAX_GAMES) : [];
    base.difficulty = ADV_DIFFICULTIES.some((d) => d.id === data.difficulty)
      ? data.difficulty
      : DEFAULT_ADV_DIFFICULTY;
    base.timeControl = TIME_CONTROLS.some((t) => t.id === data.timeControl)
      ? data.timeControl
      : DEFAULT_TIME_CONTROL;
    base.customClockMinutes = clamp(Number(data.customClockMinutes) || 10, 0.5, 180);
    base.coins = Math.max(0, Number(data.coins) || 0);
    base.boostedLines = Array.isArray(data.boostedLines) ? data.boostedLines.slice(0, 30) : [];
    base.openingWeights =
      data.openingWeights && typeof data.openingWeights === 'object' ? data.openingWeights : {};
    base.openingDeck = Array.isArray(data.openingDeck) ? data.openingDeck.slice(0, 40) : null;
    base.openingLocks = Array.isArray(data.openingLocks) ? data.openingLocks.slice(0, 40) : [];
    base.threatsEnabled = Boolean(data.threatsEnabled);
    base.mateHandover = MATE_HANDOVER_OPTIONS.some((o) => o.id === Number(data.mateHandover))
      ? Number(data.mateHandover)
      : DEFAULT_MATE_HANDOVER;
    base.mateTolerance = MATE_TOLERANCE_OPTIONS.some((o) => o.id === Number(data.mateTolerance))
      ? Number(data.mateTolerance)
      : DEFAULT_MATE_TOLERANCE;
    base.influenceDisabled = Boolean(data.influenceDisabled);
    base.influenceMode = data.influenceMode === 'game' ? 'game' : 'random';
    base.globalLives = clamp(Number(data.globalLives) || 0, 0, ADV_GLOBAL_LIVES_MAX);
    base.livesUnlocked = Boolean(data.livesUnlocked);
    base.livesDate = typeof data.livesDate === 'string' ? data.livesDate : null;
    base.bestScores = data.bestScores && typeof data.bestScores === 'object' ? data.bestScores : {};
  } catch {
    return createAdventureState();
  }
  return base;
}

export function saveAdventure() {
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
        bossStreaks: state.adventure.bossStreaks || {},
        highestBoss: state.adventure.highestBoss,
        act2Announced: state.adventure.act2Announced,
        movesPlayed: state.adventure.movesPlayed || 0,
        playerXp: state.adventure.playerXp || 0,
        games: (state.adventure.games || []).slice(0, ADV_MAX_GAMES),
        difficulty: state.adventure.difficulty || DEFAULT_ADV_DIFFICULTY,
        timeControl: state.adventure.timeControl || DEFAULT_TIME_CONTROL,
        customClockMinutes: state.adventure.customClockMinutes || 10,
        coins: state.adventure.coins || 0,
        boostedLines: (state.adventure.boostedLines || []).slice(0, 30),
        openingWeights: state.adventure.openingWeights || {},
        openingDeck: Array.isArray(state.adventure.openingDeck)
          ? state.adventure.openingDeck.slice(0, 40)
          : null,
        openingLocks: (state.adventure.openingLocks || []).slice(0, 40),
        threatsEnabled: Boolean(state.adventure.threatsEnabled),
        mateHandover: state.adventure.mateHandover || DEFAULT_MATE_HANDOVER,
        mateTolerance: state.adventure.mateTolerance ?? DEFAULT_MATE_TOLERANCE,
        influenceDisabled: Boolean(state.adventure.influenceDisabled),
        influenceMode: state.adventure.influenceMode === 'game' ? 'game' : 'random',
        globalLives: clamp(Number(state.adventure.globalLives) || 0, 0, ADV_GLOBAL_LIVES_MAX),
        livesUnlocked: Boolean(state.adventure.livesUnlocked),
        livesDate: state.adventure.livesDate || null,
        bestScores: state.adventure.bestScores || {}
      })
    );
  } catch {
    /* stockage indisponible: on continue en mémoire */
  }
}
