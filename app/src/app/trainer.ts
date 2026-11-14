/** Travail d'une ligne du répertoire : Drill (de mémoire) ou Voir la ligne (ligne commentée). */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import { isValid, scheduleBranch } from '../core/schedule';
import { isUserPly, theoryStart } from '../core/drill';
import type { Game } from '../core/types';
import { Board } from '../ui/board';
import { SFX } from '../ui/sound';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, markActive, markPlan, refreshDevs, save, setLastLesson, store } from './store';
import { syncSoon } from './api';
import { lineUrl, nextUrl, remaining, session } from './session';
import { explorerSlot } from './explorer';

/** Nom de la séance de lignes du plan du jour. */
export const PLAN_LINES = 'Plan du jour';
const PRAISE = ['Exact.', 'Bien joué.', "C'est la ligne.", 'Juste.', 'Parfait.'];
type Step = 'ok' | 'bad';
/** Nettoyage de la ligne affichée (une seule à la fois). */
let active: (() => void) | null = null;

export function mountTrainer(root: HTMLElement, id: string, mode: 'drill' | 'explore', fromGame?: Game): () => void {
  const { br, sys, bloc } = BR[id], side = bloc.side, moves = br.moves, S = session();
  const plan = id.startsWith('plan-') ? id.slice(5) : null, listUrl = plan ? `#/plan/${plan}?vu=1` : `#/rep/${bloc.id}/${sys.id}`;
  root.innerHTML = `<div class="trainer">
    <div class="tboard"><div id="board"></div><div class="stepper" id="stepper"></div></div>
    <div class="tside"><div id="xp" hidden></div><div class="tmain" id="tmain">
      <div class="coach" id="coach" aria-live="polite"></div>
      <div class="explnav" id="explnav" ${mode === 'explore' ? '' : 'hidden'}>${[['first', 'Début', 'first'], ['prev', 'Coup précédent', 'back'], ['next', 'Coup suivant', 'chev'], ['last', 'Fin', 'last']].map(([to, l, i]) => `<button class="btn" data-to="${to}" aria-label="${l}">${icon(i)}</button>`).join('')}</div>
      <div class="moves" id="moves"></div>
      <div class="actions" id="actions"></div>
    </div></div></div>`;
  const coach = $('#coach', root), actions = $('#actions', root), movesEl = $('#moves', root), stepper = $('#stepper', root);

  let game = new Chess(), ply = 0, last: Move | null = null;
  let errs = 0, wrongHere = 0, hintLevel = 0, locked = false, finished = false, lastNote: string | null = null;
  const steps: (Step | undefined)[] = []; let timer: ReturnType<typeof setTimeout> | undefined;

  const xa = () => XS.active();
  const board = new Board($('#board', root), {
    movable: () => xa() ? xa()!.movable() : mode === 'drill' && !locked && !finished && game.turn() === side ? side : null,
    onMove: m => xa() ? xa()!.onMove(m) : userMove(m),
  });
  /** Explorateur (bouton de la barre du haut) depuis la position affichée : la suite de la ligne, ou tes propres coups. */
  const XS = explorerSlot(board, () => $('#tmain', root), () => $('#xp', root),
    () => ({ fen: game.fen(), orient: side, lines: ply < moves.length ? [{ label: 'Suite de la ligne', sans: moves.slice(ply).map(m => m.san) }] : [] }), () => show());
  const show = (animate = false) => board.set(game, side, last, animate);
  const apply = (i: number) => { last = tryMove(game, uciToObj(moves[i].uci)); };
  const num = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'}`;

  function paintMoves() {
    const all = mode === 'explore'; let h = '';
    moves.forEach((m, i) => {
      if (!all && i >= ply) return;
      if (i % 2 === 0) h += `<span class="n">${i / 2 + 1}.</span>`;
      h += `<span class="m${i === ply - 1 ? ' cur' : ''}${all && i >= ply ? ' fut' : ''}${br.notes[i] ? ' note' : ''}" data-i="${i}">${esc(m.san)}</span> `;
    });
    if (!all) { const left = moves.length - ply; h += left ? `<span class="n">${ply ? '· ' : ''}encore ${plural(left, 'demi-coup')}</span>` : ''; }
    movesEl.innerHTML = h; if (!all) movesEl.scrollTop = movesEl.scrollHeight; else movesEl.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  }
  function paintStepper() {
    if (mode !== 'drill') { stepper.innerHTML = ''; return; }
    stepper.innerHTML = moves.map((_, i) => i).filter(i => isUserPly(i, side)).map(i => `<i class="${steps[i] ?? (i === ply ? 'cur' : '')}"></i>`).join('');
  }
  const say = (cls: string, lead: string, body = '') => { coach.innerHTML = `<p class="lead ${cls}">${lead}</p>${body}`; };

  /* ---------- Explorer ---------- */
  function explTo(target: number) {
    target = Math.max(0, Math.min(moves.length, target)); const forward = target === ply + 1;
    game = new Chess(); last = null; for (let i = 0; i < target; i++) apply(i);
    ply = target; show(forward); paintMoves();
    if (!ply) say('you', esc(sys.titre), `<p class="why">${esc(sys.resume)}</p><p class="why">Avance avec les flèches, à l'écran ou au clavier. Les coups soulignés portent un commentaire.</p>`);
    else { const note = br.notes[ply - 1]; say('', `${num(ply - 1)}${esc(moves[ply - 1].san)}`, note ? `<p>${esc(note)}</p>` : '<p class="why">Coup de la ligne.</p>'); }
    actions.innerHTML = ply >= moves.length ? `<a class="btn pri" href="${lineUrl(id, 'drill')}">Passer au drill</a>` : '';
  }
  const onKey = (e: KeyboardEvent) => { if (mode !== 'explore' || xa()) return; if (e.key === 'ArrowRight') explTo(ply + 1); if (e.key === 'ArrowLeft') explTo(ply - 1); };

  /* ---------- Drill ---------- */
  function drillActions() {
    actions.innerHTML = `<button class="btn" id="bHint">${icon('bulb')}Indice</button><a class="btn" href="${lineUrl(id, 'drill')}" id="bRestart">${icon('restart')}Recommencer</a>${Object.keys(br.notes).length && ply < theoryStart(br.notes, side) ? '<button class="btn" id="bSkip">Aller à la théorie</button>' : ''}`;
    $('#bHint', actions).onclick = hint; const sk = $('#bSkip', actions); if (sk) sk.onclick = skip;
    $('#bRestart', actions).onclick = e => { e.preventDefault(); remount(); };
  }
  function prompt() {
    if (ply >= moves.length) return finish();
    const key = br.notes[ply] ? ' <span class="tag">coup clé</span>' : '', turn = `<i class="stm ${side}"></i>À toi de jouer`;
    if (ply <= 1) say('you', turn + key, `<p class="why">${esc(sys.resume)}</p>`);
    else { const ok = steps[ply - 2] === 'ok';
      say('you', turn + key, `${ok ? `<p class="okline">${icon('check')}${num(ply - 2)}${esc(moves[ply - 2].san)}, réponse ${num(ply - 1)}${esc(moves[ply - 1].san)}</p>` : ''}${lastNote ? `<p class="why">${esc(lastNote)}</p>` : ok ? '' : '<p class="why">Continue la ligne.</p>'}`); }
    drillActions();
  }
  function miss() { if (steps[ply] !== 'bad') { steps[ply] = 'bad'; errs++; } paintStepper(); }
  function userMove(m: Move) {
    const want = moves[ply];
    if (uciOf(m) === want.uci) {
      last = tryMove(game, m); steps[ply] ??= 'ok'; lastNote = br.notes[ply] || null; wrongHere = 0; hintLevel = 0;
      if (S) { S.combo++; S.best = Math.max(S.best, S.combo); }
      say('ok', `${icon('check')}${num(ply)}${esc(want.san)}`, lastNote ? `<p>${esc(lastNote)}</p>` : `<p class="why">${PRAISE[ply % PRAISE.length]}</p>`);
      ply++; show(true); board.flash(m.to, 'good'); paintMoves(); paintStepper();
      if (ply >= moves.length) return finish();
      locked = true; timer = setTimeout(reply, 220);
    } else {
      miss(); wrongHere++; show(); board.flash(m.to, 'bad'); if (S) S.combo = 0;
      const plan = br.notes[ply]?.replace(/^[^:]*:\s*/, '');
      say('bad', `${esc(m.san)} n'est pas dans la ligne`, `<p>${wrongHere >= 2 && plan ? 'Indice de plan : ' + esc(plan) : 'Le répertoire joue autre chose ici. Réessaie, ou demande un indice.'}</p>`);
    }
  }
  function reply() {
    if (finished) return; locked = false; if (ply >= moves.length) return finish();
    apply(ply); ply++; show(true); paintMoves(); paintStepper();
    if (ply >= moves.length) finish(); else prompt();
  }
  /** 1er indice : la pièce à jouer. 2e : le coup entier, et il compte alors comme une erreur. */
  function hint() {
    if (finished || locked || game.turn() !== side) return; const uci = moves[ply].uci; hintLevel++;
    if (hintLevel >= 2) { miss(); if (S) S.combo = 0; }
    board.hint(hintLevel >= 2 ? [uci.slice(0, 2), uci.slice(2, 4)] : [uci.slice(0, 2)]);
  }
  function playTo(target: number) { while (ply < target) { steps[ply] ??= 'ok'; apply(ply); ply++; } show(); paintMoves(); paintStepper(); }
  function skip() { playTo(theoryStart(br.notes, side)); if (game.turn() !== side) { locked = true; timer = setTimeout(reply, 220); } else prompt(); }

  function finish() {
    if (finished) return; finished = true; locked = true; SFX.done();
    const s = store.state.br[id] = scheduleBranch(store.state.br[id], errs);
    if (S && errs === 0) S.clean++;
    if (fromGame && errs === 0) { store.state.fixed[fromGame.id] = true; refreshDevs(); }
    if (plan) (store.state.planDone ??= {})[plan] = { errs, at: Date.now() };
    markActive(); syncSoon(); S?.done.add(id); paintStepper();
    // fin d'une leçon du chemin : bonus sans faute, puis le bilan (le pion avance)
    if (S?.lesson && !remaining().length) {
      setLastLesson({ ...S.lesson, clean: S.clean, lines: S.pool.length, best: S.best, ms: Date.now() - S.t0 });
    }
    if (S?.label === PLAN_LINES && !remaining().length) markPlan('lines');
    const when = s.ivl <= 1 ? 'demain' : `dans ${s.ivl} jours`, next = S ? nextUrl(id) : null, left = remaining().length;
    const verdict = errs === 0 ? (isValid(s) ? `Ligne validée. Prochaine révision ${when}.` : 'Encore un passage sans faute et elle est validée.')
      : errs === 1 ? `Presque. Elle revient ${s.ivl ? when : 'tout de suite'}.` : "Le compteur repart à zéro : il faut deux passages sans faute d'affilée.";
    coach.innerHTML = `<div class="done"><p class="big">${errs === 0 ? 'Ligne sans faute' : plural(errs, 'erreur')}</p><p>${verdict}</p>${S ? `<p class="why">${esc(S.label)} : ${left ? `encore ${plural(left, 'ligne')}` : 'séance terminée'}.</p>` : ''}</div>`;
    actions.innerHTML = `${next ? `<a class="btn pri" href="${next}">Ligne suivante</a>` : S ? `<a class="btn pri" href="${S.back}">${S.lesson ? 'Voir le bilan' : 'Terminer'}</a>` : ''}<a class="btn${next || S || plan ? '' : ' pri'}" href="${lineUrl(id, 'drill')}" id="bAgain">Refaire</a><a class="btn${plan ? ' pri' : ''}" href="${listUrl}">${plan ? 'Voir le plan' : 'Liste'}</a>`; XS.available(true);
    $('#bAgain', actions).onclick = e => { e.preventDefault(); remount(); };
  }
  /** Relance la même ligne (l'adresse ne change pas, donc pas de navigation). */
  function remount() { dispose(); mountTrainer(root, id, 'drill', fromGame); }

  function start() {
    show(); paintStepper(); paintMoves();
    if (mode === 'explore') { XS.available(true); return explTo(0); }
    XS.available(false, "Termine la ligne pour l'explorer : le moteur te donnerait la réponse.");
    if (fromGame?.a.ply != null) { let t = Math.max(0, Math.min(fromGame.a.ply, moves.length) - 6); if (!isUserPly(t, side)) t = Math.max(0, t - 1); playTo(t); }
    if (game.turn() !== side) { locked = true; timer = setTimeout(reply, 350); } else prompt();
    if (fromGame) coach.insertAdjacentHTML('afterbegin', `<p class="surf fromgame">Contre <b>${esc(fromGame.opp)}</b>, tu as joué <b>${esc(fromGame.a.played)}</b> dans cette ligne. Rejoue-la sans faute pour la corriger.</p>`);
  }
  const onNav = (e: Event) => { const to = (e.target as HTMLElement).closest('button')?.dataset.to; if (to) explTo(to === 'first' ? 0 : to === 'last' ? moves.length : ply + (to === 'next' ? 1 : -1)); };
  const onPick = (e: Event) => { const i = (e.target as HTMLElement).closest<HTMLElement>('.m')?.dataset.i; if (mode === 'explore' && i != null) explTo(+i + 1); };
  $('#explnav', root).addEventListener('click', onNav); movesEl.addEventListener('click', onPick); document.addEventListener('keydown', onKey);
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; XS.destroy(); clearTimeout(timer); finished = true; board.destroy(); document.removeEventListener('keydown', onKey); }
  active = dispose; start();
  return () => active?.();
}
