import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import rep from '../src/data/repertoire.json';
import type { Repertoire } from '../src/core/types';
import { buildBook, indexBranches } from '../src/core/book';
import { toGame, monthsSince, resultOf, type ChessComGame } from '../src/core/ingest';
import { rateGame, replay, type RawEval } from '../src/core/analysis';

const R = rep as unknown as Repertoire;
const fixture = JSON.parse(readFileSync(new URL('./fixtures/chesscom-games.json', import.meta.url), 'utf8')) as ChessComGame[];
const ev = (cp: number | null, mate: number | null, pv: string[]): RawEval => ({ cp, mate, best: pv[0] ?? null, pv });

describe('import chess.com', () => {
  it('normalise une partie du point de vue du joueur', () => {
    const g = toGame(fixture[1], 'MATT_chess00', buildBook(R), indexBranches(R))!;
    expect(g).toMatchObject({ id: '100000002', color: 'b', opp: 'opp1', res: 'D', myElo: 1755, eco: 'Sicilian-Defense-Sveshnikov', nply: 36 });
    expect(g.clocks[0]).toBe('0:09:59');
    expect(g.a.status).toBe('ok');   // Sveshnikov : dans le répertoire
  });
  it('ignore les parties des autres et les variantes', () => {
    expect(toGame(fixture[0], 'quelquun')).toBeNull();
    expect(toGame({ ...fixture[0], rules: 'chess960' }, 'matt_chess00')).toBeNull();
  });
  it('résultats et mois d\'archive', () => {
    expect(['win', 'agreed', 'timeout', 'checkmated'].map(resultOf)).toEqual(['W', 'D', 'L', 'L']);
    const arch = ['https://x/2026/09', 'https://x/2026/10', 'https://x/2026/11'];
    expect(monthsSince(arch, Date.UTC(2026, 9, 20) / 1000)).toEqual(arch.slice(1));
  });
});

describe('notation d\'une partie', () => {
  // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7# — les Noirs (nous) gaffent au 3e coup
  const g = { id: 'g1', color: 'b' as const, sans: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'], opp: 'X', t: 1762990000, res: 'L' as const };
  const evs = [ev(30, null, ['e2e4']), ev(30, null, ['e7e5']), ev(30, null, ['d2d4']), ev(-20, null, ['b8c6']), ev(20, null, ['f1c4']),
    ev(40, null, ['g7g6', 'h5f3', 'g8f6']), ev(null, 1, ['h5f7']), { cp: null, mate: 1, best: null, pv: [], end: true }];

  it('classe les coups, calcule la précision et extrait la faute', () => {
    expect(replay(g.sans).fens).toHaveLength(8);
    const r = rateGame(g, evs, 16);
    expect(r.cls[5]).toBe('blunder');
    expect(r.st).toMatchObject({ blunder: 1, depth: 16 });
    expect(r.st.acc).toBeLessThan(80);
    expect(r.faults).toHaveLength(1);
    const f = r.faults[0];
    expect(f).toMatchObject({ id: 'g1:5', side: 'b', ply: 5, move_no: 3, phase: 'ouverture', theme: 'Pièce en prise oubliée' });
    expect(f.best).toMatchObject({ san: 'g6', uci: 'g7g6', reply: 'Qf3' });
    expect(f.played).toMatchObject({ san: 'Nf6', score: 'mat en 1 contre toi', refut: '4.Qxf7#' });
    expect(r.ev[5]).toEqual({ c: 40, m: null, b: 'g7g6', p: ['g7g6', 'h5f3', 'g8f6'] });
  });
  it('un coup égal au meilleur coup ne perd rien', () => {
    const r = rateGame(g, evs, 16); expect(r.cls[6]).toBe('best');
  });
  it('refuse des évaluations incomplètes', () => {
    expect(() => rateGame(g, evs.slice(0, 5), 16)).toThrow(/manquantes/);
  });
});
