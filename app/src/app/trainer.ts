/** Travail d'une ligne du répertoire : Drill (de mémoire) ou Voir la ligne (ligne commentée). */
import { Chess, tryMove, uciOf, uciToObj, type Move } from '../core/chess';
import { isValid, scheduleBranch } from '../core/schedule';
import { isUserPly, theoryStart } from '../core/drill';
import type { Game } from '../core/types';
import { Board } from '../ui/board';
import { SFX } from '../ui/sound';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, markActive, markPlan, plansFor, refreshDevs, save, setLastLesson, store } from './store';
import { syncSoon } from './api';
import { lineUrl, nextUrl, remaining, session } from './session';
import { explorerSlot } from './explorer';
import { passed, trunkOf } from '../core/path';
import { lineTitle, tell } from '../core/names';
import { coachSay, type Mood } from '../ui/coach';

/**
 * Méthode du cours (lignes rangées en chapitres), pour une variante pas encore réussie. Un seul passage continu depuis le premier coup :
 * les coups déjà connus, tu les rejoues de mémoire ; à partir du coup adverse qui ouvre la variante, le coach dit en deux phrases
 * pourquoi jouer quoi, sans rien arrêter. La variante finie, tu la rejoues de mémoire : c'est ce passage qui compte.
 * Une variante déjà sue se rejoue simplement en entier.
 */
/** Nom de la séance de lignes du plan du jour. */
export const PLAN_LINES = 'Plan du jour';
/** Félicitations du coach de mémoire, qui tournent pour ne pas se répéter. */
const BRAVO = ['Bien joué', 'Exact', 'Parfait', "C'est ça", 'Bien vu', 'Oui', 'Joli', 'Tout juste'];
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
  const course = mode === 'drill' && !fromGame && !!br.ch;
  const trunk = course ? trunkOf(moves, sys.branches.filter(o => o.id !== id && o.ch && (passed(store.state.br[o.id]) || S?.done.has(o.id))).map(o => o.moves), side) : 0;
  /** `learn` : premier passage d'une variante jamais jouée de mémoire. Le coach dit chaque coup nouveau et pourquoi ; rien n'est noté. */
  let learn = course && !store.state.br[id]?.runs;   // déjà tentée de mémoire, même ratée : on la retente directement
  // le coach en haut, au-dessus de l'échiquier, sur téléphone : on lit, puis on joue
  if (course) { const t = $('.trainer', root); t.classList.add('cours'); if (matchMedia('(max-width:899px)').matches) { coach.classList.add('ctop'); t.insertBefore(coach, t.firstChild); } }

  const xa = () => XS.active();
  const board = new Board($('#board', root), {
    movable: () => xa() ? xa()!.movable() : mode === 'drill' && !locked && !finished && game.turn() === side ? side : null,
    onMove: m => xa() ? xa()!.onMove(m) : userMove(m),
  });
  /** Explorateur (bouton de la barre du haut) : toute la ligne depuis le premier coup, ouverte sur la position affichée ; on recule, on avance, on joue ses propres coups. */
  const XS = explorerSlot(board, () => $('#tmain', root), () => $('#xp', root),
    () => ({ fen: new Chess().fen(), orient: side, lines: [{ label: course ? 'La variante' : 'La ligne', sans: moves.map(m => m.san) }], start: ply }), () => show());
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
    if (!ply) say('you', esc(sys.titre), `<p class="why">${esc(br.intro ?? sys.resume)}</p><p class="why">Avance avec les flèches, à l'écran ou au clavier. Les coups soulignés portent un commentaire.</p>`);
    else { const note = br.notes[ply - 1]; say('', `${num(ply - 1)}${esc(moves[ply - 1].san)}`, note ? `<p>${esc(note)}</p>` : '<p class="why">Coup de la ligne.</p>'); }
    actions.innerHTML = ply >= moves.length ? `<a class="btn pri" href="${lineUrl(id, 'drill')}">Passer au drill</a>` : '';
  }
  const onKey = (e: KeyboardEvent) => { if (mode !== 'explore' || xa()) return; if (e.key === 'ArrowRight') explTo(ply + 1); if (e.key === 'ArrowLeft') explTo(ply - 1); };

  /* ---------- Drill ---------- */
  function drillActions() {
    if (course) { actions.innerHTML = `<button class="btn" id="bHint">${icon('bulb')}Indice</button>`; $('#bHint', actions).onclick = hint; return; }
    actions.innerHTML = `<button class="btn" id="bHint">${icon('bulb')}Indice</button><a class="btn" href="${lineUrl(id, 'drill')}" id="bRestart">${icon('restart')}Recommencer</a>${Object.keys(br.notes).length && ply < theoryStart(br.notes, side) ? '<button class="btn" id="bSkip">Aller à la théorie</button>' : ''}`;
    $('#bHint', actions).onclick = hint; const sk = $('#bSkip', actions); if (sk) sk.onclick = skip;
    $('#bRestart', actions).onclick = e => { e.preventDefault(); remount(); };
  }
  const nb = (t: string) => t.replace(/ ([:?!;])/g, '\u00a0$1');
  const bare = (note?: string) => { const t = (note ?? '').replace(/^[^:]*:\s*/, ''); return nb(t.charAt(0).toUpperCase() + t.slice(1)); };
  /** Ce que dit le coach avant un nouveau coup : pourquoi, puis quoi jouer, en mots. */
  /** Coupe un texte en bulles d'environ 80 caractères, à la fin d'une phrase. */
  const pages = (t: string, max = 80) => { const out: string[] = []; for (const s of t.split(/(?<=[.!?…])\s+/)) { if (out.length && (out[out.length - 1] + ' ' + s).length <= max) out[out.length - 1] += ' ' + s; else out.push(s); } return out; };
  /** Le coach parle. Un texte long passe en plusieurs bulles : on touche la bulle pour la suite ; `tail` (la consigne) reste affiché. */
  function talk(mood: Mood, head: string, text: string, tail = '', max = 80) {
    const pg = text ? pages(text, max) : ['']; let k = 0;
    const paint = () => { coach.innerHTML = coachSay(mood, `${k ? '' : head}${pg[k] ? `<p>${esc(pg[k])}${pg.length > 1 ? ` <button class="cnext" aria-label="Suite">${k + 1}/${pg.length}${k < pg.length - 1 ? ' ›' : ''}</button>` : ''}</p>` : ''}${tail}`);
      if (pg.length > 1) $('.cbub', coach).onclick = () => { k = (k + 1) % pg.length; paint(); }; };
    paint();
  }
  const doLine = (i: number) => `<p class="do">${esc(tell(moves[i]))}</p>`;
  function prompt() {
    if (ply >= moves.length) return end();
    if (course) {
      // une faute de l'adversaire porte sa marque sur sa case : « ? », « ?? », « ?! »
      const mk = br.marks?.[ply - 1]; if (mk && last) board.mark({ sq: last.to, text: mk, cls: mk === '??' ? 'blunder' : mk === '?!' ? 'inacc' : 'mistake', label: 'Erreur de ton adversaire' });
      if (learn && ply >= trunk) talk('talk', '', bare(br.notes[ply]), doLine(ply));   // un coup nouveau : le coach l'explique, sans rien arrêter
      // de mémoire : après un bon coup, le coach dit en une phrase ce que ce coup faisait, pendant que tu cherches le suivant
      else if (ply >= 2 && steps[ply - 2] === 'ok' && br.notes[ply - 2]) talk('happy', `<p class="lead ok">${BRAVO[(ply + id.length) % BRAVO.length]}, ${esc(moves[ply - 2].san)} !</p>`, bare(br.notes[ply - 2]));
      else say('you', `<i class="stm ${side}"></i>À toi`, learn ? '<p class="why">Tu connais ce coup.</p>' : ply <= 1 ? `<p class="why">${esc(nb(lineTitle(br.titre)))}</p>` : '');
      return drillActions();
    }
    const key = br.notes[ply] ? ` <span class="tag">${br.type === 'punir' ? 'la punition' : br.type === 'bon' ? 'le bon coup' : 'coup clé'}</span>` : '', turn = `<i class="stm ${side}"></i>À toi de jouer`;
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
      if (S && !learn) { S.combo++; S.best = Math.max(S.best, S.combo); }
      if (!course) say('ok', `${icon('check')}${num(ply)}${esc(want.san)}`, lastNote ? `<p>${esc(lastNote)}</p>` : `<p class="why">${PRAISE[ply % PRAISE.length]}</p>`);
      ply++; show(true); board.flash(m.to, 'good'); paintMoves(); paintStepper();
      if (ply >= moves.length) return end();
      locked = true; timer = setTimeout(reply, course ? 320 : 220);
    } else if (course) {
      // en découverte une erreur ne coûte rien ; de mémoire elle compte, et le coach rappelle l'idée du coup attendu
      if (!learn) { miss(); if (S) S.combo = 0; } wrongHere++; show(); board.flash(m.to, 'bad');
      // une faute que tout le monde fait ici : le coach dit pourquoi elle est fausse ; sinon il rappelle l'idée du bon coup
      const why = br.wrong?.[ply]?.[uciOf(m)];
      talk('oops', `<p class="lead bad">${why ? 'Erreur classique.' : 'Pas celui-là.'}</p>`, why ? nb(why) : bare(br.notes[ply]), learn ? doLine(ply) : '');
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
  /** 1er indice : la pièce à jouer. 2e : le coup entier, et il compte alors comme une erreur. En découverte, l'indice montre le coup et ne coûte rien. */
  function hint() {
    if (finished || locked || game.turn() !== side) return; const uci = moves[ply].uci; hintLevel++;
    if (learn) return board.hint([uci.slice(0, 2), uci.slice(2, 4)]);
    if (hintLevel >= 2) { miss(); if (S) S.combo = 0; }
    board.hint(hintLevel >= 2 ? [uci.slice(0, 2), uci.slice(2, 4)] : [uci.slice(0, 2)]);
  }
  function playTo(target: number) { while (ply < target) { steps[ply] ??= 'ok'; apply(ply); ply++; } show(); paintMoves(); paintStepper(); }
  function skip() { playTo(theoryStart(br.notes, side)); if (game.turn() !== side) { locked = true; timer = setTimeout(reply, 220); } else prompt(); }

  /* ---------- Méthode du cours ---------- */
  /** Fin des coups. Après la découverte, on rejoue la variante de mémoire, depuis le premier coup : c'est ce passage qui compte. */
  function end() {
    if (!learn) return finish(); locked = true; SFX.done();
    talk('happy', '<p class="lead">Variante vue.</p>', `${br.bilan ?? ''} Maintenant, rejoue-la sans aide.`.trim(), '', 120);
    actions.innerHTML = '<button class="btn pri" id="bGo">À toi, de mémoire</button>';
    $('#bGo', actions).onclick = () => {
      clearTimeout(timer); learn = false; game = new Chess(); last = null; ply = 0; steps.length = 0; errs = 0; wrongHere = 0; hintLevel = 0; lastNote = null; locked = false;
      show(); paintMoves(); paintStepper(); if (game.turn() !== side) { locked = true; timer = setTimeout(reply, 350); } else prompt();
    };
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
    if (course) {
      talk(errs === 0 ? 'party' : 'idle', `<p class="lead ${errs ? 'bad' : 'ok'}">${errs === 0 ? 'Variante validée' : `Pas encore validée : ${plural(errs, 'erreur')}`}</p>`,
        `${br.bilan ?? ''}${errs ? ' Elle reviendra.' : ''}`.trim(), S ? `<p class="why">${left ? `Encore ${left} dans ce chapitre.` : 'Chapitre terminé.'}</p>` : '', 120);
      // toujours le même écran entre deux variantes : où tu en es dans le chapitre, ce qui vient, et le plan s'il y en a un
      const chap = sys.branches.filter(b => b.ch === br.ch), nid = S?.ordered ? remaining()[0] : null, stop = S?.exit ?? listUrl;
      const info = `<p class="cinfo"><span class="cdots" aria-hidden="true">${chap.map(b => `<i class="${passed(store.state.br[b.id]) ? 'ok' : ''}${b.id === id ? ' now' : ''}"></i>`).join('')}</span><span>${esc(br.ch!)} : ${chap.filter(b => passed(store.state.br[b.id])).length} sur ${chap.length}</span>${nid ? `<span class="nx">Ensuite : ${esc(lineTitle(BR[nid].br.titre))}</span>` : ''}</p>`;
      const planBtn = !errs && br.role === 'theorie' && plansFor(sys.id).length ? `<a class="btn" href="#/plans?o=${sys.id}&r=${encodeURIComponent(next ?? stop)}">Voir le plan</a>` : '';
      actions.innerHTML = `${info}${next ? `<a class="btn pri" href="${next}">Suivante</a>` : S ? `<a class="btn pri" href="${S.back}">${S.lesson ? 'Chapitre terminé' : 'Terminer'}</a>` : `<a class="btn pri" href="${stop}">Retour au cours</a>`}${errs ? `<a class="btn" href="${lineUrl(id, 'drill')}" id="bAgain">Refaire</a>` : planBtn}${next ? `<a class="btn" href="${stop}">Arrêter là</a>` : ''}`;
    } else {
    coach.innerHTML = coachSay(errs === 0 ? 'party' : 'idle', `<div class="done"><p class="big">${errs === 0 ? 'Ligne sans faute' : plural(errs, 'erreur')}</p><p>${verdict}</p>${S ? `<p class="why">${esc(S.label)} : ${left ? `encore ${plural(left, 'ligne')}` : 'séance terminée'}.</p>` : ''}</div>`);
    actions.innerHTML = `${next ? `<a class="btn pri" href="${next}">Ligne suivante</a>` : S ? `<a class="btn pri" href="${S.back}">${S.lesson ? 'Voir le bilan' : 'Terminer'}</a>` : ''}<a class="btn${next || S || plan ? '' : ' pri'}" href="${lineUrl(id, 'drill')}" id="bAgain">Refaire</a><a class="btn${plan ? ' pri' : ''}" href="${listUrl}">${plan ? 'Voir le plan' : 'Liste'}</a>`;
    }
    XS.available(true);
    const again = actions.querySelector<HTMLElement>('#bAgain'); if (again) again.onclick = e => { e.preventDefault(); remount(); };
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
