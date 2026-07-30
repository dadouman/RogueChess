// Tests unitaires du détecteur de coups pleutres (BAP).
// Exécution : node scripts/test-coward-move.mjs
// Sans framework : assertions maison, sortie détaillée, code de retour non nul en cas d'échec.
import { Chess } from '../site/opening-neural-poc/vendor/chess.js';
import { detectCowardMove } from '../site/opening-neural-poc/coward-move.js';

let failures = 0;
let passed = 0;

function check(name, actual, expectedReason) {
  const got = actual ? actual.reason : null;
  const ok = got === expectedReason;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name} — attendu: ${expectedReason}, obtenu: ${got}`);
  }
}

// Petit helper : joue un SAN depuis une FEN et renvoie { beforeFen, move }.
function playMove(fen, san) {
  const chess = new Chess(fen);
  const beforeFen = chess.fen();
  const move = chess.move(san);
  return { beforeFen, move };
}

console.log('— Critère 1 : retraite injustifiée —');
{
  // Cavalier développé en f3 qui rentre en g1 sans être attaqué : pleutre.
  const { beforeFen, move } = playMove(
    'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1',
    'Ng1'
  );
  check('Ng1 (retraite non forcée du cavalier)', detectCowardMove({ beforeFen, move }), 'retreat');
}
{
  // Fou attaqué par un pion qui recule : retraite JUSTIFIÉE, pas pleutre.
  // Fou blanc en b5, pion noir a6 vient de l'attaquer → Bd3 (recul) est légitime.
  const { beforeFen, move } = playMove(
    'rnbqkbnr/1ppp1ppp/p7/1B2p3/4P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3',
    'Bd3'
  );
  check('Bd3 (fou attaqué par a6 : recul légitime)', detectCowardMove({ beforeFen, move }), null);
}
{
  // Coup vers l'avant : jamais une retraite.
  const { beforeFen, move } = playMove(new Chess().fen(), 'e4');
  check('e4 (avance de pion)', detectCowardMove({ beforeFen, move }), null);
}
{
  // Le roi qui recule n'est pas compté (mise à l'abri tolérée).
  const { beforeFen, move } = playMove(
    'rnbq1bnr/pppp1ppp/8/4p3/4P2k/8/PPPPKPPP/RNBQ1BNR w - - 0 1',
    'Ke1'
  );
  check('Ke1 (recul du roi : toléré)', detectCowardMove({ beforeFen, move }), null);
}

console.log('— Critère 2 : refus de capture favorable —');
{
  // Dame noire en prise en d5 (pion e4 peut la prendre) ; les Blancs jouent a3 : pleutre.
  const { beforeFen, move } = playMove(
    'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3',
    'a3'
  );
  check(
    'a3 au lieu de exd5 (dame en prise)',
    detectCowardMove({ beforeFen, move }),
    'capture-refusal'
  );
}
{
  // Même position mais la capture est jouée : pas pleutre.
  const { beforeFen, move } = playMove(
    'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3',
    'exd5'
  );
  check('exd5 (capture jouée)', detectCowardMove({ beforeFen, move }), null);
}
{
  // Échange équilibré disponible (pion prend pion défendu) : refuser n'est PAS pleutre.
  const { beforeFen, move } = playMove(
    'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
    'Bc4'
  );
  check(
    'Bc4 (pas de capture nettement gagnante dispo)',
    detectCowardMove({ beforeFen, move }),
    null
  );
}

console.log('— Critère 3 : coup de crabe —');
{
  // Tour qui glisse latéralement sur sa rangée de départ, position favorable,
  // perte d'éval de 60 cp : pleutre (ni capture, ni échec, ni développement).
  // NB : une pièce quittant sa rangée de départ « développe », donc on teste un
  // glissement latéral d'une pièce déjà sortie.
  const fen = '1nbqkbnr/rppppppp/p7/8/P7/R7/1PPPPPPP/1NBQKBNR w Kk - 2 3';
  const { beforeFen, move } = playMove(fen, 'Rb3'); // tour a3 → b3 (latéral, hors rangée 1)
  check(
    'Rb3 latéral avec perte d’éval en position favorable',
    detectCowardMove({ beforeFen, move, beforeEvalCp: 120, afterEvalCp: 40 }),
    'crab'
  );
  check(
    'Rb3 latéral SANS perte d’éval : pas pleutre',
    detectCowardMove({ beforeFen, move, beforeEvalCp: 120, afterEvalCp: 110 }),
    null
  );
  check(
    'Rb3 latéral en position DÉFAVORABLE : pas pleutre',
    detectCowardMove({ beforeFen, move, beforeEvalCp: -80, afterEvalCp: -140 }),
    null
  );
}
{
  // Roque : développement, jamais pleutre même avec perte d'éval.
  const { beforeFen, move } = playMove(
    'rnbqkbnr/pppppppp/8/8/8/4PN2/PPPPBPPP/RNBQK2R w KQkq - 0 1',
    'O-O'
  );
  check(
    'O-O (roque : développement)',
    detectCowardMove({ beforeFen, move, beforeEvalCp: 100, afterEvalCp: 50 }),
    null
  );
}

console.log('— Perspective Noirs —');
{
  // Coup noir : cavalier f6 qui rentre en g8 sans être attaqué → pleutre.
  const { beforeFen, move } = playMove(
    'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
    'Ng8'
  );
  check('...Ng8 (retraite noire non forcée)', detectCowardMove({ beforeFen, move }), 'retreat');
}
{
  // Coup de crabe côté Noir : éval côté Blanc négative = favorable aux Noirs.
  // Tour noire déjà sortie en h6 qui glisse latéralement en g6.
  const fen = 'rnbqkbn1/1ppppppp/p6r/8/8/P6P/1PPPPPPR/RNBQKBN1 b Qq - 0 4';
  const { beforeFen, move } = playMove(fen, 'Rg6'); // tour h6 → g6 (latéral)
  check(
    '...Rg6 latéral avec perte d’éval noire',
    detectCowardMove({ beforeFen, move, beforeEvalCp: -120, afterEvalCp: -40 }),
    'crab'
  );
}

console.log('');
if (failures) {
  console.error(`${failures} test(s) en échec, ${passed} réussi(s).`);
  process.exit(1);
}
console.log(`Tous les tests passent (${passed}).`);
