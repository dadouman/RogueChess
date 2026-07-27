// État global partagé de l'application (singleton mutable). Importé par app.js
// et, à terme, par tous les modules de logique/UI découpés — ce qui évite les
// imports circulaires (chacun importe `state` ici plutôt que depuis app.js).
import {
  FIRST_LEVEL_NUMBER,
  DEFAULT_STOCKFISH_LEVEL,
  SURVIVAL_LIMIT_CP,
  DISPLAY_DEFAULT_FLOOR_MASS
} from './constants.js';

export const state = {
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
  repertoireData: {},
  isImportingPgn: false,
  activeResize: null,
  suppressNextGraphClick: false,
  collapsedPanels: {
    left: false,
    right: false
  },
  panelWidthMemory: {
    left: 328,
    right: 340
  },
  screen: 'home',
  activeBook: 'italian',
  adventureProfiles: {},
  adventure: null,
  advRun: null,
  advViewMode: 'board',
  game: null
};
