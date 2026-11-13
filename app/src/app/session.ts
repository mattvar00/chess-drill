/** Séance en cours : un lot de lignes à enchaîner. Vit en mémoire le temps de la séance. */
import { pickNext } from '../core/drill';
import { weightStates } from './store';

export interface Session { label: string; pool: string[]; done: Set<string>; back: string }
let current: Session | null = null;
export const session = () => current;
export const remaining = () => current ? current.pool.filter(id => !current!.done.has(id)) : [];
/** Démarre une séance et renvoie l'adresse de la première ligne. */
export function startSession(label: string, pool: string[], back: string): string {
  current = { label, pool, done: new Set(), back }; return lineUrl(pickNext(pool, weightStates()), 'drill');
}
export function nextUrl(after: string): string | null {
  const left = remaining(); return left.length ? lineUrl(pickNext(left, weightStates(), after), 'drill') : null;
}
export const endSession = () => { current = null; };
export const lineUrl = (id: string, mode: 'drill' | 'explore', game?: string) => `#/l/${id}/${mode}${game ? '?g=' + game : ''}`;
