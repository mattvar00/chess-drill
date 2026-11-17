import { describe, expect, it } from 'vitest';
import rep from '../src/data/repertoire.json';
import type { Bloc, Repertoire, System } from '../src/core/types';
import { lineName } from '../src/core/names';
import { caseOf, chaptersOf, knownLines, trunkOf, unitOf, type Unit } from '../src/core/path';
import { Chess } from '../src/core/chess';
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
    const more: System = { ...sys, branches: [...sys.branches, { id: 'q3', titre: '', moves: [], notes: {}, type: 'bon' }] };
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

import { recommend, type Facts } from '../src/core/reco';
describe('recommandations', () => {
  const mkU = (id: string, statut = 'joué', learnt = 0): Unit => {
    const sys: System = { id, titre: id, statut, resume: '', branches: Array.from({ length: 4 }, (_, i) => ({ id: id + i, titre: '', moves: [], notes: {} })) };
    const st: Record<string, ReturnType<typeof newBranchState>> = {};
    for (let i = 0; i < learnt; i++) st[id + i] = { ...newBranchState(), runs: 1, clean: 1, due: Date.now() + 864e5 * 9 };
    return unitOf({ id: 'B', titre: '', sous: '', side: 'b', systemes: [sys] }, sys, st);
  };
  const f = (id: string, x: Partial<Facts> = {}, statut = 'joué', learnt = 0): Facts => ({ u: mkU(id, statut, learnt), games: 0, score: null, devs: 0, due: 0, fresh: 0, punir: 0, drop: null, plans: 0, ...x });
  it('un oubli récent passe avant le reste, une ouverture de rechange ne sort jamais', () => {
    const r = recommend([f('a', { games: 10, score: 50, due: 2 }), f('b', { games: 6, score: 50, devs: 1 }), f('c', { games: 20, score: 20, devs: 3 }, 'alternatif')]);
    expect(r.todo.map(x => [x.f.u.sys.id, x.kind])).toEqual([['b', 'oubli'], ['a', 'revoir']]);
  });
  it('repère une ouverture qui coûte des points, et renvoie vers les plans quand ça se gâte après l\'ouverture', () => {
    const r = recommend([f('a', { games: 10, score: 70 }, 'joué', 4), f('b', { games: 10, score: 30, drop: -9, plans: 2 }, 'joué', 4), f('c', { games: 10, score: 30 }, 'joué', 4)]);
    expect(r.todo.map(x => x.kind).sort()).toEqual(['fragile', 'milieu']);
    expect(r.strong.map(x => x.u.sys.id)).toEqual(['a']);
  });
  it('sans rien d\'urgent, propose la suite du chemin', () => {
    const r = recommend([f('a'), f('b')]);
    expect(r.todo).toHaveLength(1); expect(r.todo[0].kind).toBe('avancer');
  });
});
describe('cases stables', () => {
  it('un « Bon coup » s\'ajoute à la fin sans déplacer les cases, une punition reste hors du chemin', () => {
    const base = Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, titre: '', moves: [], notes: {} }));
    const sys: System = { id: 'K', titre: '', statut: 'joué', resume: '', branches: base };
    const bloc: Bloc = { id: 'B', titre: '', sous: '', side: 'w', systemes: [sys] };
    const before = unitOf(bloc, sys, {}).lessons.map(l => l.ids);
    const more = { ...sys, branches: [...base, ...['x1', 'x2', 'x3', 'x4'].map(id => ({ id, titre: '', moves: [], notes: {}, type: 'bon' as const })), { id: 'p1', titre: '', moves: [], notes: {}, type: 'punir' as const }] };
    const after = unitOf(bloc, more, {}).lessons.map(l => l.ids);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([['x1', 'x2', 'x3'], ['x4']]);
    expect(after.flat()).not.toContain('p1');   // une punition n'entre pas dans le chemin
  });
});

describe('cours : chapitres et méthode', () => {
  const R = rep as unknown as Repertoire, bloc = R.blocs.find(b => b.systemes.some(s => s.id === 'C5'))!, c5 = bloc.systemes.find(s => s.id === 'C5')!;
  const course = c5.branches.filter(b => b.ch), mv = (id: string) => c5.branches.find(b => b.id === id)!.moves;
  it('une case par chapitre, dans l\'ordre du cours, puis les lignes tirées des parties', () => {
    const u = unitOf(bloc, c5, {});
    expect(u.lessons.map(l => l.name)).toEqual([...chaptersOf(course)!.map(c => c.name), 'Tirées de tes parties']);
    expect(u.lessons[1].ids).toEqual(['C5b1', 'C5b2', 'C5b3', 'C5b4', 'C5b5', 'C5b6']);
  });
  it('chaque variante du cours a un rôle, une explication, des coups légaux, et finit sur un coup à soi (sauf la ligne principale d\'origine)', () => {
    expect(course.length).toBeGreaterThanOrEqual(18);
    for (const b of course) {
      expect(b.role, b.id).toMatch(/^(theorie|erreur)$/); expect(b.intro!.length, b.id).toBeGreaterThan(40);
      const g = new Chess(); for (const m of b.moves) expect(g.move(m.san).san, `${b.id} ${m.san}`).toBe(m.san);
      if (b.id !== 'C1d') expect(b.moves.length % 2, b.id).toBe(1);
      for (const k of Object.keys(b.notes)) expect(+k % 2, `${b.id} note ${k}`).toBe(0);   // les notes sont sur tes coups
    }
  });
  it('dans chaque chapitre, la théorie passe avant les erreurs', () => {
    for (const c of chaptersOf(course)!) expect(c.lines[0].role, c.name).toBe('theorie');
  });
  it('rien de connu : la variante se joue depuis le premier coup', () => {
    expect(trunkOf(mv('C5b1'), [], 'w')).toBe(0);
  });
  it('les coups communs se jouent tout seuls, jusqu\'au coup adverse qui ouvre la variante', () => {
    // …Bd7 connue : pour …Qb6, on rejoue jusqu'à 6.Nc3 puis 6…Qb6 ; il reste 7.Nd5 à trouver
    const t = trunkOf(mv('C5b2'), [mv('C5b1')], 'w');
    expect(mv('C5b2')[t - 1].san).toBe('Qb6'); expect(mv('C5b2')[t].san).toBe('Nd5');
    // d'un chapitre à l'autre : seuls 1.d4 d5 2.c4 dxc4 3.e4 sont communs, puis 3…b5
    const t2 = trunkOf(mv('C5b1'), [mv('C1d'), mv('C1e')], 'w');
    expect(mv('C5b1')[t2 - 1].san).toBe('b5'); expect(mv('C5b1')[t2].san).toBe('a4');
  });
  it('quand la variante s\'écarte par un coup à soi, on s\'arrête juste avant', () => {
    const t = trunkOf(mv('C1x3'), [mv('C1d')], 'w');   // 5.Nxd4 au lieu de 5.Bxc4
    expect(mv('C1x3')[t].san).toBe('Nxd4');
  });
  it('il reste toujours un coup à jouer soi-même', () => {
    const a = mv('C5b5'), t = trunkOf(a, [a], 'w');
    expect(t).toBeLessThan(a.length); expect(t % 2).toBe(0);
  });
});
