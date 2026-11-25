import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import rep from '../src/data/repertoire.json';
import type { Repertoire } from '../src/core/types';
import { buildBook, indexBranches } from '../src/core/book';
import { toGame, monthsSince, resultOf, type ChessComGame } from '../src/core/ingest';
import { faultTheme, hanging, netGain, rateGame, replay, type RawEval } from '../src/core/analysis';
import { Chess } from '../src/core/chess';
import { phaseBounds, phaseOf } from '../src/core/phase';

const R = rep as unknown as Repertoire;
const fixture = JSON.parse(readFileSync(new URL('./fixtures/chesscom-games.json', import.meta.url), 'utf8')) as ChessComGame[];
const ev = (cp: number | null, mate: number | null, pv: string[]): RawEval => ({ cp, mate, best: pv[0] ?? null, pv });

describe('import chess.com', () => {
  it('normalise une partie du point de vue du joueur', () => {
    const g = toGame(fixture[1], 'MATT_chess00', buildBook(R), indexBranches(R))!;
    expect(g).toMatchObject({ id: '100000002', color: 'b', opp: 'opp1', res: 'D', myElo: 1755, eco: 'Sicilian-Defense-Sveshnikov', nply: 36 });
    expect(g.clocks[0]).toBe('0:09:59');
    expect(['ok', 'gap']).toContain(g.a.status);   // Sveshnikov : dans le répertoire (ou l'adversaire en sort, depuis que la théorie va plus loin)
    expect(g.a.depth).toBeGreaterThanOrEqual(20);
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
    expect(f).toMatchObject({ id: 'g1:5', side: 'b', ply: 5, move_no: 3, phase: 'ouverture', theme: 'Mat adverse ignoré' });
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

describe('type des fautes', () => {
  const mv = (fen: string, uci: string) => new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4) } as never);
  const e = (pv: string[], cp = 0): RawEval => ({ cp, mate: null, best: pv[0] ?? null, pv });
  it('une pièce déjà attaquée, oubliée', () => {
    const fen = 'rnbqkbnr/p1pppppp/8/8/1p2P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3';
    expect(hanging(fen, 'c3', 'w')).toBe(true);
    expect(faultTheme(fen, mv(fen, 'h2h3'), e(['c3d5']), e(['b4c3', 'b2c3']))).toBe('Pièce en prise oubliée');
  });
  it('une pièce posée sur une case prise', () => {
    const fen = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
    expect(faultTheme(fen, mv(fen, 'f3e5'), e(['d2d4']), e(['d6e5']))).toBe('Pièce déposée en prise');
  });
  it('un pion défendu qui tombe n\'est pas une pièce en prise', () => {
    const fen = 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2';
    expect(netGain(fen, ['a2a3', 'f6e4'], 'w')).toBe(-1);
    expect(faultTheme(fen, mv(fen, 'a2a3'), e(['b1c3']), e(['f6e4']))).toBe('Pion perdu');
  });
  it('la prise en passant vise le bon pion', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3p4/8/PPPPPPPP/RNBQKBNR w KQkq - 0 3';
    expect(faultTheme(fen, mv(fen, 'e2e4'), e(['c2c4']), e(['d4e3']))).toBe('Pion perdu');
  });
  it('un échange n\'est pas une capture gagnante', () => {
    const fen = 'r3k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    expect(faultTheme(fen, mv(fen, 'e1e2'), e(['a1a8', 'e8d7']), e(['a8a1']))).not.toBe('Capture gagnante ratée');
  });
});

describe('phases', () => {
  it('ouverture, milieu, finale d\'après le matériel', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('ouv');
    expect(phaseOf('r4rk1/pp3ppp/2n5/8/8/2N5/PP3PPP/R4RK1 w - - 0 20')).toBe('fin');
    expect(phaseOf('r2q1rk1/pp2bppp/2n1bn2/8/8/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 14')).toBe('mil');
    expect(phaseOf('r2q1rk1/pp2bppp/2n1bn2/8/8/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 9')).toBe('ouv');
    expect(phaseBounds(['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', '4k3/8/8/8/8/8/8/4K3 w - - 0 1'])).toEqual([1, 1]);
  });
});
