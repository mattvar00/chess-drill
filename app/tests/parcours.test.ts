import { describe, expect, it } from 'vitest';
import rep from '../src/data/repertoire.json';
import type { Bloc, Repertoire, System } from '../src/core/types';
import { lineName } from '../src/core/names';
import { caseOf, knownLines, unitOf } from '../src/core/path';
import { newBranchState } from '../src/core/schedule';
import { MIN_GAMES, playerCard, profile } from '../src/core/stats';
import { themeCounts, themeLabel } from '../src/core/wood';
import type { Fault } from '../src/core/analysis';

describe('noms de lignes', () => {
  it("met l'idée en titre quand le titre commence par des coups", () => {
    expect(lineName('5.Nc3 e5 6.Nxc6 bxc6 7.Bg5 Rb8 ! — reprendre en f6 avec la dame'))
      .toEqual({ title: 'Reprendre en f6 avec la dame', detail: '5.Nc3 e5 6.Nxc6 bxc6 7.Bg5 Rb8 !' });
  });
  it('garde le nom en tête sinon', () => {
    expect(lineName('Meran 8.Bd3 — 9.e4 (au lieu de O-O)')).toEqual({ title: 'Meran 8.Bd3', detail: '9.e4 (au lieu de O-O)' });
  });
  it("n'affiche jamais de référence interne", () => {
    const all = (rep as unknown as Repertoire).blocs.flatMap(b => b.systemes.flatMap(s => s.branches.map(br => lineName(br.titre))));
    for (const n of all) expect(`${n.title} ${n.detail}`).not.toMatch(/\(ta (g\d|partie)/i);
    expect(lineName("Slave d'échange 5.Bg5 Ne4 6.Nxe4 dxe4 7.Qc2 (ta g26)").title).toBe("Slave d'échange 5.Bg5 Ne4 6.Nxe4 dxe4 7.Qc2");
  });
});

describe('chemin : une seule mesure', () => {
  const sys: System = { id: 'S', titre: 'T', statut: 'joué', resume: '', branches: Array.from({ length: 15 }, (_, i) => ({ id: 'l' + i, titre: '', moves: [], notes: {} })) };
  const bloc: Bloc = { id: 'B', titre: '', sous: '', side: 'b', systemes: [sys] };
  it('numérote les cases à partir de 1, sur le nombre réel de cases', () => {
    const st: Record<string, ReturnType<typeof newBranchState>> = {};
    for (const id of ['l0', 'l1', 'l2', 'l3', 'l4', 'l5']) st[id] = { ...newBranchState(), runs: 1, clean: 1, due: Date.now() + 864e5 * 9 };
    const u = unitOf(bloc, sys, st);
    expect(caseOf(u)).toEqual({ k: 3, n: 6 });
    expect(knownLines(u, st)).toBe(6);
  });
});

describe('carte joueur', () => {
  it('ne donne pas de note sur trop peu de parties', () => {
    const pr = profile([]);
    pr.n = 3; pr.opening.coverage = 0;
    expect(playerCard(pr).scores.ouverture).toBeNull();
    pr.n = MIN_GAMES; expect(playerCard(pr).scores.ouverture).toBe(0);
  });
});

describe('fautes par type', () => {
  it('compte et nomme simplement', () => {
    const f = (theme: string) => ({ theme }) as Fault;
    expect(themeCounts([f('Coup calme'), f('Pièce à prendre'), f('Coup calme')])).toEqual([['Coup calme', 2], ['Pièce à prendre', 1]]);
    expect(themeLabel('Coup calme')).toBe('Bon coup tranquille manqué');
  });
});
