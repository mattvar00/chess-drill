/**
 * « Joue le plan » : depuis la position clé d'un plan, tu joues 8 coups contre Stockfish (dans le téléphone).
 * Chaque coup est jugé : dans le plan (un coup du plan ou d'une de ses flèches), bon, jouable, ou faute (reprise).
 * Le moteur répond par l'un de ses deux meilleurs coups, pour que tu voies plusieurs suites d'une partie à l'autre.
 */
import { Chess, tryMove, uciToObj, type Move } from '../core/chess';
import type { Color } from '../core/types';
import { mainEngine, type EngineResult } from '../engine/stockfish';
import { Board } from '../ui/board';
import { coachSay, type Mood } from '../ui/coach';
import { $, esc, icon } from '../ui/dom';
import { confetti } from '../ui/fx';
import { SFX } from '../ui/sound';
import { PLANS, type Plan } from './store';

const MOVES = 8, DEPTH = 12, TIME = 900;
/** Score du point de vue de `side`, en centipions (un mat compte pour ±2000). */
const pov = (r: EngineResult, side: Color) => { const s = r.mate != null ? (r.mate > 0 ? 2000 - r.mate : -2000 - r.mate) : r.cp ?? 0; return side === 'w' ? s : -s; };

/** La position de départ : la première étape du plan (après le 6e demi-coup) où c'est à toi de jouer. */
export function planStart(P: Plan): number {
  const g = new Chess(); const turnAt: Color[] = []; turnAt.push('w'); for (const s of P.sans) { tryMove(g, s); turnAt.push(g.turn() as Color); }
  const st = P.steps.find(s => s.p >= 6 && turnAt[s.p] === P.side) ?? P.steps.find(s => turnAt[s.p] === P.side);
  return st ? st.p : P.steps[0].p;
}

export function mountPlanPlay(root: HTMLElement, id: string): () => void {
  const found = PLANS.find(x => x.id === id); if (!found) { root.innerHTML = '<p class="empty">Plan introuvable.</p>'; return () => {}; }
  const P: Plan = found;
  const side = P.side, start = planStart(P), back = `#/plan/${P.id}?vu=1`;
  const g0 = new Chess(); P.sans.slice(0, start).forEach(s => tryMove(g0, s)); const startFen = g0.fen();
  // les coups « du plan » : tes coups de la ligne après le départ, et les flèches de tes pièces dans les étapes suivantes
  const theme = new Map<string, string>();
  { const g = new Chess(startFen); P.sans.slice(start).forEach(s => { const m = tryMove(g, s); if (m && m.color === side) theme.set(m.from + m.to, ''); }); }
  for (const st of P.steps.filter(s => s.p >= start)) for (const [f, t] of st.a) if (!theme.get(f + t)) theme.set(f + t, st.c);
  const toSq = new Set([...theme.keys()].map(k => k.slice(2, 4)));

  root.innerHTML = `<div class="trainer cours"><div class="tboard"><div id="board"></div></div>
    <div class="tside"><div class="tmain"><div class="coach ctop" id="coach" aria-live="polite"></div><div class="actions" id="actions"></div></div></div></div>`;
  $('.trainer', root).insertBefore($('#coach', root), $('.tboard', root));
  const coach = $('#coach', root), actions = $('#actions', root);
  const say = (mood: Mood, head: string, text = '') => { coach.innerHTML = coachSay(mood, `<p class="lead${mood === 'oops' ? ' bad' : ''}">${head}</p>${text ? `<p class="why">${text}</p>` : ''}`); };
  let game = new Chess(startFen), last: Move | null = null, busy = true, over = false, dead = false, n = 0, inPlan = 0, good = 0, meh = 0, errs = 0, miss = 0, wantHint = false;
  let here: EngineResult | null = null;   // l'analyse de la position où tu dois jouer
  const board = new Board($('#board', root), { movable: () => (busy || over ? null : side), onMove: m => { void play(m); } });
  const paint = (anim = false) => board.set(game, side, last, anim);   // anim : glisse la pièce et joue le bruit, une seule fois par coup
  const btns = () => {
    actions.innerHTML = over
      ? `<button class="btn" id="pAgain">${icon('restart')}Rejouer</button><button class="btn pri" id="pBack">Revoir le plan</button>`
      : `<button class="btn" id="pHint">${icon('bulb')}Indice</button><button class="btn" id="pStop">Arrêter</button>`;
    const on = (k: string, f: () => void) => actions.querySelector<HTMLElement>('#' + k)?.addEventListener('click', f);
    on('pAgain', restart); on('pBack', () => { location.hash = back; }); on('pStop', () => { location.hash = back; }); on('pHint', hint);
  };
  async function think(): Promise<EngineResult | null> {
    const fen = game.fen(); try { const e = await mainEngine(); return await e.eval(fen, DEPTH, TIME, 2); } catch { return null; }
  }
  async function yourTurn() {
    busy = true; here = await think(); if (dead) return; busy = false; paint();
    if (wantHint && here) { wantHint = false; hint(); }
    if (!here) say('oops', 'Le moteur ne démarre pas', 'Réessaie dans un instant : il se charge dans le téléphone la première fois.');
  }
  function hint() {
    if (over) return;
    if (busy) { wantHint = true; say('talk', 'Indice', 'Le moteur réfléchit, l\'indice arrive.'); return; }
    miss++;
    const legal = game.moves({ verbose: true }) as Move[], th = legal.find(m => theme.has(m.from + m.to)) ?? legal.find(m => toSq.has(m.to) && m.piece !== 'p' && m.piece !== 'k');
    const u = th ? th.from + th.to : here?.best; if (!u) return;
    board.overlay({ arrows: [{ from: u.slice(0, 2), to: u.slice(2, 4), cls: th ? 'plan' : 'best' }] });
    say('talk', th ? 'Indice : le plan' : 'Indice : le meilleur coup', esc(th ? (theme.get(th.from + th.to) || P.sub) : 'Aucun coup du plan n\'est possible ici : voici celui du moteur.'));
  }
  async function play(m: Move) {
    if (busy || over) return; busy = true;
    const before = game.fen(), made = tryMove(game, { from: m.from, to: m.to, promotion: m.promotion ?? 'q' }); if (!made) { busy = false; return; }
    last = made; paint(true);
    const was = here ? pov(here, side) : null, after = await think(); if (dead) return;
    const now = after ? pov(after, side) : null;   // le moteur note du point de vue des Blancs : on remet tout de ton côté
    const loss = was != null && now != null ? Math.max(0, was - now) : 0;
    const isPlan = theme.has(made.from + made.to) || (toSq.has(made.to) && made.piece !== 'p' && made.piece !== 'k');
    if (loss > 150 && !game.isCheckmate()) {   // une faute : on reprend
      errs++; game = new Chess(before); last = null; paint(); SFX.bad(); busy = false;
      say('oops', `${esc(made.san)} perd trop.`, errs >= 2 && here?.best ? 'Regarde la flèche : c\'est le coup du moteur.' : 'Reprends, et pense au plan : ' + esc(P.sub) + '.');
      if (errs >= 2 && here?.best) board.overlay({ arrows: [{ from: here.best.slice(0, 2), to: here.best.slice(2, 4), cls: 'best' }] });
      return;
    }
    n++; if (isPlan) inPlan++; else if (loss <= 50) good++; else meh++;
    const head = isPlan ? `${esc(made.san)} : dans le plan.` : loss <= 50 ? `${esc(made.san)} : bon coup.` : `${esc(made.san)} : jouable, mais pas le plus fort.`;
    if (game.isGameOver() || n >= MOVES) return finish(head);
    // sa réponse : l'un de ses deux meilleurs coups quand ils se valent (pour voir plusieurs suites)
    let reply = after?.best ?? null;
    if (after?.alt && after.cp != null && after.alt.cp != null && Math.abs(after.cp - after.alt.cp) <= 30 && Math.random() < .4) reply = after.alt.uci;
    if (!reply) return finish(head);
    await new Promise(r => setTimeout(r, 350)); if (dead) return;
    const rm = tryMove(game, uciToObj(reply)); if (rm) { last = rm; paint(true); }
    say(isPlan ? 'happy' : 'talk', head, rm ? `Il répond ${esc(rm.san)}. Coup ${n + 1} sur ${MOVES}.` : '');
    if (game.isGameOver()) return finish(head);
    void yourTurn();
  }
  function finish(head: string) {
    over = true; busy = false; btns(); paint();
    const clean = !errs && !miss, txt = `${inPlan} coup${inPlan > 1 ? 's' : ''} dans le plan, ${good} bon${good > 1 ? 's' : ''}, ${meh} jouable${meh > 1 ? 's' : ''}${errs ? `, ${errs} faute${errs > 1 ? 's' : ''} reprise${errs > 1 ? 's' : ''}` : ''}.`;
    if (inPlan >= 3 && clean) { SFX.done(); confetti(20); }
    say(inPlan >= 3 ? 'happy' : 'talk', `${head} Fini !`, `${txt} ${inPlan >= 3 ? 'Tu as suivi le plan.' : 'Revois le plan, puis rejoue : ' + esc(P.sub) + '.'}`);
  }
  function restart() { game = new Chess(startFen); last = null; over = false; n = inPlan = good = meh = errs = miss = 0; btns(); intro(); void yourTurn(); }
  function intro() { say('idle', esc(P.title.split(' · ')[0]), `Le plan : ${esc(P.sub)}. Joue ${MOVES} coups contre le moteur. <span class="dim">Le moteur se prépare…</span>`); }
  paint(); btns(); intro();
  void yourTurn().then(() => { if (!dead && here) say('idle', esc(P.title.split(' · ')[0]), `Le plan : ${esc(P.sub)}. À toi : ${MOVES} coups contre le moteur.`); });
  return () => { dead = true; board.destroy(); };
}
