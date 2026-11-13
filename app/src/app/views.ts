/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch, todayPool } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard } from '../ui/board';
import { Chess, tryMove, uciToObj } from '../core/chess';
import { ALL_IDS, BR, PLANS, REP, plansFor, store, trainingDays } from './store';
import { streak, trainedToday } from '../core/streak';
import { getToken, lastSync } from './api';
import { lineUrl, startSession } from './session';
import { duePositions } from '../core/wood';
import { gameRow } from './games';
import { startCycle } from './wood';
import { myWp } from '../core/stats';

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

export function viewHome(root: HTMLElement) {
  const { due, fresh } = todayPool(REP, store.state.br), pool = [...due, ...fresh], first = pool[0];
  const devs = recentDeviations(store.games, store.state.fixed, BR), w = week();
  const valid = validCount(ALL_IDS), posDue = duePositions(store.faults, store.state.fault);
  const lastId = Object.entries(store.state.br).sort((x, y) => y[1].last - x[1].last)[0]?.[0] ?? 'B2a';
  const headline = due.length ? `${plural(due.length, 'ligne')} à revoir` : fresh.length ? `${plural(fresh.length, 'nouvelle ligne', 'nouvelles lignes')}` : 'Tout est à jour';
  const sub = due.length && fresh.length ? `et ${plural(fresh.length, 'nouvelle', 'nouvelles')} à apprendre` : !pool.length ? 'Rien à revoir aujourd\'hui. Un drill mixte entretient le reste.' : !due.length ? 'à apprendre aujourd\'hui' : '';
  const name = String(store.state.settings.name ?? '').trim(), days = trainingDays(), n = streak(days);
  const latest = store.games.filter(g => g.st).sort((a, b) => b.t - a.t)[0];
  root.innerHTML = `
    <header class="hello">
      <div><p class="date">${cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>Bonjour${name ? ' ' + esc(name) : ''}</h1></div>
      <div class="hello-r">${n ? `<span class="pill${trainedToday(days) ? '' : ' off'}" title="${trainedToday(days) ? 'Série d\'entraînement en cours' : 'Entraîne-toi aujourd\'hui pour garder ta série'}">${icon('flame')}${plural(n, 'jour')}</span>` : ''}<a class="iconbtn" href="#/reglages" aria-label="Réglages">${icon('sliders')}</a></div>
    </header>

    <section class="surf today">
      <div class="today-top">
        <div class="today-text"><p class="label">Séance du jour</p><h2>${headline}</h2>${sub ? `<p>${sub}</p>` : ''}${first ? `<p class="nextline">D'abord : ${esc(BR[first].br.titre)}</p>` : ''}</div>
        ${preview(first ?? lastId)}
      </div>
      <button class="btn pri block" id="${pool.length ? 'bToday' : 'bMix'}">${pool.length ? 'Commencer la séance' : 'Lancer un drill mixte'}</button>
    </section>

    <section class="grp"><h2>Entraînement</h2>
      <div class="surf card list">
        <a class="rowi" href="#/rep"><span class="ico">${icon('book')}</span><span class="body"><b>Répertoire</b><small>${validPhrase(valid, ALL_IDS.length)}</small></span>${dueTag(dueLines(ALL_IDS))}${chev}</a>
        <a class="rowi" href="#/wood"><span class="ico">${icon('target')}</span><span class="body"><b>Woodpecker</b><small>${store.faults.length ? `${plural(store.faults.length, 'position tirée', 'positions tirées')} de tes parties` : 'Tes fautes arrivent après la première analyse'}</small></span>${dueTag(posDue)}${chev}</a>
        ${pool.length ? `<button class="rowi" id="bMix"><span class="ico">${icon('shuffle')}</span><span class="body"><b>Drill mixte</b><small>Tout le répertoire, les lignes fragiles d'abord</small></span>${chev}</button>` : ''}
      </div>
    </section>

    ${w ? `<section class="grp"><h2>Tes 7 derniers jours</h2><div class="surf card stats"><div><b>${w.n}</b><span>${w.n > 1 ? 'parties' : 'partie'}, ${w.wins} gagnée${w.wins > 1 ? 's' : ''}</span></div><div><b>${w.acc} %</b><span>de précision</span></div><div><b>${w.blunders}</b><span>gaffe${w.blunders > 1 ? 's' : ''}</span></div></div></section>` : ''}
    ${devs.length ? `<section class="grp"><h2>${devs.length > 1 ? 'Sorties de répertoire à corriger' : 'Sortie de répertoire à corriger'}</h2><div class="surf card list">${devs.map(g => { const id = refBranch(g, BR)!; const want = (g.a.expected || []).map(e => e.san).join(' ou ');
      return `<a class="rowi" href="${lineUrl(id, 'drill', g.id)}"><span class="chip ${g.color}"></span><span class="body"><b>${esc(BR[id].br.titre)}</b>
        <small>${cap(ago(g.t * 1000))} contre ${esc(g.opp)} : tu as joué ${esc(g.a.played)}${want ? `, la ligne joue ${esc(want)}` : ''}</small></span>${chev}</a>`; }).join('')}</div></section>` : ''}
    ${latest ? `<section class="grp"><h2>Ta dernière partie</h2><div class="surf card list">${gameRow(latest, '#/')}</div></section>` : ''}
    ${getToken() ? `<p class="foot">${store.games.length ? `${plural(store.games.length, 'partie analysée', 'parties analysées')}` : 'Aucune partie reçue pour l\'instant'}${lastSync() ? `, synchronisé ${ago(lastSync())}` : ''}.</p>`
      : `<div class="surf card list"><a class="rowi" href="#/reglages"><span class="ico">${icon('link')}</span><span class="body"><b>Relier l'app à tes parties</b><small>Entre ton code d'accès pour voir tes sorties de répertoire, tes fautes, et retrouver ta progression sur tous tes appareils.</small></span>${chev}</a></div>`}`;
  $('#bToday', root)?.addEventListener('click', () => { location.hash = startSession('Séance du jour', pool, '#/', first); });
  $('#bMix', root)?.addEventListener('click', () => go('Drill mixte', ALL_IDS, '#/'));
}

/** Filtre de la liste des blocs, gardé le temps de la visite. */
let sideFilter: 'all' | 'b' | 'w' = 'all';
const FILTERS = [['all', 'Tout'], ['b', 'Avec les Noirs'], ['w', 'Avec les Blancs']] as const;
export function viewBlocs(root: HTMLElement) {
  const valid = validCount(ALL_IDS), due = dueLines(ALL_IDS), blocs = REP.blocs.filter(b => sideFilter === 'all' || b.side === sideFilter);
  root.innerHTML = `
    <header class="pagehead"><h1>Répertoire</h1>
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
