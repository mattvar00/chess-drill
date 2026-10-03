/** Petite couche autour de chess.js 1.x : coups qui ne lèvent pas d'exception. */
import { Chess, type Move } from 'chess.js';
export { Chess, type Move };
export function tryMove(c: Chess, m: string | { from: string; to: string; promotion?: string }): Move | null {
  try { return c.move(m as never); } catch { return null; }
}
export const uciOf = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion || '');
export const uciToObj = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
/** Clé de position sans compteurs : les transpositions tombent sur la même clé. */
export const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
/** Stockfish 19 WASM n'aime pas une case en passant impossible : on la retire. */
export function cleanFen(fen: string): string {
  const f = fen.split(' '); if (f[3] === '-' || !f[3]) return fen;
  const file = f[3].charCodeAt(0) - 97, stm = f[1]; const rank = stm === 'w' ? 5 : 4; const row = f[0].split('/')[8 - rank];
  const cells: string[] = []; for (const ch of row) { if (/\d/.test(ch)) { for (let k = 0; k < +ch; k++) cells.push(''); } else cells.push(ch); }
  const pawn = stm === 'w' ? 'P' : 'p'; if (cells[file - 1] !== pawn && cells[file + 1] !== pawn) f[3] = '-';
  return f.join(' ');
}
