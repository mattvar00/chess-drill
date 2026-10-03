/** Structures de pions : détection sur une position, et bibliothèque de plans. */
import data from '../data/structures.json';
import { Chess, tryMove } from './chess';
export interface Structure { id: string; name: string; fam: string; anim: string[]; key: string; w: string[]; b: string[] }
export const STRUCTS = data as Structure[];
export const STRUCT: Record<string, Structure> = Object.fromEntries(STRUCTS.map(s => [s.id, s]));

interface Pawn { f: number; r: number }
function pawns(fen: string): { w: Pawn[]; b: Pawn[] } {
  const P = { w: [] as Pawn[], b: [] as Pawn[] };
  fen.split(' ')[0].split('/').forEach((row, ri) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { if (ch === 'P') P.w.push({ f, r: 8 - ri }); if (ch === 'p') P.b.push({ f, r: 8 - ri }); f++; } } });
  return P;
}
export function detectStructure(fen: string): string | null {
  const { w: W, b: B } = pawns(fen); const on = (a: Pawn[], f: number) => a.some(p => p.f === f), at = (a: Pawn[], f: number, r: number) => a.some(p => p.f === f && p.r === r);
  const C = 2, D = 3, E = 4, F = 5;
  if (on(W, D) && !on(W, C) && !on(W, E) && (at(W, D, 4) || at(W, D, 5))) return 'iqp_w';
  if (on(B, D) && !on(B, C) && !on(B, E) && (at(B, D, 5) || at(B, D, 4))) return 'iqp_b';
  if (at(W, C, 4) && at(W, D, 4) && !on(W, 1) && !on(W, E)) return 'hang_w';
  if (at(B, C, 5) && at(B, D, 5) && !on(B, 1) && !on(B, E)) return 'hang_b';
  if (at(W, D, 4) && at(B, D, 5) && !on(W, C) && on(B, C) && !on(B, E) && on(W, E)) return 'carlsbad';
  if (at(W, D, 4) && at(B, D, 5) && !on(B, C) && on(W, C) && !on(W, E) && on(B, E)) return 'carlsbad_rev';
  if (at(B, D, 5) && at(B, E, 6) && at(B, F, 5)) return 'stonewall_b';
  if (at(W, E, 5) && at(W, D, 4) && at(B, E, 6) && at(B, D, 5)) return 'french';
  if (at(B, D, 5) && at(B, C, 6) && at(B, E, 6) && on(W, D)) return 'triangle';
  if (at(W, E, 4) && !on(W, D) && !on(B, C) && at(B, D, 6) && at(B, E, 5)) return 'svesh';
  if (at(W, C, 4) && at(W, E, 4) && !on(W, D) && !on(B, C)) return 'maroczy';
  if (at(W, E, 4) && !on(W, D) && !on(B, C) && (on(B, D) || at(B, E, 6))) return 'sicil';
  if (at(W, D, 5) && at(W, E, 4) && at(B, C, 5) && at(B, D, 6) && !on(B, E)) return 'benoni';
  if (at(W, D, 5) && at(B, D, 6) && at(B, E, 5)) return 'kid';
  if (!on(W, D) && !on(W, E) && !on(B, D) && !on(B, E)) return 'open';
  return null;
}
/** Structure d'une partie : position au 12ᵉ coup (24 demi-coups), si la partie est assez longue. */
export function gameStructure(sans: string[]): { id: string; ply: number; fen: string } | null {
  if (sans.length < 20) return null; const c = new Chess(); const n = Math.min(24, sans.length);
  for (let i = 0; i < n; i++) if (!tryMove(c, sans[i])) return null;
  const id = detectStructure(c.fen()); return id ? { id, ply: n, fen: c.fen() } : null;
}
