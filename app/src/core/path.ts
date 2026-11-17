/**
 * Le chemin des ouvertures (concept « la promotion ») : chaque ouverture est la marche d'un pion vers la 8e rangée.
 * Ses lignes sont coupées en leçons (une case chacune : 6 au plus pour le répertoire de base, puis des cases de 3 pour les lignes tirées de tes parties). Une leçon est réussie quand chacune de ses lignes
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
export const passed = (s?: BranchState) => !!s && s.runs > 0 && s.clean >= 1;

/** `queens` : les dames déjà gagnées. Une ouverture promue le reste quand on lui ajoute des lignes : la nouvelle case se joue avant la dame, sans la reprendre. */
export function unitOf(bloc: Bloc, sys: System, st: Record<string, BranchState | undefined>, meet: Record<string, number> = {}, now = Date.now(), queens: Record<string, number> = {}): Unit {
  // Les lignes du répertoire de base sont coupées en 6 cases au plus. Celles tirées de tes parties (« Punir », « Bon coup »)
  // forment leurs propres cases de 3, ajoutées à la fin : en ajouter une ne déplace jamais une case déjà jouée.
  const ids = sys.branches.map(b => b.id), base = sys.branches.filter(b => !b.type).map(b => b.id), extra = sys.branches.filter(b => b.type).map(b => b.id);
  const parts = [...chunk(base, Math.min(6, base.length)), ...Array.from({ length: Math.ceil(extra.length / 3) }, (_, i) => extra.slice(3 * i, 3 * i + 3))], n = parts.length;
  let cur = false;
  const lessons = parts.map((p, i): Lesson => {
    const rank = 8 - n + 1 + i, ok = p.every(id => passed(st[id]));
    if (ok) return { ids: p, rank, state: p.some(id => isDue(st[id], now)) ? 'crack' : 'done' };
    if (!cur) { cur = true; return { ids: p, rank, state: 'cur' }; }
    return { ids: p, rank, state: 'lock' };
  });
  const done = lessons.filter(l => l.state === 'done' || l.state === 'crack').length;
  return { bloc, sys, lessons, done, promoted: done === n || !!queens[sys.id], meet: ids.reduce((s, id) => s + (meet[id] || 0), 0) };
}
/** Numéro de la case en cours (1 = la première) et nombre de cases : ce que l'app affiche partout, « case 2 sur 6 ». */
export function caseOf(u: Unit): { k: number; n: number } {
  const i = u.lessons.findIndex(l => l.state === 'cur');
  return { k: i < 0 ? u.lessons.length : i + 1, n: u.lessons.length };
}
/** Lignes d'une ouverture déjà jouées une fois sans faute. */
export const knownLines = (u: Unit, st: Record<string, BranchState | undefined>) => u.sys.branches.filter(b => passed(st[b.id])).length;
/** Les ouvertures d'un bloc, la plus jouée d'abord (les plans animés, qui ne sont pas des ouvertures, à part). */
export function unitsOf(bloc: Bloc, st: Record<string, BranchState | undefined>, meet: Record<string, number> = {}, now = Date.now(), queens: Record<string, number> = {}): Unit[] {
  return bloc.systemes.filter(s => s.branches.length && s.statut !== 'plan').map(s => unitOf(bloc, s, st, meet, now, queens))
    .sort((a, b) => b.meet - a.meet || bloc.systemes.indexOf(a.sys) - bloc.systemes.indexOf(b.sys));
}
/** Toutes les cases réussies, dame pas encore notée : c'est le moment de la noter. */
export const earnedQueen = (u: Unit, queens: Record<string, number> = {}) => u.done === u.lessons.length && !queens[u.sys.id];
/** Lignes tirées de tes parties (« Punir », « Bon coup ») pas encore jouées : ce qu'il y a de neuf dans une ouverture. */
export const freshFromGames = (sys: System, st: Record<string, BranchState | undefined>) => sys.branches.filter(b => b.type && !st[b.id]?.runs).length;
/** Lignes du répertoire qui passent par ces coups (ou dont tout le texte est déjà joué, plus court que la position). */
export function linesThrough(blocs: Bloc[], sans: string[]) {
  const through: { bloc: Bloc; sys: System; br: System['branches'][number] }[] = [], next: Record<string, number> = {};
  for (const bloc of blocs) for (const sys of bloc.systemes) for (const br of sys.branches) {
    if (br.moves.length < sans.length || !sans.every((m, k) => br.moves[k].san === m)) continue;
    through.push({ bloc, sys, br }); const nx = br.moves[sans.length]?.san; if (nx) next[nx] = (next[nx] || 0) + 1;
  }
  return { through, next: Object.entries(next).sort((a, b) => b[1] - a[1]) };
}
