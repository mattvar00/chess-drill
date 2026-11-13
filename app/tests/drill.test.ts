import { describe, it, expect } from 'vitest';
import rep from '../src/data/repertoire.json';
import type { Game, Repertoire, BranchState } from '../src/core/types';
import { indexBranches } from '../src/core/book';
import { scheduleBranch } from '../src/core/schedule';
import { weightedPick, pickNext, todayPool, recentDeviations, devCounts, refBranch, theoryStart, isUserPly } from '../src/core/drill';

const R = rep as unknown as Repertoire, BR = indexBranches(R);
const NOW = Date.UTC(2026, 10, 13), DAY = 864e5;
const game = (id: string, daysAgo: number, a: Partial<Game['a']>): Game => ({ id, url: '', t: (NOW - daysAgo * DAY) / 1000, tc: 'rapid', tcs: '600', rr: 'win', color: 'b', opp: 'x', oppElo: 1800, myElo: 1800, res: 'W', eco: '', sans: [], clocks: [], nply: 0, a: { status: 'dev', depth: 8, branches: ['A1a', 'A2a'], ...a } });

describe('tirage', () => {
  it('weightedPick suit les poids', () => {
    expect(weightedPick(['a', 'b'], x => x === 'a' ? 1 : 3, () => 0.2)).toBe('a');
    expect(weightedPick(['a', 'b'], x => x === 'a' ? 1 : 3, () => 0.9)).toBe('b');
  });
  it('pickNext évite la ligne en cours et préfère les lignes à travailler', () => {
    const valid: BranchState = { ...scheduleBranch(scheduleBranch(undefined, 0, NOW), 0, NOW) };
    expect(valid.due).toBeGreaterThan(NOW);
    for (let i = 0; i < 20; i++) expect(pickNext(['A1a', 'A1b', 'A1c'], { A1a: valid, A1c: valid }, 'A1c', NOW)).toBe('A1b');
    expect(pickNext(['A1a'], {}, 'A1a', NOW)).toBe('A1a');
  });
});

describe('séance du jour', () => {
  it('sépare les révisions dues des nouvelles lignes, sans les systèmes alternatifs', () => {
    const seen = scheduleBranch(undefined, 0, NOW - 3 * DAY), later = scheduleBranch(undefined, 0, NOW);
    const { due, fresh } = todayPool(R, { A1a: seen, A1b: later }, NOW, 4);
    expect(due).toEqual(['A1a']);
    expect(fresh).toHaveLength(4);
    expect(fresh).not.toContain('A1a'); expect(fresh).not.toContain('A1b');
    for (const id of fresh) expect(BR[id].sys.statut).not.toBe('alternatif');
  });
});

describe('déviations', () => {
  const games = [game('g1', 2, {}), game('g2', 5, { soft: true }), game('g3', 40, {}), game('g4', 1, { status: 'ok' }), game('g5', 3, { branches: ['A2a'] })];
  it('ligne de référence : un système joué d\'abord', () => {
    expect(refBranch(games[0], BR)).toBe('A1a'); expect(refBranch(games[4], BR)).toBe('A2a');
    expect(refBranch(game('z', 1, { branches: ['inconnue'] }), BR)).toBeNull();
  });
  it('liste les déviations récentes non corrigées', () => {
    expect(recentDeviations(games, {}, BR, NOW).map(g => g.id)).toEqual(['g1', 'g5']);
    expect(recentDeviations(games, { g1: true }, BR, NOW).map(g => g.id)).toEqual(['g5']);
  });
  it('compte par ligne sur 90 jours', () => {
    expect(devCounts(games, {}, BR, NOW)).toEqual({ A1a: 2, A2a: 1 });
  });
});

describe('théorie', () => {
  it('démarre au coup du joueur qui précède le premier commentaire', () => {
    expect(isUserPly(0, 'w')).toBe(true); expect(isUserPly(0, 'b')).toBe(false);
    expect(theoryStart({ '9': 'x', '15': 'y' }, 'b')).toBe(9);
    expect(theoryStart({ '9': 'x' }, 'w')).toBe(8);
    expect(theoryStart({}, 'w')).toBe(0);
  });
});
