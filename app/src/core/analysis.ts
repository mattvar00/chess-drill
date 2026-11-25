/**
 * Notation d'une partie à partir des évaluations moteur de chaque position.
 * Logique pure (portée de la v1, js/engine.js) : utilisée par l'analyse de nuit (Stockfish natif)
 * comme par l'analyse ponctuelle dans le navigateur.
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from './chess';
import { winPct, classify, accuracy, type MoveClass } from './winpct';
import type { Color, EvalEntry, Game } from './types';
import { PHASE_LABEL, phaseBounds, phaseOf } from './phase';

/** Résultat brut d'une recherche (point de vue des Blancs). */
export interface RawEval { cp: number | null; mate: number | null; best: string | null; pv: string[]; alt?: { uci: string; cp: number | null; mate: number | null } | null; end?: boolean }

export interface Fault {
  id: string; game: string; fen: string; side: Color; ply: number; theme: string; phase: string; mat: number;
  opp: string; date: string; result: string; move_no: number; opening: string;
  best: { san: string; uci: string; score: string; desc: string; suite: string; reply: string | null };
  played: { san: string; uci: string; score: string; wp_before: number; wp_after: number; refut: string };
}
/** `ph` : demi-coups où commencent le milieu de partie et la finale (d'après le matériel, voir core/phase.ts). */
export interface GameStats { acc: number | null; loss: number; blunder: number; mistake: number; inacc: number; depth: number; ph?: [number | null, number | null] }
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
      if (loss >= FAULT_LOSS && before.best) { const f = buildFault(g, i, fens[i], m, before, after, wpB, wpA, moves[i - 1]);
        // la même pièce laissée en prise deux coups de suite : une seule faute (la première)
        const prev = faults[faults.length - 1];
        if (f && !(prev && prev.ply === i - 2 && prev.theme === f.theme && sameTarget(prev, f))) faults.push(f); }
    }
  });
  faults.sort((a, b) => (b.played.wp_before - b.played.wp_after) - (a.played.wp_before - a.played.wp_after));
  return {
    ev: ev.slice(0, fens.length).map(compact), cls,
    st: { acc: n ? accuracy(lossSum / n) : null, loss: n ? +(lossSum / n).toFixed(1) : 0, blunder: cnt.blunder, mistake: cnt.mistake, inacc: cnt.inacc, depth, ph: phaseBounds(fens) },
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
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
/** La pièce de `owner` sur `sq` peut être prise avec gain : attaquée et non défendue, ou attaquée par une pièce de moindre valeur. */
export function hanging(fen: string, sq: string, owner: Color): boolean {
  const c = new Chess(fen), p = c.get(sq as never) as { type: string; color: Color } | undefined;
  if (!p || p.color !== owner || p.type === 'k') return false;
  const att = c.attackers(sq as never, other(owner)); if (!att.length) return false;
  const def = c.attackers(sq as never, owner); if (!def.length) return true;
  const cheapest = Math.min(...att.map(a => VAL[(c.get(a) as { type: string }).type]));
  return cheapest < VAL[p.type];
}
/**
 * Matériel gagné par `side` le long d'une variante (au plus `max` demi-coups). Une variante qui s'arrête sur une prise
 * est coupée avant elle : la reprise qui suivrait n'est pas dans la variante.
 */
export function netGain(fen: string, ucis: string[], side: Color, max = 8): number {
  const c = new Chess(fen), start = material(fen, side); const seq: Move[] = [];
  for (const u of ucis.slice(0, max)) { const m = tryMove(c, uciToObj(u)); if (!m) break; seq.push(m); }
  while (seq.length && seq[seq.length - 1].captured && seq.length < ucis.length) seq.pop();
  const d = new Chess(fen); for (const m of seq) tryMove(d, m.san);
  return material(d.fen(), side) - start;
}
/** Case de la pièce prise (différente de la case d'arrivée pour une prise en passant). */
const takenSq = (m: Move) => (m.flags.includes('e') ? m.to[0] + m.from[1] : m.to);
const targetOf = (f: Fault) => { const t = f.played.refut.split(' ')[0]?.match(/[a-h][1-8]/g); return t ? t[t.length - 1] : null; };
const sameTarget = (a: Fault, b: Fault) => { const x = targetOf(a); return !!x && x === targetOf(b); };
const mateFor = (e: RawEval, side: Color) => (e.mate == null ? null : side === 'w' ? e.mate : -e.mate);

/**
 * Le type d'une faute, d'après ce qu'elle a coûté vraiment (le matériel perdu le long de la réfutation, au plus 8 demi-coups)
 * et ce que le meilleur coup rapportait. Le plus gros des deux l'emporte ; à égalité, la réfutation (ce qu'il fallait voir).
 */
export function faultTheme(fen: string, m: Move, before: RawEval, after: RawEval, prev?: Move | null): string {
  const side = m.color, opp = other(side);
  const afterFen = (() => { const c = new Chess(fen); tryMove(c, m.san); return c.fen(); })();
  const mAfter = mateFor(after, side), mBefore = mateFor(before, side);
  if (mAfter != null && mAfter < 0 && mAfter >= -5) return 'Mat adverse ignoré';
  if (mBefore != null && mBefore > 0 && mBefore <= 5 && (mAfter == null || mAfter <= 0)) return 'Mat raté';
  const bestLine = before.pv.length ? before.pv : before.best ? [before.best] : [];
  const bestM = (() => { const c = new Chess(fen); return bestLine[0] ? tryMove(c, uciToObj(bestLine[0])) : null; })();
  const gain = bestLine.length ? netGain(fen, bestLine, side) : 0;
  const loss = after.pv.length ? -netGain(afterFen, after.pv, side) : 0;
  const reply = (() => { const c = new Chess(afterFen); return after.pv[0] ? tryMove(c, uciToObj(after.pv[0])) : null; })();
  // une reprise : il vient de prendre, et le meilleur coup comme le tien reprennent sur la même case
  if (prev?.captured && bestM?.captured && m.captured && bestM.to === prev.to && m.to === prev.to && bestM.from !== m.from) return 'Mauvaise reprise';
  if (reply && loss >= gain && (loss >= 2 || (loss >= 1 && reply.captured === 'p'))) {
    if (reply.captured) {
      if (loss < 3 && (reply.captured === 'p' || loss < 2)) return reply.san.includes('+') ? 'Échec adverse ignoré' : 'Pion perdu';
      if (takenSq(reply) === m.to) return 'Pièce déposée en prise';
      return hanging(fen, takenSq(reply), side) ? 'Pièce en prise oubliée' : 'Pièce mise en prise';
    }
    return reply.san.includes('+') ? 'Échec adverse ignoré' : 'Menace ignorée';
  }
  if (bestM && (gain >= 2 || (gain >= 1 && (bestM.captured || bestM.san.includes('+'))))) {
    if (bestM.san.includes('+')) return 'Échec gagnant raté';
    if (bestM.captured) return bestM.captured !== 'p' && hanging(fen, takenSq(bestM), opp) ? 'Pièce à prendre' : 'Capture gagnante ratée';
    return 'Tactique ratée';
  }
  // pas de matériel en jeu à court terme : un échec qu'il fallait voir venir reste la leçon
  if (reply?.san.includes('+')) return 'Échec adverse ignoré';
  return 'Coup calme';
}

const score = (e: RawEval, side: Color) => {
  const mate = e.mate == null ? null : side === 'w' ? e.mate : -e.mate, cp = (e.cp ?? 0) * (side === 'w' ? 1 : -1);
  return mate != null ? (mate > 0 ? `mat en ${mate}` : `mat en ${-mate} contre toi`) : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
};

export function buildFault(g: Pick<Game, 'id' | 'sans' | 'opp' | 't' | 'res'>, i: number, fen: string, m: Move, before: RawEval, after: RawEval, wpB: number, wpA: number, prev?: Move | null): Fault | null {
  const best = sanLine(fen, before.pv.length ? before.pv : [before.best!]); const bestM = best.moves[0];
  if (!bestM) return null;
  const afterPlayed = new Chess(fen); tryMove(afterPlayed, m.san);
  const refut = after.pv.length ? sanLine(afterPlayed.fen(), after.pv) : { text: '', moves: [] as Move[] };
  const theme = faultTheme(fen, m, before, after, prev);
  const suiteMoves = best.text.split(' ').slice(1).join(' ');
  return {
    id: `${g.id}:${i}`, game: g.id, fen, side: m.color, ply: i, theme,
    phase: PHASE_LABEL[phaseOf(fen)], mat: material(fen, m.color),
    opp: g.opp, date: new Date(g.t * 1000).toISOString().slice(0, 10).replace(/-/g, '.'), result: g.res, move_no: Math.floor(i / 2) + 1,
    opening: g.sans.slice(0, 8).join(' '),
    best: { san: bestM.san, uci: uciOf(bestM), score: score(before, m.color), desc: describe(bestM), suite: suiteMoves, reply: best.moves[1]?.san ?? null },
    played: { san: m.san, uci: uciOf(m), score: score(after, m.color), wp_before: +wpB.toFixed(1), wp_after: +wpA.toFixed(1), refut: refut.text },
  };
}
