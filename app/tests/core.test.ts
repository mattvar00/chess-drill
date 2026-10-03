import { describe, it, expect } from 'vitest';
import rep from '../src/data/repertoire.json';
import type { Repertoire } from '../src/core/types';
import { buildBook, analyseGame, indexBranches } from '../src/core/book';
import { parsePgnMoves, pgnTag } from '../src/core/pgn';
import { winPct, classify, accuracy } from '../src/core/winpct';
import { clkSec, tcParse, plyTimes } from '../src/core/clock';
import { scheduleBranch, schedulePos, isValid, posDue } from '../src/core/schedule';
import { detectStructure, gameStructure } from '../src/core/structures';
import { Chess, cleanFen, tryMove } from '../src/core/chess';

const R = rep as unknown as Repertoire; const book = buildBook(R); const idx = indexBranches(R);
const line = (s: string) => s.split(' ');

describe('répertoire', () => {
  it('toutes les lignes sont légales', () => {
    for (const b of R.blocs) for (const sy of b.systemes) for (const br of sy.branches) { const c = new Chess(); for (const m of br.moves) expect(tryMove(c, { from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] }), br.id + ' ' + m.san).not.toBeNull(); }
  });
  it('ids uniques', () => { const ids = R.blocs.flatMap(b => b.systemes.flatMap(s => s.branches.map(x => x.id))); expect(new Set(ids).size).toBe(ids.length); });
});
describe('déviations', () => {
  it('la Sveshnikov principale reste dans le livre', () => { expect(analyseGame(book, idx, line('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6'), 'b').status).toBe('ok'); });
  it('Alapin 2…Nc6 3.d4 cxd4 4.cxd4 e6 est une déviation (il fallait …d5)', () => {
    const r = analyseGame(book, idx, line('e4 c5 c3 Nc6 d4 cxd4 cxd4 e6 d5'), 'b'); expect(r.status).toBe('dev'); expect(r.played).toBe('e6'); expect(r.expected!.map(e => e.san)).toContain('d5'); });
  it('un coup adverse hors livre est un « trou »', () => { expect(analyseGame(book, idx, line('e4 c5 a3 Nc6'), 'b').status).toBe('gap'); });
  it('transposition : Slave 3.Nc3 Nf6 4.Nf3 rejoint le livre', () => { const r = analyseGame(book, idx, line('d4 d5 c4 c6 Nc3 Nf6 Nf3 e6 e3 Nbd7'), 'w'); expect(['ok', 'out']).toContain(r.status); });
});
describe('PGN et pendule', () => {
  const pgn = '[White "a"]\n[Black "b"]\n\n1. e4 {[%clk 0:09:58.1]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:50]} 1-0';
  it('coups et pendules', () => { const r = parsePgnMoves(pgn); expect(r.sans).toEqual(['e4', 'e5', 'Nf3']); expect(r.clocks[2]).toBe('0:09:50'); expect(pgnTag(pgn, 'White')).toBe('a'); });
  it('temps par coup', () => { expect(clkSec('0:09:50')).toBeCloseTo(590); expect(tcParse('600+5')).toEqual({ base: 600, inc: 5 }); const t = plyTimes(['0:09:58', '0:09:57', '0:09:50'], '600', 3); expect(t[2]).toBeCloseTo(8); });
});
describe('évaluation', () => {
  it('win% symétrique', () => { expect(winPct(0, null)).toBeCloseTo(50); expect(winPct(300, null) + winPct(-300, null)).toBeCloseTo(100); expect(winPct(null, 3)).toBe(100); });
  it('classes et précision', () => { expect(classify(1)).toBe('best'); expect(classify(25)).toBe('blunder'); expect(accuracy(0)).toBe(100); expect(accuracy(10)).toBeLessThan(70); });
});
describe('répétition espacée', () => {
  it('lignes : 1 j, 3 j, puis × facilité ; une erreur divise par deux', () => {
    let s = scheduleBranch(undefined, 0, 0); expect(s.ivl).toBe(1); s = scheduleBranch(s, 0, 0); expect(s.ivl).toBe(3); expect(isValid(s)).toBe(true);
    s = scheduleBranch(s, 0, 0); expect(s.ivl).toBe(Math.round(3 * 2.5)); const s2 = scheduleBranch(s, 1, 0); expect(s2.ivl).toBe(Math.round(s.ivl / 2)); expect(scheduleBranch(s, 3, 0).clean).toBe(0); });
  it('positions : réussie → 3 j, ratée → demain', () => { const g = schedulePos(undefined, 'good', 1, 0); expect(g.ivl).toBe(3); expect(posDue(g, 0)).toBe(false); expect(schedulePos(g, 'fail', 1, 0).ivl).toBe(1); });
});
describe('structures', () => {
  const st = (s: string) => { const c = new Chess(); line(s).forEach(m => tryMove(c, m)); return detectStructure(c.fen()); };
  it('reconnaît les structures du répertoire', () => {
    expect(st('d4 Nf6 c4 e6 Nc3 Bb4 Qc2 d5 cxd5 exd5 Bg5 h6 Bxf6 Qxf6 a3 Bxc3+ Qxc3 c6 e3 O-O')).toBe('carlsbad');
    expect(st('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5 Be7')).toBe('svesh');
    expect(st('e4 c5 c3 Nc6 d4 d5 exd5 Qxd5 Nf3 Nf6 Be2 cxd4 cxd4 Bg4 Nc3 Qa5 O-O e6')).toBe('iqp_w');
    expect(st('d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 Bd6')).toBe('triangle');
    expect(st('d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7')).toBe('kid');
  });
  it('structure d’une partie au 12ᵉ coup', () => { expect(gameStructure(line('e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5 Be7 Bxf6 Bxf6 c3 O-O Nc2 Bg5'))!.id).toBe('svesh'); });
});
describe('moteur : FEN', () => {
  it('retire une case en passant impossible', () => { expect(cleanFen('rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq b6 0 10').split(' ')[3]).toBe('-'); expect(cleanFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3').split(' ')[3]).toBe('f6'); });
});
