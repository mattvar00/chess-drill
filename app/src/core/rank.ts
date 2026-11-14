/**
 * Rangs d'une ligne du répertoire, par pièce : pion → cavalier → fou → tour → dame.
 * Chaque rang vaut la valeur de sa pièce, et le répertoire entier a donc une « valeur matérielle » : un chiffre qui monte.
 */
import type { BranchState, Game } from './types';

export const RANKS = [
  { key: 'p', name: 'Pion', pts: 0, how: 'Pas encore jouée' },
  { key: 'n', name: 'Cavalier', pts: 1, how: 'Jouée une fois' },
  { key: 'b', name: 'Fou', pts: 3, how: 'Un passage sans faute' },
  { key: 'r', name: 'Tour', pts: 5, how: 'Validée : deux passages sans faute de suite' },
  { key: 'q', name: 'Dame', pts: 9, how: 'Ancrée : validée et retenue au moins deux semaines' },
] as const;
export const MAX_PTS = 9;

/** Rang d'une ligne (0 pion … 4 dame) d'après sa répétition espacée. */
export function lineRank(s?: BranchState): number {
  if (!s || !s.runs) return 0;
  if (s.clean >= 3 && s.ivl >= 14) return 4;
  if (s.clean >= 2) return 3;
  if (s.clean >= 1) return 2;
  return 1;
}
/** Points, nombre de lignes par rang, et rang d'un ensemble (le rang atteint par au moins la moitié de ses lignes). */
export function rankSummary(ids: string[], st: Record<string, BranchState | undefined>) {
  const per = [0, 0, 0, 0, 0]; let pts = 0;
  for (const id of ids) { const r = lineRank(st[id]); per[r]++; pts += RANKS[r].pts; }
  let acc = 0, rank = 0; for (let r = 4; r >= 0; r--) { acc += per[r]; if (acc * 2 >= ids.length) { rank = r; break; } }
  return { pts, max: ids.length * MAX_PTS, per, rank };
}
/** Nombre de tes parties (des `days` derniers jours) passées par chaque ligne du répertoire. */
export function meetCounts(games: Game[], days = 180, now = Date.now()): Record<string, number> {
  const since = now / 1000 - days * 86400, out: Record<string, number> = {};
  for (const g of games) { if (g.t < since) continue; for (const id of g.a?.branches ?? []) out[id] = (out[id] || 0) + 1; }
  return out;
}
