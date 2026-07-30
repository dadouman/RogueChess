// Persistance du mode Aventure : création de l'état initial, chargement et
// sauvegarde (localStorage). S'appuie sur l'état partagé et la configuration
// aventure.
import { state } from './state.js';
import {
  DEFAULT_ADV_DIFFICULTY,
  DEFAULT_TIME_CONTROL,
  ADV_STORAGE_KEY,
  ADV_MAX_GAMES,
  DEFAULT_MATE_HANDOVER,
  DEFAULT_MATE_TOLERANCE
} from './adventure-config.js';

export function createAdventureState(bookId = 'italian') {
  return {
    bookId,
    xp: 0,
    nodes: new Set(),
    lessons: {},
    bosses: {}, // record d'étoiles par boss (0-3) : « déjà acquises », permanent
    bossStreaks: {}, // série de victoires en cours par boss (0-3), remise à 0 à la défaite
    highestBoss: 0,
    act2Announced: false,
    movesPlayed: 0, // temps de jeu : coups du joueur joués (toutes parties)
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
    antiPleutreEnabled: false, // BAP : traque des coups pleutres (opt-in, réglages)
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
      state.adventureProfiles = { italian: base };
      state.adventure = base;
      return base;
    }
    const data = JSON.parse(raw);
    const storedProfiles =
      data.books && typeof data.books === 'object' ? data.books : { italian: data };
    state.adventureProfiles = {};
    for (const [bookId, profile] of Object.entries(storedProfiles)) {
      if (profile && typeof profile === 'object') {
        state.adventureProfiles[bookId] = {
          ...createAdventureState(bookId),
          ...profile,
          nodes: new Set(Array.isArray(profile.nodes) ? profile.nodes : []),
          games: Array.isArray(profile.games) ? profile.games.slice(0, ADV_MAX_GAMES) : [],
          bookId
        };
      }
    }
    if (!state.adventureProfiles.italian) {
      state.adventureProfiles.italian = base;
    }
    const activeProfile =
      state.adventureProfiles[state.activeBook] || state.adventureProfiles.italian;
    state.adventure = activeProfile;
    return activeProfile;
  } catch {
    state.adventureProfiles = { italian: base };
    state.adventure = base;
    return base;
  }
}

export function activateAdventureProfile(bookId) {
  const profile = state.adventureProfiles?.[bookId] || createAdventureState(bookId);
  profile.bookId = bookId;
  state.adventureProfiles = state.adventureProfiles || {};
  state.adventureProfiles[bookId] = profile;
  state.adventure = profile;
  return profile;
}

export function saveAdventure() {
  if (!state.adventure) {
    return;
  }
  try {
    state.adventureProfiles = state.adventureProfiles || {};
    state.adventureProfiles[state.activeBook || state.adventure.bookId || 'italian'] =
      state.adventure;
    localStorage.setItem(
      ADV_STORAGE_KEY,
      JSON.stringify({
        books: Object.fromEntries(
          Object.entries(state.adventureProfiles).map(([bookId, profile]) => [
            bookId,
            {
              ...profile,
              nodes: [...(profile.nodes || [])],
              games: (profile.games || []).slice(0, ADV_MAX_GAMES)
            }
          ])
        )
      })
    );
  } catch {
    /* stockage indisponible: on continue en mémoire */
  }
}
