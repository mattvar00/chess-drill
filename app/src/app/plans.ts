/** Plans : animations pas à pas des idées de chaque ouverture, et plans par structure de pions (avec tes statistiques, tes parties et tes fautes). */
import { Chess, tryMove, type Move } from '../core/chess';
import { STRUCT, STRUCTS, gameStructure, type Structure } from '../core/structures';
import { structureStats } from '../core/stats';
import { Board, miniBoard } from '../ui/board';
import { $, esc, icon, plural } from '../ui/dom';
import { PLANS, planBranch, store, type Plan } from './store';
import { lineUrl } from './session';
import { gameRow, gameUrl } from './games';
import { explorerSlot } from './explorer';
import { startCycle } from './wood';

const chev = icon('chev', 'chev');
const planRow = (P: Plan) => `<a class="rowi" href="#/plan/${P.id}"><span class="chip ${P.side}"></span><span class="body"><b>${esc(P.title)}</b><small>${esc(P.sub)}, ${plural(P.steps.length, 'étape')}</small></span>${(store.state.planDone as Record<string, unknown> | undefined)?.[P.id] ? icon('check', 'tick') : ''}${chev}</a>`;
export const planTitle = (id: string) => PLANS.find(p => p.id === id)?.title ?? 'Plan';

/* ---------- liste des plans animés ---------- */
export function viewPlans(root: HTMLElement, ids?: string[]) {
  const list = ids ? PLANS.filter(p => ids.includes(p.id)) : PLANS, cats = [...new Set(list.map(p => p.cat))];
  root.innerHTML = `<p class="intro">Chaque animation montre le plan type d'une ouverture : les ruptures, les cases clés, les pièces à échanger. Tu rejoues d'abord la ligne, puis le plan se déroule étape par étape.</p>
    ${cats.map(c => `<section class="grp"><h2>${esc(c)}</h2><div class="surf card list">${list.filter(p => p.cat === c).map(planRow).join('')}</div></section>`).join('')}
    <div class="surf card list"><a class="rowi" href="#/structures"><span class="ico">${icon('pawn')}</span><span class="body"><b>Plans par structure de pions</b><small>Tes structures, ton score dans chacune, et tes fautes à y rejouer</small></span>${chev}</a></div>`;
}

/* ---------- un plan animé ---------- */
function positionAt(P: Plan, ply: number): { game: Chess; last: Move | null } {
  const game = new Chess(); let last: Move | null = null; for (let i = 0; i < ply; i++) last = tryMove(game, P.sans[i]); return { game, last };
}

export function mountPlan(root: HTMLElement, id: string, skipIntro: boolean): () => void {
  const P = PLANS.find(x => x.id === id); if (!P) { root.innerHTML = '<section class="empty"><p>Ce plan n\'existe plus.</p><a class="btn" href="#/plans">Tous les plans</a></section>'; return () => { /* rien */ }; }
  const done = (store.state.planDone as Record<string, { errs: number }> | undefined)?.[P.id];
  if (!skipIntro && !done) {
    const lastPly = P.steps[P.steps.length - 1].p, mine = Math.ceil((P.side === 'w' ? lastPly : lastPly - 1) / 2), { game } = positionAt(P, P.steps[0].p);
    root.innerHTML = `<section class="surf today"><div class="today-top"><div class="today-text"><p class="label">${esc(P.cat)}</p><h2>${esc(P.title)}</h2><p>${esc(P.sub)}</p></div>${miniBoard(game, P.side)}</div>
      <p>Avant de voir le plan, rejoue la ligne avec les ${P.side === 'w' ? 'Blancs' : 'Noirs'} : ${plural(mine, 'coup')} jusqu'à la position clé. L'adversaire joue tout seul.</p>
      <a class="btn pri block" href="${lineUrl(planBranch(P.id), 'drill')}">Jouer la ligne</a><a class="btn block" href="#/plan/${P.id}?vu=1">Voir directement le plan</a></section>`;
    return () => { /* rien */ };
  }
  // `i` : l'étape affichée ; `at` : le demi-coup affiché. Entre deux étapes, les coups se jouent un par un, pour qu'aucun ne soit sauté.
  let i = 0, at = P.steps[0].p, auto = false, timer: ReturnType<typeof setTimeout> | undefined;
  root.innerHTML = `<div class="trainer plan">
    <div class="tboard"><div id="board"></div><div class="stepper" id="stepper"></div></div>
    <div class="tside"><div id="xp" hidden></div><div class="tmain" id="tmain">
      <div class="coach" aria-live="polite"><p class="meta" id="mv"></p><p class="moves mseg" id="seg"></p><p id="cap"></p></div>
      <div class="explnav three"><button class="btn" id="bPrev" aria-label="Étape précédente">${icon('back')}</button><button class="btn" id="bPlay"></button><button class="btn" id="bNext" aria-label="Étape suivante">${icon('chev')}</button></div>
      <div class="row"><a class="btn" href="${lineUrl(planBranch(P.id), 'drill')}">${done ? 'Rejouer la ligne' : 'Jouer la ligne'}</a></div>
      ${done ? `<p class="hint">Ligne déjà jouée${done.errs ? `, ${plural(done.errs, 'erreur')} la dernière fois` : ' sans faute'}.</p>` : ''}
      <details class="help"><summary>Toute la ligne et les sources</summary><p class="line">${P.sans.map((s, k) => (k % 2 === 0 ? `${k / 2 + 1}.` : '') + esc(s)).join(' ')}</p>
        <p>Idées tirées de : ${P.src.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>`).join(', ')}. Chaque coup est vérifié au moteur.</p></details>
    </div></div></div>`;
  const board = new Board($('#board', root), { movable: () => XS.active()?.movable() ?? null, onMove: m => XS.active()?.onMove(m) });
  const XS = explorerSlot(board, () => $('#tmain', root), () => $('#xp', root), () => { stop();
    return { fen: positionAt(P, at).game.fen(), orient: P.side, lines: at < P.sans.length ? [{ label: 'Suite de la ligne', sans: P.sans.slice(at) }] : [] }; }, () => draw());
  XS.available(true);
  const play = $('#bPlay', root), MOVE_MS = 650, READ_MS = 4000;
  /** Premier demi-coup du tronçon qui mène à l'étape `k` : les coups joués depuis l'étape précédente. */
  const segStart = (k: number) => k ? P.steps[k - 1].p : Math.max(0, P.steps[0].p - 4);
  const draw = (animate = false) => {
    const S = P.steps[i], onStep = at === S.p, { game, last } = positionAt(P, at), from = segStart(i);
    board.set(game, P.side, last, animate);
    board.overlay(onStep ? { arrows: S.a.map(([f, t]) => ({ from: f, to: t, cls: 'plan' })), marks: S.h.map(sq => ({ sq, cls: 'key' })) } : { arrows: [], marks: [] });
    $('#mv', root).textContent = `Étape ${i + 1} sur ${P.steps.length}${i ? ', les coups joués depuis la précédente' : ', les derniers coups de la ligne'}`;
    $('#seg', root).innerHTML = P.sans.slice(from, S.p).map((san, k) => { const n = from + k;
      return `${n % 2 === 0 ? `<span class="n">${n / 2 + 1}.</span>` : k === 0 ? `<span class="n">${(n + 1) / 2}…</span>` : ''}<button type="button" class="m${n + 1 === at ? ' cur' : n + 1 > at ? ' fut' : ''}" data-ply="${n + 1}">${esc(san)}</button> `; }).join('');
    const cap = $('#cap', root); cap.textContent = S.c; cap.classList.toggle('wait', !onStep);
    $('#stepper', root).innerHTML = P.steps.map((_, k) => `<i class="${k < i ? 'ok' : k === i ? 'cur' : ''}"></i>`).join('');
  };
  const setPlay = () => { play.innerHTML = auto ? 'Pause' : 'Lecture'; play.setAttribute('aria-label', auto ? 'Mettre en pause' : 'Lire le plan'); };
  const stop = () => { clearTimeout(timer); timer = undefined; auto = false; setPlay(); };
  /** Joue un coup, puis le suivant, jusqu'à la position de l'étape ; en lecture, enchaîne ensuite sur l'étape suivante. */
  const tick = () => { timer = undefined;
    if (at < P.steps[i].p) { at++; draw(true); timer = setTimeout(tick, at < P.steps[i].p ? MOVE_MS : auto ? READ_MS : 0); return; }
    if (auto) { if (i < P.steps.length - 1) { i++; tick(); } else stop(); } };
  const next = () => { if (at < P.steps[i].p) { clearTimeout(timer); timer = undefined; at = P.steps[i].p; draw(); return; }   // un deuxième appui va droit à l'étape
    if (i < P.steps.length - 1) { i++; tick(); } };
  const prev = () => { if (at === P.steps[i].p && i > 0) i--; at = P.steps[i].p; draw(); };
  $('#bPrev', root).onclick = () => { stop(); prev(); }; $('#bNext', root).onclick = () => { stop(); next(); };
  $('#seg', root).addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ply]'); if (!b) return; stop(); at = +b.dataset.ply!; draw(); });
  play.onclick = () => { if (auto) return stop(); auto = true; setPlay();
    if (i >= P.steps.length - 1 && at === P.steps[i].p) { i = 0; at = P.steps[0].p; draw(); timer = setTimeout(tick, READ_MS); } else if (at < P.steps[i].p) tick(); else timer = setTimeout(tick, 600); };
  const onKey = (e: KeyboardEvent) => { if (XS.active()) return; if (e.key === 'ArrowRight') { stop(); next(); } if (e.key === 'ArrowLeft') { stop(); prev(); } };
  document.addEventListener('keydown', onKey);
  stop(); draw();
  return () => { XS.destroy(); clearTimeout(timer); board.destroy(); document.removeEventListener('keydown', onKey); };
}

/* ---------- structures de pions ---------- */
const analysed = () => store.games.filter(g => g.st && g.wp && !store.state.ignored[g.id]);
function structRow(s: Structure, o?: ReturnType<typeof structureStats>[string]) {
  const gap = o ? o.errMe - o.errOp : 0;
  const sub = o ? `${plural(o.n, 'partie')}, score ${o.score} %, ${gap > 2 ? `<em class="warn">${Math.round(gap)} points d'erreurs de plus que tes adversaires</em>` : gap < -2 ? `${Math.round(-gap)} points d'erreurs de moins que tes adversaires` : "autant d'erreurs que tes adversaires"}` : esc(s.fam);
  return `<a class="rowi" href="#/structure/${s.id}"><span class="body"><b>${esc(s.name)}</b><small>${sub}</small></span>${chev}</a>`;
}
export function viewStructs(root: HTMLElement) {
  const S = structureStats(analysed()), mine = Object.entries(S).sort((a, b) => b[1].n - a[1].n);
  root.innerHTML = `<p class="intro">Les plans viennent de la structure de pions. L'app reconnaît la structure de chacune de tes parties au 12ᵉ coup, mesure comment tu t'en sors, et t'entraîne sur ses plans avec tes propres positions.</p>
    ${mine.length ? `<section class="grp"><h2>Tes structures</h2><div class="surf card list">${mine.map(([id, o]) => structRow(STRUCT[id], o)).join('')}</div></section>` : '<p class="hint">Tes structures apparaissent ici dès que des parties sont analysées.</p>'}
    <section class="grp"><h2>Toutes les structures</h2><div class="surf card list">${STRUCTS.filter(s => !S[s.id]).map(s => structRow(s)).join('')}</div></section>`;
}
const keySquares = (s: Structure) => s.key.match(/\b[a-h][1-8]\b/g) ?? [];

export function mountStruct(root: HTMLElement, id: string): () => void {
  const s = STRUCT[id]; if (!s) { root.innerHTML = '<section class="empty"><p>Structure inconnue.</p><a class="btn" href="#/structures">Toutes les structures</a></section>'; return () => { /* rien */ }; }
  const o = structureStats(analysed())[id], games = o?.games ?? [], side = games.length ? (games.filter(g => g.color === 'w').length >= games.length / 2 ? 'w' : 'b') : 'w';
  const ex = games[0], st = ex ? gameStructure(ex.sans) : null;
  const gids = new Set(games.map(g => g.id)), faults = store.faults.filter(f => gids.has(f.game));
  const plan = (c: 'w' | 'b') => `<section class="grp"><h2>${c === 'w' ? 'Plan des Blancs' : 'Plan des Noirs'}${c === side && games.length ? ', ton camp le plus souvent' : ''}</h2><div class="surf card padded"><ol class="plan-list">${(c === 'w' ? s.w : s.b).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></section>`;
  const anims = s.anim.filter(a => PLANS.some(p => p.id === a));
  root.innerHTML = `${st ? `<div class="trainer struct"><div class="tboard"><div id="board"></div></div><div class="tside"><div id="xp" hidden></div><div class="tmain" id="tmain">` : '<div><div>'}
    <p class="meta">${ex ? `Position de ta partie contre <b>${esc(ex.opp)}</b>, coup 12. ` : ''}Cases clés : ${esc(s.key)}.</p>
    ${o ? `<div class="surf card stats"><div><b>${o.n}</b><span>${o.n > 1 ? 'parties' : 'partie'}</span></div><div><b>${o.score} %</b><span>de score</span></div><div><b>${Math.round(o.errMe)} / ${Math.round(o.errOp)} %</b><span>coups ratés, toi / eux</span></div></div>` : ''}
    ${o && o.n >= 3 ? `<p class="insight">${o.delta <= -5 ? `Dans cette structure, tu perds en moyenne ${-o.delta} points de chances entre les coups 8 et 20.` : o.delta >= 5 ? `Dans cette structure, tu gagnes en moyenne ${o.delta} points de chances entre les coups 8 et 20.` : 'Tes chances restent stables entre les coups 8 et 20.'}</p>` : ''}
    ${faults.length ? `<button class="btn pri block" id="bStFaults">${icon('target')}Rejouer tes ${plural(faults.length, 'faute')} dans cette structure</button>` : ''}
    ${plan(side)}${plan(side === 'w' ? 'b' : 'w')}
    ${anims.length ? `<section class="grp"><h2>Plans animés</h2><div class="surf card list">${anims.map(a => planRow(PLANS.find(p => p.id === a)!)).join('')}</div></section>` : ''}
    ${games.length ? `<section class="grp"><h2>Tes parties dans cette structure</h2><div class="surf card list">${games.slice(0, 15).map(g => gameRow(g, `#/structure/${id}`).replace(gameUrl(g.id, undefined, `#/structure/${id}`), gameUrl(g.id, gameStructure(g.sans)?.ply, `#/structure/${id}`))).join('')}</div></section>` : ''}
    <p class="foot">Coups ratés : part des coups 9 à 25 qui font perdre au moins 10 points de chances de gain.</p>
  ${st ? '</div></div></div>' : '</div></div>'}`;
  root.querySelector('#bStFaults')?.addEventListener('click', () => startCycle(s.name, faults));
  let board: Board | null = null, XS: ReturnType<typeof explorerSlot> | null = null;
  if (st && ex) {
    const b = board = new Board($('#board', root), { movable: () => XS?.active()?.movable() ?? null, onMove: m => XS?.active()?.onMove(m) });
    const show = () => { b.set(new Chess(st.fen), ex.color); b.overlay({ marks: keySquares(s).map(sq => ({ sq, cls: 'key' })) }); }; show();
    XS = explorerSlot(b, () => $('#tmain', root), () => $('#xp', root), () => ({ fen: st.fen, orient: ex.color, lines: [{ label: 'Suite de ta partie', sans: ex.sans.slice(st.ply, st.ply + 10) }] }), show);
    XS.available(true);
  }
  return () => { XS?.destroy(); board?.destroy(); };
}
