/** Probabilités de gain, classement des coups et précision (formules Lichess). */
export function winPct(cp: number | null, mate: number | null): number {
  if (mate !== null && mate !== undefined) return mate > 0 ? 100 : 0;
  const c = Math.max(-1500, Math.min(1500, cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}
/** Chances de celui qui joue le coup, avant/après. */
export function moverPct(mover: 'w' | 'b', cp: number | null, mate: number | null): number {
  const w = winPct(cp, mate); return mover === 'w' ? w : 100 - w;
}
export type MoveClass = 'best' | 'good' | 'inacc' | 'mistake' | 'blunder';
export function classify(loss: number): MoveClass {
  return loss < 2 ? 'best' : loss < 5 ? 'good' : loss < 10 ? 'inacc' : loss < 20 ? 'mistake' : 'blunder';
}
/** Précision Lichess à partir de la perte moyenne de chances. */
export function accuracy(avgLoss: number): number {
  return Math.round(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avgLoss) - 3.1669)));
}
