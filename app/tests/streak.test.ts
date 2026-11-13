import { describe, it, expect } from 'vitest';
import { addDay, dayKey, streak, trainedToday } from '../src/core/streak';
const at = (y: number, m: number, d: number, h = 15) => new Date(y, m - 1, d, h).getTime();
describe('série de jours', () => {
  it('clé de jour locale et ajout sans doublon', () => {
    expect(dayKey(at(2026, 11, 3))).toBe('2026-11-03');
    const d = addDay(addDay([], at(2026, 11, 3)), at(2026, 11, 3, 23)); expect(d).toEqual(['2026-11-03']);
  });
  it('compte les jours consécutifs, aujourd\'hui compris ou non', () => {
    const days = ['2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13'];
    expect(streak(days, at(2026, 11, 13))).toBe(3);
    expect(streak(days, at(2026, 11, 14))).toBe(3);          // pas encore travaillé aujourd'hui : la série tient
    expect(streak(days, at(2026, 11, 15))).toBe(0);          // un jour sauté : perdue
    expect(streak([], at(2026, 11, 13))).toBe(0);
    expect(trainedToday(days, at(2026, 11, 13))).toBe(true); expect(trainedToday(days, at(2026, 11, 14))).toBe(false);
  });
  it('passe les changements de mois', () => { expect(streak(['2026-10-31', '2026-11-01'], at(2026, 11, 1))).toBe(2); });
});
