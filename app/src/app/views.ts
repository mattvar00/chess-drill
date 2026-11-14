/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch, todayPool } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard, miniFen } from '../ui/board';
import { Chess, tryMove, uciToObj } from '../core/chess';
import { ALL_IDS, BR, PLANS, REP, markPlan, planDone, plansFor, store, trainingDays } from './store';
import { dayKey, streak, trainedToday } from '../core/streak';
import { getToken, lastSync } from './api';
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

/** Aperçu d'une ligne : la position atteinte au bout de la ligne. */
function preview(id: string): string {
  const { br, bloc } = BR[id], g = new Chess(); for (const m of br.moves) if (!tryMove(g, uciToObj(m.uci))) break;
  return miniBoard(g, bloc.side);
}
const small = (h: string) => h.replace('class="mini"', 'class="mini sm"');
const thumb = (game: Chess, orient: 'w' | 'b') => small(miniBoard(game, orient));
/** Position après les `n` premiers demi-coups d'une partie. */
function positionAt(sans: string[], n: number): Chess { const g = new Chess(); for (let i = 0; i < n; i++) if (!tryMove(g, sans[i])) break; return g; }
const lineThumb = (id: string) => small(preview(id));
/** Nom d'une ligne en mots simples : le camp et l'ouverture adverse, pas le nom de la variante. */
const plainBloc = (id: string) => { const b = BR[id].bloc; return `${b.side === 'w' ? 'Avec les Blancs' : 'Avec les Noirs'} : ${b.sous || b.titre}`; };

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
  const steps = dailyPlan(), todo = steps.filter(s => !s.done), next = todo[0], later = todo.slice(1), did = steps.filter(s => s.done);
  const days = trainingDays(), n = streak(days), cold = coldStart(store.games);
  const games = store.games.filter(g => !store.state.ignored[g.id]), last = lastSession(games), res = (r: string) => last ? last.games.filter(g => g.res === r).length : 0;
  const hero = next ? `<section class="surf today now">
      <div class="today-top"><div class="today-text"><h2>${esc(next.title)}</h2><p>${esc(next.sub)}</p></div>${next.thumb}</div>
      <button class="btn pri block" id="bGo">${did.length ? 'Continuer' : 'Commencer'}, ${next.min} min</button></section>`
    : `<section class="surf today now"><div class="today-text"><h2>${steps.length ? 'Séance du jour terminée' : 'Tout est à jour'}</h2><p>${steps.length ? `${did.map(s => s.title.toLowerCase()).join(', ')}.` : 'Rien à revoir aujourd\'hui. Tu peux avancer dans ton répertoire ou rejouer tes fautes.'}</p></div>
      <a class="btn pri block" href="#/entrainer">S'entraîner en libre</a></section>`;
  root.innerHTML = `
    <header class="hello">
      <div><p class="date">${cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>Aujourd'hui</h1></div>
      <div class="hello-r">${n ? `<span class="pill${trainedToday(days) ? '' : ' off'}" title="${trainedToday(days) ? 'Série d\'entraînement en cours' : 'Entraîne-toi aujourd\'hui pour garder ta série'}">${n > 1 ? `${n} jours de suite` : '1 jour'}</span>` : ''}<a class="iconbtn" href="#/reglages" aria-label="Réglages">${icon('sliders')}</a></div>
    </header>
    ${weekStrip(days)}
    ${hero}
    ${next && !did.length && next.key === 'tac' && cold && cold.rest - cold.first >= 5 ? `<p class="hint">À faire avant de jouer : tu gagnes ${cold.first} % de tes 3 premières parties d'une session, ${cold.rest} % des suivantes.</p>` : ''}
    ${later.length ? `<section class="grp"><h2>Ensuite</h2><div class="surf card list">${later.map(s => `<button class="rowi" data-step="${steps.indexOf(s)}">${small(s.thumb)}<span class="body"><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></span><span class="dim">${s.min} min</span>${chev}</button>`).join('')}</div></section>` : ''}
    ${next && did.length ? `<p class="doneline">${icon('check', 'tick')}<span>Déjà fait aujourd'hui : ${did.map(s => esc(s.title.toLowerCase())).join(', ')}</span></p>` : ''}
    ${last ? `<section class="grp"><h2>Tes dernières parties</h2>
      <div class="surf card list"><a class="rowi sess" href="#/progres"><span class="body"><b>${cap(ago(last.t * 1000))}, ${plural(last.games.length, 'partie')}</b><small>${[res('W') ? plural(res('W'), 'gagnée') : '', res('D') ? plural(res('D'), 'nulle') : '', res('L') ? plural(res('L'), 'perdue') : ''].filter(Boolean).join(', ')}</small></span>
        <span class="dots" aria-hidden="true">${last.games.slice(-12).map(g => `<i class="${g.res}"></i>`).join('')}</span>${chev}</a>
      ${[...last.games].reverse().slice(0, 2).map(g => gameRow(g, '#/')).join('')}</div></section>` : ''}
    ${next ? `<a class="quiet" href="#/entrainer">Choisir moi-même</a>` : ''}
    ${getToken() ? '' : `<div class="surf card list"><a class="rowi" href="#/reglages"><span class="body"><b>Relier l'app à tes parties</b><small>Entre ton code d'accès : le plan du jour s'appuiera sur tes propres parties, et ta progression suivra sur tous tes appareils.</small></span>${chev}</a></div>`}`;
  root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => steps[+b.dataset.step!].go()));
  $('#bGo', root)?.addEventListener('click', () => next!.go());
}

/** S'entraîner : tout ce qui se lance en libre. Chaque chose a sa forme : le répertoire et sa progression, les plans et les structures en images, les fautes en chiffre, les sorties de ligne coup contre coup. */
export function viewTrain(root: HTMLElement) {
  const devs = recentDeviations(store.games, store.state.fixed, BR), due = dueLines(ALL_IDS), posDue = duePositions(store.faults, store.state.fault), valid = validCount(ALL_IDS);
  const { due: d, fresh } = todayPool(REP, store.state.br), firstLine = d[0] ?? fresh[0] ?? ALL_IDS[0];
  const plan = PLANS[0], planPos = plan ? positionAt(plan.sans, plan.steps[0].p) : new Chess(), stPos = PLANS[1] ? positionAt(PLANS[1].sans, PLANS[1].steps[0].p) : planPos;
  root.innerHTML = `
    <header class="pagehead"><h1>S'entraîner</h1></header>
    <section class="grp"><h2>Tes ouvertures</h2>
      <a class="surf card feat" href="#/rep">${preview(firstLine)}<span class="body"><b>Répertoire</b><small>${validPhrase(valid, ALL_IDS.length)}</small>${bar(valid, ALL_IDS.length, 'big')}${due ? `<span class="due">${due} à revoir</span>` : ''}</span>${chev}</a>
      <div class="halves">
        <a class="surf card half" href="#/plans">${miniBoard(planPos, plan?.side ?? 'w')}<b>Plans animés</b><small>${plural(PLANS.length, 'plan')} : quoi faire une fois l'ouverture jouée</small></a>
        <a class="surf card half" href="#/structures">${miniFen(stPos.fen(), PLANS[1]?.side ?? 'w', 'p')}<b>Structures de pions</b><small>Ton score dans chacune, et le plan qui va avec</small></a>
      </div></section>
    <section class="grp"><h2>Tes fautes</h2>
      <a class="surf card feat count" href="#/wood"><b class="num">${store.faults.length}</b><span class="body"><b>Fautes à rejouer</b><small>${store.faults.length ? `${store.faults.length > 1 ? 'Positions tirées' : 'Position tirée'} de tes parties, à résoudre jusqu'à ne plus les rater` : 'Elles arrivent après la première analyse de tes parties'}</small>${posDue ? `<span class="due">${posDue} à revoir</span>` : ''}</span>${chev}</a></section>
    ${devs.length ? `<section class="grp"><h2>Là où tu as quitté ta ligne</h2><div class="surf card list">
      ${devs.slice(0, 3).map(g => { const id = refBranch(g, BR)!, exp = (g.a.expected || []).map(e => e.san);
        return `<a class="rowi" href="${lineUrl(id, 'drill', g.id)}">${thumb(positionAt(g.sans, g.a.ply ?? 0), g.color)}<span class="body"><b>Contre ${esc(g.opp)}, ${ago(g.t * 1000)}</b>
          <span class="swap"><span class="mv no">${esc(g.a.played ?? '')}</span>${exp.length ? `<small>au lieu de</small>${exp.slice(0, 2).map(x => `<span class="mv yes">${esc(x)}</span>`).join('')}` : ''}</span></span>${chev}</a>`; }).join('')}
    </div></section>` : ''}
    <section class="grp"><h2>Libre</h2><div class="row"><button class="btn" id="bMix">Lignes au hasard</button><a class="btn" href="#/explorer">Explorer une position</a></div></section>`;
  $('#bMix', root).addEventListener('click', () => go('Lignes au hasard', ALL_IDS, '#/entrainer'));
}

/** Filtre de la liste des blocs, gardé le temps de la visite. */
let sideFilter: 'all' | 'b' | 'w' = 'all';
const FILTERS = [['all', 'Tout'], ['b', 'Avec les Noirs'], ['w', 'Avec les Blancs']] as const;
export function viewBlocs(root: HTMLElement) {
  const valid = validCount(ALL_IDS), due = dueLines(ALL_IDS), blocs = REP.blocs.filter(b => sideFilter === 'all' || b.side === sideFilter);
  root.innerHTML = `
    <header class="pagehead">
      <div class="sumrow"><p>${validPhrase(valid, ALL_IDS.length)}</p>${due ? `<p class="duetxt">${due} à revoir</p>` : ''}</div>${bar(valid, ALL_IDS.length, 'big')}</header>
    <div class="seg" role="group" aria-label="Filtrer par couleur">${FILTERS.map(([v, l]) => `<button type="button" data-f="${v}" aria-pressed="${sideFilter === v}">${l}</button>`).join('')}</div>
    <div class="surf card list">${blocs.map(b => { const ids = idsOf(b); return `<a class="rowi" href="#/rep/${b.id}"><span class="chip ${b.side}"></span><span class="body"><b>${esc(b.titre)}</b><small>${esc(b.sous)}</small>${progLine(ids)}</span>${dueTag(dueLines(ids))}${chev}</a>`; }).join('')}</div>
    <section class="grp"><h2>Plans</h2><div class="surf card list">
      <a class="rowi" href="#/plans"><span class="ico">${icon('chart')}</span><span class="body"><b>Plans animés</b><small>${plural(PLANS.length, 'animation')} : ruptures, cases clés, pièces à échanger</small></span>${chev}</a>
      <a class="rowi" href="#/structures"><span class="ico">${icon('pawn')}</span><span class="body"><b>Plans par structure de pions</b><small>Tes structures, ton score dans chacune, et tes fautes à y rejouer</small></span>${chev}</a>
    </div></section>
    <details class="help"><summary>Comment ça marche</summary><p>Le drill te fait rejouer une ligne de mémoire ; Voir la ligne la montre avec ses commentaires. L'explorateur, sur chaque position, te laisse essayer tes propres coups avec l'avis du moteur. Deux passages sans faute valident une ligne, qui revient ensuite à intervalles de plus en plus longs. Le tirage favorise les lignes neuves et celles où tu es sorti du répertoire en partie.</p></details>`;
  root.querySelectorAll<HTMLButtonElement>('[data-f]').forEach(b => b.addEventListener('click', () => {
    sideFilter = b.dataset.f as typeof sideFilter; viewBlocs(root); root.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }));
}

const badge = (s: System) => `<span class="badge ${s.statut === 'joué' ? 'ok' : s.statut === 'à apprendre' ? 'learn' : ''}">${esc(s.statut)}</span>`;
export function viewBloc(root: HTMLElement, bloc: Bloc) {
  root.innerHTML = `<button class="btn pri block" id="bAll">Drill sur tout le bloc</button>
    <div class="surf card list">${bloc.systemes.map(s => { const ids = idsOf(s); return `<a class="rowi" href="#/rep/${bloc.id}/${s.id}"><span class="body"><span><b>${esc(s.titre)}</b>${badge(s)}</span><small class="clamp">${esc(s.resume)}</small>${progLine(ids)}</span>${dueTag(dueLines(ids))}${chev}</a>`; }).join('')}</div>`;
  $('#bAll', root).addEventListener('click', () => go(bloc.titre, idsOf(bloc), `#/rep/${bloc.id}`));
}

function lineStatus(br: Branch): string {
  const s = st(br.id), parts = [plural(Math.ceil(br.moves.length / 2), 'coup')];
  if (s?.runs) parts.push(isValid(s) ? (isDue(s) ? 'à revoir' : `validée, revient dans ${plural(Math.max(1, Math.ceil((s.due - Date.now()) / DAY)), 'jour')}`) : `${s.clean}/2 sans faute`);
  else parts.push('jamais jouée');
  return parts.join(', ');
}
/** Tes parties jouées dans un système (d'après la ligne du répertoire suivie le plus longtemps), les plus récentes d'abord. */
const gamesOfSystem = (sys: System) => store.games.filter(g => { const id = refBranch(g, BR); return !!id && BR[id].sys.id === sys.id; }).sort((a, b) => b.t - a.t);
/** Ce que tes parties disent de ce système : score, ce que tu fais de la sortie d'ouverture, et tes fautes à retravailler. */
function inYourGames(sys: System): string {
  const games = gamesOfSystem(sys), an = games.filter(g => g.st && myWp(g)); if (!games.length) return '';
  const score = Math.round(100 * games.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? 0.5 : 0), 0) / games.length);
  const at = (g: typeof an[number], ply: number) => { const w = myWp(g)!; return w[Math.min(ply, w.length - 1)]; };
  const avg = (ply: number) => Math.round(an.reduce((a, g) => a + at(g, ply), 0) / an.length);
  const ids = new Set(games.map(g => g.id)), faults = store.faults.filter(f => ids.has(f.game));
  const themes: Record<string, number> = {}; for (const f of faults) themes[f.theme] = (themes[f.theme] || 0) + 1;
  const top = Object.entries(themes).sort((a, b) => b[1] - a[1])[0];
  const drop = an.length ? avg(40) - avg(20) : 0;
  return `<section class="grp"><h2>Dans tes parties</h2>
    <div class="surf card stats"><div><b>${games.length}</b><span>${games.length > 1 ? 'parties' : 'partie'}</span></div><div><b>${score} %</b><span>de score</span></div><div><b>${an.length ? avg(20) + ' %' : '–'}</b><span>de chances au coup 10</span></div></div>
    ${an.length >= 3 ? `<p class="insight">${drop <= -5 ? `Tu sors bien de l'ouverture, puis tu perds en moyenne ${-drop} points de chances entre les coups 10 et 20 : c'est le plan du milieu de jeu qui te coûte, pas la théorie.` : drop >= 5 ? `Tu gagnes en moyenne ${drop} points de chances entre les coups 10 et 20 : tu connais les plans de ce système.` : 'Tes chances restent stables entre les coups 10 et 20.'}${top ? ` Ta faute la plus fréquente ici : ${top[0].toLowerCase()} (${top[1]}).` : ''}</p>` : ''}
    ${faults.length ? `<button class="btn block" id="bSysFaults">${icon('target')}Rejouer tes ${plural(faults.length, 'faute')} dans ce système</button>` : ''}
  </section>`;
}
export function viewSystem(root: HTMLElement, bloc: Bloc, sys: System) {
  const back = `#/rep/${bloc.id}/${sys.id}`;
  const played = gamesOfSystem(sys);
  root.innerHTML = `<p class="intro">${esc(sys.resume)}</p>
    ${inYourGames(sys)}
    <button class="btn pri block" id="bDrill">Drill sur ce système</button>
    ${plansFor(sys.id).length ? `<section class="grp"><h2>Plans animés</h2><div class="surf card list">${plansFor(sys.id).map(P => `<a class="rowi" href="#/plan/${P.id}"><span class="ico">${icon('chart')}</span><span class="body"><b>${esc(P.title)}</b><small>${esc(P.sub)}</small></span>${chev}</a>`).join('')}</div></section>` : ''}
    <div class="surf card list">${sys.branches.map(br => { const d = store.devs[br.id]; return `<a class="rowi" href="${lineUrl(br.id, 'explore')}"><span class="body"><b>${esc(br.titre)}</b><small>${lineStatus(br)}${d ? `, <em class="warn">${plural(d, 'sortie')} en partie</em>` : ''}</small></span>${isValid(st(br.id)) ? icon('check', 'tick') : ''}${chev}</a>`; }).join('')}</div>
    ${played.length ? `<section class="grp"><h2>Tes dernières parties dans ce système</h2><div class="surf card list">${played.slice(0, 5).map(g => gameRow(g, back)).join('')}</div></section>` : ''}`;
  $('#bDrill', root).addEventListener('click', () => go(sys.titre, idsOf(sys), back));
  root.querySelector('#bSysFaults')?.addEventListener('click', () => { const ids = new Set(gamesOfSystem(sys).map(g => g.id)); startCycle(sys.titre, store.faults.filter(f => ids.has(f.game))); });
}
