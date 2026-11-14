import { describe, expect, it } from 'vitest';
import { chunk, unitOf } from '../src/core/path';
import { newBranchState } from '../src/core/schedule';
import type { Bloc, System } from '../src/core/types';

const sys = (n: number): System => ({ id: 'S', titre: 'Test', statut: 'joué', resume: '', branches: Array.from({ length: n }, (_, i) => ({ id: 'l' + i, titre: '', moves: [], notes: {} })) });
const bloc = (s: System): Bloc => ({ id: 'B', titre: '', sous: '', side: 'b', systemes: [s] });

describe('chemin', () => {
  it('coupe en morceaux égaux', () => {
    expect(chunk([...'abcdefghijklmnopq'], 6).map(c => c.length)).toEqual([3, 3, 3, 3, 3, 2]);
    expect(chunk([1, 2, 3], 3)).toEqual([[1], [2], [3]]);
  });
  it('place les cases jusqu\'à la 8e rangée, la première non réussie est la case courante', () => {
    const s = sys(17), now = Date.now(), ok = { ...newBranchState(), runs: 1, clean: 1, due: now + 1e9 };
    const st = Object.fromEntries(['l0', 'l1', 'l2', 'l3', 'l4', 'l5'].map(id => [id, ok]));
    const u = unitOf(bloc(s), s, st, {}, now);
    expect(u.lessons.map(l => l.rank)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(u.lessons.map(l => l.state)).toEqual(['done', 'done', 'cur', 'lock', 'lock', 'lock']);
    expect(u.done).toBe(2); expect(u.promoted).toBe(false);
  });
  it('une ligne à revoir fissure sa case ; tout réussi : promotion', () => {
    const s = sys(3), now = Date.now(), ok = { ...newBranchState(), runs: 1, clean: 1, due: now + 1e9 };
    const u = unitOf(bloc(s), s, { l0: ok, l1: { ...ok, due: now - 1 }, l2: ok }, {}, now);
    expect(u.lessons.map(l => `${l.rank}${l.state}`)).toEqual(['6done', '7crack', '8done']);
    expect(u.promoted).toBe(true);
  });
});
