/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch, todayPool } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard, pieceSrc } from '../ui/board';
import { meetCounts } from '../core/rank';
import { bindPath, devRow, nextUp, pathBlock, shortName, unitFor } from './path';
import { caseOf, chaptersOf, knownLines, ownLines } from '../core/path';
import { lineName, roleLabel, typeLabel } from '../core/names';
import { structureStats } from '../core/stats';
import { Chess, tryMove, uciToObj } from '../core/chess';
import { ALL_IDS, BR, PLANS, REP, markPlan, planDone, plansFor, store, trainingDays } from './store';
import { dayKey, streak, trainedToday } from '../core/streak';
import { lineUrl, startSession } from './session';
import { duePositions, priorityFaults } from '../core/wood';
import { gameRow, gameUrl } from './games';
import { PLAN_LINES } from './trainer';
import { startCycle } from './wood';
import { coldStart, keyMoment, lastSession, myWp } from '../core/stats';

const DAY = 864e5;
const st = (id: string) => store.state.br[id];
const validCount = (ids: string[]) => ids.filter(id => isValid(st(id))).length;
const idsOf = (b: Bloc | System) => 'systemes' in b ? b.systemes.flatMap(s => s.branches.map(x => x.id)) : b.branches.map(x => x.id);
const go = (label: string, pool: string[], back: string) => { location.hash = startSession(label, pool, back); };
/** « aujourd'hui », « hier », « il y a 3 jours » : en jours de calendrier, pas en tranches de 24 heures. */
const ago = (t: number) => { const a = new Date(t), b = new Date(); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0); const d = Math.round((b.getTime() - a.getTime()) / DAY); return d <= 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} jours`; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const chev = icon('chev', 'chev');
const dueLines = (ids: string[]) => ids.filter(id => st(id)?.runs && isDue(st(id))).length;
const dueTag = (n: number) => n ? `<span class="due">${n} à revoir</span>` : '';
const bar = (done: number, total: number, cls = '') => `<span class="prog ${cls}" role="img" aria-label="${done} sur ${total} validées"><b style="width:${total ? Math.round(100 * done / total) : 0}%"></b></span>`;
/** Barre d'avancement suivie du décompte « validées / total ». */
const progLine = (ids: string[]) => { const v = validCount(ids); return `<span class="pl">${bar(v, ids.length)}<i>${v}/${ids.length}</i></span>`; };
const validPhrase = (v: number, total: number) => `${v} ${v > 1 ? 'lignes validées' : 'ligne validée'} sur ${total}`;
const nf = (n: number) => n.toLocaleString('fr-FR');

/** Aperçu d'une ligne : la position atteinte au bout de la ligne. */
function preview(id: string): string {
  const { br, bloc } = BR[id], g = new Chess(); for (const m of br.moves) if (!tryMove(g, uciToObj(m.uci))) break;
  return miniBoard(g, bloc.side);
}
const small = (h: string) => h.replace('class="mini"', 'class="mini sm"');
/** Position après les `n` premiers demi-coups d'une partie. */
function positionAt(sans: string[], n: number): Chess { const g = new Chess(); for (let i = 0; i < n; i++) if (!tryMove(g, sans[i])) break; return g; }
/** Nom d'une ligne en mots simples : le camp et l'ouverture adverse, pas le nom de la variante. */
const plainBloc = (id: string) => { const { bloc: b, sys } = BR[id]; return `${shortName(sys.titre)}, ${b.titre.toLowerCase()}`; };

/** Les thèmes de faute, dits simplement. */
const PLAIN_THEME: Record<string, string> = { 'Coup calme': 'un bon coup tranquille manqué', 'Pièce en prise oubliée': 'une pièce en prise oubliée', 'Pièce déposée en prise': 'une pièce donnée', 'Pièce mise en prise': 'une pièce laissée en prise',
  'Pièce à prendre': 'une pièce à prendre', 'Capture gagnante ratée': 'une prise gagnante manquée', 'Échec gagnant raté': 'un échec gagnant manqué', 'Échec adverse ignoré': 'un échec adverse oublié' };
/** Les étapes du plan du jour, tirées de tes parties et de ton répertoire : tactique, lignes, un coup à retrouver. */
function dailyPlan() {
  const done = planDone(), steps: { key: string; thumb: string; title: string; sub: string; min: number; done: boolean; go: () => void }[] = [];
  const faults = priorityFaults(store.faults, store.state.fault, 5);
  if (faults.length) { const th: Record<string, number> = {}; for (const f of faults) th[f.theme] = (th[f.theme] || 0) + 1; const top = Object.entries(th).sort((x, y) => y[1] - x[1])[0][0];
    steps.push({ key: 'tac', thumb: miniBoard(new Chess(faults[0].fen), faults[0].side), title: `${plural(faults.length, 'position')} à résoudre`, sub: `Tirées de tes fautes : ${PLAIN_THEME[top] ?? top.toLowerCase()}`, min: Math.max(1, Math.round(faults.length * 0.6)), done: done.includes('tac'),
      go: () => startCycle('Plan du jour', faults, '#/', true) }); }
  const { due, fresh } = todayPool(REP, store.state.br), pool = [...due, ...fresh];
  if (pool.length) steps.push({ key: 'lines', thumb: preview(pool[0]), title: due.length ? `${plural(due.length, 'ligne')} à revoir${fresh.length ? `, ${fresh.length} à découvrir` : ''}` : `${plural(fresh.length, 'ligne')} à découvrir`,
    sub: plainBloc(pool[0]), min: pool.length, done: done.includes('lines'), go: () => { location.hash = startSession(PLAN_LINES, pool, '#/', pool[0]); } });
  const g = store.games.filter(x => x.st && x.wp).sort((x, y) => y.t - x.t)[0], k = g ? keyMoment(g) : null;
  if (g && k) steps.push({ key: 'review', thumb: miniBoard(positionAt(g.sans, k.ply), g.color), title: 'Un coup à retrouver', sub: `${Math.floor(k.ply / 2) + 1}${k.ply % 2 ? '…' : '.'}${k.san} ${ago(g.t * 1000)}, contre ${g.opp}`, min: 2, done: done.includes('review'),
    go: () => { markPlan('review'); location.hash = gameUrl(g.id, k.ply + 1, '#/'); } });
  return steps;
}

/** Les 7 derniers jours, aujourd'hui à droite : un point plein par jour d'entraînement. */
function weekStrip(days: string[]) {
  const set = new Set(days), cells: string[] = []; let n = 0;
  for (let k = 6; k >= 0; k--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - k); const on = set.has(dayKey(d.getTime())); if (on) n++;
    cells.push(`<span class="${on ? 'on' : ''}${k ? '' : ' now'}"><i></i>${d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span>`); }
  return `<div class="week" role="img" aria-label="${plural(n, "jour d'entraînement", "jours d'entraînement")} sur les 7 derniers">${cells.join('')}</div>`;
}

export function viewHome(root: HTMLElement) {
  // le cours à continuer vient des recommandations (un seul endroit en décide) ; les autres étapes du jour suivent
  const up = nextUp(), steps = dailyPlan().filter(s => !up || s.key !== 'lines'), todo = steps.filter(s => !s.done), next = up ? undefined : todo[0], later = up ? todo : todo.slice(1), did = steps.filter(s => s.done);
  const days = trainingDays(), n = streak(days), cold = coldStart(store.games);
  const games = store.games.filter(g => !store.state.ignored[g.id]), last = lastSession(games), res = (r: string) => last ? last.games.filter(g => g.res === r).length : 0;
  const hero = up ? `<section class="surf today now">
      <div class="today-top"><div class="today-text"><h2>${esc(shortName(up.u.sys.titre))}</h2><p class="rside">${esc(up.side)}</p><p>${up.why}</p></div></div>
      <button class="btn pri block" id="bGo">Continuer : ${up.label.toLowerCase()}</button><a class="quiet" href="#/rep/${up.u.bloc.id}/${up.u.sys.id}">Voir le cours</a></section>`
    : next ? `<section class="surf today now">
      <div class="today-top"><div class="today-text"><h2>${esc(next.title)}</h2><p>${esc(next.sub)}</p></div>${next.thumb}</div>
      <button class="btn pri block" id="bGo">${did.length ? 'Continuer' : 'Commencer'}, ${next.min} min</button></section>`
    : `<section class="surf today now"><div class="today-text"><h2>${steps.length ? 'Séance du jour terminée' : 'Tout est à jour'}</h2><p>${steps.length ? `${did.map(s => s.title.toLowerCase()).join(', ')}.` : 'Rien à revoir aujourd\'hui. Tu peux avancer dans ton répertoire ou rejouer tes fautes.'}</p></div>
      <a class="btn pri block" href="#/rep">Voir mes cours</a></section>`;
  root.innerHTML = `
    <header class="hello">
      <div><p class="date">${cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>Aujourd'hui</h1></div>
      <div class="hello-r">${n ? `<span class="pill${trainedToday(days) ? '' : ' off'}" title="${trainedToday(days) ? 'Série d\'entraînement en cours' : 'Entraîne-toi aujourd\'hui pour garder ta série'}">${n > 1 ? `${n} jours de suite` : '1 jour'}</span>` : ''}<a class="iconbtn" href="#/reglages" aria-label="Réglages">${icon('sliders')}</a></div>
    </header>
    ${weekStrip(days)}
    ${hero}
    ${next && !did.length && next.key === 'tac' && cold && cold.rest - cold.first >= 5 ? `<p class="hint">À faire avant de jouer : tu gagnes ${cold.first} % de tes 3 premières parties d'une session, ${cold.rest} % des suivantes.</p>` : ''}
    ${later.length || ((next || up) && did.length) ? `<section class="grp"><h2>${up ? 'Ensuite' : next ? 'Le reste de la séance' : 'Ta séance'}</h2><div class="surf card list">${[...later, ...did].map(s => `<button class="rowi${s.done ? ' isdone' : ''}" data-step="${steps.indexOf(s)}">${small(s.thumb)}<span class="body"><b>${esc(s.title)}</b><small>${s.done ? 'Fait. Touche pour le refaire' : esc(s.sub)}</small></span>${s.done ? icon('check', 'tick') : `<span class="dim">${s.min} min</span>`}${chev}</button>`).join('')}</div></section>` : ''}
    ${last ? `<section class="grp"><h2>Tes dernières parties</h2>
      <div class="surf card list"><a class="rowi sess" href="#/progres"><span class="body"><b>${cap(ago(last.t * 1000))}, ${plural(last.games.length, 'partie')}</b><small>${[res('W') ? plural(res('W'), 'gagnée') : '', res('D') ? plural(res('D'), 'nulle') : '', res('L') ? plural(res('L'), 'perdue') : ''].filter(Boolean).join(', ')}</small></span>
        <span class="dots" aria-hidden="true">${last.games.slice(-12).map(g => `<i class="${g.res}"></i>`).join('')}</span>${chev}</a>
      ${[...last.games].reverse().slice(0, 2).map(g => gameRow(g, '#/')).join('')}</div></section>` : ''}
    `;
  root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => steps[+b.dataset.step!].go()));
  $('#bGo', root)?.addEventListener('click', () => { if (up) { if (up.run) up.run(); else location.hash = up.href!; } else next!.go(); });
}

function lineStatus(br: Branch): string {
  const s = st(br.id), parts = [plural(Math.ceil(br.moves.length / 2), 'coup')];
  if (s?.runs) parts.push(isValid(s) ? (isDue(s) ? 'à revoir' : `validée, revient dans ${plural(Math.max(1, Math.ceil((s.due - Date.now()) / DAY)), 'jour')}`) : `${s.clean}/2 sans faute`);
  else parts.push('jamais jouée');
  return parts.join(', ');
}
/** Tes parties jouées dans un système (d'après la ligne du répertoire suivie le plus longtemps), les plus récentes d'abord. */
const gamesOfSystem = (sys: System) => store.games.filter(g => { const id = refBranch(g, BR); return !!id && BR[id].sys.id === sys.id; }).sort((a, b) => b.t - a.t);
/** Ce que tes parties disent de cette ouverture : score, et ce que tu fais de la sortie d'ouverture. */
function inYourGames(sys: System): string {
  const games = gamesOfSystem(sys), an = games.filter(g => g.st && myWp(g)); if (!games.length) return '';
  const score = Math.round(100 * games.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? 0.5 : 0), 0) / games.length);
  const at = (g: typeof an[number], ply: number) => { const w = myWp(g)!; return w[Math.min(ply, w.length - 1)]; };
  const avg = (ply: number) => Math.round(an.reduce((a, g) => a + at(g, ply), 0) / an.length);
  const drop = an.length ? avg(40) - avg(20) : 0;
  return `<p class="pnote">Dans tes parties : ${plural(games.length, 'jouée', 'jouées')}, ${score} % des points.${an.length >= 3 ? ` ${drop <= -5 ? `Tu perds en moyenne ${-drop} points de chances entre les coups 10 et 20 : c'est le plan du milieu de jeu qui te coûte, pas la théorie.` : drop >= 5 ? `Tu gagnes en moyenne ${drop} points de chances entre les coups 10 et 20.` : 'Tes chances restent stables entre les coups 10 et 20.'}` : ''}</p>`;
}
/** Page d'une ouverture : où tu en es (une seule mesure), ce qu'il faut corriger, tes lignes, puis les liens vers ses fautes et ses plans. */
export function viewSystem(root: HTMLElement, bloc: Bloc, sys: System) {
  const back = `#/rep/${bloc.id}/${sys.id}`, played = gamesOfSystem(sys);
  const u = unitFor(bloc, sys), known = knownLines(u, store.state.br);
  const own = ownLines(sys), nPun = sys.branches.length - own.length;
  const devs = recentDeviations(store.games, store.state.fixed, BR, Date.now(), 60, 10).filter(g => BR[refBranch(g, BR)!]?.sys.id === sys.id).slice(0, 3);
  const gids = new Set(played.map(g => g.id)), nFaults = store.faults.filter(f => gids.has(f.game)).length, plans = plansFor(sys.id);
  const cells = u.lessons.map(l => `<i class="${l.state}"></i>`).join('');
  // un cours : les lignes sous le nom de leur chapitre (une case du chemin), avec leur rôle ; sinon une seule liste
  const chapters = chaptersOf(own.filter(b => !b.type)), rest = own.filter(b => b.type);
  const groups: { name: string; lines: Branch[] }[] = chapters ? [...chapters, ...(rest.length ? [{ name: 'Tirées de tes parties', lines: rest }] : [])] : [{ name: '', lines: own }];
  const row = (br: Branch) => { const d = store.devs[br.id], nm = lineName(br.titre);
    return `<a class="rowi" href="${lineUrl(br.id, 'explore')}"><span class="body"><b>${br.type ? `<span class="ltype ${br.type}">${typeLabel(br.type)}</span>` : br.role ? `<span class="ltype ${br.role}">${roleLabel(br.role)}</span>` : ''}${esc(nm.title)}</b><small>${nm.detail ? `${esc(nm.detail)} · ` : ''}${lineStatus(br)}${d ? `, <em class="warn">${plural(d, 'sortie')} en partie</em>` : ''}</small></span>${isValid(st(br.id)) ? icon('check', 'tick') : ''}${chev}</a>`; };
  root.innerHTML = `
    ${pathBlock(u)}
    ${plans.length ? `<a class="surf card lk1" href="#/plans?o=${sys.id}&r=${encodeURIComponent(back)}"><b>Les plans de cette ouverture</b><span class="dim">${plans.length}</span>${chev}</a>` : ''}
    ${devs.length ? `<section class="grp fix"><h2>À corriger : quittée en partie</h2><div class="surf card list">${devs.map(g => devRow(g)).join('')}</div></section>` : ''}
    <details class="others allv"><summary>Toutes les variantes (${own.length})</summary><p class="pnote">${esc(sys.resume)}</p>${groups.map(g => `${g.name ? `<h3 class="chap">${esc(g.name)}</h3>` : ''}<div class="surf card list">${g.lines.map(row).join('')}</div>`).join('')}
      <button class="quiet" id="bDrill">Rejouer les ${own.length} variantes à la suite</button></details>
    ${nFaults ? `<a class="surf card lk1" href="#/wood?o=${sys.id}&r=${encodeURIComponent(back)}"><b>Tes fautes dans cette ouverture</b><span class="dim">${nFaults}</span>${chev}</a>` : ''}
    ${played.length ? `<section class="grp"><h2>Tes dernières parties dans cette ouverture</h2>${inYourGames(sys)}<div class="surf card list">${played.slice(0, 5).map(g => gameRow(g, back)).join('')}</div></section>` : ''}`;
  $('#bDrill', root).addEventListener('click', () => go(sys.titre, own.map(b => b.id), back));
  bindPath(root, u);

}
