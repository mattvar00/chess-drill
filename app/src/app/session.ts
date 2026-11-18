/** Séance en cours : un lot de lignes à enchaîner. Vit en mémoire le temps de la séance. */
import { pickNext } from '../core/drill';
import { weightStates } from './store';

/** Une leçon du chemin : son ouverture, sa case, et où en était le pion avant. */
export interface LessonRef { bloc: string; sys: string; idx: number; rank: number; doneBefore: number }
/** `back` : où aller à la fin ; `exit` : où va la croix si on quitte avant (par défaut `back`). Chiffres de la séance pour son bilan. */
/** `ordered` : les lignes se suivent dans l'ordre donné (un cours : la théorie, puis les erreurs), au lieu d'être tirées selon leur poids. */
export interface Session { label: string; pool: string[]; done: Set<string>; back: string; exit?: string; lesson?: LessonRef; ordered?: boolean;
  clean: number; combo: number; best: number; t0: number }
let current: Session | null = null;
const KEY = 'cd.session';
/** La séance survit à un rechargement de la page ou à un aller-retour dans l'historique (elle reste dans l'onglet). */
export function persistSession() { try { if (current) sessionStorage.setItem(KEY, JSON.stringify({ ...current, done: [...current.done] })); else sessionStorage.removeItem(KEY); } catch { /* stockage indisponible */ } }
function restore(): Session | null { try { const r = sessionStorage.getItem(KEY); if (!r) return null; const o = JSON.parse(r); return Array.isArray(o.pool) ? { ...o, done: new Set<string>(o.done) } : null; } catch { return null; } }
export const session = () => current ??= restore();
export const remaining = () => { const c = session(); return c ? c.pool.filter(id => !c.done.has(id)) : []; };
/** Démarre une séance et renvoie l'adresse de la première ligne. */
export function startSession(label: string, pool: string[], back: string, first?: string, extra: { exit?: string; lesson?: LessonRef; ordered?: boolean } = {}): string {
  current = { label, pool, done: new Set(), back, ...extra, clean: 0, combo: 0, best: 0, t0: Date.now() }; persistSession(); return lineUrl(first && pool.includes(first) ? first : pickNext(pool, weightStates()), 'drill');
}
export function nextUrl(after: string): string | null {
  const left = remaining(); return left.length ? lineUrl(current!.ordered ? left[0] : pickNext(left, weightStates(), after), 'drill') : null;
}
export const endSession = () => { current = null; persistSession(); };
export const lineUrl = (id: string, mode: 'drill' | 'explore', game?: string) => `#/l/${id}/${mode}${game ? '?g=' + game : ''}`;
