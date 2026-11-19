/**
 * Finales. Trois choses, toutes appuyées sur la table de finales de Lichess (résultat exact à 7 pièces ou moins, gratuite, sans compte) :
 *  - « Tes finales » : pour une de tes parties, le résultat théorique coup par coup, et les moments où il a basculé ;
 *  - « Rejoue ce moment » : la position juste avant ta faute, à rejouer contre la meilleure défense ;
 *  - les classiques (pont de Lucena, Philidor…) : même exercice, depuis une position d'école.
 * Rien n'est récité : tu joues, la table dit si le gain (ou la nulle) tient encore, et répond.
 */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import type { Color, Game } from '../core/types';
import { Board, miniFen } from '../ui/board';
import { coachSay, type Mood } from '../ui/coach';
import { $, esc, icon, plural } from '../ui/dom';
import { confetti } from '../ui/fx';
import { SFX } from '../ui/sound';
import { markActive, save, store } from './store';

/* ---------- la table ---------- */
/** Résultat pour le camp au trait : gagné, nul, perdu (les gains qui butent sur la règle des 50 coups comptent comme nuls). */
export type Out = 'w' | 'd' | 'l';
interface TbMove { uci: string; san: string; category: string }
interface Tb { out: Out; moves: { uci: string; san: string; out: Out }[]; over: boolean }
const OUT: Record<string, Out> = { win: 'w', 'syzygy-win': 'w', 'maybe-win': 'w', loss: 'l', 'syzygy-loss': 'l', 'maybe-loss': 'l', draw: 'd', 'cursed-win': 'd', 'blessed-loss': 'd', unknown: 'd' };
const flip = (o: Out): Out => o === 'w' ? 'l' : o === 'l' ? 'w' : 'd';
const cache = new Map<string, Promise<Tb | null>>();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
export const pieces = (fen: string) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
/** Interroge la table. null : position hors table (plus de 7 pièces) ou réseau indisponible. */
export function probe(fen: string): Promise<Tb | null> {
  const key = fen.split(' ').slice(0, 4).join(' ');
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (pieces(fen) > 7) return null;
      for (let t = 0; t < 4; t++) {
        try {
          const r = await fetch('https://tablebase.lichess.ovh/standard?fen=' + encodeURIComponent(key + ' 0 1'));
          if (r.status === 429) { await wait(3000 * (t + 1)); continue; }
          if (!r.ok) return null;
          const j = await r.json() as { category: string; checkmate?: boolean; stalemate?: boolean; insufficient_material?: boolean; moves?: TbMove[] };
          // la catégorie d'un coup est donnée pour l'adversaire, après le coup : on la retourne
          return { out: OUT[j.category] ?? 'd', over: !!(j.checkmate || j.stalemate || j.insufficient_material), moves: (j.moves ?? []).map(m => ({ uci: m.uci, san: m.san, out: flip(OUT[m.category] ?? 'd') })) };
        } catch { await wait(800); }
      }
      return null;
    })();
    cache.set(key, p); p.then(v => { if (!v) cache.delete(key); });
  }
  return p;
}

/* ---------- les mots ---------- */
const FR: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
/** Un coup en notation française : Kf3 → Rf3, Rxa7 → Txa7. */
export const frSan = (san: string) => san.replace(/^[KQRBN]/, c => FR[c]).replace(/=([QRBN])/, (_, c) => '=' + FR[c]);
const num = (ply: number) => `${Math.floor((ply - 1) / 2) + 1}${ply % 2 ? '.' : '…'}`;
const orList = (l: string[]) => l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`;
const NAME: Record<string, string> = { q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };
/** Le type de finale en mots : « Tour et pion contre tour ». */
export function material(fen: string, me: Color): string {
  const side = (white: boolean) => { const s = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').split('').filter(c => (c === c.toUpperCase()) === white && c.toLowerCase() !== 'k').map(c => c.toLowerCase());
    const n = (k: string) => s.filter(c => c === k).length, out: string[] = [];
    for (const k of ['q', 'r', 'b', 'n']) if (n(k)) out.push(n(k) > 1 ? `${n(k)} ${NAME[k]}s` : NAME[k]);
    if (n('p')) out.push(n('p') > 1 ? `${n('p')} pions` : 'pion');
    return out.length ? out.join(' et ') : 'roi seul'; };
  const a = side(me === 'w'), b = side(me !== 'w'), t = `${a} contre ${b}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- une de tes parties ---------- */
export interface Turn { ply: number; san: string; mine: boolean; from: Out; to: Out; keep: string[]; fen: string }
export interface EndReport { start: number; fen: string; outs: Out[]; turns: Turn[]; last: Out }
const REP = 'cd_eg_';
/** Demi-coup à partir duquel la partie tient dans la table, ou -1 si elle n'y arrive pas (ou trop tard pour être une vraie finale). */
export function endgameStart(g: Pick<Game, 'sans'>): number {
  if (g.sans.length < 30) return -1;
  const c = new Chess(); let k = -1;
  for (let i = 0; i < g.sans.length; i++) { if (!tryMove(c, g.sans[i])) return -1; if (k < 0 && pieces(c.fen()) <= 7) k = i + 1; }
  return k > 0 && g.sans.length - k >= 4 ? k : -1;
}
/** Le rapport d'une finale : résultat de chaque position de ton point de vue, et les coups qui l'ont changé. Gardé sur l'appareil une fois calculé. */
export async function endReport(g: Game, onStep?: (done: number, total: number) => void): Promise<EndReport | null> {
  try { const raw = localStorage.getItem(REP + g.id); if (raw) return JSON.parse(raw) as EndReport; } catch { /* on recalcule */ }
  const start = endgameStart(g); if (start < 0) return null;
  const c = new Chess(), fens: string[] = [];
  for (let i = 0; i < g.sans.length; i++) { tryMove(c, g.sans[i]); if (i + 1 >= start) fens.push(c.fen()); }
  const tbs: (Tb | null)[] = [];
  for (let i = 0; i < fens.length; i++) { const hit = cache.has(fens[i].split(' ').slice(0, 4).join(' ')); tbs.push(await probe(fens[i])); onStep?.(i + 1, fens.length); if (!hit) await wait(140); }
  if (tbs.some(t => !t)) return null;
  const mineAt = (fen: string) => fen.split(' ')[1] === g.color;                       // le trait est à toi
  const outs = fens.map((f, i) => mineAt(f) ? tbs[i]!.out : flip(tbs[i]!.out));         // de ton point de vue
  const turns: Turn[] = [];
  for (let i = 1; i < fens.length; i++) {
    if (outs[i] === outs[i - 1]) continue;
    const ply = start + i, before = tbs[i - 1]!, mover = mineAt(fens[i - 1]);
    turns.push({ ply, san: g.sans[ply - 1], mine: mover, from: outs[i - 1], to: outs[i], fen: fens[i - 1], keep: before.moves.filter(m => m.out === before.out).map(m => m.san) });
  }
  const rep: EndReport = { start, fen: fens[0], outs, turns, last: outs[outs.length - 1] };
  try { localStorage.setItem(REP + g.id, JSON.stringify(rep)); } catch { /* stockage plein : tant pis */ }
  return rep;
}
const WORD: Record<Out, string> = { w: 'gagnant', d: 'nul', l: 'perdant' };
/** Ce qu'un coup a changé, en une phrase. */
function turnText(t: Turn): string {
  const only = t.keep.length ? `${t.keep.length === 1 ? 'Seul' : 'Il fallait'} ${orList(t.keep.slice(0, 3).map(frSan))}${t.keep.length === 1 ? (t.from === 'w' ? ' gagnait' : ' tenait') : ''}.` : '';
  if (t.mine) return `${t.from === 'w' ? (t.to === 'd' ? 'Tu rends la nulle.' : 'Tu passes de gagnant à perdant.') : 'Tu perds une position nulle.'} ${only}`;
  return `${t.to === 'w' ? (t.from === 'd' ? 'Il perd une position nulle.' : 'Il te donne le gain.') : 'Il te rend la nulle.'} ${only}`;
}

/** Tes parties récentes qui finissent dans la table. */
export const endgameGames = (max = 12) => [...store.games].filter(g => !store.state.ignored[g.id]).sort((a, b) => b.t - a.t).slice(0, 80).filter(g => endgameStart(g) > 0).slice(0, max);

/* ---------- les classiques ---------- */
export interface Lesson { id: string; titre: string; sub: string; fen: string; side: Color; goal: 'w' | 'd'; n: number; intro: string; idea: string }
export const LESSONS: Lesson[] = [
  { id: 'derriere', titre: 'La tour derrière le pion passé', sub: 'Tiré de ta partie contre kis73', fen: '8/8/1R1Pk3/8/p7/1pK5/8/3r4 w - - 0 1', side: 'w', goal: 'd', n: 6,
    intro: 'Tu as deux pions de moins et ton pion d6 va tomber. Un seul coup sauve la nulle.', idea: 'La tour se met derrière le pion passé le plus dangereux : elle l\'attaque et le suit s\'il avance.' },
  { id: 'colle', titre: 'Le roi collé à son pion', sub: 'Tiré de ta partie contre LivelyBrake', fen: '8/8/8/4K3/5pk1/8/5r2/6R1 b - - 0 1', side: 'b', goal: 'w', n: 10,
    intro: 'Il te donne échec. Une seule case garde le gain.', idea: 'Ton roi reste à côté de son pion : il le protège et s\'abrite derrière lui.' },
  { id: 'ecart', titre: 'La tour loin, pour les échecs de côté', sub: 'Tiré de ta partie contre LivelyBrake', fen: '5R2/8/8/8/5K2/5p2/5rk1/8 b - - 0 1', side: 'b', goal: 'w', n: 10,
    intro: 'Ton roi veut avancer avec son pion, mais ta tour le gêne.', idea: 'Éloigne ta tour sur la rangée : elle libère la case de ton roi et pourra donner échec de loin.' },
  { id: 'lucena', titre: 'Le pont de Lucena', sub: 'La finale gagnante à connaître', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', side: 'w', goal: 'w', n: 14,
    intro: 'Ton pion est à une case de la dame, mais ton roi est coincé devant lui.', idea: 'Chasse son roi par un échec, amène ta tour sur la 4e rangée, puis sors ton roi : la tour viendra couper les échecs. C\'est le pont.' },
  { id: 'philidor', titre: 'La défense de Philidor', sub: 'La nulle à connaître', fen: '4k3/7R/8/3PK3/8/8/8/r7 b - - 0 1', side: 'b', goal: 'd', n: 8,
    intro: 'Il a un pion de plus et son roi avance. Tu peux tenir la nulle.', idea: 'Ta tour sur la 6e rangée empêche son roi d\'avancer. Dès que le pion y arrive, ta tour descend tout en bas et donne des échecs par derrière.' },
];

/* ---------- les écrans ---------- */
const dayOf = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const RES: Record<string, string> = { W: 'Gagnée', D: 'Nulle', L: 'Perdue' };
/** La page Finales : tes parties qui se sont jouées en finale, puis les classiques. */
export function viewEndgames(root: HTMLElement) {
  const gs = endgameGames(), done = (id: string) => !!(store.state.settings as Record<string, unknown>)[`eg_${id}`];
  root.innerHTML = `
    ${gs.length ? `<section class="grp"><h2>Tes finales</h2><div class="surf card list">${gs.map(g => { const k = endgameStart(g), c = new Chess(); for (let i = 0; i < k; i++) tryMove(c, g.sans[i]);
      return `<a class="rowi egrow" href="#/finale/${encodeURIComponent(g.id)}">${miniFen(c.fen(), g.color).replace('class="mini"', 'class="mini cthumb"')}<span class="body"><b>${esc(material(c.fen(), g.color))}</b><small>${RES[g.res] ?? ''} contre ${esc(g.opp)} · ${dayOf(g.t)}</small></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>` : ''}
    <section class="grp"><h2>Les classiques</h2><div class="surf card list">${LESSONS.map(l => `<a class="rowi egrow" href="#/finales/${l.id}">${miniFen(l.fen, l.side).replace('class="mini"', 'class="mini cthumb"')}<span class="body"><b>${esc(l.titre)}</b><small>${esc(l.sub)}</small></span>${done(l.id) ? `<span class="vok">${icon('check')}</span>` : ''}${icon('chev', 'chev')}</a>`).join('')}</div></section>`;
}

/** Une de tes finales : la bande gagné / nul / perdu, et chaque moment où le résultat a changé. */
export function viewEndgame(root: HTMLElement, g: Game) {
  let dead = false;
  root.innerHTML = `<section class="surf card padded egload"><p id="egst">La table de finales lit ta partie…</p><span class="prog"><b id="egbar" style="width:0%"></b></span></section>`;
  endReport(g, (d, t) => { if (dead) return; const b = root.querySelector<HTMLElement>('#egbar'); if (b) b.style.width = `${Math.round(100 * d / t)}%`; }).then(rep => {
    if (dead) return;
    if (!rep) { root.innerHTML = `<section class="empty"><p>Cette finale n'a pas pu être lue. Vérifie ta connexion, ou la partie garde plus de 7 pièces jusqu'au bout.</p></section>`; return; }
    const mine = rep.turns.filter(t => t.mine), his = rep.turns.filter(t => !t.mine);
    const verdict = rep.outs[0] === 'd' && !rep.turns.length ? 'Nulle du début à la fin, jouée sans faute.' : `Au départ, la position est ${WORD[rep.outs[0]]}e pour toi. Le résultat change ${plural(rep.turns.length, 'fois', 'fois')} : ${mine.length} de ton fait, ${his.length} du sien.`;
    root.innerHTML = `
      <section class="surf card padded eghead">${miniFen(rep.fen, g.color).replace('class="mini"', 'class="mini egboard"')}
        <div><h2>${esc(material(rep.fen, g.color))}</h2><p>${verdict}</p></div></section>
      <div class="egstrip" role="img" aria-label="Résultat théorique coup par coup, de ton point de vue">${rep.outs.map(o => `<i class="${o}"></i>`).join('')}</div>
      <p class="egkey"><span><i class="w"></i>gagnant</span><span><i class="d"></i>nul</span><span><i class="l"></i>perdant</span></p>
      ${rep.turns.length ? `<div class="surf card list">${rep.turns.map(t => `<div class="rowi egturn ${t.mine ? 'mine' : ''}"><span class="body"><b>${num(t.ply)}${esc(frSan(t.san))} ?</b><small>${esc(turnText(t))}</small></span>
        ${t.mine ? `<a class="btn" href="#/finale/${encodeURIComponent(g.id)}/${t.ply}">Rejouer</a>` : ''}</div>`).join('')}</div>` : ''}
      <a class="quiet" href="${esc(g.url)}" target="_blank" rel="noopener">Voir la partie sur Chess.com</a>`;
  });
  return () => { dead = true; };
}

interface Drill { fen: string; side: Color; goal: 'w' | 'd'; n: number; title: string; intro: string; idea: string; back: string; done?: () => void }
/** La position d'une de tes fautes de finale, prête à rejouer. */
export async function turnDrill(g: Game, ply: number): Promise<Drill | null> {
  const rep = await endReport(g), t = rep?.turns.find(x => x.ply === ply && x.mine); if (!rep || !t || t.from === 'l') return null;
  return { fen: t.fen, side: g.color, goal: t.from, n: t.from === 'w' ? 10 : 6, title: `${num(ply)}${frSan(t.san)} ?`, back: `#/finale/${encodeURIComponent(g.id)}`,
    intro: t.from === 'w' ? 'Ici tu avais le gain. Retrouve le coup, puis tiens-le.' : 'Ici la nulle tenait encore. Retrouve le coup, puis tiens-la.', idea: turnText(t) };
}
export const lessonDrill = (l: Lesson): Drill => ({ fen: l.fen, side: l.side, goal: l.goal, n: l.n, title: l.titre, intro: l.intro, idea: l.idea, back: '#/finales',
  done: () => { (store.state.settings as Record<string, unknown>)[`eg_${l.id}`] = 1; save(); } });

/**
 * L'exercice : tu joues, la table juge. Un coup qui laisse filer le but (le gain, ou la nulle) est repris, et compte comme une erreur.
 * L'adversaire répond par la meilleure défense. C'est réussi quand tu mates, quand ton pion va à dame, ou quand tu as tenu `n` coups.
 */
export function mountDrill(root: HTMLElement, d: Drill): () => void {
  root.innerHTML = `<div class="trainer cours"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><div class="tmain"><div class="coach ctop" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div></div></div>`;
  $('.trainer', root).insertBefore($('#coach', root), $('.tboard', root));
  const coach = $('#coach', root), actions = $('#actions', root);
  let game = new Chess(d.fen), busy = false, over = false, errs = 0, ok = 0, miss = 0, dead = false, last: Move | null = null;
  const say = (mood: Mood, head: string, text = '') => { coach.innerHTML = coachSay(mood, `<p class="lead${mood === 'oops' ? ' bad' : ''}">${head}</p>${text ? `<p class="why">${text}</p>` : ''}`); };
  const board = new Board($('#board', root), { movable: () => (busy || over ? null : d.side), onMove: m => { void play(m); } });
  const goalWord = d.goal === 'w' ? 'le gain' : 'la nulle';
  const paint = () => board.set(game, d.side, last, true);
  const btns = () => { actions.innerHTML = over ? `<button class="btn" id="bAgain">Rejouer</button><a class="btn pri" href="${d.back}">Continuer</a>` : `<button class="btn" id="bHint">Indice</button><a class="btn" href="${d.back}">Arrêter là</a>`;
    actions.querySelector<HTMLElement>('#bAgain')?.addEventListener('click', restart); actions.querySelector<HTMLElement>('#bHint')?.addEventListener('click', () => { void hint(); }); };
  function restart() { game = new Chess(d.fen); over = false; busy = false; errs = 0; ok = 0; miss = 0; last = null; $('.trainer', root).classList.remove('fin'); paint(); btns(); say('idle', esc(d.intro), `À toi : ${d.goal === 'w' ? 'gagne' : 'tiens la nulle'}.`); }
  async function hint() { if (busy || over) return; const tb = await probe(game.fen()); if (dead || !tb) return; const m = tb.moves.find(x => x.out === tb.out) ?? tb.moves[0]; if (!m) return;
    miss++; board.hint(miss >= 2 ? [m.uci.slice(0, 2), m.uci.slice(2, 4)] : [m.uci.slice(0, 2)]); say('talk', 'Indice', esc(d.idea)); }
  function finish(win: boolean, head: string, text: string) { over = true; $('.trainer', root).classList.add('fin'); if (win) { SFX.done(); if (!errs) confetti(24); d.done?.(); markActive(); } say(win ? (errs ? 'happy' : 'party') : 'oops', head, text); btns(); }
  async function play(m: Move) {
    if (busy || over) return; busy = true;
    const before = game.fen(), promo = m.flags.includes('p'), made = tryMove(game, { from: m.from, to: m.to, promotion: m.promotion });
    if (!made) { busy = false; return; }
    last = made; paint(); SFX.forMove(made);
    const tb = await probe(game.fen()); if (dead) return;
    if (!tb) { game = new Chess(before); last = null; paint(); busy = false; say('oops', 'Pas de réseau', 'La table de finales ne répond pas. Réessaie dans un instant.'); return; }
    const mine = flip(tb.out);                                         // le résultat pour toi, une fois ton coup joué
    if ((d.goal === 'w' && mine !== 'w') || (d.goal === 'd' && mine === 'l')) {
      errs++; board.flash(m.to, 'bad'); await wait(450); if (dead) return;
      game = new Chess(before); last = null; paint(); busy = false;
      say('oops', `${frSan(made.san)} laisse filer ${goalWord}.`, errs >= 2 ? esc(d.idea) : 'Essaie autre chose.');
      if (errs >= 3) { const t = await probe(before); const b = t?.moves.find(x => x.out === t.out); if (b && !dead) board.hint([b.uci.slice(0, 2), b.uci.slice(2, 4)]); }
      return;
    }
    ok++;
    if (game.isCheckmate()) return finish(true, 'Mat !', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    if (tb.over || game.isDraw()) return finish(d.goal === 'd', d.goal === 'd' ? 'Nulle tenue.' : 'C\'est nul.', esc(d.idea));
    if (d.goal === 'w' && promo) return finish(true, 'Dame ! Le gain est fait.', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    if (ok >= d.n) return finish(true, d.goal === 'w' ? 'Tu tiens le gain.' : 'Nulle tenue.', errs ? `Avec ${plural(errs, 'erreur')}. ${esc(d.idea)}` : esc(d.idea));
    // la meilleure défense : la table trie les coups du meilleur au moins bon pour le camp au trait
    const reply = tb.moves[0]; await wait(380); if (dead) return;
    const rm = reply ? tryMove(game, uciToObj(reply.uci)) : null;
    if (rm) { last = rm; paint(); SFX.forMove(rm); }
    if (game.isCheckmate() || game.isDraw()) return finish(d.goal === 'd' && !game.isCheckmate(), game.isCheckmate() ? 'Mat contre toi.' : 'Nulle.', esc(d.idea));
    busy = false; say('happy', `${frSan(made.san)} tient ${goalWord}.`, rm ? `Il répond ${frSan(rm.san)}. À toi.` : 'À toi.');
  }
  restart();
  return () => { dead = true; board.destroy(); };
}
void uciOf;
