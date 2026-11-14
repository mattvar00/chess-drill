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

/** Ouvre le chemin sur une ouverture précise (depuis la page d'une ouverture). */
export function openUnit(blocId: string, sysId: string) { setBloc(blocId); unitPick[blocId] = sysId; location.hash = '#/rep'; }

/** Une case de la colonne : réussie (or), à revoir (or, point rouge), le pion (case en cours), verrouillée (couleur du plateau), la dame en haut. */
function cell(u: Unit, L: Lesson, i: number) {
  const last = i === u.lessons.length - 1, dark = L.rank % 2 === 1;
  const inner = L.state === 'cur' ? `<img src="${pieceSrc('p')}" alt="">`
    : last ? `<img class="${u.promoted ? '' : 'qghost'}" src="${pieceSrc('q')}" alt="">` : L.state === 'lock' ? '' : icon('check');
  const side = L.state === 'cur' ? `<b>À toi</b><small>${plural(L.ids.length, 'ligne')}</small>` : L.state === 'crack' ? '<b class="rev">À revoir</b>' : last && !u.promoted ? '<small>Promotion</small>' : '';
  return `<div class="frow${L.state === 'cur' ? ' iscur' : ''}"><span class="frk">${L.rank}</span>
    <button class="fsq ${L.state}${dark ? ' dk' : ''}${last ? ' goal' : ''}" data-i="${i}" ${L.state === 'lock' ? 'disabled' : ''} aria-label="Case ${L.rank}, ${L.state === 'lock' ? 'verrouillée' : L.state === 'cur' ? 'à jouer' : L.state === 'crack' ? 'à revoir' : 'réussie'}">${inner}${L.state === 'crack' ? '<i class="dot"></i>' : ''}</button>
    <span class="fside">${side}</span></div>`;
}

export function viewPath(root: HTMLElement) {
  const meet = meetCounts(store.games), blocs = REP.blocs;
  const bloc = blocs.find(b => b.id === getBloc()) ?? blocs[0];
  const units = unitsOf(bloc, store.state.br, meet);
  const u = units.find(x => x.sys.id === unitPick[bloc.id]) ?? units.find(x => !x.promoted) ?? units[0], k = units.indexOf(u);
  const left = u.lessons.length - u.done, cur = u.lessons.findIndex(l => l.state === 'cur'), crack = u.lessons.findIndex(l => l.state === 'crack');
  const days = streak(trainingDays());
  // l'action principale : avancer ; sinon revoir une case fissurée ; sinon passer à l'ouverture suivante
  const target = cur >= 0 ? cur : crack;
  const cta = target >= 0 ? `<button class="btn pri block fcta" data-go="${target}"><span>${cur >= 0 ? 'Avancer' : 'Revoir'}, +${u.lessons[target].ids.length * 10} XP</span><small>Case ${u.lessons[target].rank} : ${plural(u.lessons[target].ids.length, 'ligne')}, ${u.lessons[target].ids.length} min environ</small></button>`
    : units[k + 1] ? `<button class="btn pri block fcta" data-u="${units[k + 1].sys.id}"><span>Ouverture suivante</span><small>${esc(shortName(units[k + 1].sys.titre))}</small></button>` : '';
  root.innerHTML = `
    <header class="phead"><label class="pbloc"><span class="sr">Bloc</span><select id="selBloc">${blocs.map(b => `<option value="${b.id}" ${b === bloc ? 'selected' : ''}>${esc(b.titre)}</option>`).join('')}</select></label>
      <div class="phead-r">${days ? `<span class="pstreak">${plural(days, 'jour')}</span>` : ''}${xpBadge()}</div></header>
    <section class="fhero">
      <button class="fnav" data-u="${units[k - 1]?.sys.id ?? ''}" ${k ? '' : 'disabled'} aria-label="Ouverture précédente">${icon('back')}</button>
      <div class="ftitle"><b>${esc(shortName(u.sys.titre))}</b><small>${u.promoted ? (crack >= 0 ? 'Promue, une case à revoir' : 'Promue') : left === 1 ? 'Plus qu\'une case avant la dame' : `Plus que ${left} cases avant la dame`}</small>
        <span class="fdots" aria-label="Ouverture ${k + 1} sur ${units.length}">${units.map((x, j) => `<i class="${j === k ? 'on' : ''}${x.promoted ? ' q' : ''}"></i>`).join('')}</span></div>
      <button class="fnav" data-u="${units[k + 1]?.sys.id ?? ''}" ${units[k + 1] ? '' : 'disabled'} aria-label="Ouverture suivante">${icon('chev')}</button>
    </section>
    <div class="ffile">${[...u.lessons].map((L, i) => ({ L, i })).reverse().map(({ L, i }) => cell(u, L, i)).join('')}</div>
    ${cta}
    <div class="flinks"><a class="quiet" href="#/rep/${bloc.id}/${u.sys.id}">L'ouverture : plans, stats, fautes</a><a class="quiet" href="#/rep/tout">Toutes les lignes</a></div>`;
  $<HTMLSelectElement>('#selBloc', root).onchange = e => { setBloc((e.target as HTMLSelectElement).value); viewPath(root); };
  root.querySelectorAll<HTMLButtonElement>('[data-u]').forEach(b => b.onclick = () => { if (!b.dataset.u) return; unitPick[bloc.id] = b.dataset.u; viewPath(root); });
  root.querySelectorAll<HTMLButtonElement>('.fsq:not([disabled]), [data-go]').forEach(b => b.onclick = () => startLesson(u, +(b.dataset.i ?? b.dataset.go!)));
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
