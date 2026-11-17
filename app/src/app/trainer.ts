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
import { passed, trunkOf } from '../core/path';
import { lineTitle, roleLabel } from '../core/names';
import { coachSay, type Mood } from '../ui/coach';

/**
 * Méthode du cours (lignes rangées en chapitres), pour une variante pas encore réussie : tu rejoues toi-même, de mémoire,
 * les coups que tu connais déjà ; au coup adverse qui ouvre la variante, le coach l'explique ; tu la découvres coups montrés,
 * chacun avec sa raison ; puis tu la rejoues sans aide depuis ce point. Une variante déjà sue se rejoue simplement en entier.
 */
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
  const course = mode === 'drill' && !fromGame && !!br.ch, known = passed(store.state.br[id]);
  const trunk = course ? trunkOf(moves, sys.branches.filter(o => o.id !== id && o.ch && (passed(store.state.br[o.id]) || S?.done.has(o.id))).map(o => o.moves), side) : 0;
  /** `introduced` : le coach a présenté la variante (d'office pour une variante déjà sue, ou hors cours). `trunkErrs` : fautes faites avant ce moment. */
  let guided = false, opening = false, introduced = !course || known, trunkErrs = 0;

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
  const MOODS: Record<string, Mood> = { ok: 'happy', bad: 'oops', you: 'idle' };
  const say = (cls: string, lead: string, body = '', mood: Mood = MOODS[cls] ?? 'talk') => { coach.innerHTML = coachSay(mood, `<p class="lead ${cls}">${lead}</p>${body}`); };

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
    actions.innerHTML = `<button class="btn" id="bHint">${icon('bulb')}Indice</button><a class="btn" href="${lineUrl(id, 'drill')}" id="bRestart">${icon('restart')}Recommencer</a>${!course && Object.keys(br.notes).length && ply < theoryStart(br.notes, side) ? '<button class="btn" id="bSkip">Aller à la théorie</button>' : ''}`;
    $('#bHint', actions).onclick = hint; const sk = $('#bSkip', actions); if (sk) sk.onclick = skip;
    $('#bRestart', actions).onclick = e => { e.preventDefault(); remount(); };
  }
  const nb = (t: string) => t.replace(/ ([:?!;])/g, '\u00a0$1');
  const bare = (note: string) => { const t = note.replace(/^[^:]*:\s*/, ''); return nb(t.charAt(0).toUpperCase() + t.slice(1)); };
  function prompt() {
    if (ply >= moves.length) return end();
    if (!introduced && ply >= trunk) return explain();
    if (guided) {   // découverte : le coup est montré, avec sa raison
      const want = moves[ply]; board.guide([want.uci.slice(0, 2), want.uci.slice(2, 4)]);
      say('you', `<i class="stm ${side}"></i>Joue ${num(ply)}${esc(want.san)}`, br.notes[ply] ? `<p>${esc(bare(br.notes[ply]))}</p>` : '<p class="why">Le coup est montré sur l\'échiquier.</p>', 'talk');
      actions.innerHTML = `<button class="btn" id="bMem">Je la connais, à moi de jouer</button>`; $('#bMem', actions).onclick = fromMemory; return;
    }
    if (opening) { opening = false; say('you', `<i class="stm ${side}"></i>À toi de jouer`, `<p class="why">${br.role ? roleLabel(br.role) + '. ' : ''}${esc(lineTitle(br.titre))}</p>`); return drillActions(); }
    const key = br.notes[ply] && !course ? ` <span class="tag">${br.type === 'punir' ? 'la punition' : br.type === 'bon' ? 'le bon coup' : 'coup clé'}</span>` : '', turn = `<i class="stm ${side}"></i>À toi de jouer`;
    if (ply <= 1) say('you', turn + key, `<p class="why">${!introduced ? 'On repart du premier coup. Rejoue ceux que tu connais : la nouvelle variante commence juste après.' : course ? (br.role ? roleLabel(br.role) + '. ' : '') + esc(lineTitle(br.titre)) : esc(sys.resume)}</p>`);
    else { const ok = steps[ply - 2] === 'ok';
      say('you', turn + key, `${ok ? `<p class="okline">${icon('check')}${num(ply - 2)}${esc(moves[ply - 2].san)}, réponse ${num(ply - 1)}${esc(moves[ply - 1].san)}</p>` : ''}${lastNote ? `<p class="why">${esc(lastNote)}</p>` : ok ? '' : '<p class="why">Continue la ligne.</p>'}`); }
    drillActions();
  }
  function miss() { if (steps[ply] !== 'bad') { steps[ply] = 'bad'; errs++; } paintStepper(); }
  function userMove(m: Move) {
    const want = moves[ply];
    if (uciOf(m) === want.uci) {
      last = tryMove(game, m); steps[ply] ??= 'ok'; lastNote = br.notes[ply] || null; wrongHere = 0; hintLevel = 0;
      if (S && !guided) { S.combo++; S.best = Math.max(S.best, S.combo); }
      say('ok', `${icon('check')}${num(ply)}${esc(want.san)}`, lastNote ? `<p>${esc(lastNote)}</p>` : `<p class="why">${PRAISE[ply % PRAISE.length]}</p>`);
      ply++; show(true); board.flash(m.to, 'good'); paintMoves(); paintStepper();
      if (ply >= moves.length) return end();
      locked = true; timer = setTimeout(reply, guided ? 450 : 220);
    } else if (guided) {   // en découverte, une erreur ne coûte rien : le coup reste montré
      show(); board.flash(m.to, 'bad'); board.guide([want.uci.slice(0, 2), want.uci.slice(2, 4)]);
      say('bad', `Ici, c'est ${num(ply)}${esc(want.san)}`, br.notes[ply] ? `<p>${esc(bare(br.notes[ply]))}</p>` : '<p class="why">Le coup est montré sur l\'échiquier.</p>');
    } else {
      miss(); wrongHere++; show(); board.flash(m.to, 'bad'); if (S) S.combo = 0;
      const plan = br.notes[ply]?.replace(/^[^:]*:\s*/, '');
      say('bad', `${esc(m.san)} n'est pas dans la ligne`, `<p>${wrongHere >= 2 && plan ? 'Indice de plan : ' + esc(plan) : 'Le répertoire joue autre chose ici. Réessaie, ou demande un indice.'}</p>`);
    }
  }
  function reply() {
    if (finished) return; locked = false; if (ply >= moves.length) return end();
    apply(ply); ply++; show(true); paintMoves(); paintStepper();
    if (ply >= moves.length) end(); else prompt();
  }
  /** 1er indice : la pièce à jouer. 2e : le coup entier, et il compte alors comme une erreur. */
  function hint() {
    if (finished || locked || game.turn() !== side) return; const uci = moves[ply].uci; hintLevel++;
    if (hintLevel >= 2) { miss(); if (S) S.combo = 0; }
    board.hint(hintLevel >= 2 ? [uci.slice(0, 2), uci.slice(2, 4)] : [uci.slice(0, 2)]);
  }
  function playTo(target: number) { while (ply < target) { steps[ply] ??= 'ok'; apply(ply); ply++; } show(); paintMoves(); paintStepper(); }
  function skip() { playTo(theoryStart(br.notes, side)); if (game.turn() !== side) { locked = true; timer = setTimeout(reply, 220); } else prompt(); }

  /* ---------- Méthode du cours ---------- */
  /** Fin des coups : en découverte, on enchaîne sur le passage de mémoire ; sinon la ligne est finie. */
  function end() { if (!guided) return finish(); locked = true;
    say('ok', 'Variante vue', '<p>À toi maintenant, sans aide, depuis le début de la variante.</p>');
    actions.innerHTML = '<button class="btn pri" id="bGo">La rejouer de mémoire</button>'; $('#bGo', actions).onclick = fromMemory; }
  /** Revient au début de la variante pour la jouer sans aide (les coups d'avant viennent d'être rejoués, on ne les redemande pas). */
  function fromMemory() {
    clearTimeout(timer); game = new Chess(); last = null; ply = 0; steps.length = 0; errs = trunkErrs; wrongHere = 0; hintLevel = 0; lastNote = null;
    playTo(trunk); begin(false);
  }
  function begin(g: boolean) {
    guided = g; opening = !g; locked = false;
    if (game.turn() !== side) { locked = true; timer = setTimeout(reply, 300); } else prompt();
  }
  /** Le coach présente la variante, au moment où elle commence (le coup adverse qui l'ouvre vient d'être joué). */
  function explain() {
    introduced = true; trunkErrs = errs; locked = true;
    const sibs = sys.branches.filter(b => b.ch === br.ch), k = sibs.findIndex(b => b.id === id) + 1;
    coach.innerHTML = coachSay('talk', `<p class="vhead">${br.role ? `<span class="ltype ${br.role}">${roleLabel(br.role)}</span>` : ''}<small>${esc(br.ch!)}, variante ${k} sur ${sibs.length}</small></p>
      <p class="lead">${esc(nb(lineTitle(br.titre)))}</p>${br.intro ? `<p>${esc(nb(br.intro))}</p>` : ''}`);
    actions.innerHTML = '<button class="btn pri" id="bGo">Montre-moi la variante</button><button class="btn" id="bAlt">Je la connais, à moi de jouer</button>';
    $('#bGo', actions).onclick = () => begin(true); $('#bAlt', actions).onclick = () => begin(false);
  }

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
    const nextId = S?.ordered ? remaining()[0] : null;
    coach.innerHTML = coachSay(errs === 0 ? 'party' : 'idle', `<div class="done"><p class="big">${errs === 0 ? (course ? 'Variante sans faute' : 'Ligne sans faute') : plural(errs, 'erreur')}</p><p>${verdict}</p>${nextId ? `<p class="why">Ensuite : ${esc(lineTitle(BR[nextId].br.titre))}</p>` : ''}${S ? `<p class="why">${esc(S.label)} : ${left ? `encore ${course ? plural(left, 'variante') : plural(left, 'ligne')}` : 'séance terminée'}.</p>` : ''}</div>`);
    actions.innerHTML = `${next ? `<a class="btn pri" href="${next}">${course ? 'Variante suivante' : 'Ligne suivante'}</a>` : S ? `<a class="btn pri" href="${S.back}">${S.lesson ? 'Voir le bilan' : 'Terminer'}</a>` : ''}<a class="btn${next || S || plan ? '' : ' pri'}" href="${lineUrl(id, 'drill')}" id="bAgain">Refaire</a><a class="btn${plan ? ' pri' : ''}" href="${listUrl}">${plan ? 'Voir le plan' : 'Liste'}</a>`; XS.available(true);
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
