/**
 * Notation d'une partie à partir des évaluations moteur de chaque position.
 * Logique pure (portée de la v1, js/engine.js) : utilisée par l'analyse de nuit (Stockfish natif)
 * comme par l'analyse ponctuelle dans le navigateur.
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from './chess';
import { winPct, classify, accuracy, type MoveClass } from './winpct';
import type { Color, EvalEntry, Game } from './types';

/** Résultat brut d'une recherche (point de vue des Blancs). */
export interface RawEval { cp: number | null; mate: number | null; best: string | null; pv: string[]; alt?: { uci: string; cp: number | null; mate: number | null } | null; end?: boolean }

export interface Fault {
  id: string; game: string; fen: string; side: Color; ply: number; theme: string; phase: string; mat: number;
  opp: string; date: string; result: string; move_no: number; opening: string;
  best: { san: string; uci: string; score: string; desc: string; suite: string; reply: string | null };
  played: { san: string; uci: string; score: string; wp_before: number; wp_after: number; refut: string };
}
export interface GameStats { acc: number | null; loss: number; blunder: number; mistake: number; inacc: number; depth: number }
export interface Rated { ev: EvalEntry[]; cls: MoveClass[]; st: GameStats; faults: Fault[] }

export const FAULT_LOSS = 15;   // perte de chances (points de %) à partir de laquelle un coup devient un exercice
export const MAX_FAULTS = 4;    // par partie

/** Positions successives d'une partie (FEN avant chaque coup + position finale). */
export function replay(sans: string[]): { fens: string[]; moves: Move[] } {
  const c = new Chess(); const fens = [c.fen()], moves: Move[] = [];
  for (const s of sans) { const m = tryMove(c, s); if (!m) break; moves.push(m); fens.push(c.fen()); }
  return { fens, moves };
}

export const compact = (e: RawEval): EvalEntry => {
  const o: EvalEntry = { c: e.cp, m: e.mate, b: e.best, p: e.pv.slice(0, 4) };
  if (e.alt) { o.b2 = e.alt.uci; o.c2 = e.alt.cp; o.m2 = e.alt.mate; }
  return o;
};

export function rateGame(g: Pick<Game, 'id' | 'color' | 'sans' | 'opp' | 't' | 'res'>, ev: RawEval[], depth: number): Rated {
  const { fens, moves } = replay(g.sans);
  if (ev.length < fens.length) throw new Error(`évaluations manquantes : ${ev.length}/${fens.length}`);
  const cls: MoveClass[] = []; const cnt = { blunder: 0, mistake: 0, inacc: 0, good: 0, best: 0 };
  let lossSum = 0, n = 0; const faults: Fault[] = [];
  moves.forEach((m, i) => {
    const before = ev[i], after = ev[i + 1];
    const wb = winPct(before.cp, before.mate), wa = winPct(after.cp, after.mate);
    const wpB = m.color === 'w' ? wb : 100 - wb, wpA = m.color === 'w' ? wa : 100 - wa;
    let loss = Math.max(0, wpB - wpA); if (uciOf(m) === before.best) loss = 0;
    const k = classify(loss); cls.push(k);
    if (m.color === g.color) {
      lossSum += loss; n++; cnt[k]++;
      if (loss >= FAULT_LOSS && before.best) { const f = buildFault(g, i, fens[i], m, before, after, wpB, wpA); if (f) faults.push(f); }
    }
  });
  faults.sort((a, b) => (b.played.wp_before - b.played.wp_after) - (a.played.wp_before - a.played.wp_after));
  return {
    ev: ev.slice(0, fens.length).map(compact), cls,
    st: { acc: n ? accuracy(lossSum / n) : null, loss: n ? +(lossSum / n).toFixed(1) : 0, blunder: cnt.blunder, mistake: cnt.mistake, inacc: cnt.inacc, depth },
    faults: faults.slice(0, MAX_FAULTS),
  };
}

/* ---------- construction d'un exercice à partir d'une faute ---------- */
const PIECE_FR: Record<string, string> = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };

function sanLine(fen: string, ucis: string[]): { text: string; moves: Move[] } {
  const c = new Chess(fen); const moves: Move[] = [];
  for (const u of ucis) { const m = tryMove(c, uciToObj(u)); if (!m) break; moves.push(m); }
  let n = parseInt(fen.split(' ')[5]) || 1; let w = fen.split(' ')[1] === 'w'; const out: string[] = [];
  moves.forEach((m, i) => { out.push(w ? `${n}.${m.san}` : (i === 0 ? `${n}...` : '') + m.san); if (!w) n++; w = !w; });
  return { text: out.join(' '), moves };
}
function describe(m: Move): string {
  const p = PIECE_FR[m.piece]; const art = p === 'dame' || p === 'tour' ? 'La ' : 'Le ';
  let s = art + p + (m.captured ? ` prend ${'nbrq'.includes(m.captured) ? 'un' + (m.captured === 'q' || m.captured === 'r' ? 'e' : '') + ' ' + PIECE_FR[m.captured] : 'un pion'} en ${m.to}` : ` va en ${m.to}`);
  return s + (m.san.includes('#') ? ' : mat.' : m.san.includes('+') ? ' avec échec.' : '.');
}
function material(fen: string, side: Color): number {
  const v: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }; let s = 0;
  for (const ch of fen.split(' ')[0]) { const l = ch.toLowerCase(); if (v[l]) s += (ch === ch.toUpperCase() ? 1 : -1) * v[l]; }
  return side === 'w' ? s : -s;
}
function attacked(fen: string, sq: string, by: Color): boolean {
  const f = fen.split(' '); f[1] = by; f[3] = '-';
  try { return new Chess(f.join(' ')).moves({ verbose: true }).some(mv => mv.to === sq && mv.flags.includes('c')); } catch { return false; }
}
const score = (e: RawEval, side: Color) => {
  const mate = e.mate == null ? null : side === 'w' ? e.mate : -e.mate, cp = (e.cp ?? 0) * (side === 'w' ? 1 : -1);
  return mate != null ? (mate > 0 ? `mat en ${mate}` : `mat en ${-mate} contre toi`) : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
};

function buildFault(g: Pick<Game, 'id' | 'sans' | 'opp' | 't' | 'res'>, i: number, fen: string, m: Move, before: RawEval, after: RawEval, wpB: number, wpA: number): Fault | null {
  const best = sanLine(fen, before.pv.length ? before.pv : [before.best!]); const bestM = best.moves[0];
  if (!bestM) return null;
  const afterPlayed = new Chess(fen); tryMove(afterPlayed, m.san);
  const refut = after.pv.length ? sanLine(afterPlayed.fen(), after.pv) : { text: '', moves: [] as Move[] };
  const reply = refut.moves[0];
  let theme = 'Coup calme';
  if (bestM.san.includes('+') && bestM.captured) theme = 'Capture gagnante ratée';
  else if (bestM.san.includes('+') || bestM.san.includes('#')) theme = 'Échec gagnant raté';
  else if (bestM.captured && 'nbrq'.includes(bestM.captured)) theme = 'Pièce à prendre';
  else if (bestM.captured) theme = 'Capture gagnante ratée';
  if (reply) {
    if (reply.captured) theme = reply.to === m.to ? 'Pièce déposée en prise' : attacked(fen, reply.to, m.color === 'w' ? 'b' : 'w') ? 'Pièce en prise oubliée' : 'Pièce mise en prise';
    else if ((reply.san.includes('+') || reply.san.includes('#')) && theme === 'Coup calme') theme = 'Échec adverse ignoré';
  }
  const nPieces = fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length;
  const suiteMoves = best.text.split(' ').slice(1).join(' ');
  return {
    id: `${g.id}:${i}`, game: g.id, fen, side: m.color, ply: i, theme,
    phase: i < 20 ? 'ouverture' : nPieces <= 6 ? 'finale' : 'milieu de partie', mat: material(fen, m.color),
    opp: g.opp, date: new Date(g.t * 1000).toISOString().slice(0, 10).replace(/-/g, '.'), result: g.res, move_no: Math.floor(i / 2) + 1,
    opening: g.sans.slice(0, 8).join(' '),
    best: { san: bestM.san, uci: uciOf(bestM), score: score(before, m.color), desc: describe(bestM), suite: suiteMoves, reply: best.moves[1]?.san ?? null },
    played: { san: m.san, uci: uciOf(m), score: score(after, m.color), wp_before: +wpB.toFixed(1), wp_after: +wpA.toFixed(1), refut: refut.text },
  };
}
