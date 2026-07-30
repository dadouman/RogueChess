// Test de la règle BAP « 3e étoile » : reproduit la logique de
// adventureOnGameFinished (app.js) sur des cas représentatifs, avec les mêmes
// constantes. Exécution : node scripts/test-bap-star-rule.mjs
import { ADV_COWARD_STAR_LIMIT } from '../site/opening-neural-poc/adventure-config.js';

const ADV_BOSS_STARS = 3; // même valeur que adventure-status.js

// Réplique fidèle de la décision prise dans adventureOnGameFinished.
function resolveBossWin({ prevStreak, cowardMoves, antiPleutreEnabled }) {
  const cowardBlocked =
    antiPleutreEnabled && prevStreak + 1 >= ADV_BOSS_STARS && cowardMoves >= ADV_COWARD_STAR_LIMIT;
  if (cowardBlocked) {
    return { streak: ADV_BOSS_STARS - 1, blocked: true };
  }
  return { streak: Math.min(prevStreak + 1, ADV_BOSS_STARS), blocked: false };
}

let failures = 0;
function expect(name, got, want) {
  const ok = got.streak === want.streak && got.blocked === want.blocked;
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
  }
}

console.log('— Règle BAP : validation de la 3e étoile —');
expect(
  '3e victoire, 4 coups pleutres (< 5) : étoile validée',
  resolveBossWin({ prevStreak: 2, cowardMoves: 4, antiPleutreEnabled: true }),
  { streak: 3, blocked: false }
);
expect(
  '3e victoire, 5 coups pleutres : étoile refusée, retour à 2',
  resolveBossWin({ prevStreak: 2, cowardMoves: 5, antiPleutreEnabled: true }),
  { streak: 2, blocked: true }
);
expect(
  '3e victoire, 12 coups pleutres : étoile refusée, retour à 2',
  resolveBossWin({ prevStreak: 2, cowardMoves: 12, antiPleutreEnabled: true }),
  { streak: 2, blocked: true }
);
expect(
  '1re victoire, 9 coups pleutres : pas de blocage (seule la 3e étoile est conditionnée)',
  resolveBossWin({ prevStreak: 0, cowardMoves: 9, antiPleutreEnabled: true }),
  { streak: 1, blocked: false }
);
expect(
  '2e victoire, 7 coups pleutres : pas de blocage',
  resolveBossWin({ prevStreak: 1, cowardMoves: 7, antiPleutreEnabled: true }),
  { streak: 2, blocked: false }
);
expect(
  'mode désactivé : 3e victoire à 20 coups pleutres passe quand même',
  resolveBossWin({ prevStreak: 2, cowardMoves: 20, antiPleutreEnabled: false }),
  { streak: 3, blocked: false }
);

console.log('');
if (failures) {
  console.error(`${failures} test(s) en échec.`);
  process.exit(1);
}
console.log('Tous les tests de la règle 3e étoile passent.');
