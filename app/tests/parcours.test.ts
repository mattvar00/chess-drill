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

import { earnedQueen, linesThrough } from '../src/core/path';
import plans from '../src/data/plans.json';
describe('ouvertures regroupées', () => {
  const R = rep as unknown as Repertoire;
  it('chaque ligne est rangée une seule fois, les plans pointent vers des ouvertures qui existent', () => {
    const ids = R.blocs.flatMap(b => b.systemes.flatMap(s => s.branches.map(x => x.id)));
    expect(new Set(ids).size).toBe(ids.length);
    const sys = new Set(R.blocs.flatMap(b => b.systemes.map(s => s.id)));
    for (const p of plans as { sys: string[] }[]) for (const s of p.sys) expect(sys.has(s)).toBe(true);
  });
  it('trouve tes lignes en jouant les coups', () => {
    const r = linesThrough(R.blocs, ['d4', 'd5', 'Bf4']);
    expect(r.through.some(x => x.sys.id === 'A6')).toBe(true);
    expect(r.through.every(x => x.br.moves[2].san === 'Bf4')).toBe(true);
    expect(linesThrough(R.blocs, ['h4', 'h5', 'g4']).through).toHaveLength(0);
  });
});

describe('dame gagnée', () => {
  const sys: System = { id: 'Q', titre: 'T', statut: 'joué', resume: '', branches: Array.from({ length: 3 }, (_, i) => ({ id: 'q' + i, titre: '', moves: [], notes: {} })) };
  const bloc: Bloc = { id: 'B', titre: '', sous: '', side: 'w', systemes: [sys] };
  const ok = { ...newBranchState(), runs: 1, clean: 1, due: Date.now() + 864e5 * 9 };
  it('se gagne quand toutes les cases sont réussies, et reste quand une ligne s\'ajoute', () => {
    const st = { q0: ok, q1: ok, q2: ok };
    const u = unitOf(bloc, sys, st);
    expect(u.promoted).toBe(true); expect(earnedQueen(u)).toBe(true);
    const more: System = { ...sys, branches: [...sys.branches, { id: 'q3', titre: '', moves: [], notes: {}, type: 'punir' }] };
    expect(unitOf(bloc, more, st).promoted).toBe(false);
    const kept = unitOf(bloc, more, st, {}, Date.now(), { Q: 1 });
    expect(kept.promoted).toBe(true);
    expect(kept.lessons.some(l => l.state === 'cur')).toBe(true);
  });
});

import { punishWeeks, scanExits } from '../src/core/scan';
import type { Game } from '../src/core/types';
describe('sorties d\'ouverture', () => {
  const base = { url: '', tc: 'rapid', tcs: '', rr: '', opp: 'x', oppElo: 1700, myElo: 1750, res: 'W', eco: '', clocks: [], nply: 9 } as const;
  const sans = ['d4', 'd5', 'c4', 'c6', 'Nc3', 'Nf6', 'Nf3', 'Bg4', 'h3'];
  const gap = { status: 'gap', depth: 7, ply: 7, fen: 'x', played: 'Bg4', branches: [] } as Game['a'];
  // chances des Blancs avant chaque coup : son …Bg4 fait monter de 50 à 70 ; h3 rend l'avantage (70 → 55) ou le garde (70 → 68)
  const mk = (id: string, after: number, t = Date.now() / 1000): Game => ({ ...base, id, t, color: 'w', sans, a: gap, wp: [50, 50, 50, 50, 50, 50, 50, 50, 70, after] } as unknown as Game);
  it("classe une erreur adverse, et compte si elle a été punie", () => {
    const s = scanExits([mk('1', 55), mk('2', 68), mk('3', 54), { ...mk('5', 62), cls: [...Array(8).fill('book'), 'best'] } as Game]);
    expect(s.punir).toHaveLength(1);
    expect(s.punir[0]).toMatchObject({ count: 4, punished: 2, missed: 2, played: 'Bg4' });   // le 4e : la classe « meilleur coup » prime sur l'écart
    expect(s.connaitre).toHaveLength(0);
  });
  it('un coup normal hors répertoire est à connaître', () => {
    const g = { ...mk('4', 52), wp: [50, 50, 50, 50, 50, 50, 50, 50, 52, 52] } as Game;
    expect(scanExits([g]).connaitre).toHaveLength(1);
  });
  it('suit les erreurs punies semaine par semaine', () => {
    const w = punishWeeks([mk('1', 55), mk('2', 68)], 8);
    expect(w[7]).toMatchObject({ errors: 2, punished: 1 });
  });
});
