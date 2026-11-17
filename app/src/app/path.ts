/**
 * Le chemin des ouvertures (concept « la promotion », façon Duolingo) : la liste des ouvertures, le chemin de chacune
 * (en haut de sa page), et le bilan d'une leçon. Une ouverture = une réponse à un plan adverse, 6 cases au plus ;
 * le pion avance d'une case par leçon réussie, la dame au bout. Une dame gagnée reste gagnée.
 */
import { caseOf, earnedQueen, freshFromGames, passed, unitOf, unitsOf, type Lesson, type Unit } from '../core/path';
import type { Bloc, System } from '../core/types';
import { syncSoon } from './api';
import { lineName, lineTitle, typeLabel } from '../core/names';
import { recentDeviations, refBranch } from '../core/drill';
import { lineUrl } from './session';
import { isDue } from '../core/schedule';
import { meetCounts } from '../core/rank';
import { pieceSrc } from '../ui/board';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, REP, lastLesson, save, store } from './store';
import { startSession } from './session';

const SIDE_KEY = 'cd_rep_side', LAST_KEY = 'cd_last_sys';
const getLS = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const setLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* stockage bloqué */ } };
/** Nom court d'une ouverture : le titre du système sans ses précisions entre parenthèses ni après le tiret. */
export const shortName = (t: string) => t.replace(/\s*\(.*?\)\s*/g, ' ').split(/\s[—–-]\s/)[0].replace(/\s+/g, ' ').trim();
const queens = () => store.state.queens ?? {};
const openingUrl = (u: Unit) => `#/rep/${u.bloc.id}/${u.sys.id}`;
/** Toutes les ouvertures (hors plans), et la dame notée au passage pour celles qui viennent d'être finies. */
function allUnits(): Unit[] {
  const meet = meetCounts(store.games), out = REP.blocs.flatMap(b => unitsOf(b, store.state.br, meet, Date.now(), queens()));
  let fresh = false; for (const u of out) if (earnedQueen(u, queens())) { (store.state.queens ??= {})[u.sys.id] = Date.now(); fresh = true; }
  if (fresh) { save(); syncSoon(); return REP.blocs.flatMap(b => unitsOf(b, store.state.br, meet, Date.now(), queens())); }
  return out;
}
const played = (u: Unit) => u.sys.statut !== 'alternatif';
/** L'ouverture à reprendre : la dernière travaillée tant qu'il lui reste une case, sinon la plus jouée qui n'est pas promue. */
function currentUnit(units = allUnits()): Unit {
  const last = units.find(u => u.sys.id === getLS(LAST_KEY));
  const open = (u: Unit) => u.lessons.some(l => l.state === 'cur' || l.state === 'crack');
  return (last && open(last) ? last : null) ?? [...units].filter(u => played(u) && open(u)).sort((a, b) => b.meet - a.meet)[0] ?? units[0];
}
/** Ouvre la page d'une ouverture (son chemin en haut). */
export function openUnit(blocId: string, sysId: string) { location.hash = `#/rep/${blocId}/${sysId}`; }

/** Les lignes à jouer quand on (re)lance une case : celles qui ne sont pas encore sues pour la case en cours,
 *  celles qui reviennent en révision pour une case à revoir, toutes pour une case réussie qu'on veut rejouer. */
export function lessonIds(L: Lesson): string[] {
  const st = store.state.br;
  const left = L.state === 'cur' ? L.ids.filter(id => !passed(st[id])) : L.state === 'crack' ? L.ids.filter(id => isDue(st[id]) || !passed(st[id])) : L.ids;
  return left.length ? left : L.ids;
}
/** Ouvre une leçon : ses lignes en séance, le bilan à la fin, la croix ramène à la page de l'ouverture. */
function startLesson(u: Unit, i: number) {
  const L = u.lessons[i], ids = lessonIds(L); setLS(LAST_KEY, u.sys.id);
  location.hash = startSession(`${shortName(u.sys.titre)}, case ${i + 1}`, ids, '#/lecon/fin', ids[0],
    { exit: openingUrl(u), lesson: { bloc: u.bloc.id, sys: u.sys.id, idx: i, rank: L.rank, doneBefore: u.done } });
}

const X = [50, 35, 62, 42, 60, 38, 52];   // position horizontale des cases (en %), pour le zigzag
/** Case choisie sur le chemin, par ouverture : aucune tant qu'on n'en touche pas une (la bulle ne s'ouvre qu'au toucher). */
const selPick: Record<string, number> = {};
const selOf = (u: Unit) => { const s = selPick[u.sys.id]; return s != null && s < u.lessons.length ? s : -1; };
const STATE: Record<Lesson['state'], string> = { done: 'réussie', crack: 'à revoir', cur: 'à jouer', lock: 'pas encore ouverte' };

/** La bulle sous la case choisie : ce qu'elle contient, où elle en est, et l'action qui va avec. */
function bubble(u: Unit, L: Lesson, i: number, x: number) {
  const n = u.lessons.length, last = i === n - 1, st = store.state.br;
  const lineMark = (id: string) => { const s = st[id]; return !s?.runs ? ['new', 'nouvelle'] : s.clean >= 1 && isDue(s) ? ['rev', 'à revoir'] : s.clean >= 1 ? ['ok', 'sue'] : ['new', 'à finir']; };
  const lines = L.ids.slice(0, 4).map(id => { const [c, t] = lineMark(id); const nm = lineName(BR[id].br.titre); const ty = BR[id].br.type; return `<li><span class="lm ${c}">${t}</span><span>${ty ? `<span class="ltype ${ty}">${typeLabel(ty)}</span>` : ''}${esc(nm.title)}${nm.detail ? `<small>${esc(nm.detail)}</small>` : ''}</span></li>`; }).join('') + (L.ids.length > 4 ? `<li class="more">et ${plural(L.ids.length - 4, 'autre ligne', 'autres lignes')}</li>` : '');
  const rest = lessonIds(L).length, partial = L.state === 'cur' && rest < L.ids.length;
  const why = L.state === 'cur' ? `Joue ces ${plural(L.ids.length, 'ligne')} une fois chacune sans faute pour avancer le pion.${partial ? ' Celles déjà sues ne sont pas à refaire.' : ''}`
    : L.state === 'crack' ? 'Une ligne de cette case revient en révision. Rejoue-la sans faute pour garder la case.'
    : L.state === 'done' ? 'Case réussie. Tu peux rejouer ses lignes quand tu veux.'
    : last ? `La dame : termine les ${n} cases pour promouvoir l'ouverture.` : `S'ouvre quand la case ${i} est réussie.`;
  const act = L.state === 'cur' ? `<button class="btn pri" data-go="${i}">${partial ? `Finir la case ${i + 1} : ${plural(rest, 'ligne restante', 'lignes restantes')}` : `Jouer la case ${i + 1}`}</button>`
    : L.state === 'crack' ? `<button class="btn pri" data-go="${i}">Revoir maintenant</button>`
    : L.state === 'done' ? `<button class="btn" data-go="${i}">Rejouer ces lignes</button>` : '';
  return `<div class="pbubble ${L.state}" style="--x:${x}%" role="region" aria-label="Case ${i + 1} sur ${n}">
    <p class="pbh"><b>Case ${i + 1} sur ${n}</b><span class="pst ${L.state}">${STATE[L.state]}</span></p>
    <p class="pbw">${why}</p><ul class="plines">${lines}</ul>${act}</div>`;
}
/** Une case du chemin : réussie (or), à revoir (point rouge), le pion (case en cours), pas encore ouverte, et la dame au bout. Toutes se touchent : la bulle dit ce qu'elles contiennent. */
function step(u: Unit, L: Lesson, i: number, sel: number) {
  const kept = u.promoted && u.lessons.some(l => l.state === 'cur' || l.state === 'lock'), last = i === u.lessons.length - 1 && !kept, x = X[i % X.length], cur = L.state === 'cur', on = i === sel;
  const inner = cur ? `<img src="${pieceSrc('p')}" alt="">` : last ? `<img class="${u.promoted ? '' : 'qghost'}" src="${pieceSrc('q')}" alt="">` : L.state === 'lock' ? `<span class="pn">${i + 1}</span>` : icon('check');
  return `<div class="prow${on ? ' issel' : ''}${cur ? ' iscur' : ''}${last ? ' isgoal' : ''}">
    <button class="psq ${L.state}${last ? ' goal' : ''}${last && u.promoted ? ' won' : ''}${on ? ' sel' : ''}" style="left:${x}%" data-i="${i}" aria-expanded="${on}" aria-label="Case ${i + 1} sur ${u.lessons.length}, ${STATE[L.state]}">${inner}${L.state === 'crack' ? '<i class="dot"></i>' : ''}</button>
    ${on ? bubble(u, L, i, x) : ''}</div>`;
}
const legend = `<p class="plegend"><span><i class="lg done"></i>réussie</span><span><i class="lg crack"></i>à revoir</span><span><i class="lg cur"></i>le pion : en cours</span><span><i class="lg lock"></i>à venir</span></p>`;

const pathCells = (u: Unit) => { const sel = selOf(u), open = u.lessons.some(l => l.state === 'cur' || l.state === 'lock');
  // dame déjà gagnée et nouvelles lignes ajoutées : la dame reste au bout du chemin, après la nouvelle case
  const kept = u.promoted && open ? `<div class="prow isgoal"><span class="psq goal won done" role="img" aria-label="Dame gagnée"><img src="${pieceSrc('q')}" alt=""></span></div>` : '';
  return u.lessons.map((L, i) => step(u, L, i, sel)).join('') + kept; };
/** Petite bande des cases d'une ouverture, pour les listes : or réussie, rouge à revoir, pion en cours, dame au bout. */
export function strip(u: Unit) {
  return `<span class="estrip mini">${u.lessons.map((l, i) => { const last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${l.state === 'cur' ? ' pawn' : ''}">${l.state === 'cur' ? `<img src="${pieceSrc('p')}" alt="">` : last && !u.promoted && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('')}</span>`;
}
const where = (u: Unit) => { const c = caseOf(u), fresh = u.lessons.some(l => l.state === 'cur');
  return u.promoted ? (fresh ? `Promue, nouvelle case : ${c.k} sur ${c.n}` : 'Promue') : `Case ${c.k} sur ${c.n}`; };

/**
 * Le chemin d'une ouverture, en haut de sa page : le bandeau (où en est le pion), le bouton pour jouer la case en cours,
 * puis les cases en zigzag ; toucher une case ouvre sa bulle. `bindPath` branche les gestes.
 */
export function pathBlock(u: Unit): string {
  const c = caseOf(u), cur = u.lessons.findIndex(l => l.state === 'cur'), crack = u.lessons.findIndex(l => l.state === 'crack');
  const go = cur >= 0 ? cur : crack, left = u.lessons.length - u.done;
  const L = go >= 0 ? u.lessons[go] : null, rest = L ? lessonIds(L).length : 0, partial = L?.state === 'cur' && rest < L.ids.length;
  const msg = u.promoted && cur < 0 ? (crack >= 0 ? 'Ouverture promue. Une case est à revoir pour garder la dame bien en place.' : 'Ouverture promue : ses lignes reviendront de temps en temps pour ne pas s\'effacer.')
    : u.promoted ? 'Ouverture promue. De nouvelles lignes sont arrivées : elles forment une case avant la dame, la dame reste à toi.'
    : 'Joue chaque ligne de la case une fois sans faute : le pion avance d\'une case. Au bout, la dame.';
  const btn = L ? `<button class="btn pri block" data-go="${go}">${L.state === 'crack' ? `Revoir la case ${go + 1}` : partial ? `Finir la case ${go + 1} : ${plural(rest, 'ligne restante', 'lignes restantes')}` : `Jouer la case ${go + 1}`}</button>` : '';
  return `<section class="surf card padded pathhead${u.promoted ? ' won' : ''}">
      <div class="pchead"><b>${where(u)}</b>${u.promoted ? `<img class="qwon" src="${pieceSrc('q')}" alt="Dame gagnée">` : `<span>${c.n - u.done} ${c.n - u.done > 1 ? 'cases' : 'case'} avant la dame</span>`}</div>
      <p class="pnote">${msg}</p>${btn}</section>
    <div class="pboard"><section class="psec">${legend}<div class="ppath" data-sys="${u.sys.id}">${pathCells(u)}</div></section></div>`;
}
export function bindPath(root: HTMLElement, u: Unit) {
  setLS(LAST_KEY, u.sys.id); setLS(SIDE_KEY, u.bloc.side);
  root.querySelector('.pathhead [data-go]')?.addEventListener('click', e => startLesson(u, +(e.currentTarget as HTMLElement).dataset.go!));
  const path = root.querySelector<HTMLElement>('.ppath');
  path?.addEventListener('click', e => {
    const t = e.target as HTMLElement, go = t.closest<HTMLElement>('[data-go]'), sq = t.closest<HTMLElement>('.psq');
    if (go) return startLesson(u, +go.dataset.go!);
    if (!sq) return;
    const i = +sq.dataset.i!; selPick[u.sys.id] = selPick[u.sys.id] === i ? -1 : i; path.innerHTML = pathCells(u);
    path.querySelector('.issel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    path.querySelector<HTMLElement>('.psq.sel')?.focus({ preventScroll: true });
  });
}
/** L'ouverture d'une page, avec sa progression (pour `pathBlock`). */
export const unitFor = (bloc: Bloc, sys: System) => allUnits().find(u => u.sys.id === sys.id) ?? unitOf(bloc, sys, store.state.br, {}, Date.now(), queens());

/**
 * Ouvertures : la liste, rangée comme sur l'échiquier. Avec les Noirs ou avec les Blancs, puis par le premier coup adverse.
 * En haut, l'ouverture à reprendre et le nombre de dames ; une recherche par nom ; en bas, les ouvertures de rechange, repliées.
 */
export function viewPath(root: HTMLElement) {
  const units = allUnits(), cu = currentUnit(units), side = (getLS(SIDE_KEY) || cu.bloc.side) as 'w' | 'b';
  const mine = units.filter(u => u.bloc.side === side), playedU = mine.filter(played), others = mine.filter(u => !played(u));
  const nQ = playedU.filter(u => u.promoted).length, devs = recentDeviations(store.games, store.state.fixed, BR);
  const devBy: Record<string, number> = {}; for (const g of devs) { const s = BR[refBranch(g, BR)!]?.sys.id; if (s) devBy[s] = (devBy[s] || 0) + 1; }
  const row = (u: Unit) => { const due = u.sys.branches.filter(b => { const s = store.state.br[b.id]; return s?.runs && isDue(s); }).length, fresh = freshFromGames(u.sys, store.state.br);
    return `<a class="rowi orow" href="${openingUrl(u)}"><span class="body"><b>${esc(shortName(u.sys.titre))}</b>
      <small>${where(u)}${u.meet ? ` · dans ${plural(u.meet, 'de tes parties', 'de tes parties')}` : ''}</small>${strip(u)}
      ${due || fresh || devBy[u.sys.id] ? `<span class="tags">${devBy[u.sys.id] ? `<span class="due bad">${plural(devBy[u.sys.id], 'quittée', 'quittées')} en partie</span>` : ''}${due ? `<span class="due">${due} à revoir</span>` : ''}${fresh ? `<span class="due new">${plural(fresh, 'nouvelle ligne', 'nouvelles lignes')} de tes parties</span>` : ''}</span>` : ''}</span>
      ${u.promoted ? `<img class="qwon" src="${pieceSrc('q')}" alt="Promue">` : ''}${icon('chev', 'chev')}</a>`; };
  const blocs = REP.blocs.filter(b => b.side === side);
  const cc = caseOf(cu), cl = cu.lessons.findIndex(l => l.state === 'cur' || l.state === 'crack');
  root.innerHTML = `
    <div class="seg" role="group" aria-label="Couleur"><button type="button" data-side="b" aria-pressed="${side === 'b'}">Avec les Noirs</button><button type="button" data-side="w" aria-pressed="${side === 'w'}">Avec les Blancs</button></div>
    <section class="surf today resume"><div class="today-top"><div class="today-text"><p class="label">À reprendre</p><h2>${esc(shortName(cu.sys.titre))}</h2><p>${where(cu)}, ${esc(cu.bloc.titre.toLowerCase())}</p>${strip(cu)}</div></div>
      ${cl >= 0 ? `<button class="btn pri block" id="bResume">${cu.lessons[cl].state === 'crack' ? 'Revoir' : 'Jouer'} la case ${cl + 1}</button>` : ''}<a class="quiet" href="${openingUrl(cu)}">Voir l'ouverture</a></section>
    <p class="qcount"><img src="${pieceSrc('q')}" alt=""><span><b>${nQ}</b> ${nQ > 1 ? 'dames' : 'dame'} sur ${playedU.length} ouvertures ${side === 'w' ? 'avec les Blancs' : 'avec les Noirs'}</span></p>
    <div class="rsearch"><label class="sr" for="qRep">Chercher une ouverture ou une ligne</label><input id="qRep" type="search" placeholder="Chercher : Londres, Bowdler, Meran…" autocomplete="off"><a class="hchip" href="#/rep/chercher">Jouer les coups</a></div>
    <div id="qRes"></div>
    <div id="olist">${blocs.map(b => { const us = playedU.filter(u => u.bloc.id === b.id); return us.length ? `<section class="grp"><h2>${esc(b.titre)}</h2><div class="surf card list">${us.map(row).join('')}</div></section>` : ''; }).join('')}
    ${others.length ? `<details class="others"><summary>Autres options (${others.length})</summary><p class="pnote">Des ouvertures de rechange, que tu ne joues pas d'habitude.</p><div class="surf card list">${others.map(row).join('')}</div></details>` : ''}</div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(b => b.onclick = () => { setLS(SIDE_KEY, b.dataset.side!); viewPath(root); });
  $('#bResume', root)?.addEventListener('click', () => startLesson(cu, cl));
  // recherche par nom : ouvertures et lignes, toutes couleurs confondues
  const q = $<HTMLInputElement>('#qRep', root), res = $('#qRes', root), list = $('#olist', root);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  q.addEventListener('input', () => {
    const t = norm(q.value.trim()); list.hidden = !!t; if (!t) { res.innerHTML = ''; return; }
    const us = units.filter(u => norm(u.sys.titre + ' ' + u.bloc.titre).includes(t));
    const ls = Object.values(BR).filter(r => r.sys.statut !== 'plan' && norm(r.br.titre).includes(t)).slice(0, 12);
    res.innerHTML = us.length || ls.length ? `${us.length ? `<section class="grp"><h2>Ouvertures</h2><div class="surf card list">${us.map(row).join('')}</div></section>` : ''}
      ${ls.length ? `<section class="grp"><h2>Lignes</h2><div class="surf card list">${ls.map(r => { const nm = lineName(r.br.titre); return `<a class="rowi" href="${lineUrl(r.br.id, 'explore')}"><span class="body"><b>${r.br.type ? `<span class="ltype ${r.br.type}">${typeLabel(r.br.type)}</span>` : ''}${esc(nm.title)}</b><small>${esc(shortName(r.sys.titre))}${nm.detail ? ` · ${esc(nm.detail)}` : ''}</small></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>` : ''}`
      : '<p class="pnote">Rien trouvé. Essaie un autre nom, ou cherche en jouant les coups.</p>';
  });
}

/** Une ligne quittée en partie : contre qui, ce que tu as joué, ce que dit ta ligne. Mène au drill de cette ligne. */
export function devRow(g: import('../core/types').Game) {
  const id = refBranch(g, BR)!, exp = (g.a.expected || []).map(e => e.san).slice(0, 2);
  const when = new Date(g.t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<a class="rowi" href="${lineUrl(id, 'drill', g.id)}"><span class="body"><b>${esc(lineTitle(BR[id].br.titre))}</b>
    <small>Contre ${esc(g.opp)}, ${when} : tu as joué <span class="mv no">${esc(g.a.played ?? '')}</span>${exp.length ? `, ta ligne dit ${exp.map(x => `<span class="mv yes">${esc(x)}</span>`).join(' ou ')}` : ''}</small></span>${icon('chev', 'chev')}</a>`;
}

/** Ce que la carte « Tes ouvertures » de S'entraîner affiche : l'ouverture en cours et où en est son pion. */
export function pathSummary() {
  const u = currentUnit();
  return { u, cells: u.lessons.map(l => l.state) };
}

/** Bilan d'une leçon : le pion avance (ou pas encore), et la promotion si l'ouverture est finie. */
export function viewLessonEnd(root: HTMLElement) {
  const L = lastLesson; if (!L) { location.replace('#/rep'); return; }
  const u = allUnits().find(x => x.sys.id === L.sys); if (!u) { location.replace('#/rep'); return; }
  const back = openingUrl(u), moved = u.done > L.doneBefore, name = shortName(u.sys.titre), mins = Math.floor(L.ms / 60000), secs = Math.round((L.ms % 60000) / 1000);
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  if (u.promoted && moved) {
    root.innerHTML = `<div class="lend unitdone"><p class="kick">Promotion</p><img class="bigq" src="${pieceSrc('q')}" alt="">
      <h1>${esc(name)} terminée</h1><p class="sub">Les ${plural(u.sys.branches.length, 'ligne')} sont acquises. Elles reviendront de temps en temps pour ne pas s'effacer.</p>
      <div class="etiles"><div><b>${u.sys.branches.length}</b><span>lignes</span></div>${u.meet ? `<div><b>${u.meet}</b><span>de tes parties couvertes</span></div>` : ''}<div><b>${time}</b><span>pour la dernière case</span></div></div>
      </div><div class="lend-act"><a class="btn pri block" href="${back}">Voir l'ouverture</a></div>`;
    return;
  }
  const strip = u.lessons.map((l, i) => { const isPawn = l.state === 'cur', last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${isPawn ? ' pawn' : ''}">${isPawn ? `<img src="${pieceSrc('p')}" alt="">` : last && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('');
  const left = u.lessons.length - u.done;
  root.innerHTML = `<div class="lend"><h1>${moved ? 'Le pion avance' : 'Presque'}</h1>
    <div class="estrip">${strip}</div>
    <p class="sub">${moved ? `${esc(name)} : ${left === 1 ? 'plus qu\'une case avant la dame' : `plus que ${left} cases avant la dame`}` : 'Rejoue sans faute les lignes ratées pour passer à la case suivante.'}</p>
    <div class="etiles"><div><b class="ok">${L.clean}/${L.lines}</b><span>lignes sans faute</span></div><div><b class="combo">×${L.best}</b><span>meilleur combo</span></div><div><b>${time}</b><span>temps</span></div></div></div>
    <div class="lend-act"><a class="btn pri block" href="${back}">Continuer</a></div>`;
}
