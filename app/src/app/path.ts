/** Le chemin des ouvertures (concept « la promotion ») : écran du chemin, et bilan d'une leçon ou d'une ouverture. */
import { unitsOf, type Lesson, type Unit } from '../core/path';
import { meetCounts } from '../core/rank';
import { pieceSrc } from '../ui/board';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, REP, XP_GOAL, lastLesson, store, xpToday, trainingDays } from './store';
import { streak } from '../core/streak';
import { startSession } from './session';

const BLOC_KEY = 'cd_path_bloc';
const getBloc = () => { try { return localStorage.getItem(BLOC_KEY) || ''; } catch { return ''; } };
const setBloc = (id: string) => { try { localStorage.setItem(BLOC_KEY, id); } catch { /* stockage bloqué */ } };
let unitPick: Record<string, string> = {};
/** Nom court d'une ouverture : le titre du système sans ses précisions entre parenthèses ni après le tiret. */
export const shortName = (t: string) => t.replace(/\s*\(.*?\)\s*/g, ' ').split(/\s[—–-]\s/)[0].replace(/\s+/g, ' ').trim();

const ring = (pct: number, label: string) => {
  const r = 17, c = 2 * Math.PI * r;
  return `<span class="ring" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" class="rt"/><circle cx="20" cy="20" r="${r}" class="rv" stroke-dasharray="${(c * Math.min(1, pct)).toFixed(1)} ${c.toFixed(1)}"/></svg><b>${label}</b></span>`;
};
export const xpBadge = () => { const x = xpToday(); return `<span class="xpday">${ring(x / XP_GOAL, String(x))}<span><b>${x} / ${XP_GOAL} XP</b><small>${x >= XP_GOAL ? 'objectif atteint' : "aujourd'hui"}</small></span></span>`; };

/** Ouvre une leçon : ses lignes en séance, le bilan à la fin, la croix ramène au chemin. */
function startLesson(u: Unit, i: number) {
  const L = u.lessons[i];
  location.hash = startSession(`${shortName(u.sys.titre)}, case ${L.rank}`, L.ids, '#/lecon/fin', L.ids[0],
    { exit: '#/rep', lesson: { bloc: u.bloc.id, sys: u.sys.id, idx: i, rank: L.rank, doneBefore: u.done } });
}

const X = [52, 34, 62, 40, 62, 36, 52];   // décalage horizontal des cases (en %), pour le zigzag
function square(u: Unit, L: Lesson, i: number) {
  const last = i === u.lessons.length - 1, x = X[(8 - L.rank) % X.length];
  const inner = L.state === 'cur' ? `<img src="${pieceSrc('p')}" alt="">` : L.state === 'lock' ? (last ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : '')
    : last && u.promoted ? `<img src="${pieceSrc('q')}" alt="">` : icon('check');
  const lab = L.state === 'crack' ? '<small class="rev">À revoir</small>' : '';
  const n = L.ids.length, title = L.state === 'cur' ? `Case ${L.rank} : ${plural(n, 'ligne')}` : '';
  return `<div class="prow${L.state === 'cur' ? ' iscur' : ''}"><span class="prk">${L.rank}</span>
    <button class="psq ${L.state}${last ? ' goal' : ''}" style="left:${x}%" data-i="${i}" ${L.state === 'lock' ? 'disabled' : ''} aria-label="Case ${L.rank}, ${L.state === 'lock' ? 'verrouillée' : L.state === 'cur' ? 'à jouer' : L.state === 'crack' ? 'à revoir' : 'réussie'}">${inner}</button>
    <span class="plab" style="left:${x}%">${lab}</span>
    ${L.state === 'cur' ? `<div class="pbubble" style="--x:${x}%"><b>${title}</b><small>${esc(BR[L.ids[0]].br.titre)}${n > 1 ? ', …' : ''}</small><button class="btn pri" data-go="${i}">Avancer, +${n * 10} XP</button></div>` : ''}</div>`;
}

export function viewPath(root: HTMLElement) {
  const meet = meetCounts(store.games), blocs = REP.blocs;
  const bloc = blocs.find(b => b.id === getBloc()) ?? blocs[0];
  const units = unitsOf(bloc, store.state.br, meet);
  const u = units.find(x => x.sys.id === unitPick[bloc.id]) ?? units.find(x => !x.promoted) ?? units[0];
  const n = u.lessons.length, left = n - u.done, crack = u.lessons.filter(l => l.state === 'crack').length, days = streak(trainingDays());
  root.innerHTML = `
    <header class="phead"><label class="pbloc"><span class="sr">Bloc</span><select id="selBloc">${blocs.map(b => `<option value="${b.id}" ${b === bloc ? 'selected' : ''}>${esc(b.titre)}</option>`).join('')}</select></label>
      <div class="phead-r">${days ? `<span class="pstreak">${plural(days, 'jour')}</span>` : ''}${xpBadge()}</div></header>
    <div class="punits" role="tablist">${units.map(x => `<button role="tab" aria-selected="${x === u}" data-u="${x.sys.id}"${x.promoted ? ' class="promo"' : ''}>${x.promoted ? `<img src="${pieceSrc('q')}" alt="">` : ''}${esc(shortName(x.sys.titre))}<small>${x.done}/${x.lessons.length}</small></button>`).join('')}</div>
    <section class="punit">
      <div><small>Ouverture ${units.indexOf(u) + 1} sur ${units.length}${u.meet ? `, dans ${plural(u.meet, 'de tes parties', 'de tes parties')}` : ''}</small><b>${esc(shortName(u.sys.titre))}</b>
        <small>${u.promoted ? `Promue${crack ? `, ${plural(crack, 'case')} à revoir` : ''}` : left === 1 ? 'Plus qu\'une case avant la promotion' : `Plus que ${left} cases avant la promotion`}</small></div>
      <img src="${pieceSrc('q')}" alt="" class="${u.promoted ? '' : 'dim'}"></section>
    <div class="ppath">${[...u.lessons].map((L, i) => ({ L, i })).reverse().map(({ L, i }) => square(u, L, i)).join('')}</div>
    <a class="quiet" href="#/rep/tout">Toutes les lignes du répertoire</a>`;
  $<HTMLSelectElement>('#selBloc', root).onchange = e => { setBloc((e.target as HTMLSelectElement).value); viewPath(root); };
  root.querySelectorAll<HTMLButtonElement>('[data-u]').forEach(b => b.onclick = () => { unitPick[bloc.id] = b.dataset.u!; viewPath(root); });
  root.querySelectorAll<HTMLButtonElement>('.psq:not([disabled]), [data-go]').forEach(b => b.onclick = () => startLesson(u, +(b.dataset.i ?? b.dataset.go!)));
  // après le retour en haut de page fait par le routeur : on amène le pion au milieu de l'écran
  requestAnimationFrame(() => { root.querySelector('.iscur')?.scrollIntoView({ block: 'center' }); const t = root.querySelector<HTMLElement>('.punits [aria-selected="true"]'), bar = t?.parentElement; if (t && bar) bar.scrollLeft = t.offsetLeft - 20; });
}

/** Ce que la carte « Répertoire » de S'entraîner affiche : l'ouverture en cours et où en est son pion. */
export function pathSummary() {
  const meet = meetCounts(store.games), bloc = REP.blocs.find(b => b.id === getBloc()) ?? REP.blocs[0], units = unitsOf(bloc, store.state.br, meet);
  const u = units.find(x => !x.promoted) ?? units[0];
  return { u, cells: u.lessons.map(l => l.state) };
}

/** Bilan d'une leçon : le pion avance (ou pas encore), les XP, et la promotion si l'ouverture est finie. */
export function viewLessonEnd(root: HTMLElement) {
  const L = lastLesson; if (!L) { location.replace('#/rep'); return; }
  const bloc = REP.blocs.find(b => b.id === L.bloc)!, u = unitsOf(bloc, store.state.br).find(x => x.sys.id === L.sys)!;
  const moved = u.done > L.doneBefore, name = shortName(u.sys.titre), x = xpToday(), mins = Math.floor(L.ms / 60000), secs = Math.round((L.ms % 60000) / 1000);
  const tiles = `<div class="etiles"><div><b class="ok">${L.clean}/${L.lines}</b><span>lignes sans faute</span></div><div><b class="combo">×${L.best}</b><span>meilleur combo</span></div><div><b>${mins}:${String(secs).padStart(2, '0')}</b><span>temps</span></div></div>`;
  const goal = `<section class="egoal">${ring(x / XP_GOAL, x >= XP_GOAL ? '✓' : String(x))}<div><b>${x >= XP_GOAL ? 'Objectif du jour atteint' : `Objectif du jour : ${x} / ${XP_GOAL} XP`}</b><small>${x >= XP_GOAL ? `${x} / ${XP_GOAL} XP` : `Encore ${XP_GOAL - x} XP`}</small></div></section>`;
  if (u.promoted && moved) {
    const games = u.meet;
    root.innerHTML = `<div class="lend unitdone"><p class="kick">Promotion</p><img class="bigq" src="${pieceSrc('q')}" alt="">
      <h1>${esc(name)} terminée</h1><p class="sub">Les ${plural(u.sys.branches.length, 'ligne')} sont acquises. Elles reviendront de temps en temps pour ne pas s'effacer.</p>
      <div class="etiles"><div><b>${u.sys.branches.length}</b><span>lignes</span></div>${games ? `<div><b>${games}</b><span>de tes parties couvertes</span></div>` : ''}<div><b class="xp">+${L.xp}</b><span>XP de cette leçon</span></div></div>
      </div><div class="lend-act"><a class="btn pri block" href="#/rep">Revenir au chemin</a></div>`;
    return;
  }
  const strip = u.lessons.map((l, i) => { const isPawn = !u.promoted && l.state === 'cur', last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${isPawn ? ' pawn' : ''}">${isPawn ? `<img src="${pieceSrc('p')}" alt="">` : last && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('');
  const left = u.lessons.length - u.done;
  root.innerHTML = `<div class="lend"><h1>${moved ? 'Le pion avance' : 'Presque'}</h1>
    <div class="estrip">${strip}</div>
    <p class="sub">${moved ? `${esc(name)} : case ${L.rank + 1 <= 8 ? L.rank + 1 : 8} sur 8, ${left === 1 ? 'plus qu\'une case avant la dame' : `plus que ${left} cases avant la dame`}` : `Rejoue sans faute les lignes ratées pour passer à la case ${L.rank + 1}.`}</p>
    <p class="bigxp">+${L.xp} XP</p>${L.bonus ? `<p class="sub small">dont ${L.bonus} de bonus sans faute</p>` : ''}
    ${tiles}${goal}</div>
    <div class="lend-act"><a class="btn pri block" href="#/rep">Continuer</a></div>`;
}
