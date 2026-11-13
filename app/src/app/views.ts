/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch, todayPool } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard } from '../ui/board';
import { Chess, tryMove, uciToObj } from '../core/chess';
import { ALL_IDS, BR, PLANS, REP, markPlan, planDone, plansFor, store, trainingDays } from './store';
import { streak, trainedToday } from '../core/streak';
import { getToken, lastSync } from './api';
import { lineUrl, startSession } from './session';
import { duePositions, priorityFaults } from '../core/wood';
import { gameRow, gameUrl } from './games';
import { PLAN_LINES } from './trainer';
import { startCycle } from './wood';
import { coldStart, keyMoment, myWp } from '../core/stats';

const DAY = 864e5;
const st = (id: string) => store.state.br[id];
const validCount = (ids: string[]) => ids.filter(id => isValid(st(id))).length;
const idsOf = (b: Bloc | System) => 'systemes' in b ? b.systemes.flatMap(s => s.branches.map(x => x.id)) : b.branches.map(x => x.id);
const go = (label: string, pool: string[], back: string) => { location.hash = startSession(label, pool, back); };
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} jours`; };
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
/** Bilan des 7 derniers jours de parties analysées. */
function week() {
  const since = Date.now() / 1000 - 7 * 86400, gs = store.games.filter(g => g.t >= since && g.st && g.st.acc != null);
  if (!gs.length) return null;
  return { n: gs.length, acc: Math.round(gs.reduce((a, g) => a + (g.st!.acc || 0), 0) / gs.length), wins: gs.filter(g => g.res === 'W').length, blunders: gs.reduce((a, g) => a + g.st!.blunder, 0) };
}

const thumb = (game: Chess, orient: 'w' | 'b') => miniBoard(game, orient).replace('class="mini"', 'class="mini sm"');
/** Position après les `n` premiers demi-coups d'une partie. */
function positionAt(sans: string[], n: number): Chess { const g = new Chess(); for (let i = 0; i < n; i++) if (!tryMove(g, sans[i])) break; return g; }
const lineThumb = (id: string) => { const { br, bloc } = BR[id], g = new Chess(); for (const m of br.moves) if (!tryMove(g, uciToObj(m.uci))) break; return thumb(g, bloc.side); };
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
    steps.push({ key: 'tac', thumb: thumb(new Chess(faults[0].fen), faults[0].side), title: `${plural(faults.length, 'position')} à résoudre`, sub: `Tirées de tes fautes : ${PLAIN_THEME[top] ?? top.toLowerCase()}`, min: Math.max(1, Math.round(faults.length * 0.6)), done: done.includes('tac'),
      go: () => startCycle('Plan du jour', faults, '#/', true) }); }
  const { due, fresh } = todayPool(REP, store.state.br), pool = [...due, ...fresh];
  if (pool.length) steps.push({ key: 'lines', thumb: lineThumb(pool[0]), title: due.length ? `${plural(due.length, 'ligne')} à revoir${fresh.length ? `, ${fresh.length} à découvrir` : ''}` : `${plural(fresh.length, 'ligne')} à découvrir`,
    sub: plainBloc(pool[0]), min: pool.length, done: done.includes('lines'), go: () => { location.hash = startSession(PLAN_LINES, pool, '#/', pool[0]); } });
  const g = store.games.filter(x => x.st && x.wp).sort((x, y) => y.t - x.t)[0], k = g ? keyMoment(g) : null;
  if (g && k) steps.push({ key: 'review', thumb: thumb(positionAt(g.sans, k.ply), g.color), title: 'Un coup à retrouver', sub: `${Math.floor(k.ply / 2) + 1}${k.ply % 2 ? '…' : '.'}${k.san} ${ago(g.t * 1000)}, contre ${g.opp}`, min: 2, done: done.includes('review'),
    go: () => { markPlan('review'); location.hash = gameUrl(g.id, k.ply + 1, '#/'); } });
  return steps;
}

export function viewHome(root: HTMLElement) {
  const steps = dailyPlan(), next = steps.find(s => !s.done), total = steps.reduce((a, s) => a + s.min, 0), left = steps.filter(s => !s.done).length;
  const days = trainingDays(), n = streak(days), cold = coldStart(store.games);
  const lead = !steps.length ? 'Rien de prévu aujourd\'hui : tout est à jour.' : !next ? 'Plan du jour terminé.' : left < steps.length ? `Encore ${plural(left, 'exercice')}.`
    : `${steps.length === 1 ? 'Un exercice' : steps.length === 2 ? 'Deux exercices' : 'Trois exercices'}${store.games.length ? ' tirés de tes parties' : ''}, ${plural(total, 'minute')}.`;
  root.innerHTML = `
    <header class="hello">
      <div><p class="date">${cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>Aujourd'hui</h1></div>
      <div class="hello-r">${n ? `<span class="pill${trainedToday(days) ? '' : ' off'}" title="${trainedToday(days) ? 'Série d\'entraînement en cours' : 'Entraîne-toi aujourd\'hui pour garder ta série'}">${n > 1 ? `${n} jours de suite` : '1 jour'}</span>` : ''}<a class="iconbtn" href="#/reglages" aria-label="Réglages">${icon('sliders')}</a></div>
    </header>
    <p class="leadline">${lead}</p>
    ${steps.length ? `<div class="surf card list plan">${steps.map((s, i) => `<button class="rowi step${s.done ? ' isdone' : ''}" data-step="${i}">${s.thumb}<span class="body"><small class="stepn${s === next ? ' on' : ''}">${s.done ? 'Fait' : `Étape ${i + 1}, ${s.min} min`}</small><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></span>${s.done ? icon('check', 'tick') : ''}</button>`).join('')}</div>` : ''}
    ${next ? `<button class="btn pri block" id="bGo">${left < steps.length ? 'Continuer' : 'Commencer'}</button>` : `<a class="btn pri block" href="#/entrainer">S'entraîner en libre</a>`}
    ${cold && cold.rest - cold.first >= 5 && steps[0]?.key === 'tac' ? `<section class="surf card padded why2">
      <div class="bars3" role="img" aria-label="${cold.first} % de victoires sur les parties 1 à 3 d'une session, ${cold.rest} % ensuite"><i class="lo" style="height:${cold.first}%"></i><i style="height:${cold.rest}%"></i><i style="height:${cold.rest}%"></i></div>
      <div><b>Pourquoi commencer par la tactique</b><small>Tu gagnes ${cold.first} % de tes 3 premières parties d'une session, ${cold.rest} % des suivantes.</small></div></section>` : ''}
    ${next ? `<a class="quiet" href="#/entrainer">Choisir moi-même</a>` : ''}
    ${getToken() ? '' : `<div class="surf card list"><a class="rowi" href="#/reglages"><span class="body"><b>Relier l'app à tes parties</b><small>Entre ton code d'accès : le plan du jour s'appuiera sur tes propres parties, et ta progression suivra sur tous tes appareils.</small></span>${chev}</a></div>`}`;
  root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => b.addEventListener('click', () => steps[+b.dataset.step!].go()));
  $('#bGo', root)?.addEventListener('click', () => next!.go());
}

/** S'entraîner : tout ce qui se lance en libre, rangé par intention. */
export function viewTrain(root: HTMLElement) {
  const devs = recentDeviations(store.games, store.state.fixed, BR), due = dueLines(ALL_IDS), posDue = duePositions(store.faults, store.state.fault);
  const { due: d, fresh } = todayPool(REP, store.state.br), firstLine = d[0] ?? fresh[0] ?? ALL_IDS[0], f0 = store.faults[0];
  const start = new Chess(), plan = PLANS[0], planPos = plan ? positionAt(plan.sans, plan.steps[0].p) : start;
  const item = (href: string, th: string, title: string, sub: string, tag = '') => `<a class="rowi" href="${href}">${th}<span class="body"><b>${title}</b><small>${sub}</small></span>${tag ? `<span class="due">${tag}</span>` : ''}${chev}</a>`;
  root.innerHTML = `
    <header class="pagehead"><h1>S'entraîner</h1><div class="sumrow"><p>Quand tu veux choisir toi-même</p></div></header>
    <section class="grp"><h2>Tes ouvertures</h2><div class="surf card list">
      ${item('#/rep', lineThumb(firstLine), 'Répertoire', `${plural(ALL_IDS.length, 'ligne')}, ${validCount(ALL_IDS)} validée${validCount(ALL_IDS) > 1 ? 's' : ''}`, due ? `${due} à revoir` : '')}
      ${item('#/plans', thumb(planPos, plan?.side ?? 'w'), 'Plans animés', `${plural(PLANS.length, 'plan')} : quoi faire une fois l'ouverture jouée`)}
      ${item('#/structures', thumb(planPos, plan?.side ?? 'w'), 'Structures de pions', 'Ton score dans chacune, et le plan qui va avec')}
    </div></section>
    <section class="grp"><h2>Tes fautes</h2><div class="surf card list">
      ${item('#/wood', thumb(f0 ? new Chess(f0.fen) : start, f0?.side ?? 'w'), 'Fautes à rejouer', store.faults.length ? `${plural(store.faults.length, 'position tirée', 'positions tirées')} de tes parties` : 'Elles arrivent après la première analyse de tes parties', posDue ? `${posDue} à revoir` : '')}
      ${devs.slice(0, 3).map(g => { const id = refBranch(g, BR)!; return item(lineUrl(id, 'drill', g.id), thumb(positionAt(g.sans, g.a.ply ?? 0), g.color), `Tu as quitté ta ligne ${ago(g.t * 1000)}`, `Contre ${esc(g.opp)} : tu as joué ${esc(g.a.played ?? '')}${(g.a.expected || []).length ? `, ta ligne joue ${esc(g.a.expected!.map(e => e.san).join(' ou '))}` : ''}`); }).join('')}
    </div></section>
    <section class="grp"><h2>Libre</h2><div class="surf card list">
      <button class="rowi" id="bMix">${lineThumb(ALL_IDS[Math.floor(ALL_IDS.length / 2)])}<span class="body"><b>Lignes au hasard</b><small>Tout le répertoire, les lignes fragiles d'abord</small></span>${chev}</button>
      ${item('#/explorer', thumb(start, 'w'), 'Explorer une position', "Joue tes coups, le moteur donne son avis")}
    </div></section>`;
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
