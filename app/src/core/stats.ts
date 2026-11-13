/**
 * Statistiques sur tes parties (portées de la v1, js/profile.js et js/structures.js).
 * Elles reposent sur la courbe des chances (wp) et la classe des coups (cls) envoyées avec chaque partie analysée.
 */
import { plyTimes } from './clock';
import { gameStructure } from './structures';
import type { Game } from './types';

/** Chances de ton point de vue, avant chaque coup (null si la partie n'est pas analysée). */
export const myWp = (g: Game): number[] | null => (g.wp?.length ? g.wp.map(w => (g.color === 'w' ? w : 100 - w)) : null);
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const winRate = (l: Game[]) => pct(l.filter(g => g.res === 'W').length, l.length);
const mean = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

/** Part des parties restées dans ton répertoire (un trou, c'est l'adversaire qui sort du livre). */
export function coverage(list: Game[]): number | null {
  const rel = list.filter(g => g.a && g.a.status !== 'nobook' && g.a.status !== 'err'); if (!rel.length) return null;
  return pct(rel.filter(g => g.a.status === 'ok' || g.a.status === 'gap' || g.a.depth >= 8).length, rel.length);
}

export interface Profile {
  n: number; nAn: number; winRate: number | null;
  opening: { coverage: number | null; devs: number; gaps: number; wp10: number | null };
  tactics: { acc: number; blunders: number; mistakes: number; themes: [string, number][] } | null;
  conversion: { n: number; rate: number | null } | null;
  resilience: { n: number; rate: number | null } | null;
  clock: { timeouts: number; avgMove: number | null; fastShare: number | null; blunders: number; fastBlunders: number | null; slowBlunders: number | null; n: number };
  tilt: { perDay: number; maxDay: number; afterTwoL: number; wrAfterTwoL: number | null; longSessions: number; wrLongTail: number | null; avgSess: number } | null;
  elo: Record<string, { t: number; e: number }[]>;
}
/** Parties coupées en sessions (une pause de plus de 20 minutes en commence une nouvelle). */
function sessions(list: Game[]): Game[][] {
  const out: Game[][] = []; let cur: Game[] = [], last = 0;
  for (const g of [...list].sort((a, b) => a.t - b.t)) { if (cur.length && g.t - last > 1200) { out.push(cur); cur = []; } cur.push(g); last = g.t; }
  if (cur.length) out.push(cur); return out;
}
/** `themes` : nombre de fautes par thème, pour les parties de la liste. */
export function profile(list: Game[], themes: (ids: Set<string>) => [string, number][] = () => []): Profile {
  const all = list.filter(g => g.a?.status !== 'err').sort((a, b) => a.t - b.t), an = all.filter(g => g.st && myWp(g));
  const wp10 = an.map(g => { const w = myWp(g)!; return w[Math.min(20, w.length - 1)]; });
  const pr: Profile = {
    n: all.length, nAn: an.length, winRate: winRate(all),
    opening: { coverage: coverage(all), devs: all.filter(g => g.a?.status === 'dev').length, gaps: all.filter(g => g.a?.status === 'gap').length, wp10: wp10.length ? Math.round(mean(wp10)!) : null },
    tactics: null, conversion: null, resilience: null, tilt: null, elo: {},
    clock: { timeouts: all.filter(g => g.rr === 'timeout' && g.res === 'L').length, avgMove: null, fastShare: null, blunders: 0, fastBlunders: null, slowBlunders: null, n: 0 },
  };
  if (an.length) {
    pr.tactics = { acc: Math.round(mean(an.map(g => g.st!.acc ?? 0))!), blunders: +(an.reduce((a, g) => a + g.st!.blunder, 0) / an.length).toFixed(1), mistakes: +(an.reduce((a, g) => a + g.st!.mistake, 0) / an.length).toFixed(1), themes: themes(new Set(an.map(g => g.id))) };
    const won = an.filter(g => Math.max(...myWp(g)!) >= 80), lost = an.filter(g => Math.min(...myWp(g)!) <= 20);
    pr.conversion = { n: won.length, rate: pct(won.filter(g => g.res === 'W').length, won.length) };
    pr.resilience = { n: lost.length, rate: pct(lost.filter(g => g.res !== 'L').length, lost.length) };
  }
  let fast = 0, fastBl = 0, slowBl = 0, nb = 0, tSum = 0, tN = 0;
  for (const g of an) { if (!g.cls || !g.clocks?.length) continue; const mt = plyTimes(g.clocks, g.tcs, g.cls.length); let gn = 0;
    g.cls.forEach((k, i) => { if ((i % 2 === 0) !== (g.color === 'w')) return; const t = mt[i]; if (t == null) return; gn++; tSum += t; tN++; if (t < 3) fast++;
      if (k === 'blunder') { nb++; if (t < 3) fastBl++; else if (t >= 15) slowBl++; } });
    if (gn) pr.clock.n++; }
  Object.assign(pr.clock, { avgMove: tN ? +(tSum / tN).toFixed(1) : null, fastShare: pct(fast, tN), blunders: nb, fastBlunders: pct(fastBl, nb), slowBlunders: pct(slowBl, nb) });
  if (all.length) {
    const byDay: Record<string, number> = {}; for (const g of all) { const d = new Date(g.t * 1000).toISOString().slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
    const ss = sessions(all), afterTwoL: Game[] = [];
    for (const s of ss) { let streak = 0; for (const g of s) { if (streak >= 2) afterTwoL.push(g); streak = g.res === 'L' ? streak + 1 : 0; } }
    const long = ss.filter(s => s.length >= 10);
    pr.tilt = { perDay: +(all.length / Object.keys(byDay).length).toFixed(1), maxDay: Math.max(...Object.values(byDay)), afterTwoL: afterTwoL.length, wrAfterTwoL: winRate(afterTwoL),
      longSessions: long.length, wrLongTail: winRate(long.flatMap(s => s.slice(10))), avgSess: +(all.length / ss.length).toFixed(1) };
  }
  for (const g of all) if (g.myElo) (pr.elo[g.tc] ??= []).push({ t: g.t, e: g.myElo });
  return pr;
}

export interface StructStat { n: number; score: number; delta: number; errMe: number; errOp: number; games: Game[] }
/** Par structure de pions : score, évolution des chances entre les coups 8 et 20, part de coups ratés (coups 9 à 25) pour toi et pour l'adversaire. */
export function structureStats(list: Game[]): Record<string, StructStat> {
  const acc: Record<string, { n: number; sc: number; d: number; me: [number, number]; op: [number, number]; games: Game[] }> = {};
  for (const g of list) { const w = myWp(g); if (!w || !g.st) continue; const st = gameStructure(g.sans); if (!st) continue;
    const o = acc[st.id] ??= { n: 0, sc: 0, d: 0, me: [0, 0], op: [0, 0], games: [] }; const meParity = g.color === 'w' ? 0 : 1;
    o.n++; o.sc += g.res === 'W' ? 1 : g.res === 'D' ? 0.5 : 0; o.d += w[Math.min(40, w.length - 1)] - w[Math.min(16, w.length - 1)];
    for (let i = 16; i < 50 && i + 1 < w.length; i++) { const mine = i % 2 === meParity; const l = mine ? Math.max(0, w[i] - w[i + 1]) : Math.max(0, w[i + 1] - w[i]);
      const X = mine ? o.me : o.op; X[0]++; if (l >= 10) X[1]++; }
    o.games.push(g); }
  const out: Record<string, StructStat> = {};
  for (const [k, o] of Object.entries(acc)) out[k] = { n: o.n, score: Math.round((100 * o.sc) / o.n), delta: Math.round(o.d / o.n), errMe: o.me[0] ? (100 * o.me[1]) / o.me[0] : 0, errOp: o.op[0] ? (100 * o.op[1]) / o.op[0] : 0, games: o.games.sort((a, b) => b.t - a.t) };
  return out;
}
