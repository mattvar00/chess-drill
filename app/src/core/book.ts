/** Répertoire → livre d'ouvertures indexé par position, et détection des déviations dans une partie. */
import { Chess, tryMove, uciOf, uciToObj, fenKey } from './chess';
import type { Repertoire, Color, BookResult, Branch, System, Bloc } from './types';

interface BookEntry { user: Set<string>; opp: Set<string>; branches: Set<string>; ply: number; end?: boolean }
export type Book = Record<Color, Record<string, BookEntry>>;
export interface BranchRef { br: Branch; sys: System; bloc: Bloc }
export const MAX_BOOK_PLY = 40;

export function indexBranches(rep: Repertoire): Record<string, BranchRef> {
  const out: Record<string, BranchRef> = {};
  for (const bloc of rep.blocs) for (const sys of bloc.systemes) for (const br of sys.branches) out[br.id] = { br, sys, bloc };
  return out;
}
export function buildBook(rep: Repertoire): Book {
  const book: Book = { w: {}, b: {} };
  for (const bloc of rep.blocs) for (const sys of bloc.systemes) for (const br of sys.branches) {
    const side = bloc.side, map = book[side]; const g = new Chess();
    br.moves.forEach((mv, i) => {
      const k = fenKey(g.fen()); const e = map[k] || (map[k] = { user: new Set(), opp: new Set(), branches: new Set(), ply: i });
      const userToMove = (i % 2 === 0) === (side === 'w'); (userToMove ? e.user : e.opp).add(mv.uci); e.branches.add(br.id);
      tryMove(g, uciToObj(mv.uci));
    });
    const k = fenKey(g.fen()); const e = map[k] || (map[k] = { user: new Set(), opp: new Set(), branches: new Set(), ply: br.moves.length });
    e.branches.add(br.id); e.end = true;
  }
  return book;
}
/**
 * Compare une partie au livre. Une sortie suivie d'un retour dans le livre en ≤ 3 demi-coups est une transposition, pas une déviation.
 * « soft » = la déviation porte sur une ligne non jouée (à apprendre / alternative) : pas d'alerte.
 */
export function analyseGame(book: Book, branches: Record<string, BranchRef>, sans: string[], color: Color): BookResult {
  const map = book[color]; const g = new Chess(); let depth = 0, transpo = 0; let last: string[] | null = null;
  for (let i = 0; i < sans.length && i < MAX_BOOK_PLY; i++) {
    const e = map[fenKey(g.fen())];
    if (!e) return { status: depth ? 'out' : 'nobook', depth, branches: last, transpo };
    if (e.end && !e.user.size && !e.opp.size) return { status: 'ok', depth, branches: [...e.branches], transpo };
    const m = tryMove(g, sans[i]); if (!m) return { status: 'err', depth, transpo };
    const uci = uciOf(m); const userMove = (i % 2 === 0) === (color === 'w'); const set = userMove ? e.user : e.opp;
    if (!set.size) return { status: 'ok', depth, branches: [...e.branches], transpo };
    if (set.has(uci)) { depth = i + 1; last = [...e.branches]; continue; }
    let back = -1; const t = new Chess(g.fen());
    for (let j = 1; j <= 3 && i + j < sans.length; j++) { if (map[fenKey(t.fen())]) { back = j; break; } if (!tryMove(t, sans[i + j])) break; }
    if (back === -1 && map[fenKey(t.fen())]) back = Math.min(3, sans.length - i - 1);
    if (back >= 1) { for (let j = 1; j < back; j++) tryMove(g, sans[i + j]); i += back - 1; depth = i + 1; transpo++; const e2 = map[fenKey(g.fen())]; if (e2) last = [...e2.branches]; continue; }
    g.undo(); const fen = g.fen();
    const expected = [...set].map(u => { const mm = tryMove(g, uciToObj(u)); const san = mm ? mm.san : u; if (mm) g.undo(); return { uci: u, san }; });
    const brs = [...e.branches]; const soft = !brs.some(b => branches[b] && branches[b].sys.statut === 'joué');
    return { status: userMove ? 'dev' : 'gap', ply: i, depth, fen, played: m.san, playedUci: uci, expected, branches: brs, soft, transpo };
  }
  return { status: 'ok', depth, branches: last, transpo };
}
