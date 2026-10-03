import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { migrateLegacy, getAllGames, getState, putState, putGames, getAllGFaults, _resetForTests } from '../src/storage/db';

describe('IndexedDB', () => {
  it('importe les données de l’ancienne version une seule fois', async () => {
    _resetForTests();
    const legacy = { games: { g1: { id: 'g1', t: 1, sans: ['e4'] }, g2: { id: 'g2', t: 2, sans: ['d4'] } }, gfaults: { g1: [{ id: 'g1:3' }] }, br: { A1a: { clean: 2 } }, fault: {}, ignored: {}, pref: {}, fixed: {}, settings: { user: 'matt_chess00' } };
    const ls = { getItem: (k: string) => k === 'drill_matt_v3' ? JSON.stringify(legacy) : null };
    expect(await migrateLegacy(ls)).toBe(2); expect(await migrateLegacy(ls)).toBe(0);
    expect((await getAllGames()).map(g => g.id).sort()).toEqual(['g1', 'g2']);
    expect((await getAllGFaults()).g1).toHaveLength(1);
    const s = await getState(); expect(s.br.A1a.clean).toBe(2); s.settings.depth = 14; await putState(s); expect((await getState()).settings.depth).toBe(14);
  });
  it('n’écrit pas les caches « _ »', async () => { await putGames([{ id: 'g3', t: 3, _rv: { big: 1 } } as never]); const g = (await getAllGames()).find(x => x.id === 'g3') as unknown as Record<string, unknown>; expect(g._rv).toBeUndefined(); });
});
