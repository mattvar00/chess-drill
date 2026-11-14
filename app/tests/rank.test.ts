import { describe, expect, it } from 'vitest';
import { lineRank, rankSummary } from '../src/core/rank';
import { newBranchState, scheduleBranch } from '../src/core/schedule';

describe('rangs', () => {
  it('monte de pion à dame avec les passages sans faute', () => {
    let s = undefined as ReturnType<typeof newBranchState> | undefined, t = Date.now();
    expect(lineRank(s)).toBe(0);
    s = scheduleBranch(s, 2, t); expect(lineRank(s)).toBe(1);
    s = scheduleBranch(s, 0, t); expect(lineRank(s)).toBe(2);
    s = scheduleBranch(s, 0, t); expect(lineRank(s)).toBe(3);
    for (let i = 0; i < 4; i++) s = scheduleBranch(s, 0, t);
    expect(lineRank(s)).toBe(4);
  });
  it('résume un ensemble de lignes', () => {
    const r = rankSummary(['a', 'b', 'c'], { a: { ...newBranchState(), runs: 3, clean: 2 }, b: { ...newBranchState(), runs: 1 } });
    expect(r.per).toEqual([1, 1, 0, 1, 0]); expect(r.pts).toBe(6); expect(r.max).toBe(27); expect(r.rank).toBe(1);
  });
});
