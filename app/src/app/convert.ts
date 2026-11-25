/**
 * « S'entraîner à conclure » : tes positions gagnantes (au moins 75 % de chances) dans des parties que tu n'as pas gagnées.
 * Tu reprends la partie juste avant le coup qui a tout laissé filer, et tu joues 10 coups contre Stockfish en gardant l'avantage.
 * Un coup qui rend trop (plus d'un pion et demi) est repris ; au deuxième, la flèche montre le coup du moteur.
 */
import { Chess, tryMove, uciToObj, type Move } from '../core/chess';
import { keyMoment, myWp } from '../core/stats';
import { winPct } from '../core/winpct';
import type { Color, Game } from '../core/types';
import { mainEngine, type EngineResult } from '../engine/stockfish';
import { Board } from '../ui/board';
import { coachSay, type Mood } from '../ui/coach';
import { $, esc, icon } from '../ui/dom';
import { confetti } from '../ui/fx';
import { SFX } from '../ui/sound';
import { store } from './store';
import { thrown } from './insights';
import { countConvert } from './week';

const MOVES = 10, DEPTH = 12, TIME = 900, SERIES = 5;
const pov = (r: EngineResult, side: Color) => { const s = r.mate != null ? (r.mate > 0 ? 2000 - r.mate : -2000 - r.mate) : r.cp ?? 0; return side === 'w' ? s : -s; };
const chance = (r: EngineResult, side: Color) => { const w = winPct(r.cp, r.mate); return side === 'w' ? w : 100 - w; };

/** Le demi-coup où reprendre : juste avant ton coup qui a tout laissé filer, sinon ta dernière position à 75 % ou plus. */
function startPly(g: Game): number | null {
  const w = myWp(g); if (!w) return null; const mine = (i: number) => (i % 2 === 0) === (g.color === 'w');
  const k = keyMoment(g); if (k && w[k.ply] >= 70) return k.ply;
  let s: number | null = null; for (let i = 0; i < Math.min(w.length, g.sans.length); i++) if (mine(i) && w[i] >= 75) s = i;
  return s;
}
/** Les positions à conclure, des plus récentes aux plus anciennes. */
export function convertList(): { g: Game; ply: number; fen: string; w: number }[] {
  return thrown(store.games.filter(g => !store.state.ignored[g.id])).sort((a, b) => b.t - a.t).flatMap(g => {
    const p = startPly(g); if (p == null) return [];
    const c = new Chess(); for (let i = 0; i < p; i++) if (!tryMove(c, g.sans[i])) return [];
    return [{ g, ply: p, fen: c.fen(), w: Math.round(myWp(g)![p]) }];
  });
}

export function mountConvert(root: HTMLElement, k: number, setSub: (t: string) => void): () => void {
  const all = convertList(), pos = all[k];
  if (!pos) { root.innerHTML = `<section class="empty"><p>${all.length ? 'Série terminée.' : 'Pas encore de position gagnante laissée filer : bonne nouvelle.'}</p><a class="btn pri block" href="#/progres">Retour aux progrès</a></section>`; return () => {}; }
  const side = pos.g.color, startFen = pos.fen, inSeries = k % SERIES, next = inSeries + 1 < SERIES && all[k + 1] ? `#/conclure?k=${k + 1}` : null;
  setSub(`Position ${inSeries + 1} sur ${Math.min(SERIES, all.length - (k - inSeries))}`);
  root.innerHTML = `<div class="trainer cours"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><div class="tmain"><div class="coach ctop" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div></div></div>`;
  $('.trainer', root).insertBefore($('#coach', root), $('.tboard', root));
  const coach = $('#coach', root), actions = $('#actions', root);
  const say = (mood: Mood, head: string, text = '') => { coach.innerHTML = coachSay(mood, `<p class="lead${mood === 'oops' ? ' bad' : ''}">${head}</p>${text ? `<p class="why">${text}</p>` : ''}`); };
  let game = new Chess(startFen), last: Move | null = null, busy = true, over = false, dead = false, n = 0, errs = 0, miss = 0, wantHint = false;
  let here: EngineResult | null = null;
  const board = new Board($('#board', root), { movable: () => (busy || over ? null : side), onMove: m => { void play(m); } });
  const paint = (anim = false) => board.set(game, side, last, anim);
  const btns = (won = false) => {
    actions.innerHTML = over
      ? `<button class="btn" id="cAgain">${icon('restart')}Rejouer</button>${next ? `<a class="btn pri" href="${next}">Position suivante</a>` : `<a class="btn pri" href="#/progres">Terminer</a>`}`
      : `<button class="btn" id="cHint">${icon('bulb')}Indice</button><a class="btn" href="#/partie/${encodeURIComponent(pos.g.id)}?i=${pos.ply}&r=${encodeURIComponent(location.hash)}">Voir la partie</a>`;
    actions.querySelector('#cAgain')?.addEventListener('click', restart); actions.querySelector('#cHint')?.addEventListener('click', hint); void won;
  };
  async function think(): Promise<EngineResult | null> { try { const e = await mainEngine(); return await e.eval(game.fen(), DEPTH, TIME, 1); } catch { return null; } }
  async function yourTurn() {
    busy = true; here = await think(); if (dead) return; busy = false; paint();
    if (wantHint && here) { wantHint = false; hint(); }
    if (!here) say('oops', 'Le moteur ne démarre pas', 'Réessaie dans un instant : il se charge dans le téléphone la première fois.');
  }
  function hint() {
    if (over) return; if (busy) { wantHint = true; say('talk', 'Indice', 'Le moteur réfléchit, l\'indice arrive.'); return; }
    if (!here?.best) return; miss++;
    board.overlay({ arrows: [{ from: here.best.slice(0, 2), to: here.best.slice(2, 4), cls: 'best' }] });
    say('talk', 'Indice', 'La flèche montre le coup du moteur.');
  }
  async function play(m: Move) {
    if (busy || over) return; busy = true;
    const before = game.fen(), made = tryMove(game, { from: m.from, to: m.to, promotion: m.promotion ?? 'q' }); if (!made) { busy = false; return; }
    last = made; paint(true);
    const was = here ? pov(here, side) : null, after = await think(); if (dead) return;
    const now = after ? pov(after, side) : null, loss = was != null && now != null ? Math.max(0, was - now) : 0;
    if (game.isCheckmate()) return finish(true, `${esc(made.san)}, mat !`);
    if (loss > 150) {
      errs++; game = new Chess(before); last = null; paint(); SFX.bad(); busy = false;
      say('oops', `${esc(made.san)} rend l'avantage.`, errs >= 2 && here?.best ? 'Regarde la flèche : c\'est le coup du moteur.' : 'Reprends : cherche d\'abord ses menaces, puis le coup le plus sûr.');
      if (errs >= 2 && here?.best) board.overlay({ arrows: [{ from: here.best.slice(0, 2), to: here.best.slice(2, 4), cls: 'best' }] });
      return;
    }
    n++;
    if (game.isGameOver() || n >= MOVES) return finish(!!after && chance(after, side) >= 70, `${esc(made.san)}.`);
    const reply = after?.best; if (!reply) return finish(true, `${esc(made.san)}.`);
    await new Promise(r => setTimeout(r, 350)); if (dead) return;
    const rm = tryMove(game, uciToObj(reply)); if (rm) { last = rm; paint(true); }
    say('talk', `${esc(made.san)} : tu gardes l'avantage.`, rm ? `Il répond ${esc(rm.san)}. Coup ${n + 1} sur ${MOVES}.` : '');
    if (game.isGameOver()) return finish(false, `${esc(made.san)}.`);
    void yourTurn();
  }
  function finish(won: boolean, head: string) {
    over = true; busy = false; btns(won); paint(); countConvert();
    if (won && !errs && !miss) { SFX.done(); confetti(20); }
    say(won ? 'happy' : 'talk', `${head} ${won ? 'Avantage gardé !' : 'Fini.'}`, won ? (errs || miss ? `Avec ${errs ? `${errs} coup${errs > 1 ? 's' : ''} repris` : ''}${errs && miss ? ' et ' : ''}${miss ? `${miss} indice${miss > 1 ? 's' : ''}` : ''}. Rejoue-la sans aide.` : 'Sans aide : c\'est ça, conclure.') : 'L\'avantage a fondu : rejoue-la.');
  }
  function restart() { game = new Chess(startFen); last = null; over = false; n = errs = miss = 0; btns(); intro(); void yourTurn(); }
  function intro() { say('idle', `Tu avais ${pos.w} % de chances contre ${esc(pos.g.opp)}.`, `Garde l'avantage ${MOVES} coups contre le moteur. <span class="dim">Le moteur se prépare…</span>`); }
  paint(); btns(); intro();
  void yourTurn().then(() => { if (!dead && here) say('idle', `Tu avais ${pos.w} % de chances contre ${esc(pos.g.opp)}.`, `Ici, la partie a basculé. Garde l'avantage ${MOVES} coups contre le moteur.`); });
  return () => { dead = true; board.destroy(); };
}
