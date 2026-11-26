/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard, pieceSrc } from '../ui/board';
import { meetCounts } from '../core/rank';
import { endDue, endFen, endgameGames, material } from './endgame';
import { bindPath, courseBoard, devRow, familyColor, nextUp, openCourse, otherUps, pathBlock, runUp, setCourseView, shortName, unitFor } from './path';
import { caseOf, chaptersOf, knownLines, ownLines } from '../core/path';
import { lineName, lineTitle, nomTitle, plainName, popBars, roleLabel, shortNom, typeLabel, variantTitle } from '../core/names';
import { structureStats } from '../core/stats';
import { Chess, tryMove, uciToObj } from '../core/chess';
import { ALL_IDS, BR, REP, markPlan, planDone, store, trainingDays } from './store';
import { dayKey, streak, trainedToday } from '../core/streak';
import { lineUrl, startSession } from './session';
import { duePositions, hangFaults, priorityFaults } from '../core/wood';
import { gameRow, gameUrl } from './games';
import { PLAN_LINES } from './trainer';
import { startCycle } from './wood';
import { currentWeek, stepDone } from './week';
import { convertList } from './convert';
import { woodHistory } from './store';
import { coldStart, keyMoment, lastSession, myWp } from '../core/stats';
import { courseHead, gamesOfSystem, mountTree, type CourseTab } from './course';

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
  'Pièce à prendre': 'une pièce à prendre', 'Capture gagnante ratée': 'une prise gagnante manquée', 'Échec gagnant raté': 'un échec gagnant manqué', 'Échec adverse ignoré': 'un échec adverse oublié',
  'Pion perdu': 'un pion perdu', 'Menace ignorée': 'une menace ignorée', 'Mat adverse ignoré': 'un mat oublié', 'Mat raté': 'un mat manqué', 'Tactique ratée': 'une tactique manquée', 'Mauvaise reprise': 'une mauvaise reprise' };
/** Les étapes du plan du jour, tirées de tes parties et de ton répertoire : tactique, lignes, un coup à retrouver. */
function dailyPlan() {
  const done = planDone(), steps: { key: string; thumb: string; title: string; sub: string; min: number; done: boolean; go: () => void }[] = [];
  const faults = priorityFaults(store.faults, store.state.fault, 5);
  if (faults.length) { const th: Record<string, number> = {}; for (const f of faults) th[f.theme] = (th[f.theme] || 0) + 1; const top = Object.entries(th).sort((x, y) => y[1] - x[1])[0][0];
    steps.push({ key: 'tac', thumb: miniBoard(new Chess(faults[0].fen), faults[0].side), title: `${plural(faults.length, 'position')} à résoudre`, sub: `Tirées de tes fautes : ${PLAIN_THEME[top] ?? top.toLowerCase()}`, min: Math.max(1, Math.round(faults.length * 0.6)), done: done.includes('tac'),
      go: () => startCycle('Séance du jour', faults, '#/', true) }); }
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
const WARM = 'Échauffement : pièces en prise';
export function viewHome(root: HTMLElement) {
  const up = nextUp(), steps = dailyPlan(), todo = steps.filter(s => !s.done), did = steps.filter(s => s.done);
  const days = trainingDays(), n = streak(days);
  type Card = { kick: string; fam?: string; title: string; why: string; board: string; cta: string; go: () => void };
  const cards: Card[] = [];
  if (up) {
    let board = courseBoard(up.u);
    if (up.line && BR[up.line]) { const { br, bloc } = BR[up.line], g = new Chess(), stop = br.marks ? Math.max(...Object.keys(br.marks).map(Number)) + 1 : Math.min(br.moves.length, 10);
      for (const m of br.moves.slice(0, stop)) if (!tryMove(g, uciToObj(m.uci))) break; board = miniBoard(g, bloc.side); }
    cards.push({ kick: shortName(up.u.sys.titre), fam: familyColor(up.u.bloc.id), title: up.line ? variantTitle(BR[up.line].br).title : shortName(up.u.sys.titre), why: up.line && variantTitle(BR[up.line].br).sub ? `${esc(variantTitle(BR[up.line].br).sub)}. ${up.why}` : up.why, board, cta: up.label, go: () => runUp(up) });
  }
  // ta dernière partie s'est jouée en finale et tu n'as pas gagné : la table dit où ça s'est décidé
  const eg = endgameGames(1)[0];
  if (eg && eg.res !== 'W' && Date.now() / 1000 - eg.t < 3 * 86400) { const c = new Chess(endFen(eg));
    cards.splice(Math.min(1, cards.length), 0, { kick: 'Ta finale', title: material(c.fen(), eg.color), why: `${eg.res === 'L' ? 'Perdue' : 'Nulle'} contre ${esc(eg.opp)}. La table dit où ça s'est joué.`, board: miniBoard(c, eg.color), cta: 'Voir ma finale', go: () => { location.hash = `#/finale/${encodeURIComponent(eg.id)}`; } }); }
  // des finales à revoir (tes fautes d'abord, puis les leçons dont le délai est passé)
  else { const due = endDue(); if (due) cards.splice(Math.min(1, cards.length), 0, { kick: 'Finales', title: due.title, why: `${plural(due.n, 'position')} à revoir.`, board: miniBoard(new Chess(due.fen), due.side), cta: 'Revoir', go: () => { location.hash = due.href; } }); }
  // le plan de la semaine : l'étape du jour d'abord, les trois étapes en dessous
  { const w = currentWeek(), st = w.steps.map(x => ({ x, ok: stepDone(w, x) })), nx = st.find(y => !y.ok), nDone = st.filter(y => y.ok).length;
    if (st.length) {
      const list = `<span class="wsteps">${st.map(({ x, ok }) => `<span class="${ok ? 'ok' : x === nx?.x ? 'now' : ''}"><i></i>${esc(x.title)}</span>`).join('')}</span>`;
      // la miniature de l'étape : l'ouverture, la position à conclure, ou une de ces fautes
      const sysId = nx?.x.id === 'open' ? (/o=([^,&]+)/.exec(nx.x.href)?.[1] ?? null) : null, fb = sysId ? REP.blocs.find(b => b.systemes.some(x => x.id === sysId)) : null;
      const cv = nx?.x.id === 'conv' ? convertList()[0] : null, ft = store.faults.find(f => nx?.x.label === 'Pièces en prise' ? /en prise/.test(f.theme) : true);
      const brd = fb && sysId ? courseBoard(unitFor(fb, fb.systemes.find(x => x.id === sysId)!)).replace('mini cthumb', 'mini') : cv ? miniBoard(new Chess(cv.fen), cv.g.color) : ft ? miniBoard(new Chess(ft.fen), ft.side) : '';
      cards.unshift({ kick: `Ta semaine · ${nDone} sur ${st.length}`, title: nx ? nx.x.title : 'Semaine terminée', why: `${nx ? esc(nx.x.sub) : 'Les trois étapes sont faites. Le nouveau programme arrive lundi.'}${list}`,
        board: brd, cta: nx ? 'Commencer' : 'Voir mes progrès', go: () => { location.hash = nx ? nx.x.href : '#/progres'; } }); } }
  for (const s of todo) cards.push({ kick: 'Ta séance', title: s.title, why: s.sub, board: s.thumb, cta: `Commencer · ${s.min} min`, go: s.go });
  // les autres cours ne sont plus poussés ici : ils sont dans l'onglet Ouvertures, rangés par ouverture
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
export function viewSystem(root: HTMLElement, bloc: Bloc, sys: System, tab: CourseTab = 'chemin', base?: string) {
  const back = base ?? `#/rep/${bloc.id}/${sys.id}`, played = gamesOfSystem(sys);
  const u = unitFor(bloc, sys), known = knownLines(u, store.state.br);
  const own = ownLines(sys), nPun = sys.branches.length - own.length;
  const devs = recentDeviations(store.games, store.state.fixed, BR, Date.now(), 60, 10).filter(g => BR[refBranch(g, BR)!]?.sys.id === sys.id).slice(0, 3);
  const gids = new Set(played.map(g => g.id)), nFaults = store.faults.filter(f => gids.has(f.game)).length;
  const cells = u.lessons.map(l => `<i class="${l.state}"></i>`).join('');
  // un cours : les lignes sous le nom de leur chapitre (une case du chemin), avec leur rôle ; sinon une seule liste
  const chapters = chaptersOf(own.filter(b => !b.type)), rest = own.filter(b => b.type);
  const groups: { name: string; lines: Branch[] }[] = chapters ? [...chapters, ...(rest.length ? [{ name: 'Tirées de tes parties', lines: rest }] : [])] : [{ name: '', lines: own }];
  // une ligne par variante : son nom en mots, et une coche quand elle est sue. Le reste (coups, fréquence, type) se voit en l'ouvrant.
  // un groupe porte le nom officiel que partagent ses variantes ; chaque ligne dit alors seulement ce que fait l'adversaire
  const commonNom = (ls: Branch[]) => { const c = new Map<string, number>(); for (const b of ls) if (b.nom) c.set(b.nom, (c.get(b.nom) ?? 0) + 1); const best = [...c].sort((x, y) => y[1] - x[1])[0]; return best && best[1] * 2 >= ls.length ? best[0] : ''; };
  const row = (br: Branch, common = '') => { const st = store.state.br[br.id], known = !!st?.clean && st.clean >= 1, due = known && isDue(st!), v = variantTitle(br), same = !!common && br.nom === common;
    return `<a class="rowi vrow" href="${lineUrl(br.id, 'explore')}"><span class="body"><b>${esc(same ? v.sub || v.title : v.title)}</b>${!same && v.sub ? `<small>${esc(v.sub)}</small>` : ''}${due ? '<small class="due">à revoir</small>' : ''}</span>${known && !due ? `<span class="vok">${icon('check')}</span>` : ''}${chev}</a>`; };
  const plusIds = own.filter(b => b.plus).map(b => b.id), plusLeft = plusIds.filter(id => !store.state.br[id]?.clean);
  const head = courseHead(sys, back, tab);
  if (tab === 'arbre') { root.innerHTML = head + '<div id="ctree"></div>'; mountTree($('#ctree', root), bloc, sys, own.filter(b => !b.type)); return; }
  root.innerHTML = `${head}
    ${pathBlock(u)}
    ${devs.length ? `<section class="grp fix"><h2>À corriger : quittée en partie</h2><div class="surf card list">${devs.map(g => devRow(g)).join('')}</div></section>` : ''}
    ${plusIds.length ? (u.promoted ? `<button class="surf card lk1" id="bPlus"><b>Pour aller plus loin</b><span class="dim">${plusLeft.length ? plural(plusLeft.length, 'variante rare', 'variantes rares') : 'tout est su'}</span>${chev}</button>` : `<p class="pnote plusnote">Pour aller plus loin : ${plural(plusIds.length, 'variante rare', 'variantes rares')}, après la dame.</p>`) : ''}
    <details class="others allv morec"><summary>Plus : toutes les variantes, tes fautes, tes parties</summary>
    ${nFaults ? `<a class="surf card lk1" href="#/wood?o=${sys.id}&r=${encodeURIComponent(back)}"><b>Tes fautes dans cette ouverture</b><span class="dim">${nFaults}</span>${chev}</a>` : ''}
    <h3 class="chap">Toutes les variantes</h3>${groups.map(g => { const cn = commonNom(g.lines); return `${g.name ? `<h3 class="chap">${esc(cn ? nomTitle(cn) : g.name.split(' : ')[0])}</h3>` : ''}<div class="surf card list">${g.lines.map(b => row(b, cn)).join('')}</div>`; }).join('')}
      <button class="quiet" id="bDrill">Rejouer les ${own.length} variantes à la suite</button>
    ${played.length ? `<section class="grp"><h2>Tes dernières parties dans cette ouverture</h2>${inYourGames(sys)}<div class="surf card list">${played.slice(0, 5).map(g => gameRow(g, back)).join('')}</div></section>` : ''}</details>`;
  $('#bDrill', root).addEventListener('click', () => go(sys.titre, own.map(b => b.id), back));
  root.querySelector('#bPlus')?.addEventListener('click', () => go(`${shortName(sys.titre)} : pour aller plus loin`, plusLeft.length ? plusLeft : plusIds, back));
  bindPath(root, u);

}

setCourseView(viewSystem);
