/** Parties chess.com (API publique) → format interne. Partagé par l'app et par l'analyse de nuit. */
import type { Game, Result, Color } from './types';
import { parsePgnMoves } from './pgn';
import { analyseGame, type Book, type BranchRef } from './book';

/** Une partie telle que renvoyée par https://api.chess.com/pub/player/<user>/games/<yyyy>/<mm>. */
export interface ChessComGame {
  url: string; pgn?: string; end_time: number; time_class: string; time_control?: string; rules?: string; eco?: string;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

const DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
export const gameId = (g: Pick<ChessComGame, 'url' | 'end_time'>) => (g.url || '').split('/').pop() || String(g.end_time);
export const resultOf = (r: string): Result => r === 'win' ? 'W' : DRAWS.includes(r) ? 'D' : 'L';

/** Normalise une partie du point de vue de `user`. Renvoie null si ce n'est pas une partie d'échecs standard de ce joueur. */
export function toGame(g: ChessComGame, user: string, book?: Book, branches?: Record<string, BranchRef>): Game | null {
  if (g.rules && g.rules !== 'chess') return null;
  const u = user.toLowerCase(); const isW = (g.white.username || '').toLowerCase() === u;
  if (!isW && (g.black.username || '').toLowerCase() !== u) return null;
  const color: Color = isW ? 'w' : 'b'; const me = isW ? g.white : g.black, opp = isW ? g.black : g.white;
  const { sans, clocks } = parsePgnMoves(g.pgn || '');
  return {
    id: gameId(g), url: g.url, t: g.end_time, tc: g.time_class, tcs: g.time_control || '', rr: me.result, color,
    opp: opp.username, oppElo: opp.rating, myElo: me.rating, res: resultOf(me.result), eco: g.eco ? g.eco.split('/').pop()! : '',
    sans, clocks, nply: sans.length,
    a: book && branches ? analyseGame(book, branches, sans, color) : { status: 'nobook', depth: 0 },
  };
}

/** Mois d'archive (« 2026/11 ») postérieurs ou égaux à une date (secondes epoch). */
export function monthsSince(archives: string[], since: number): string[] {
  const d = new Date(since * 1000); const from = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
  return archives.filter(a => { const m = /(\d{4})\/(\d{2})$/.exec(a); return m && +m[1] * 100 + +m[2] >= from; });
}
