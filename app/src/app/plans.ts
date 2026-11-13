/** Plans : animations pas à pas des idées de chaque ouverture, et plans par structure de pions (avec tes statistiques et un quiz). */
import { Chess, tryMove, type Move } from '../core/chess';
import { STRUCT, STRUCTS, gameStructure, type Structure } from '../core/structures';
import { structureStats } from '../core/stats';
import { Board, miniBoard } from '../ui/board';
import { SFX } from '../ui/sound';
import { $, esc, icon, plural } from '../ui/dom';
import { PLANS, planBranch, store, type Plan } from './store';
import { lineUrl } from './session';
import { gameRow, gameUrl } from './games';
import { exploreButton, openExplorer, type Explorer } from './explorer';

const chev = icon('chev', 'chev');
const planRow = (P: Plan) => `<a class="rowi" href="#/plan/${P.id}"><span class="chip ${P.side}"></span><span class="body"><b>${esc(P.title)}</b><small>${esc(P.sub)}, ${plural(P.steps.length, 'étape')}</small></span>${(store.state.planDone as Record<string, unknown> | undefined)?.[P.id] ? icon('check', 'tick') : ''}${chev}</a>`;
export const planTitle = (id: string) => PLANS.find(p => p.id === id)?.title ?? 'Plan';

/* ---------- liste des plans animés ---------- */
export function viewPlans(root: HTMLElement, ids?: string[]) {
  const list = ids ? PLANS.filter(p => ids.includes(p.id)) : PLANS, cats = [...new Set(list.map(p => p.cat))];
  root.innerHTML = `<p class="intro">Chaque animation montre le plan type d'une ouverture : les ruptures, les cases clés, les pièces à échanger. Tu rejoues d'abord la ligne, puis le plan se déroule étape par étape.</p>
    ${cats.map(c => `<section class="grp"><h2>${esc(c)}</h2><div class="surf card list">${list.filter(p => p.cat === c).map(planRow).join('')}</div></section>`).join('')}
    <div class="surf card list"><a class="rowi" href="#/structures"><span class="ico">${icon('pawn')}</span><span class="body"><b>Plans par structure de pions</b><small>Les plans viennent de la structure : les tiens, avec un quiz sur tes positions</small></span>${chev}</a></div>`;
}

/* ---------- un plan animé ---------- */
function positionAt(P: Plan, ply: number): { game: Chess; last: Move | null } {
  const game = new Chess(); let last: Move | null = null; for (let i = 0; i < ply; i++) last = tryMove(game, P.sans[i]); return { game, last };
}
const recent = (P: Plan, ply: number) => { const from = Math.max(0, ply - 6), out: string[] = [];
  for (let i = from; i < ply; i++) out.push((i % 2 === 0 ? `${i / 2 + 1}.` : i === from ? `${Math.ceil(i / 2)}…` : '') + P.sans[i]); return out.join(' '); };

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
  let i = 0, timer: ReturnType<typeof setInterval> | undefined;
  root.innerHTML = `<div class="trainer plan">
    <div class="tboard"><div id="board"></div><div class="stepper" id="stepper"></div></div>
    <div class="tside"><div id="xp" hidden></div><div class="tmain" id="tmain">
      <div class="coach" aria-live="polite"><p class="meta" id="mv"></p><p id="cap"></p></div>
      <div class="explnav three"><button class="btn" id="bPrev" aria-label="Étape précédente">${icon('back')}</button><button class="btn" id="bPlay"></button><button class="btn" id="bNext" aria-label="Étape suivante">${icon('chev')}</button></div>
      <div class="row"><a class="btn" href="${lineUrl(planBranch(P.id), 'drill')}">${done ? 'Rejouer la ligne' : 'Jouer la ligne'}</a>${exploreButton()}</div>
      ${done ? `<p class="hint">Ligne déjà jouée${done.errs ? `, ${plural(done.errs, 'erreur')} la dernière fois` : ' sans faute'}.</p>` : ''}
      <details class="help"><summary>Toute la ligne et les sources</summary><p class="line">${P.sans.map((s, k) => (k % 2 === 0 ? `${k / 2 + 1}.` : '') + esc(s)).join(' ')}</p>
        <p>Idées tirées de : ${P.src.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>`).join(', ')}. Chaque coup est vérifié au moteur.</p></details>
    </div></div></div>`;
  let X: Explorer | null = null;
  const board = new Board($('#board', root), { movable: () => X?.movable() ?? null, onMove: m => X?.onMove(m) });
  $('#bExplore', root).onclick = () => { stop(); const ply = P.steps[i].p;
    X = openExplorer(board, $('#tmain', root), $('#xp', root), { fen: positionAt(P, ply).game.fen(), orient: P.side, lines: ply < P.sans.length ? [{ label: 'Suite de la ligne', sans: P.sans.slice(ply) }] : [] }, () => { X = null; draw(); }); };
  const play = $('#bPlay', root);
  const draw = (animate = false) => {
    const S = P.steps[i], { game, last } = positionAt(P, S.p);
    board.set(game, P.side, last, animate);
    board.overlay({ arrows: S.a.map(([from, to]) => ({ from, to, cls: 'plan' })), marks: S.h.map(sq => ({ sq, cls: 'key' })) });
    $('#cap', root).textContent = S.c; $('#mv', root).textContent = `Étape ${i + 1} sur ${P.steps.length}, après ${recent(P, S.p)}`;
    $('#stepper', root).innerHTML = P.steps.map((_, k) => `<i class="${k < i ? 'ok' : k === i ? 'cur' : ''}"></i>`).join('');
  };
  const stop = () => { clearInterval(timer); timer = undefined; play.innerHTML = 'Lecture'; play.setAttribute('aria-label', 'Lire le plan'); };
  const step = (d: number) => { const j = Math.max(0, Math.min(P.steps.length - 1, i + d)); if (j !== i) { i = j; draw(d === 1); } };
  $('#bPrev', root).onclick = () => { stop(); step(-1); }; $('#bNext', root).onclick = () => { stop(); step(1); };
  play.onclick = () => { if (timer) return stop(); if (i >= P.steps.length - 1) { i = 0; draw(); }
    play.innerHTML = 'Pause'; play.setAttribute('aria-label', 'Mettre en pause');
    timer = setInterval(() => { if (i < P.steps.length - 1) step(1); else stop(); }, 4500); };
  const onKey = (e: KeyboardEvent) => { if (X) return; if (e.key === 'ArrowRight') { stop(); step(1); } if (e.key === 'ArrowLeft') { stop(); step(-1); } };
  document.addEventListener('keydown', onKey);
  stop(); draw();
  return () => { X?.destroy(); clearInterval(timer); board.destroy(); document.removeEventListener('keydown', onKey); };
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
  const plan = (c: 'w' | 'b') => `<section class="grp"><h2>${c === 'w' ? 'Plan des Blancs' : 'Plan des Noirs'}${c === side && games.length ? ', ton camp le plus souvent' : ''}</h2><div class="surf card padded"><ol class="plan-list">${(c === 'w' ? s.w : s.b).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></section>`;
  const anims = s.anim.filter(a => PLANS.some(p => p.id === a));
  root.innerHTML = `${st ? `<div class="trainer struct"><div class="tboard"><div id="board"></div></div><div class="tside"><div id="xp" hidden></div><div class="tmain" id="tmain">` : '<div><div>'}
    <p class="meta">${ex ? `Position de ta partie contre <b>${esc(ex.opp)}</b>, coup 12. ` : ''}Cases clés : ${esc(s.key)}.</p>
    ${o ? `<div class="surf card stats"><div><b>${o.n}</b><span>${o.n > 1 ? 'parties' : 'partie'}</span></div><div><b>${o.score} %</b><span>de score</span></div><div><b>${Math.round(o.errMe)} / ${Math.round(o.errOp)} %</b><span>coups ratés, toi / eux</span></div></div>` : ''}
    ${games.length ? `<a class="btn pri block" href="#/structure/${id}/quiz">Quiz : quel est le plan ? (${Math.min(games.length, 10)} positions)</a>` : ''}
    ${st ? `<div class="row">${exploreButton()}</div>` : ''}
    ${plan(side)}${plan(side === 'w' ? 'b' : 'w')}
    ${anims.length ? `<section class="grp"><h2>Plans animés</h2><div class="surf card list">${anims.map(a => planRow(PLANS.find(p => p.id === a)!)).join('')}</div></section>` : ''}
    ${games.length ? `<section class="grp"><h2>Tes parties dans cette structure</h2><div class="surf card list">${games.slice(0, 15).map(g => gameRow(g, `#/structure/${id}`).replace(gameUrl(g.id, undefined, `#/structure/${id}`), gameUrl(g.id, gameStructure(g.sans)?.ply, `#/structure/${id}`))).join('')}</div></section>` : ''}
    <p class="foot">Coups ratés : part des coups 9 à 25 qui font perdre au moins 10 points de chances de gain.</p>
  ${st ? '</div></div></div>' : '</div></div>'}`;
  let board: Board | null = null, X: Explorer | null = null;
  if (st && ex) {
    const b = board = new Board($('#board', root), { movable: () => X?.movable() ?? null, onMove: m => X?.onMove(m) });
    const show = () => { b.set(new Chess(st.fen), ex.color); b.overlay({ marks: keySquares(s).map(sq => ({ sq, cls: 'key' })) }); }; show();
    $('#bExplore', root).onclick = () => { X = openExplorer(b, $('#tmain', root), $('#xp', root), { fen: st.fen, orient: ex.color, lines: [{ label: 'Suite de ta partie', sans: ex.sans.slice(st.ply, st.ply + 10) }] }, () => { X = null; show(); }); };
  }
  return () => { X?.destroy(); board?.destroy(); };
}

/* ---------- quiz : à la position de ta partie, retrouver le plan de ton camp parmi trois ---------- */
const shuffle = <T>(a: T[]) => { const b = [...a]; for (let k = b.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [b[k], b[j]] = [b[j], b[k]]; } return b; };
export function mountQuiz(root: HTMLElement, id: string, header: (title: string, sub: string) => void): () => void {
  const s = STRUCT[id], games = s ? (structureStats(analysed())[id]?.games ?? []).slice(0, 10) : [];
  if (!s || !games.length) { location.replace(`#/structure/${id}`); return () => { /* rien */ }; }
  let k = 0, ok = 0, board: Board | null = null, X: Explorer | null = null;
  const render = () => {
    X?.destroy(); X = null; board?.destroy(); board = null;
    if (k >= games.length) {
      header('Quiz terminé', s.name);
      root.innerHTML = `<div class="endwrap"><section class="endcard"><h1>${ok}/${games.length}</h1><p>${ok === games.length ? 'Tu connais le plan de cette structure.' : 'Relis les plans de la structure, puis revois tes parties à partir de cette position.'}</p>
        <div class="row"><a class="btn pri" href="#/structure/${id}">Retour à la structure</a></div></section></div>`; return;
    }
    const g = games[k], st = gameStructure(g.sans)!, mine = g.color, right = (mine === 'w' ? s.w : s.b)[0];
    const others = shuffle(STRUCTS.filter(x => x.id !== s.id && x.id !== 'open' && (mine === 'w' ? x.w : x.b)[0] !== right)).slice(0, 2).map(x => (mine === 'w' ? x.w : x.b)[0]);
    const opts = shuffle([right, ...others]);
    header('Quel est le plan ?', `Position ${k + 1} sur ${games.length}`);
    root.innerHTML = `<div class="trainer"><div class="tboard"><div id="board"></div></div><div class="tside"><div id="xp" hidden></div><div class="tmain" id="tmain">
      <p class="meta">Contre <b>${esc(g.opp)}</b>, coup 12, tu as les ${mine === 'w' ? 'Blancs' : 'Noirs'}.</p>
      <div class="coach"><p class="lead">${esc(s.name)}</p><p class="why">Quel est le plan principal de ton camp ?</p></div>
      <div class="opts">${opts.map((o, j) => `<button class="btn opt" data-j="${j}">${esc(o)}</button>`).join('')}</div>
      <div id="after"></div></div></div></div>`;
    const bd = board = new Board($('#board', root), { movable: () => X?.movable() ?? null, onMove: m => X?.onMove(m) }); bd.set(new Chess(st.fen), mine);
    root.querySelectorAll<HTMLButtonElement>('.opt').forEach(b => b.onclick = () => {
      const good = opts[+b.dataset.j!] === right; if (good) { ok++; SFX.done(); } else SFX.bad();
      root.querySelectorAll<HTMLButtonElement>('.opt').forEach(x => { x.disabled = true; if (opts[+x.dataset.j!] === right) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
      $('#after', root).innerHTML = `<p class="lead ${good ? 'ok' : 'bad'}">${good ? 'Exact' : 'Pas tout à fait'}</p><p>Le plan complet de ton camp : ${esc((mine === 'w' ? s.w : s.b).map(x => x.charAt(0).toLowerCase() + x.slice(1)).join(' ; '))}.</p>
        <div class="actions"><button class="btn pri" id="bNext">${k + 1 < games.length ? 'Position suivante' : 'Voir le résultat'}</button>${exploreButton()}<a class="btn" href="${gameUrl(g.id, st.ply, `#/structure/${id}`)}">Suite de la partie</a></div>`;
      $('#bNext', root).onclick = () => { k++; render(); scrollTo(0, 0); };
      $('#bExplore', root).onclick = () => { X = openExplorer(bd, $('#tmain', root), $('#xp', root), { fen: st.fen, orient: mine, lines: [{ label: 'Suite de ta partie', sans: g.sans.slice(st.ply, st.ply + 10) }] }, () => { X = null; bd.set(new Chess(st.fen), mine); }); };
    });
  };
  render();
  return () => { X?.destroy(); board?.destroy(); };
}
