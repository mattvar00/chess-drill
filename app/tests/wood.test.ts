import { describe, it, expect } from 'vitest';
import type { Fault } from '../src/core/analysis';
import { schedulePos } from '../src/core/schedule';
import { priorityFaults, costliestFaults, duePositions, drop, ageDays, matPhrase, themeHint, fmtTime } from '../src/core/wood';

const NOW = Date.UTC(2026, 10, 13, 12), DAY = 864e5;
const F = (id: string, date: string, before: number, after: number): Fault => ({ id, game: id, fen: '', side: 'w', ply: 10, theme: 'Coup calme', phase: 'milieu de partie', mat: 0, opp: 'x', date, result: 'L', move_no: 6, opening: '',
  best: { san: 'Nf3', uci: 'g1f3', score: '+0.5', desc: '', suite: '', reply: null }, played: { san: 'a3', uci: 'a2a3', score: '-2.0', wp_before: before, wp_after: after, refut: '' } });
const faults = [F('old', '2026.09.01', 60, 20), F('recent', '2026.11.12', 55, 35), F('small', '2026.11.10', 50, 34)];

describe('woodpecker', () => {
  it('mesure le coût et l\'âge', () => { expect(drop(faults[0])).toBe(40); expect(ageDays(faults[1], NOW)).toBe(1); });
  it('priorité : les positions récentes et jamais vues d\'abord, celles réussies récemment ensuite', () => {
    expect(priorityFaults(faults, {}, 2, NOW).map(f => f.id)).toEqual(['recent', 'small']);
    const solved = schedulePos(undefined, 'good', 1, NOW);
    expect(priorityFaults(faults, { recent: solved }, 3, NOW).map(f => f.id)).toEqual(['small', 'old', 'recent']);
  });
  it('les plus coûteuses sur une période', () => {
    expect(costliestFaults(faults, 5, 30, NOW).map(f => f.id)).toEqual(['recent', 'small']);
    expect(costliestFaults(faults, 1, 365, NOW).map(f => f.id)).toEqual(['old']);
  });
  it('compte les positions à revoir', () => {
    const due = schedulePos(undefined, 'fail', 1, NOW - 2 * DAY), later = schedulePos(undefined, 'good', 1, NOW);
    expect(duePositions(faults, { old: due, recent: later }, NOW)).toBe(1);
  });
  it('textes', () => { expect(matPhrase(2)).toBe('tu as 2 points de plus'); expect(matPhrase(0)).toBe('matériel égal'); expect(themeHint('inconnu')).toMatch(/Échecs/); expect(fmtTime(83000)).toBe('1:23'); });
});
