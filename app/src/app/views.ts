/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard, pieceSrc } from '../ui/board';
import { meetCounts } from '../core/rank';
import { bindPath, courseBoard, devRow, familyColor, nextUp, openCourse, otherUps, pathBlock, runUp, shortName, unitFor } from './path';
import { caseOf, chaptersOf, knownLines, ownLines } from '../core/path';
import { lineName, lineTitle, popBars, roleLabel, shortNom, typeLabel } from '../core/names';
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
  // la révision du jour : toutes les variantes dues, tous cours confondus (les nouvelles viennent du bouton « Continuer »)
  const due = ALL_IDS.filter(id => st(id)?.runs && isDue(st(id)) && BR[id].sys.statut !== 'plan').sort((x, y) => st(x).due - st(y).due), nCours = new Set(due.map(id => BR[id].sys.id)).size;
  if (due.length) steps.push({ key: 'lines', thumb: preview(due[0]), title: `${plural(due.length, 'variante')} à revoir`,
    sub: nCours > 1 ? `Dans ${nCours} cours, les plus anciennes d'abord` : plainBloc(due[0]), min: Math.max(1, Math.round(due.length * 0.7)), done: done.includes('lines'), go: () => { location.hash = startSession(PLAN_LINES, due, '#/', due[0]); } });
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

/**
 * Aujourd'hui = « Pour toi » : une pile de cartes plein écran, une chose à faire par carte, la plus utile d'abord.
 * Pas d'étiquette « recommandé » : c'est l'ordre qui recommande. On glisse vers le haut pour la suivante.
 */
export function viewHome(root: HTMLElement) {
  const up = nextUp(), steps = dailyPlan(), todo = steps.filter(s => !s.done), did = steps.filter(s => s.done);
  const days = trainingDays(), n = streak(days);
  type Card = { kick: string; fam?: string; title: string; why: string; board: string; cta: string; go: () => void };
  const cards: Card[] = [];
  if (up) {
    let board = courseBoard(up.u);
    if (up.line && BR[up.line]) { const { br, bloc } = BR[up.line], g = new Chess(), stop = br.marks ? Math.max(...Object.keys(br.marks).map(Number)) + 1 : Math.min(br.moves.length, 10);
      for (const m of br.moves.slice(0, stop)) if (!tryMove(g, uciToObj(m.uci))) break; board = miniBoard(g, bloc.side); }
    cards.push({ kick: shortName(up.u.sys.titre), fam: familyColor(up.u.bloc.id), title: up.line ? lineTitle(BR[up.line].br.titre) : shortName(up.u.sys.titre), why: up.why, board, cta: up.label, go: () => runUp(up) });
  }
  for (const s of todo) cards.push({ kick: 'Ta séance', title: s.title, why: s.sub, board: s.thumb, cta: `Commencer · ${s.min} min`, go: s.go });
  for (const a of up ? otherUps(up.u.sys.id) : []) cards.push({ kick: shortName(a.u.sys.titre), fam: familyColor(a.u.bloc.id), title: shortName(a.u.sys.titre), why: a.why, board: courseBoard(a.u), cta: 'Ouvrir le cours', go: () => openCourse(a.u) });
  const head = `<header class="hello fhead"><h1>Pour toi</h1>
      <div class="hello-r">${n ? `<span class="pill${trainedToday(days) ? '' : ' off'}" title="${trainedToday(days) ? 'Série d\'entraînement en cours' : 'Entraîne-toi aujourd\'hui pour garder ta série'}">${n > 1 ? `${n} jours` : '1 jour'}</span>` : ''}<a class="iconbtn" href="#/reglages" aria-label="Réglages">${icon('sliders')}</a></div></header>`;
  if (!cards.length) {
    root.innerHTML = `${head}<section class="surf today now"><div class="today-text"><h2>${did.length ? 'Séance terminée' : 'Tout est à jour'}</h2><p>${did.length ? 'Reviens demain, ou avance dans un cours.' : 'Rien à revoir aujourd\'hui.'}</p></div><a class="btn pri block" href="#/rep">Voir mes cours</a></section>`;
    return;
  }
  root.innerHTML = `${head}
    <div class="feed" id="feed">${cards.map((c, i) => `<section class="fcard" style="${c.fam ? `--fam:${c.fam}` : ''}" aria-label="${esc(c.title)}">
      <p class="fkick"><i class="famdot" aria-hidden="true"></i>${esc(c.kick)}</p>
      <div class="fboard">${c.board}</div>
      <div class="ftext"><h2>${esc(c.title)}</h2><p>${c.why}</p></div>
      <button class="btn pri block" data-card="${i}">${esc(c.cta)}</button>
      ${i < cards.length - 1 ? `<button class="fnext" data-next="${i + 1}" aria-label="Carte suivante">${icon('chev')}</button>` : ''}</section>`).join('')}</div>
    ${cards.length > 1 ? `<div class="fdots" aria-hidden="true">${cards.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>` : ''}`;
  const feed = $('#feed', root), dots = [...root.querySelectorAll<HTMLElement>('.fdots i')];
  feed.addEventListener('click', e => { const t = e.target as HTMLElement, c = t.closest<HTMLElement>('[data-card]'), nx = t.closest<HTMLElement>('[data-next]');
    if (c) cards[+c.dataset.card!].go(); else if (nx) feed.children[+nx.dataset.next!].scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  feed.addEventListener('scroll', () => { const k = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight)); dots.forEach((d, i) => d.classList.toggle('on', i === k)); }, { passive: true });
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
    return `<a class="rowi" href="${lineUrl(br.id, 'explore')}"><span class="body"><b>${popBars(br.pop)}${br.type ? `<span class="ltype ${br.type}">${typeLabel(br.type)}</span>` : br.role ? `<span class="ltype ${br.role}">${roleLabel(br.role)}</span>` : ''}${esc(nm.title)}</b><small>${br.nom ? `${esc(shortNom(br.nom))} · ` : nm.detail ? `${esc(nm.detail)} · ` : ''}${lineStatus(br)}${d ? `, <em class="warn">${plural(d, 'sortie')} en partie</em>` : ''}</small></span>${isValid(st(br.id)) ? icon('check', 'tick') : ''}${chev}</a>`; };
  const plusIds = own.filter(b => b.plus).map(b => b.id), plusLeft = plusIds.filter(id => !store.state.br[id]?.clean);
  root.innerHTML = `
    ${pathBlock(u)}
    ${devs.length ? `<section class="grp fix"><h2>À corriger : quittée en partie</h2><div class="surf card list">${devs.map(g => devRow(g)).join('')}</div></section>` : ''}
    ${plusIds.length ? (u.promoted ? `<button class="surf card lk1" id="bPlus"><b>Pour aller plus loin</b><span class="dim">${plusLeft.length ? plural(plusLeft.length, 'variante rare', 'variantes rares') : 'tout est su'}</span>${chev}</button>` : `<p class="pnote plusnote">Pour aller plus loin : ${plural(plusIds.length, 'variante rare', 'variantes rares')}, après la dame.</p>`) : ''}
    <details class="others allv morec"><summary>Plus : plans, variantes, tes parties</summary>
    ${plans.length ? `<a class="surf card lk1" href="#/plans?o=${sys.id}&r=${encodeURIComponent(back)}"><b>Les plans de cette ouverture</b><span class="dim">${plans.length}</span>${chev}</a>` : ''}
    ${(sys.modeles ?? []).map(m => `<a class="surf card lk1" href="${lineUrl(m.id, 'explore')}"><b>Partie modèle</b><span class="dim">${esc(m.titre)}</span>${chev}</a>`).join('')}
    ${nFaults ? `<a class="surf card lk1" href="#/wood?o=${sys.id}&r=${encodeURIComponent(back)}"><b>Tes fautes dans cette ouverture</b><span class="dim">${nFaults}</span>${chev}</a>` : ''}
    <h3 class="chap">Toutes les variantes (${own.length})</h3><p class="pnote">${esc(sys.resume)}</p>${groups.map(g => `${g.name ? `<h3 class="chap">${esc(g.name)}</h3>` : ''}<div class="surf card list">${g.lines.map(row).join('')}</div>`).join('')}
      <button class="quiet" id="bDrill">Rejouer les ${own.length} variantes à la suite</button>
    ${played.length ? `<section class="grp"><h2>Tes dernières parties dans cette ouverture</h2>${inYourGames(sys)}<div class="surf card list">${played.slice(0, 5).map(g => gameRow(g, back)).join('')}</div></section>` : ''}</details>`;
  $('#bDrill', root).addEventListener('click', () => go(sys.titre, own.map(b => b.id), back));
  root.querySelector('#bPlus')?.addEventListener('click', () => go(`${shortName(sys.titre)} : pour aller plus loin`, plusLeft.length ? plusLeft : plusIds, back));
  bindPath(root, u);

}
