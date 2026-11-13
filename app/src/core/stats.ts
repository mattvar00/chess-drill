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

/* ---------- carte joueur : six notes sur 100 (échelles fixes, pas des percentiles) ---------- */
export type AxisKey = 'ouverture' | 'tactique' | 'conversion' | 'resilience' | 'horloge' | 'rythme';
export const AXES: [AxisKey, string][] = [['ouverture', 'Ouverture'], ['tactique', 'Tactique'], ['conversion', 'Conversion'], ['resilience', 'Résilience'], ['horloge', 'Horloge'], ['rythme', 'Rythme']];
const STRONG: Record<AxisKey, string> = { ouverture: 'Théoricien', tactique: 'Tacticien', conversion: 'Finisseur', resilience: 'Accrocheur', horloge: 'Métronome', rythme: 'Régulier' };
const WEAK: Record<AxisKey, string> = { ouverture: 'hors piste', tactique: 'distrait', conversion: 'généreux', resilience: 'fragile', horloge: 'pressé', rythme: 'insatiable' };
export interface Card { scores: Record<AxisKey, number | null>; overall: number | null; best: AxisKey | null; worst: AxisKey | null; type: string }
const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
/**
 * Ouverture : part des parties dans le répertoire. Tactique : précision ramenée de 50-100 à 0-100. Conversion : positions gagnantes converties.
 * Résilience : positions perdantes sauvées (40 % vaut 100). Horloge : pénalise les coups et les gaffes joués en moins de 3 s.
 * Rythme : pénalise les grosses journées et la baisse après deux défaites d'affilée. La note globale est la moyenne des notes connues.
 */
export function playerCard(pr: Profile): Card {
  const c = pr.clock, ti = pr.tilt;
  const scores: Card['scores'] = {
    ouverture: pr.opening.coverage,
    tactique: pr.tactics ? clamp((pr.tactics.acc - 50) * 2) : null,
    conversion: pr.conversion?.rate ?? null,
    resilience: pr.resilience?.rate != null ? clamp(pr.resilience.rate * 2.5) : null,
    horloge: c.fastShare != null ? clamp(100 - (c.fastBlunders ?? 0) - c.fastShare / 2) : null,
    rythme: ti ? clamp(100 - Math.min(60, ti.maxDay * 2) - (ti.wrAfterTwoL != null && pr.winRate != null ? Math.max(0, (pr.winRate - ti.wrAfterTwoL) * 2) : 0)) : null,
  };
  const known = AXES.map(([k]) => [k, scores[k]] as const).filter((x): x is [AxisKey, number] => x[1] != null).sort((a, b) => b[1] - a[1]);
  const best = known[0]?.[0] ?? null, worst = known.length > 1 ? known[known.length - 1][0] : null;
  return { scores, overall: known.length ? Math.round(known.reduce((a, x) => a + x[1], 0) / known.length) : null, best, worst, type: best ? `${STRONG[best]}${worst ? ' ' + WEAK[worst] : ''}` : '' };
}
/** Précision par phase (ouverture : 10 premiers coups, milieu : jusqu'au 30ᵉ, finale ensuite), à partir de la courbe des chances. */
export function phaseAccuracy(list: Game[]): { o: number | null; m: number | null; f: number | null } {
  const sum = { o: [0, 0], m: [0, 0], f: [0, 0] };
  for (const g of list) { const w = myWp(g); if (!w) continue;
    for (let i = g.color === 'w' ? 0 : 1; i + 1 < w.length; i += 2) { const k = i < 20 ? 'o' : i < 60 ? 'm' : 'f'; sum[k][0] += Math.max(0, w[i] - w[i + 1]); sum[k][1]++; } }
  const acc = ([l, n]: number[]) => (n ? clamp(103.1668 * Math.exp(-0.04354 * (l / n)) - 3.1669) : null);
  return { o: acc(sum.o), m: acc(sum.m), f: acc(sum.f) };
}
export function byColor(list: Game[], color: 'w' | 'b') { const l = list.filter(g => g.color === color); return { n: l.length, w: l.filter(g => g.res === 'W').length, d: l.filter(g => g.res === 'D').length, l: l.filter(g => g.res === 'L').length }; }

/** Le coup qui t'a coûté le plus cher dans une partie analysée (au moins 10 points de chances), ou null. */
export function keyMoment(g: Game): { ply: number; san: string; before: number; after: number } | null {
  const w = myWp(g); if (!w) return null; let best: { ply: number; loss: number } | null = null;
  for (let i = g.color === 'w' ? 0 : 1; i + 1 < w.length && i < g.sans.length; i += 2) { const loss = w[i] - w[i + 1]; if (loss >= 10 && (!best || loss > best.loss)) best = { ply: i, loss }; }
  return best ? { ply: best.ply, san: g.sans[best.ply], before: Math.round(w[best.ply]), after: Math.round(w[best.ply + 1]) } : null;
}
/** Part de victoires sur les trois premières parties d'une session, puis sur les suivantes (null si trop peu de parties). */
export function coldStart(list: Game[]): { first: number; rest: number } | null {
  const a = [0, 0], b = [0, 0];
  for (const s of sessions(list)) s.forEach((g, i) => { const x = i < 3 ? a : b; x[0]++; if (g.res === 'W') x[1]++; });
  return a[0] >= 20 && b[0] >= 20 ? { first: Math.round((100 * a[1]) / a[0]), rest: Math.round((100 * b[1]) / b[0]) } : null;
}
