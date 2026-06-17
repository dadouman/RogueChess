// Constantes partagées (graine du découpage — s'étoffera au fil des modules).
// Pour l'instant : celles dont dépend l'état initial (state.js). Les autres
// constantes restent dans app.js et migreront progressivement.

export const FIRST_LEVEL_NUMBER = 1;
export const DEFAULT_STOCKFISH_LEVEL = 5;
export const SURVIVAL_LIMIT_CP = -100;
export const DISPLAY_DEFAULT_FLOOR_MASS = 0.01;
// Score encodant un mat forcé (centipions) ; partagé moteur ↔ logique d'échecs.
export const MATE_SCORE_CP = 100000;
// Modèle de probabilité des branches (softmax sur l'évaluation) ; partagé entre
// l'import PGN et l'assignation des probabilités dans app.js.
export const PROBABILITY_TEMPERATURE_CP = 95;
export const PROBABILITY_FLOOR_MASS = 0.01;
