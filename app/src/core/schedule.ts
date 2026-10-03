/** Répétition espacée : lignes du répertoire (SM-2 adapté) et positions d'exercice. */
import type { BranchState, PosState } from './types';
const DAY = 864e5;
export const newBranchState = (): BranchState => ({ clean: 0, runs: 0, last: 0, due: 0, ivl: 0, ease: 2.3, fails: 0 });
export const isValid = (s?: BranchState) => !!s && s.clean >= 2;
export const isDue = (s: BranchState | undefined, now = Date.now()) => !s || !s.runs || s.due <= now;
/** errs = erreurs dans le passage : 0 → l'intervalle grandit ; 1 → divisé par deux ; 2+ → on recommence. */
export function scheduleBranch(prev: BranchState | undefined, errs: number, now = Date.now()): BranchState {
  const s = { ...newBranchState(), ...prev }; s.runs++; s.last = now;
  if (errs === 0) { s.clean++; s.ivl = s.ivl === 0 ? 1 : s.ivl === 1 ? 3 : Math.round(s.ivl * s.ease); s.ease = Math.min(3, s.ease + 0.1); }
  else if (errs === 1) { s.ivl = Math.max(1, Math.round(s.ivl * 0.5)); s.ease = Math.max(1.3, s.ease - 0.15); }
  else { s.clean = 0; s.ivl = 0; s.fails++; s.ease = Math.max(1.3, s.ease - 0.2); }
  s.ivl = Math.min(s.ivl, 60); s.due = s.ivl ? now + s.ivl * DAY : now; return s;
}
/** Poids de tirage d'une ligne (neuves, dues, ratées, rencontrées en partie). */
export function branchWeight(s: BranchState | undefined, now = Date.now()): number {
  let w = 1; if (!s || !s.runs) w += 2; if (!isValid(s)) w += 1.5; if (isDue(s, now)) w += 1.5;
  if (s) { w += Math.min(3, s.fails || 0) * 0.7 + Math.min(4, s.devs || 0) * 1.2 + Math.min(4, s.freq || 0) * 0.4; if (s.prob != null) w += Math.min(3, s.prob * 20); }
  return w;
}
export type PosResult = 'good' | 'ok' | 'fail';
export function schedulePos(prev: PosState | undefined, res: PosResult, tries?: number, now = Date.now()): PosState {
  const s: PosState = { ivl: 0, ease: 2.3, reps: 0, lapses: 0, ...prev }; s.reps = (s.reps || 0) + 1; s.last = now; if (tries) s.tries = tries;
  if (res === 'good') { s.ivl = s.ivl ? Math.round(s.ivl * (s.ease || 2.3)) : 3; s.ease = Math.min(3, (s.ease || 2.3) + 0.1); s.done = true; }
  else if (res === 'ok') { s.ivl = 1; s.ease = Math.max(1.3, (s.ease || 2.3) - 0.15); s.done = true; }
  else { s.ivl = 1; s.lapses = (s.lapses || 0) + 1; s.ease = Math.max(1.3, (s.ease || 2.3) - 0.2); s.shown = true; }
  s.ivl = Math.min(s.ivl, 90); s.due = now + s.ivl * DAY; return s;
}
export const posDue = (s: PosState | undefined, now = Date.now()) => !s || !s.due || s.due <= now;
/** Priorité d'une position dans la file : due, chances perdues, récence, jamais vue, ratée, facile pour ton niveau. */
export function posPriority(s: PosState | undefined, drop: number, ageDays: number, now = Date.now()): number {
  return (posDue(s, now) ? 100 : 0) + Math.max(0, drop) * 0.6 + Math.max(0, 30 - ageDays) + (s && s.reps ? 0 : 10) + ((s && s.lapses) || 0) * 8
    + (s && s.pm != null ? (s.pm >= 0.3 ? 15 : s.pm < 0.1 ? -5 : 5) : 0);
}
