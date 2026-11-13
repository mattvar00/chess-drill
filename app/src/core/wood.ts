/** Exercices tirés de tes fautes : choix des positions d'un cycle. Logique pure. */
import type { Fault } from './analysis';
import { posPriority } from './schedule';
import type { PosState } from './types';

export type PosStates = Record<string, PosState | undefined>;
/** Chances de gain perdues par le coup joué en partie (points de %). */
export const drop = (f: Fault) => f.played.wp_before - f.played.wp_after;
export const faultTime = (f: Fault) => Date.parse(f.date.replace(/\./g, '-') + 'T12:00:00Z');
export const ageDays = (f: Fault, now = Date.now()) => Math.max(0, (now - faultTime(f)) / 864e5);

/** Les positions les plus utiles maintenant : dues, coûteuses, récentes, ratées. */
export function priorityFaults(faults: Fault[], st: PosStates, n: number, now = Date.now()): Fault[] {
  return [...faults].sort((a, b) => posPriority(st[b.id], drop(b), ageDays(b, now), now) - posPriority(st[a.id], drop(a), ageDays(a, now), now)).slice(0, n);
}
/** Les fautes qui ont coûté le plus cher sur une période. */
export function costliestFaults(faults: Fault[], n: number, days: number, now = Date.now()): Fault[] {
  return faults.filter(f => ageDays(f, now) <= days).sort((a, b) => drop(b) - drop(a)).slice(0, n);
}
export const duePositions = (faults: Fault[], st: PosStates, now = Date.now()) => faults.filter(f => { const s = st[f.id]; return s?.reps && (s.due ?? 0) <= now; }).length;

export const matPhrase = (m: number) => m > 0 ? `tu as ${m} point${m > 1 ? 's' : ''} de plus` : m < 0 ? `tu as ${-m} point${-m > 1 ? 's' : ''} de moins` : 'matériel égal';
const HINTS: Record<string, string> = {
  'Échec gagnant raté': 'Passe en revue tous tes échecs avant de jouer un coup calme.',
  'Pièce à prendre': 'Une pièce adverse est mal défendue. Compte, puis encaisse.',
  'Capture gagnante ratée': 'Une prise rapporte du matériel. Calcule-la jusqu\'au bout avant de la rejeter.',
  'Pièce en prise oubliée': 'Une de tes pièces est attaquée. Sauve-la, ou trouve plus fort.',
  'Pièce déposée en prise': 'La case où tu veux aller est-elle sûre ? Compte attaquants et défenseurs.',
  'Pièce mise en prise': 'Que défend la pièce que tu veux bouger ? Regarde ce qui reste en l\'air.',
  'Échec adverse ignoré': 'Quels échecs l\'adversaire aura-t-il après ton coup ?',
  'Coup calme': 'Pas de tactique immédiate : cherche le coup le plus utile et vérifie la réponse adverse.',
};
export const themeHint = (theme: string) => HINTS[theme] ?? 'Échecs, prises, menaces : vérifie-les dans cet ordre.';
export const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
