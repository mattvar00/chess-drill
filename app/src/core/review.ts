/**
 * Revue de partie (portée de la v1, js/review.js) : classe de chaque coup, précision, moments clés
 * et commentaire en français, à partir des évaluations moteur de chaque position.
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from './chess';
import { plyTimes } from './clock';
import { winPct } from './winpct';
import type { Color, EvalEntry, Game } from './types';

export type ReviewClass = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inacc' | 'mistake' | 'miss' | 'blunder' | 'forced';
/** Nom et signe de chaque classe. */
export const CLASS: Record<ReviewClass, [string, string]> = {
  brilliant: ['Brillant', '!!'], great: ['Très fort', '!'], best: ['Meilleur coup', '★'], excellent: ['Excellent', '✓'], good: ['Bon', '✓'],
  book: ['Théorie', '='], inacc: ['Imprécision', '?!'], mistake: ['Erreur', '?'], miss: ['Occasion manquée', '✕'], blunder: ['Gaffe', '??'], forced: ['Forcé', '□'],
};
/** Classes qui méritent d'être signalées sur le plateau et dans la liste des coups. */
export const NOTABLE: ReviewClass[] = ['brilliant', 'great', 'inacc', 'mistake', 'miss', 'blunder'];

const V: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
const fem = (t: string) => t === 'r' || t === 'q';
const le = (t: string) => (fem(t) ? 'la ' : 'le ') + NAME[t];
const Le = (t: string) => (fem(t) ? 'La ' : 'Le ') + NAME[t];
const e = (t: string) => (fem(t) ? 'e' : '');
export function matPhrase(n: number): string {
  n = Math.round(n); if (n <= 0) return '';
  return n === 1 ? 'un pion' : n === 2 ? 'deux pions' : n === 3 ? 'une pièce' : n === 4 ? 'une pièce et un pion' : n === 5 ? 'une tour' : n >= 9 ? 'la dame ou plus' : `${n} points de matériel`;
}

/* ---------- géométrie : cases attaquées (sans tenir compte des clouages) ---------- */
interface P { c: Color; t: string }
type B = Record<string, P>;
function boardOf(fen: string): B {
  const out: B = {}; fen.split(' ')[0].split('/').forEach((row, ri) => { let f = 0;
    for (const ch of row) { if (/\d/.test(ch)) { f += +ch; continue; } out['abcdefgh'[f] + (8 - ri)] = { c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() }; f++; } });
  return out;
}
const xy = (s: string): [number, number] => [s.charCodeAt(0) - 97, +s[1] - 1];
const sqAt = (x: number, y: number) => (x < 0 || x > 7 || y < 0 || y > 7 ? null : 'abcdefgh'[x] + (y + 1));
function attacks(b: B, sq: string): string[] {
  const p = b[sq]; if (!p) return []; const [x, y] = xy(sq); const out: string[] = [];
  const ray = (dx: number, dy: number) => { for (let i = 1; ; i++) { const s = sqAt(x + dx * i, y + dy * i); if (!s) break; out.push(s); if (b[s]) break; } };
  const add = (s: string | null) => { if (s) out.push(s); };
  if (p.t === 'p') { const d = p.c === 'w' ? 1 : -1; add(sqAt(x - 1, y + d)); add(sqAt(x + 1, y + d)); }
  else if (p.t === 'n') for (const [a, c] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(sqAt(x + a, y + c));
  else if (p.t === 'k') { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (a || c) add(sqAt(x + a, y + c)); }
  else { if (p.t !== 'r') for (const [a, c] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(a, c); if (p.t !== 'b') for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(a, c); }
  return out;
}
const attackers = (b: B, sq: string, c: Color) => Object.keys(b).filter(s => b[s].c === c && attacks(b, s).includes(sq));
function balance(b: B, c: Color) { let s = 0; for (const k in b) s += (b[k].c === c ? 1 : -1) * V[b[k].t]; return s; }
function hanging(b: B, sq: string) {
  const p = b[sq]; if (!p || p.t === 'k') return false; const at = attackers(b, sq, p.c === 'w' ? 'b' : 'w'); if (!at.length) return false;
  return !attackers(b, sq, p.c).length || at.some(a => V[b[a].t] < V[p.t]);
}
/** Clouage : une pièce à longue portée vise une pièce adverse derrière laquelle se trouve une pièce plus forte. */
function pin(b: B, sq: string): { pinned: string; behind: string } | null {
  const p = b[sq]; if (!p || !'brq'.includes(p.t)) return null; const [x, y] = xy(sq); const dirs: number[][] = [];
  if (p.t !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]); if (p.t !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  for (const [dx, dy] of dirs) { let first: string | null = null;
    for (let i = 1; ; i++) { const s = sqAt(x + dx * i, y + dy * i); if (!s) break; if (!b[s]) continue;
      if (!first) { if (b[s].c === p.c) break; first = s; continue; }
      if (b[s].c !== p.c && b[first].t !== 'k' && (b[s].t === 'k' || (V[b[s].t] > V[b[first].t] && V[b[first].t] >= 3))) return { pinned: first, behind: s };
      break; } }
  return null;
}
function passed(b: B, sq: string) {
  const p = b[sq]; if (!p || p.t !== 'p') return false; const [x, y] = xy(sq); const d = p.c === 'w' ? 1 : -1;
  for (let yy = y + d; yy >= 0 && yy <= 7; yy += d) for (let xx = x - 1; xx <= x + 1; xx++) { const s = sqAt(xx, yy); if (s && b[s]?.t === 'p' && b[s].c !== p.c) return false; }
  return true;
}

/** Ce que fait un coup : une phrase, puis les intentions (menace, fourchette, clouage, développement…). */
export function whatMove(fenBefore: string, m: Move, mine = true): { d: string; bits: string[]; hang: boolean } {
  const B0 = boardOf(fenBefore), c = new Chess(fenBefore); tryMove(c, m.san); const B1 = boardOf(c.fen()); const me = m.color, opp: Color = me === 'w' ? 'b' : 'w'; const bits: string[] = [];
  let d: string;
  if (m.flags.includes('k') || m.flags.includes('q')) d = `Roque ${m.flags.includes('k') ? 'côté roi' : 'côté dame'} : le roi se met à l'abri et la tour entre en jeu`;
  else if (m.captured) d = `${Le(m.piece)} prend ${le(m.captured)} en ${m.to}`;
  else if (m.promotion) d = `Le pion va à dame en ${m.to}`;
  else d = `${Le(m.piece)} va en ${m.to}`;
  if (m.san.includes('#')) return { d, bits: ['échec et mat'], hang: false };
  if (m.san.includes('+')) bits.push('avec échec');
  const undef = (s: string) => !attackers(B1, s, opp).length;
  const tg = attacks(B1, m.to).filter(s => B1[s]?.c === opp && B1[s].t !== 'k');
  const big = tg.filter(s => (V[B1[s].t] > V[m.piece] && V[B1[s].t] >= 3) || (undef(s) && (V[B1[s].t] >= 3 || !'qk'.includes(m.piece))));
  const rank = (s: string) => (B1[s].t === 'k' ? 99 : V[B1[s].t]);
  const valuable = attacks(B1, m.to).filter(s => B1[s]?.c === opp && (B1[s].t === 'k' || (V[B1[s].t] >= 3 && (V[B1[s].t] > V[m.piece] || undef(s))))).sort((a, b) => rank(b) - rank(a)).slice(0, 2);
  if (valuable.length >= 2 && m.piece !== 'k') bits.push(`fourchette sur ${valuable.map(s => (B1[s].t === 'k' ? 'le roi' : le(B1[s].t))).join(' et ')}`);
  else if (big.length) bits.push(`attaque ${le(B1[big[0]].t)} en ${big[0]}${undef(big[0]) ? `, qui n'est pas défendu${e(B1[big[0]].t)}` : ''}`);
  const pn = pin(B1, m.to); if (pn) bits.push(`cloue ${le(B1[pn.pinned].t)} en ${pn.pinned} devant ${B1[pn.behind].t === 'k' ? 'le roi' : le(B1[pn.behind].t)}`);
  const ply = (parseInt(fenBefore.split(' ')[5]) - 1) * 2 + (me === 'b' ? 1 : 0);
  if (ply < 24 && 'nb'.includes(m.piece) && (m.from[1] === '1' || m.from[1] === '8') && !m.captured) bits.push(`développe ${le(m.piece)}`);
  if (m.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(m.to) && ply < 24) bits.push("prend de l'espace au centre");
  if (m.piece === 'p' && passed(B1, m.to) && !passed(B0, m.from)) bits.push('crée un pion passé');
  if (m.piece === 'r') { const f = m.to[0]; const own = Object.keys(B1).some(s => s[0] === f && B1[s].t === 'p' && B1[s].c === me), any = Object.keys(B1).some(s => s[0] === f && B1[s].t === 'p');
    if (!any) bits.push('occupe la colonne ouverte'); else if (!own) bits.push('occupe une colonne semi-ouverte'); }
  if (m.piece === 'p' && !m.captured) { const k = Object.keys(B0).find(s => B0[s].t === 'k' && B0[s].c === me);
    const front = k && (me === 'w' ? k[1] === '1' : k[1] === '8') && (('fgh'.includes(k[0]) && 'fgh'.includes(m.from[0])) || ('abc'.includes(k[0]) && 'abc'.includes(m.from[0])));
    if (front) bits.push(mine ? 'avance un pion devant ton roi' : 'avance un pion devant son roi'); }
  return { d, bits, hang: hanging(B1, m.to) };
}
function pvSan(fen: string, pv: string[], n = 4): string[] {
  const c = new Chess(fen); const out: string[] = []; for (const u of pv.filter(Boolean).slice(0, n)) { const m = tryMove(c, uciToObj(u)); if (!m) break; out.push(m.san); } return out;
}
function lineMat(fen: string, pv: string[], c: Color, n = 4) {
  const t = new Chess(fen); const b0 = balance(boardOf(fen), c); for (const u of pv.filter(Boolean).slice(0, n)) if (!tryMove(t, uciToObj(u))) break;
  return balance(boardOf(t.fen()), c) - b0;
}
const pvOf = (x: EvalEntry) => (x.p?.length ? x.p : [x.b].filter((u): u is string => !!u));

export interface MoveReview { i: number; m: Move; me: Color; wb: number; wa: number; loss: number; k: ReviewClass; t: number | null; only: boolean }
export interface Review {
  F: string[]; M: Move[]; R: MoveReview[]; wpW: number[];
  acc: Record<Color, number | null>; phAcc: Record<'o' | 'm' | 'e', number | null>; key: MoveReview[]; counts: Partial<Record<ReviewClass, number>>;
}
const accOf = (avg: number) => Math.round(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avg) - 3.1669)));

export function reviewGame(g: Pick<Game, 'sans' | 'color' | 'clocks' | 'tcs' | 'a'> & { ev: EvalEntry[] }): Review {
  const c = new Chess(); const F = [c.fen()], M: Move[] = []; for (const s of g.sans) { const m = tryMove(c, s); if (!m) break; M.push(m); F.push(c.fen()); }
  const ev = g.ev, n = Math.min(M.length, ev.length - 1), book = g.a?.depth || 0, times = plyTimes(g.clocks || [], g.tcs || '', n);
  const wpW = ev.slice(0, n + 1).map(x => winPct(x.c, x.m)); const R: MoveReview[] = [];
  for (let i = 0; i < n; i++) {
    const m = M[i], me = m.color, wb = me === 'w' ? wpW[i] : 100 - wpW[i], wa = me === 'w' ? wpW[i + 1] : 100 - wpW[i + 1];
    const uci = uciOf(m), isBest = uci === ev[i].b; const loss = isBest ? 0 : Math.max(0, wb - wa);
    let k: ReviewClass = new Chess(F[i]).moves().length === 1 ? 'forced' : i < book ? 'book' : loss < 0.5 && isBest ? 'best' : loss < 2 ? 'excellent' : loss < 5 ? 'good' : loss < 10 ? 'inacc' : loss < 20 ? 'mistake' : 'blunder';
    // une erreur qui laisse encore gagnant est moins grave
    if (k === 'blunder' && wa >= 60) k = wa >= 70 ? 'inacc' : 'mistake'; else if (k === 'mistake' && wa >= 70) k = 'inacc';
    const prevOppBlunder = i > 0 && R[i - 1]?.loss >= 20;
    if (prevOppBlunder && loss >= 10 && k !== 'blunder') k = 'miss'; else if (prevOppBlunder && loss >= 20) k = 'blunder';
    let only = false;
    if (ev[i].b2 && isBest) { const w2 = winPct(ev[i].c2 ?? null, ev[i].m2 ?? null); only = wb - (me === 'w' ? w2 : 100 - w2) >= 15; }
    if ((k === 'best' || k === 'excellent') && i >= book) {
      // sacrifice : après le coup et la meilleure réponse, du matériel est perdu et c'est la pièce jouée qui est prise
      const rep = pvOf(ev[i + 1])[0]; const ml = rep ? lineMat(F[i], [uci, rep], me, 2) : 0;
      if (ml <= -2 && rep?.slice(2, 4) === m.to && wa >= 45 && wb < 92) k = 'brilliant'; else if (isBest && only && wb < 97) k = 'great';
    }
    R.push({ i, m, me, wb, wa, loss, k, t: times[i], only });
  }
  const acc = (col: Color) => { const L = R.filter(r => r.me === col && r.k !== 'book' && r.k !== 'forced'); return L.length ? accOf(L.reduce((s, r) => s + r.loss, 0) / L.length) : null; };
  const pieces = (f: string) => f.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length;
  const phase = (i: number) => (i < 20 ? 'o' : pieces(F[i]) <= 6 ? 'e' : 'm');
  const phAcc = { o: null, m: null, e: null } as Review['phAcc'];
  for (const p of ['o', 'm', 'e'] as const) { const L = R.filter(r => r.me === g.color && phase(r.i) === p && r.k !== 'book'); phAcc[p] = L.length ? accOf(L.reduce((s, r) => s + r.loss, 0) / L.length) : null; }
  const weight = (r: MoveReview) => (r.k === 'brilliant' ? 30 : r.loss);
  const key = R.filter(r => r.loss >= 10 || r.k === 'brilliant').sort((a, b) => weight(b) - weight(a)).slice(0, 4).sort((a, b) => a.i - b.i);
  const counts: Review['counts'] = {}; for (const r of R) if (r.me === g.color) counts[r.k] = (counts[r.k] || 0) + 1;
  return { F, M, R, wpW, acc: { w: acc('w'), b: acc('b') }, phAcc, key, counts };
}

/** Commentaire d'un coup, en français, du point de vue du joueur (« tu ») ou de son adversaire. */
export function commentMove(g: Pick<Game, 'color'> & { ev: EvalEntry[] }, A: Review, r: MoveReview): string {
  const ev = g.ev, i = r.i, mine = r.me === g.color, your = mine ? 'Tes' : 'Ses';
  const W = whatMove(A.F[i], r.m, mine); const out: string[] = [];
  out.push(W.d + (W.bits.length ? ', ' + W.bits.slice(0, 2).join(', ') : '') + '.');
  if (r.k === 'book') return out.concat('Coup de théorie.').join(' ');
  if (r.k === 'forced') return out.concat('Le seul coup légal.').join(' ');
  if (r.k === 'brilliant') out.push('Un sacrifice juste : le matériel donné revient avec intérêt.');
  if (r.k === 'great') out.push("C'était le seul bon coup : tous les autres perdaient nettement.");
  const loses = (n: number) => `${mine ? 'tu perds' : 'il perd'} ${matPhrase(n)}`;
  if (r.loss >= 10) {
    out.push(`${your} chances passent de ${Math.round(r.wb)} % à ${Math.round(r.wa)} %.`);
    const after = ev[i + 1], pv = pvOf(after), rep = pvSan(A.F[i + 1], pv, 4);
    if (after.m != null && ((r.me === 'w' && after.m < 0) || (r.me === 'b' && after.m > 0))) out.push(`Après ce coup, ${rep[0]} mène au mat en ${Math.abs(after.m)} (${rep.join(' ')}).`);
    else if (rep.length) {
      const t = new Chess(A.F[i + 1]); const rm = tryMove(t, rep[0]); const lost = -lineMat(A.F[i + 1], pv, r.me, 4);
      if (W.hang && rm && rm.to === r.m.to) out.push(`${Le(r.m.piece)} que ${mine ? 'tu viens' : "l'adversaire vient"} de jouer n'est pas assez défendu${e(r.m.piece)} : ${rep[0]} ${fem(r.m.piece) ? 'la' : 'le'} prend${lost >= 2 ? ', ' + loses(lost) : ''}.`);
      else if (rm?.captured) out.push(`Réponse : ${rep[0]}, qui prend ${le(rm.captured)} en ${rm.to}${lost >= 2 ? ' : ' + loses(lost) : ''}.`);
      else if (rm?.san.includes('+')) out.push(`Réponse : l'échec ${rep[0]}${lost >= 2 ? ', et ' + loses(lost) : ''} (${rep.join(' ')}).`);
      else if (lost >= 2) out.push(`Après ${rep.join(' ')}, ${loses(lost)}.`);
      else { const Wr = rm ? whatMove(A.F[i + 1], rm, !mine) : null; out.push(`Réponse : ${rep[0]}${Wr?.bits.length ? ` (${Wr.bits[0]})` : ''}, et la position bascule.`); }
    }
    if (r.k === 'miss') out.push(mine ? "L'adversaire venait de faire une erreur : il fallait la punir." : "Il n'a pas puni ton erreur précédente.");
  }
  if (r.loss >= 5 && ev[i].b) {
    const bm = tryMove(new Chess(A.F[i]), uciToObj(ev[i].b!));
    if (bm) { const Wb = whatMove(A.F[i], bm, mine), pv = pvOf(ev[i]), gain = lineMat(A.F[i], pv, r.me, 4), pvs = pvSan(A.F[i], pv, 4);
      const mate = ev[i].m != null && ((r.me === 'w' && ev[i].m! > 0) || (r.me === 'b' && ev[i].m! < 0));
      const why: string[] = []; if (bm.captured) why.push(`prend ${le(bm.captured)} en ${bm.to}`);
      Wb.bits.filter(x => !x.startsWith('développe') || !why.length).slice(0, 2).forEach(x => why.push(x));
      if (mate) why.push(`mat en ${Math.abs(ev[i].m!)}`); else if (gain >= 2) why.push(`gagne ${matPhrase(gain)}`);
      out.push(`Il fallait ${bm.san}${why.length ? ' : ' + why.join(', ') : ''}${pvs.length > 1 ? ` (${pvs.join(' ')})` : ''}.`); }
  } else if (r.k === 'best' && !W.bits.length && mine) out.push("C'est le coup du moteur.");
  if (mine && r.t != null && r.loss >= 10 && r.t < 4) out.push(`Joué en ${Math.round(r.t)} s.`);
  return out.join(' ');
}

/** Évaluation affichable (point de vue des Blancs) : « +1.2 » ou « M3 ». */
export const evalText = (x?: EvalEntry) => (!x ? '' : x.m != null ? `M${Math.abs(x.m)}` : `${(x.c ?? 0) >= 0 ? '+' : ''}${((x.c ?? 0) / 100).toFixed(1)}`);

/* ---------- nom d'ouverture lisible, depuis l'adresse ECO de chess.com ---------- */
const ECO_FR: [RegExp, string][] = [[/Sicilian Defense/, 'Sicilienne'], [/Queens Gambit Declined/, 'Gambit Dame refusé'], [/Queens Gambit Accepted/, 'Gambit Dame accepté'], [/Queens Gambit/, 'Gambit Dame'], [/Semi Slav Defense/, 'Semi-Slave'], [/Slav Defense/, 'Slave'],
  [/Dutch Defense/, 'Hollandaise'], [/Kings Indian Defense/, 'Est-indienne'], [/Nimzo Indian Defense/, 'Nimzo-indienne'], [/Queens Indian Defense/, 'Ouest-indienne'], [/Grunfeld Defense/, 'Grünfeld'], [/Caro Kann Defense/, 'Caro-Kann'], [/French Defense/, 'Française'],
  [/Queens Pawn Opening/, 'Début du pion dame'], [/Kings Pawn Opening/, 'Début du pion roi'], [/English Opening/, 'Anglaise'], [/Bird Opening/, 'Bird'], [/Modern Defense/, 'Moderne'], [/Pirc Defense/, 'Pirc'], [/Indian Game/, 'Partie indienne'], [/Ruy Lopez Opening/, 'Espagnole'], [/Italian Game/, 'Italienne'],
  [/Scandinavian Defense/, 'Scandinave'], [/Alekhines Defense/, 'Alekhine'], [/Benoni Defense/, 'Benoni'], [/Catalan Opening/, 'Catalane'], [/London System/, 'Système de Londres'], [/Variation/g, ''], [/Attack/g, 'attaque'], [/Gambit/g, 'gambit'], [/Defense/g, 'défense'], [/Opening/g, ''], [/System/g, 'système']];
export function ecoName(eco?: string): string {
  if (!eco) return ''; let t: string[]; try { t = decodeURIComponent(eco.split('/').pop() || '').split('-'); } catch { return ''; }
  const cut = t.findIndex(w => /\d\./.test(w)); if (cut > 0) t = t.slice(0, cut);
  let n = t.join(' ').replace(/\s+/g, ' ').trim(); for (const [re, fr] of ECO_FR) n = n.replace(re, fr);
  return n.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
}
