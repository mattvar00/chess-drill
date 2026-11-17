/**
 * Le chemin des ouvertures (concept « la promotion ») : chaque ouverture est la marche d'un pion vers la 8e rangée.
 * Ses lignes sont coupées en leçons (une case chacune : 6 au plus pour le répertoire de base, puis des cases de 3 pour les lignes tirées de tes parties). Une leçon est réussie quand chacune de ses lignes
 * a été jouée une fois sans faute ; elle se « fissure » quand une de ses lignes est à revoir. Toutes réussies : promotion.
 */
import { isDue } from './schedule';
import type { Bloc, Branch, BranchState, Color, RepMove, System } from './types';

export type CaseState = 'done' | 'crack' | 'cur' | 'lock';
export interface Lesson { ids: string[]; rank: number; state: CaseState; name?: string }
export interface Unit { bloc: Bloc; sys: System; lessons: Lesson[]; done: number; promoted: boolean; meet: number }

/** Coupe une liste en `n` morceaux de tailles aussi égales que possible, dans l'ordre. */
export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []; let k = 0;
  for (let i = 0; i < n; i++) { const size = Math.floor(xs.length / n) + (i < xs.length % n ? 1 : 0); out.push(xs.slice(k, k + size)); k += size; }
  return out.filter(c => c.length);
}
export const passed = (s?: BranchState) => !!s && s.runs > 0 && s.clean >= 1;

/** `queens` : les dames déjà gagnées. Une ouverture promue le reste quand on lui ajoute des lignes : la nouvelle case se joue avant la dame, sans la reprendre. */
/**
 * Les lignes propres à une ouverture : ce que tu joues, toi. Les punitions (réponses à une erreur adverse) sont à part,
 * dans « Punir les erreurs adverses » : elles ne font pas partie du chemin et ne comptent pas pour la dame.
 */
export const ownLines = (sys: System) => sys.branches.filter(b => b.type !== 'punir');
/** Les chapitres d'un cours, dans l'ordre où ils apparaissent ; `null` si les lignes n'ont pas de chapitre (ouverture sans cours). */
export function chaptersOf(lines: Branch[]): { name: string; lines: Branch[] }[] | null {
  if (!lines.length || !lines.every(b => b.ch)) return null;
  const out: { name: string; lines: Branch[] }[] = [];
  for (const b of lines) { let c = out.find(x => x.name === b.ch); if (!c) out.push(c = { name: b.ch!, lines: [] }); c.lines.push(b); }
  return out;
}
/**
 * Méthode du cours : où commence une variante. On rejoue tout seuls les coups qu'elle partage avec une variante déjà connue,
 * jusqu'au coup adverse qui l'ouvre (compris) ; il reste toujours au moins un coup à jouer soi-même.
 * `known` : les coups des autres variantes déjà sues. Renvoie le nombre de demi-coups joués d'office.
 */
export function trunkOf(moves: RepMove[], known: RepMove[][], side: Color): number {
  let t = 0;
  for (const o of known) { let k = 0; while (k < moves.length && k < o.length && o[k].uci === moves[k].uci) k++; t = Math.max(t, k); }
  if (!t) return 0;
  const mine = (i: number) => (i % 2 === 0) === (side === 'w');
  if (t < moves.length && !mine(t)) t++;
  let last = moves.length - 1; while (last >= 0 && !mine(last)) last--;
  return Math.max(0, Math.min(t, last));
}
export function unitOf(bloc: Bloc, sys: System, st: Record<string, BranchState | undefined>, meet: Record<string, number> = {}, now = Date.now(), queens: Record<string, number> = {}): Unit {
  // Les lignes du répertoire de base sont coupées en 6 cases au plus. Les « Bon coup » tirés de tes parties forment leurs propres
  // cases de 3, ajoutées à la fin : en ajouter un ne déplace jamais une case déjà jouée. Les punitions n'entrent pas dans le chemin.
  // Un cours (lignes rangées par chapitre) : une case par chapitre, dans l'ordre du cours. Ajouter une variante à un chapitre ne déplace rien.
  const ids = sys.branches.map(b => b.id), baseBr = sys.branches.filter(b => !b.type), extra = sys.branches.filter(b => b.type === 'bon').map(b => b.id);
  const chapters = chaptersOf(baseBr);
  const parts: { ids: string[]; name?: string }[] = [
    ...(chapters ? chapters.map(c => ({ ids: c.lines.map(b => b.id), name: c.name })) : chunk(baseBr.map(b => b.id), Math.min(6, baseBr.length)).map(p => ({ ids: p }))),
    ...Array.from({ length: Math.ceil(extra.length / 3) }, (_, i) => ({ ids: extra.slice(3 * i, 3 * i + 3), name: chapters ? 'Tirées de tes parties' : undefined }))], n = parts.length;
  let cur = false;
  const lessons = parts.map(({ ids: p, name }, i): Lesson => {
    const rank = 8 - n + 1 + i, ok = p.every(id => passed(st[id]));
    if (ok) return { ids: p, rank, name, state: p.some(id => isDue(st[id], now)) ? 'crack' : 'done' };
    if (!cur) { cur = true; return { ids: p, rank, name, state: 'cur' }; }
    return { ids: p, rank, name, state: 'lock' };
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
export const knownLines = (u: Unit, st: Record<string, BranchState | undefined>) => ownLines(u.sys).filter(b => passed(st[b.id])).length;
/** Les ouvertures d'un bloc, la plus jouée d'abord (les plans animés, qui ne sont pas des ouvertures, à part). */
export function unitsOf(bloc: Bloc, st: Record<string, BranchState | undefined>, meet: Record<string, number> = {}, now = Date.now(), queens: Record<string, number> = {}): Unit[] {
  return bloc.systemes.filter(s => ownLines(s).length && s.statut !== 'plan').map(s => unitOf(bloc, s, st, meet, now, queens))
    .sort((a, b) => b.meet - a.meet || bloc.systemes.indexOf(a.sys) - bloc.systemes.indexOf(b.sys));
}
/** Toutes les cases réussies, dame pas encore notée : c'est le moment de la noter. */
export const earnedQueen = (u: Unit, queens: Record<string, number> = {}) => u.done === u.lessons.length && !queens[u.sys.id];
/** Lignes « Bon coup » tirées de tes parties pas encore jouées : ce qu'il y a de neuf dans une ouverture. */
export const freshFromGames = (sys: System, st: Record<string, BranchState | undefined>) => sys.branches.filter(b => b.type === 'bon' && !st[b.id]?.runs).length;
/** Lignes du répertoire qui passent par ces coups (ou dont tout le texte est déjà joué, plus court que la position). */
export function linesThrough(blocs: Bloc[], sans: string[]) {
  const through: { bloc: Bloc; sys: System; br: System['branches'][number] }[] = [], next: Record<string, number> = {};
  for (const bloc of blocs) for (const sys of bloc.systemes) for (const br of sys.branches) {
    if (br.moves.length < sans.length || !sans.every((m, k) => br.moves[k].san === m)) continue;
    through.push({ bloc, sys, br }); const nx = br.moves[sans.length]?.san; if (nx) next[nx] = (next[nx] || 0) + 1;
  }
  return { through, next: Object.entries(next).sort((a, b) => b[1] - a[1]) };
}
