/**
 * Le chemin des ouvertures (concept « la promotion ») : écran du chemin, et bilan d'une leçon ou d'une ouverture.
 * Toutes les ouvertures d'un bloc se suivent sur un seul chemin, par sections, sur un grand échiquier à peine visible.
 * Chaque section commence par un bandeau et se termine par sa dame.
 */
import { passed, unitsOf, type Lesson, type Unit } from '../core/path';
import { lineName, lineTitle } from '../core/names';
import { recentDeviations, refBranch } from '../core/drill';
import { lineUrl } from './session';
import { isDue } from '../core/schedule';
import { meetCounts } from '../core/rank';
import { pieceSrc } from '../ui/board';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, REP, lastLesson, store, trainingDays } from './store';
import { streak } from '../core/streak';
import { startSession } from './session';

const BLOC_KEY = 'cd_path_bloc';
const getBloc = () => { try { return localStorage.getItem(BLOC_KEY) || ''; } catch { return ''; } };
const setBloc = (id: string) => { try { localStorage.setItem(BLOC_KEY, id); } catch { /* stockage bloqué */ } };
const unitPick: Record<string, string> = {};
/** Nom court d'une ouverture : le titre du système sans ses précisions entre parenthèses ni après le tiret. */
export const shortName = (t: string) => t.replace(/\s*\(.*?\)\s*/g, ' ').split(/\s[—–-]\s/)[0].replace(/\s+/g, ' ').trim();

/** Ouvre le chemin sur une ouverture précise (depuis la page d'une ouverture). */
export function openUnit(blocId: string, sysId: string) { setBloc(blocId); unitPick[blocId] = sysId; location.hash = '#/rep'; }

/** Les lignes à jouer quand on (re)lance une case : celles qui ne sont pas encore sues pour la case en cours,
 *  celles qui reviennent en révision pour une case à revoir, toutes pour une case réussie qu'on veut rejouer. */
export function lessonIds(L: Lesson): string[] {
  const st = store.state.br;
  const left = L.state === 'cur' ? L.ids.filter(id => !passed(st[id])) : L.state === 'crack' ? L.ids.filter(id => isDue(st[id]) || !passed(st[id])) : L.ids;
  return left.length ? left : L.ids;
}
/** Ouvre une leçon : ses lignes en séance, le bilan à la fin, la croix ramène au chemin. */
function startLesson(u: Unit, i: number) {
  const L = u.lessons[i], ids = lessonIds(L);
  location.hash = startSession(`${shortName(u.sys.titre)}, case ${i + 1}`, ids, '#/lecon/fin', ids[0],
    { exit: '#/rep', lesson: { bloc: u.bloc.id, sys: u.sys.id, idx: i, rank: L.rank, doneBefore: u.done } });
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
  const lines = L.ids.slice(0, 4).map(id => { const [c, t] = lineMark(id); const nm = lineName(BR[id].br.titre); return `<li><span class="lm ${c}">${t}</span><span>${esc(nm.title)}${nm.detail ? `<small>${esc(nm.detail)}</small>` : ''}</span></li>`; }).join('') + (L.ids.length > 4 ? `<li class="more">et ${plural(L.ids.length - 4, 'autre ligne', 'autres lignes')}</li>` : '');
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
  const last = i === u.lessons.length - 1, x = X[i % X.length], cur = L.state === 'cur', on = i === sel;
  const inner = cur ? `<img src="${pieceSrc('p')}" alt="">` : last ? `<img class="${u.promoted ? '' : 'qghost'}" src="${pieceSrc('q')}" alt="">` : L.state === 'lock' ? `<span class="pn">${i + 1}</span>` : icon('check');
  return `<div class="prow${on ? ' issel' : ''}${cur ? ' iscur' : ''}${last ? ' isgoal' : ''}">
    <button class="psq ${L.state}${last ? ' goal' : ''}${last && u.promoted ? ' won' : ''}${on ? ' sel' : ''}" style="left:${x}%" data-i="${i}" aria-expanded="${on}" aria-label="Case ${i + 1} sur ${u.lessons.length}, ${STATE[L.state]}">${inner}${L.state === 'crack' ? '<i class="dot"></i>' : ''}</button>
    ${on ? bubble(u, L, i, x) : ''}</div>`;
}
const legend = `<p class="plegend"><span><i class="lg done"></i>réussie</span><span><i class="lg crack"></i>à revoir</span><span><i class="lg cur"></i>le pion : en cours</span><span><i class="lg lock"></i>à venir</span></p>`;

const pathCells = (u: Unit) => { const sel = selOf(u); return u.lessons.map((L, i) => step(u, L, i, sel)).join(''); };
function section(u: Unit, k: number, open: boolean) {
  const left = u.lessons.length - u.done, crack = u.lessons.some(l => l.state === 'crack');
  const sub = k === 0 && u.meet ? 'Ouverture 1, ta plus jouée' : `Ouverture ${k + 1}`;
  const head = `<button class="pband${open ? ' open' : ''}${u.promoted ? ' won' : ''}" data-u="${u.sys.id}" aria-expanded="${open}">
    <span><small>${sub}${u.meet ? `, dans ${plural(u.meet, 'de tes parties', 'de tes parties')}` : ''}</small><b>${esc(shortName(u.sys.titre))}</b>
      ${open && !u.promoted ? `<small>${left === 1 ? 'Plus qu\'une case avant la dame' : `Plus que ${left} cases avant la dame`}</small>` : ''}</span>
    ${u.promoted ? `<img src="${pieceSrc('q')}" alt="Promue">${crack ? '<i class="dot"></i>' : ''}` : `<em>${u.done} / ${u.lessons.length}</em>`}</button>`;
  return `<section class="psec">${head}${open ? `${legend}<div class="ppath" data-sys="${u.sys.id}">${pathCells(u)}</div>
    <a class="quiet" href="#/rep/${u.bloc.id}/${u.sys.id}">L'ouverture : plans, stats, fautes</a>` : ''}</section>`;
}

export function viewPath(root: HTMLElement) {
  const meet = meetCounts(store.games), blocs = REP.blocs;
  const bloc = blocs.find(b => b.id === getBloc()) ?? blocs[0];
  const units = unitsOf(bloc, store.state.br, meet);
  const open = units.find(x => x.sys.id === unitPick[bloc.id]) ?? units.find(x => !x.promoted) ?? units[0];
  const days = streak(trainingDays());
  const devs = recentDeviations(store.games, store.state.fixed, BR).filter(g => BR[refBranch(g, BR)!]?.bloc.id === bloc.id).slice(0, 3);
  root.innerHTML = `
    <header class="phead"><label class="pbloc"><span class="sr">Bloc</span><select id="selBloc">${blocs.map(b => `<option value="${b.id}" ${b === bloc ? 'selected' : ''}>${esc(b.titre)}</option>`).join('')}</select></label>
      ${days ? `<span class="pstreak">${days > 1 ? `${days} jours de suite` : '1 jour'}</span>` : ''}</header>
    ${devs.length ? `<section class="grp fix"><h2>À corriger : quittée en partie</h2><div class="surf card list">${devs.map(g => devRow(g)).join('')}</div></section>` : ''}
    <div class="pboard">${units.map((u, k) => section(u, k, u === open)).join('')}</div>
    <a class="quiet" href="#/rep/tout">Toutes les lignes du répertoire</a>`;
  $<HTMLSelectElement>('#selBloc', root).onchange = e => { setBloc((e.target as HTMLSelectElement).value); viewPath(root); };
  root.querySelectorAll<HTMLButtonElement>('[data-u]').forEach(b => b.onclick = () => { unitPick[bloc.id] = b.dataset.u!; viewPath(root); root.querySelector(`[data-u="${b.dataset.u}"]`)?.scrollIntoView({ block: 'start' }); });
  // toucher une case la choisit (sa bulle s'ouvre dessous) ; le bouton de la bulle lance la leçon
  const path = root.querySelector<HTMLElement>('.ppath');
  path?.addEventListener('click', e => {
    const t = e.target as HTMLElement, go = t.closest<HTMLElement>('[data-go]'), sq = t.closest<HTMLElement>('.psq');
    if (go) return startLesson(open, +go.dataset.go!);
    if (!sq) return;
    const i = +sq.dataset.i!; selPick[open.sys.id] = selPick[open.sys.id] === i ? -1 : i; path.innerHTML = pathCells(open);
    path.querySelector('.issel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    path.querySelector<HTMLElement>('.psq.sel')?.focus({ preventScroll: true });
  });
  // après le retour en haut de page fait par le routeur : on amène la case choisie au milieu de l'écran
  requestAnimationFrame(() => (root.querySelector('.issel') ?? root.querySelector('.iscur'))?.scrollIntoView({ block: 'center' }));
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
  const meet = meetCounts(store.games), bloc = REP.blocs.find(b => b.id === getBloc()) ?? REP.blocs[0], units = unitsOf(bloc, store.state.br, meet);
  const u = units.find(x => !x.promoted) ?? units[0];
  return { u, cells: u.lessons.map(l => l.state) };
}

/** Bilan d'une leçon : le pion avance (ou pas encore), et la promotion si l'ouverture est finie. */
export function viewLessonEnd(root: HTMLElement) {
  const L = lastLesson; if (!L) { location.replace('#/rep'); return; }
  const bloc = REP.blocs.find(b => b.id === L.bloc)!, u = unitsOf(bloc, store.state.br).find(x => x.sys.id === L.sys)!;
  const moved = u.done > L.doneBefore, name = shortName(u.sys.titre), mins = Math.floor(L.ms / 60000), secs = Math.round((L.ms % 60000) / 1000);
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  if (u.promoted && moved) {
    root.innerHTML = `<div class="lend unitdone"><p class="kick">Promotion</p><img class="bigq" src="${pieceSrc('q')}" alt="">
      <h1>${esc(name)} terminée</h1><p class="sub">Les ${plural(u.sys.branches.length, 'ligne')} sont acquises. Elles reviendront de temps en temps pour ne pas s'effacer.</p>
      <div class="etiles"><div><b>${u.sys.branches.length}</b><span>lignes</span></div>${u.meet ? `<div><b>${u.meet}</b><span>de tes parties couvertes</span></div>` : ''}<div><b>${time}</b><span>pour la dernière case</span></div></div>
      </div><div class="lend-act"><a class="btn pri block" href="#/rep">Revenir au chemin</a></div>`;
    return;
  }
  const strip = u.lessons.map((l, i) => { const isPawn = l.state === 'cur', last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${isPawn ? ' pawn' : ''}">${isPawn ? `<img src="${pieceSrc('p')}" alt="">` : last && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('');
  const left = u.lessons.length - u.done;
  root.innerHTML = `<div class="lend"><h1>${moved ? 'Le pion avance' : 'Presque'}</h1>
    <div class="estrip">${strip}</div>
    <p class="sub">${moved ? `${esc(name)} : ${left === 1 ? 'plus qu\'une case avant la dame' : `plus que ${left} cases avant la dame`}` : 'Rejoue sans faute les lignes ratées pour passer à la case suivante.'}</p>
    <div class="etiles"><div><b class="ok">${L.clean}/${L.lines}</b><span>lignes sans faute</span></div><div><b class="combo">×${L.best}</b><span>meilleur combo</span></div><div><b>${time}</b><span>temps</span></div></div></div>
    <div class="lend-act"><a class="btn pri block" href="#/rep">Continuer</a></div>`;
}
