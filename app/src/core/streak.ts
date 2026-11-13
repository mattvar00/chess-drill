/** Série de jours d'entraînement consécutifs. Logique pure. */
const pad = (n: number) => String(n).padStart(2, '0');
/** Jour local au format AAAA-MM-JJ. */
export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function addDay(days: string[], t = Date.now()): string[] {
  const k = dayKey(t); return days.includes(k) ? days : [...days, k].sort().slice(-400);
}
/** Jours consécutifs jusqu'à aujourd'hui. Une série reste en vie tant qu'hier a été travaillé. */
export function streak(days: string[], now = Date.now()): number {
  const set = new Set(days), d = new Date(now); d.setHours(12, 0, 0, 0);
  if (!set.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0; while (set.has(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export const trainedToday = (days: string[], now = Date.now()) => days.includes(dayKey(now));
