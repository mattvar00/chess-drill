/**
 * Le chemin des ouvertures (concept « la promotion ») : écran du chemin, et bilan d'une leçon ou d'une ouverture.
 * Toutes les ouvertures d'un bloc se suivent sur un seul chemin, par sections, sur un grand échiquier à peine visible.
 * Chaque section commence par un bandeau et se termine par sa dame.
 */
import { unitsOf, type Lesson, type Unit } from '../core/path';
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

/** Ouvre une leçon : ses lignes en séance, le bilan à la fin, la croix ramène au chemin. */
function startLesson(u: Unit, i: number) {
  const L = u.lessons[i];
  location.hash = startSession(`${shortName(u.sys.titre)}, case ${L.rank}`, L.ids, '#/lecon/fin', L.ids[0],
    { exit: '#/rep', lesson: { bloc: u.bloc.id, sys: u.sys.id, idx: i, rank: L.rank, doneBefore: u.done } });
}

const X = [50, 35, 62, 42, 60, 38, 52];   // position horizontale des cases (en %), pour le zigzag
/** Une case du chemin : réussie (or), à revoir (point rouge), le pion (case en cours), verrouillée, et la dame au bout. */
function step(u: Unit, L: Lesson, i: number) {
  const last = i === u.lessons.length - 1, x = X[i % X.length], cur = L.state === 'cur';
  const inner = cur ? `<img src="${pieceSrc('p')}" alt="">` : last ? `<img class="${u.promoted ? '' : 'qghost'}" src="${pieceSrc('q')}" alt="">` : L.state === 'lock' ? '' : icon('check');
  const label = L.state === 'crack' ? '<small class="rev">À revoir</small>' : '';
  return `<div class="prow${cur ? ' iscur' : ''}${last ? ' isgoal' : ''}">
    <button class="psq ${L.state}${last ? ' goal' : ''}${last && u.promoted ? ' won' : ''}" style="left:${x}%" data-i="${i}" ${L.state === 'lock' ? 'disabled' : ''} aria-label="Case ${L.rank}, ${L.state === 'lock' ? 'verrouillée' : cur ? 'à jouer' : L.state === 'crack' ? 'à revoir' : 'réussie'}">${inner}${L.state === 'crack' ? '<i class="dot"></i>' : ''}</button>
    <span class="plab" style="left:${x}%">${label}</span>
    ${cur ? `<div class="pbubble" style="--x:${x}%"><b>Case ${L.rank} : ${plural(L.ids.length, 'ligne')}</b><small>${esc(BR[L.ids[0]].br.titre)}${L.ids.length > 1 ? ', …' : ''}</small><button class="btn pri" data-go="${i}">Avancer</button></div>` : ''}</div>`;
}

function section(u: Unit, k: number, open: boolean) {
  const left = u.lessons.length - u.done, crack = u.lessons.some(l => l.state === 'crack');
  const sub = k === 0 && u.meet ? 'Ouverture 1, ta plus jouée' : `Ouverture ${k + 1}`;
  const head = `<button class="pband${open ? ' open' : ''}${u.promoted ? ' won' : ''}" data-u="${u.sys.id}" aria-expanded="${open}">
    <span><small>${sub}${u.meet ? `, dans ${plural(u.meet, 'de tes parties', 'de tes parties')}` : ''}</small><b>${esc(shortName(u.sys.titre))}</b>
      ${open && !u.promoted ? `<small>${left === 1 ? 'Plus qu\'une case avant la dame' : `Plus que ${left} cases avant la dame`}</small>` : ''}</span>
    ${u.promoted ? `<img src="${pieceSrc('q')}" alt="Promue">${crack ? '<i class="dot"></i>' : ''}` : `<em>${u.done} / ${u.lessons.length}</em>`}</button>`;
  return `<section class="psec">${head}${open ? `<div class="ppath">${u.lessons.map((L, i) => step(u, L, i)).join('')}</div>
    <a class="quiet" href="#/rep/${u.bloc.id}/${u.sys.id}">L'ouverture : plans, stats, fautes</a>` : ''}</section>`;
}

export function viewPath(root: HTMLElement) {
  const meet = meetCounts(store.games), blocs = REP.blocs;
  const bloc = blocs.find(b => b.id === getBloc()) ?? blocs[0];
  const units = unitsOf(bloc, store.state.br, meet);
  const open = units.find(x => x.sys.id === unitPick[bloc.id]) ?? units.find(x => !x.promoted) ?? units[0];
  const days = streak(trainingDays());
  root.innerHTML = `
    <header class="phead"><label class="pbloc"><span class="sr">Bloc</span><select id="selBloc">${blocs.map(b => `<option value="${b.id}" ${b === bloc ? 'selected' : ''}>${esc(b.titre)}</option>`).join('')}</select></label>
      ${days ? `<span class="pstreak">${days > 1 ? `${days} jours de suite` : '1 jour'}</span>` : ''}</header>
    <div class="pboard">${units.map((u, k) => section(u, k, u === open)).join('')}</div>
    <a class="quiet" href="#/rep/tout">Toutes les lignes du répertoire</a>`;
  $<HTMLSelectElement>('#selBloc', root).onchange = e => { setBloc((e.target as HTMLSelectElement).value); viewPath(root); };
  root.querySelectorAll<HTMLButtonElement>('[data-u]').forEach(b => b.onclick = () => { unitPick[bloc.id] = b.dataset.u!; viewPath(root); root.querySelector(`[data-u="${b.dataset.u}"]`)?.scrollIntoView({ block: 'start' }); });
  root.querySelectorAll<HTMLButtonElement>('.psq:not([disabled]), [data-go]').forEach(b => b.onclick = () => startLesson(open, +(b.dataset.i ?? b.dataset.go!)));
  // après le retour en haut de page fait par le routeur : on amène le pion au milieu de l'écran
  requestAnimationFrame(() => root.querySelector('.iscur')?.scrollIntoView({ block: 'center' }));
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
