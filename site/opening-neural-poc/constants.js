// Constantes partagées (graine du découpage — s'étoffera au fil des modules).
// Pour l'instant : celles dont dépend l'état initial (state.js). Les autres
// constantes restent dans app.js et migreront progressivement.

export const FIRST_LEVEL_NUMBER = 1;
export const DEFAULT_STOCKFISH_LEVEL = 5;
export const SURVIVAL_LIMIT_CP = -100;
export const DISPLAY_DEFAULT_FLOOR_MASS = 0.01;
