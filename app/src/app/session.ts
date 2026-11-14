/** Séance en cours : un lot de lignes à enchaîner. Vit en mémoire le temps de la séance. */
import { pickNext } from '../core/drill';
import { weightStates } from './store';

/** Une leçon du chemin : son ouverture, sa case, et où en était le pion avant. */
export interface LessonRef { bloc: string; sys: string; idx: number; rank: number; doneBefore: number }
/** `back` : où aller à la fin ; `exit` : où va la croix si on quitte avant (par défaut `back`). Chiffres de la séance pour son bilan. */
export interface Session { label: string; pool: string[]; done: Set<string>; back: string; exit?: string; lesson?: LessonRef;
  xp: number; clean: number; combo: number; best: number; t0: number }
let current: Session | null = null;
export const session = () => current;
export const remaining = () => current ? current.pool.filter(id => !current!.done.has(id)) : [];
/** Démarre une séance et renvoie l'adresse de la première ligne. */
export function startSession(label: string, pool: string[], back: string, first?: string, extra: { exit?: string; lesson?: LessonRef } = {}): string {
  current = { label, pool, done: new Set(), back, ...extra, xp: 0, clean: 0, combo: 0, best: 0, t0: Date.now() }; return lineUrl(first && pool.includes(first) ? first : pickNext(pool, weightStates()), 'drill');
}
export function nextUrl(after: string): string | null {
  const left = remaining(); return left.length ? lineUrl(pickNext(left, weightStates(), after), 'drill') : null;
}
export const endSession = () => { current = null; };
export const lineUrl = (id: string, mode: 'drill' | 'explore', game?: string) => `#/l/${id}/${mode}${game ? '?g=' + game : ''}`;
