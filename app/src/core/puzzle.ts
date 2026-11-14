/**
 * Jusqu'où jouer la solution d'un problème.
 * On suit la meilleure suite du moteur tant qu'elle n'a pas « encaissé » : le problème s'arrête sur ton coup
 * qui donne le mat, ou qui laisse un gain de matériel que la réponse adverse ne reprend pas. Sans gain net
 * (coup calme, pièce à sauver), un seul coup suffit. Au plus trois de tes coups.
 */
import { Chess, tryMove } from './chess';
import type { Color } from './types';

const V: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
/** Matériel de `side` moins celui de l'adversaire. */
export function balance(fen: string, side: Color): number {
  let s = 0; for (const ch of fen.split(' ')[0]) { const l = ch.toLowerCase(); if (V[l]) s += (ch === ch.toUpperCase() ? 1 : -1) * V[l]; }
  return side === 'w' ? s : -s;
}

export interface PuzzleLine {
  /** Les coups à jouer, en notation, en alternance : toi, l'adversaire, toi… Toujours un nombre impair. */
  sans: string[];
  /** Matériel gagné à la fin de la ligne (après la réponse adverse s'il y en a une). */
  gain: number;
  mate: boolean;
}

export function puzzleLine(fen: string, side: Color, line: string[], maxMine = 3): PuzzleLine {
  const g = new Chess(fen), b0 = balance(fen, side), ok: string[] = [], bal: number[] = [];
  for (const san of line.slice(0, maxMine * 2)) { const m = tryMove(g, san); if (!m) break; ok.push(m.san); bal.push(balance(g.fen(), side) - b0); if (g.isCheckmate()) break; }
  if (!ok.length) return { sans: line.slice(0, 1), gain: 0, mate: false };
  for (let k = 0; k < ok.length; k += 2) {
    if (ok[k].includes('#')) return { sans: ok.slice(0, k + 1), gain: bal[k], mate: true };
    // gain gardé après la réponse adverse (s'il n'y en a pas dans la ligne, on prend le gain tel quel)
    const kept = k + 1 < ok.length ? Math.min(bal[k], bal[k + 1]) : bal[k];
    if (kept >= 2) return { sans: ok.slice(0, k + 1), gain: kept, mate: false };
  }
  // pas de gain net en vue : le premier coup suffit
  return { sans: ok.slice(0, 1), gain: Math.min(bal[0], bal[1] ?? bal[0]), mate: false };
}
