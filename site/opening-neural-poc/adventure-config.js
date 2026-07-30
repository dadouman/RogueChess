// Configuration du mode Aventure (données pures) : difficultés, cadences,
// « mat en X », clés de stockage et bornes. Partagée par la persistance
// (adventure-state) et l'UI (app).

export const ADV_DIFFICULTIES = [
  {
    id: 'tres-facile',
    label: 'Très facile',
    icon: '🍼',
    desc: 'Coups suggérés, évaluation et retour arrière (cases légales toujours visibles).',
    aids: { moveChoices: true, legalDots: true, evaluation: true, takeback: true }
  },
  {
    id: 'facile',
    label: 'Facile',
    icon: '🙂',
    desc: 'Coups suggérés et évaluation (cases légales toujours visibles).',
    aids: { moveChoices: true, legalDots: true, evaluation: true, takeback: false }
  },
  {
    id: 'normal',
    label: 'Normal',
    icon: '⚔️',
    desc: 'Évaluation seule. Cases légales masquées, révélées après 5 s ou une erreur.',
    aids: { moveChoices: false, legalDots: false, evaluation: true, takeback: false },
    legalDotsRevealable: true
  },
  {
    id: 'difficile',
    label: 'Difficile',
    icon: '🔥',
    desc: 'Aucune aide (cases légales jamais affichées).',
    aids: { moveChoices: false, legalDots: false, evaluation: false, takeback: false }
  }
];

export const DEFAULT_ADV_DIFFICULTY = 'facile';

export const TIME_CONTROLS = [
  { id: 'off', label: 'Sans horloge', icon: '∞', baseMs: 0, meanMs: 0 },
  { id: 'bullet', label: 'Bullet 2′', icon: '🚅', baseMs: 120000, meanMs: 1000 },
  { id: 'blitz', label: 'Blitz 5′', icon: '⚡', baseMs: 300000, meanMs: 3000 },
  { id: 'normal', label: 'Rapide 10′', icon: '⏱️', baseMs: 600000, meanMs: 6000 },
  { id: 'custom', label: 'Perso', icon: '🎛️', baseMs: 0, meanMs: 0 }
];

export const DEFAULT_TIME_CONTROL = 'off';

export const ADV_STORAGE_KEY = 'roguechess-adventure-v1';

export const ADV_MAX_GAMES = 60; // historique des parties conservées (M)

export const ADV_GLOBAL_LIVES_MAX = 3;

// Couverture du cortex requise pour débloquer l'Acte 2 (boss).
export const ADV_ACT2_UNLOCK = 0.5;

export const MATE_HANDOVER_OPTIONS = [
  { id: 1, label: 'Mat en 1' },
  { id: 2, label: 'Mat en 2' },
  { id: 3, label: 'Mat en 3' },
  { id: 5, label: 'Mat en 5' },
  { id: 99, label: 'Au plus tôt' }
];

export const DEFAULT_MATE_HANDOVER = 3;

export const MATE_TOLERANCE_OPTIONS = [
  { id: 0, label: 'Mat exact' },
  { id: 1, label: '+1' },
  { id: 2, label: '+2' },
  { id: 3, label: '+3' },
  { id: 5, label: '+5' }
];

export const DEFAULT_MATE_TOLERANCE = 2;

export const ADV_MAX_REVIEW_MOVES = 160;

// === BAP — Brigade Anti-Pleutre ================================================
// Mode optionnel qui traque les coups passifs/craintifs (« coups pleutres »).
// Seuil de coups pleutres tolérés dans la 3e partie d'une série de boss : à
// partir de ce nombre, la 3e étoile est refusée et la série retombe à 2/3.
export const ADV_COWARD_STAR_LIMIT = 5;
// Perte d'évaluation (cp) à partir de laquelle un coup passif sans capture,
// échec ni développement est classé « coup de crabe ».
export const COWARD_CRAB_EVAL_LOSS_CP = 30;
