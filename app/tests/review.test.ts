import { describe, expect, it } from 'vitest';
import { commentMove, ecoName, reviewGame, whatMove } from '../src/core/review';
import { profile, structureStats } from '../src/core/stats';
import { sanTokens } from '../src/app/explorer';
import { Chess } from '../src/core/chess';
import type { EvalEntry, Game } from '../src/core/types';

const E = (c: number | null, b: string | null, p: string[] = [], m: number | null = null): EvalEntry => ({ c, m, b, p });
// 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#, avec les Noirs
const sans = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];
const ev = [E(30, 'e2e4'), E(30, 'e7e5'), E(30, 'g1f3'), E(30, 'b8c6'), E(40, 'd1h5'), E(50, 'g7g6', ['g7g6', 'h5f3']), E(null, 'h5f7', ['h5f7'], 1), E(null, null, [], 0)];
const g = { sans, color: 'b' as const, clocks: [], tcs: '600', a: { status: 'out' as const, depth: 0 }, ev };

describe('revue de partie', () => {
  it('classe la gaffe qui laisse le mat et la commente', () => {
    const A = reviewGame(g);
    expect(A.R).toHaveLength(7);
    const r = A.R[5];
    expect(r.k).toBe('blunder');
    expect(A.key.map(k => k.i)).toContain(5);
    const txt = commentMove(g, A, r);
    expect(txt).toContain('Le cavalier va en f6');
    expect(txt).toContain('Qxf7');
    expect(txt).toMatch(/mat en 1/);
    expect(txt).toContain('Il fallait g6');
    expect(A.counts.blunder).toBe(1);
  });
  it('reconnaît une fourchette', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', m = new Chess(fen).move('Nc7+');
    expect(whatMove(fen, m).bits).toEqual(['avec échec', 'fourchette sur le roi et la tour']);
  });
  it('lit les noms d\'ouverture et les variantes', () => {
    expect(ecoName('https://www.chess.com/openings/Sicilian-Defense-Sveshnikov-Variation-9.Nd5')).toBe('Sicilienne Sveshnikov');
    expect(sanTokens('20...Rxc4 21.Nd7 Qe7 22.Nxf8')).toEqual(['Rxc4', 'Nd7', 'Qe7', 'Nxf8']);
  });
});

const game = (o: Partial<Game>): Game => ({ id: String(Math.random()), url: '', t: 1_700_000_000, tc: 'blitz', tcs: '180+2', rr: 'win', color: 'w', opp: 'x', oppElo: 1500, myElo: 1500, res: 'W', eco: '',
  sans: [], clocks: [], nply: 0, a: { status: 'ok', depth: 10 }, st: { acc: 80, loss: 5, blunder: 1, mistake: 0, inacc: 1, depth: 16 }, wp: [50, 50], cls: [], ...o });

describe('statistiques', () => {
  it('conversion, résilience et rythme', () => {
    const list = [
      game({ wp: [50, 85, 90, 100], res: 'W', t: 1000 }),
      game({ wp: [50, 85, 40, 0], res: 'L', t: 2000 }),
      game({ wp: [50, 15, 10, 50], res: 'D', t: 3000, color: 'b' }),   // Noirs : 85 % puis 90 %, partie nulle
      game({ wp: [50, 10, 5, 0], res: 'L', t: 4000 }),
    ];
    const p = profile(list);
    expect(p.n).toBe(4);
    expect(p.conversion).toEqual({ n: 3, rate: 33 });
    expect(p.resilience).toEqual({ n: 2, rate: 0 });
    expect(p.tilt?.avgSess).toBe(4);
    expect(p.winRate).toBe(25);
  });
  it('structures : la partie de Sveshnikov est reconnue', () => {
    const sv = ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5', 'Ndb5', 'd6', 'Bg5', 'a6', 'Na3', 'b5', 'Nd5', 'Be7', 'Bxf6', 'Bxf6', 'c3', 'O-O', 'Nc2', 'Bg5'];
    const S = structureStats([game({ sans: sv, color: 'b', wp: Array(25).fill(50) })]);
    expect(Object.keys(S)).toEqual(['svesh']);
  });
});
