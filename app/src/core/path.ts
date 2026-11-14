/**
 * Le chemin des ouvertures (concept « la promotion ») : chaque ouverture est la marche d'un pion vers la 8e rangée.
 * Ses lignes sont coupées en leçons (une case chacune, au plus 6). Une leçon est réussie quand chacune de ses lignes
 * a été jouée une fois sans faute ; elle se « fissure » quand une de ses lignes est à revoir. Toutes réussies : promotion.
 */
import { isDue } from './schedule';
import type { Bloc, BranchState, System } from './types';

export type CaseState = 'done' | 'crack' | 'cur' | 'lock';
export interface Lesson { ids: string[]; rank: number; state: CaseState }
export interface Unit { bloc: Bloc; sys: System; lessons: Lesson[]; done: number; promoted: boolean; meet: number }

/** Coupe une liste en `n` morceaux de tailles aussi égales que possible, dans l'ordre. */
export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []; let k = 0;
  for (let i = 0; i < n; i++) { const size = Math.floor(xs.length / n) + (i < xs.length % n ? 1 : 0); out.push(xs.slice(k, k + size)); k += size; }
  return out.filter(c => c.length);
}
const passed = (s?: BranchState) => !!s && s.runs > 0 && s.clean >= 1;

export function unitOf(bloc: Bloc, sys: System, st: Record<string, BranchState | undefined>, meet: Record<string, number> = {}, now = Date.now()): Unit {
  const ids = sys.branches.map(b => b.id), parts = chunk(ids, Math.min(6, ids.length)), n = parts.length;
  let cur = false;
  const lessons = parts.map((p, i): Lesson => {
    const rank = 8 - n + 1 + i, ok = p.every(id => passed(st[id]));
    if (ok) return { ids: p, rank, state: p.some(id => isDue(st[id], now)) ? 'crack' : 'done' };
    if (!cur) { cur = true; return { ids: p, rank, state: 'cur' }; }
    return { ids: p, rank, state: 'lock' };
  });
  const done = lessons.filter(l => l.state === 'done' || l.state === 'crack').length;
  return { bloc, sys, lessons, done, promoted: done === n, meet: ids.reduce((s, id) => s + (meet[id] || 0), 0) };
}
/** Les ouvertures d'un bloc, la plus jouée d'abord (les plans animés, qui ne sont pas des ouvertures, à part). */
export function unitsOf(bloc: Bloc, st: Record<string, BranchState | undefined>, meet: Record<string, number> = {}, now = Date.now()): Unit[] {
  return bloc.systemes.filter(s => s.branches.length && s.statut !== 'plan').map(s => unitOf(bloc, s, st, meet, now))
    .sort((a, b) => b.meet - a.meet || bloc.systemes.indexOf(a.sys) - bloc.systemes.indexOf(b.sys));
}
