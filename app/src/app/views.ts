/** Écrans de listes : Aujourd'hui, Répertoire (blocs → systèmes → lignes). */
import { isDue, isValid } from '../core/schedule';
import { recentDeviations, refBranch, todayPool } from '../core/drill';
import type { Bloc, Branch, System } from '../core/types';
import { esc, plural, $, icon } from '../ui/dom';
import { miniBoard } from '../ui/board';
import { Chess, tryMove, uciToObj } from '../core/chess';
import { ALL_IDS, BR, REP, store } from './store';
import { getToken, lastSync } from './api';
import { lineUrl, startSession } from './session';
import { duePositions, priorityFaults } from '../core/wood';
import { startPriority } from './wood';

const DAY = 864e5;
const st = (id: string) => store.state.br[id];
const validCount = (ids: string[]) => ids.filter(id => isValid(st(id))).length;
const idsOf = (b: Bloc | System) => 'systemes' in b ? b.systemes.flatMap(s => s.branches.map(x => x.id)) : b.branches.map(x => x.id);
const go = (label: string, pool: string[], back: string) => { location.hash = startSession(label, pool, back); };
const bar = (done: number, total: number) => `<span class="prog" role="img" aria-label="${done} sur ${total} validées"><b style="width:${total ? Math.round(100 * done / total) : 0}%"></b></span>`;
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} jours`; };

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
/** Position d'une faute, vue du côté du joueur. */
const faultPreview = (fen: string, side: 'w' | 'b') => miniBoard(new Chess(fen), side);
const dueLines = (ids: string[]) => ids.filter(id => st(id)?.runs && isDue(st(id))).length;
const meter = (done: number, total: number, label: string) => `<span class="meter"><span>${label}</span>${bar(done, total)}</span>`;

export function viewHome(root: HTMLElement) {
  const { due, fresh } = todayPool(REP, store.state.br), pool = [...due, ...fresh], first = pool[0];
  const devs = recentDeviations(store.games, store.state.fixed, BR), w = week();
  const valid = validCount(ALL_IDS), posDue = duePositions(store.faults, store.state.fault);
  const top = priorityFaults(store.faults, store.state.fault, 1)[0];
  const lastId = Object.entries(store.state.br).sort((x, y) => y[1].last - x[1].last)[0]?.[0] ?? 'B2a';
  const headline = due.length ? `${plural(due.length, 'ligne')} à revoir` : fresh.length ? `${plural(fresh.length, 'nouvelle ligne', 'nouvelles lignes')}` : 'Tout est à jour';
  const sub = due.length && fresh.length ? `et ${plural(fresh.length, 'nouvelle', 'nouvelles')} à apprendre` : !pool.length ? 'Rien à revoir aujourd\'hui. Un drill mixte entretient le reste.' : !due.length ? 'à apprendre aujourd\'hui' : '';
  root.innerHTML = `
    <section class="panel session">
      ${preview(first ?? lastId)}
      <div class="stext"><p class="label">Séance du jour</p><h1>${headline}</h1>${sub ? `<p>${sub}</p>` : ''}${first ? `<p class="nextline">D'abord : ${esc(BR[first].br.titre)}</p>` : ''}</div>
      <button class="btn pri big" id="${pool.length ? 'bToday' : 'bMix'}">${pool.length ? 'Commencer la séance' : 'Lancer un drill mixte'}</button>
    </section>

    <h2>Entraînement</h2>
    <div class="tiles">
      <a class="tile" href="#/rep">${preview(lastId)}<b>Répertoire</b>${meter(valid, ALL_IDS.length, `${valid}/${ALL_IDS.length} lignes validées`)}<span class="btn sm">Ouvrir</span></a>
      ${top ? `<button class="tile" id="bWood">${faultPreview(top.fen, top.side)}<b>Woodpecker</b><span class="meter"><span>${posDue ? `${plural(posDue, 'position')} à revoir` : `${plural(store.faults.length, 'position')} en stock`}</span></span><span class="btn sm">${Math.min(10, store.faults.length)} positions</span></button>`
        : `<a class="tile" href="#/wood">${miniBoard(new Chess(), 'w')}<b>Woodpecker</b><span class="meter"><span>Tes fautes arrivent après la première analyse</span></span><span class="btn sm">Ouvrir</span></a>`}
    </div>
    ${pool.length ? '<button class="card" id="bMix"><span class="body"><b>Drill mixte</b><small>Des lignes de tout le répertoire, les plus fragiles d\'abord</small></span><span class="go">›</span></button>' : ''}

    ${w ? `<h2>Tes 7 derniers jours</h2><div class="stats"><div><b>${w.n}</b><span>${w.n > 1 ? 'parties' : 'partie'}, ${w.wins} gagnée${w.wins > 1 ? 's' : ''}</span></div><div><b>${w.acc} %</b><span>de précision</span></div><div><b>${w.blunders}</b><span>gaffe${w.blunders > 1 ? 's' : ''}</span></div></div>` : ''}
    ${devs.length ? `<h2>Sorties de répertoire à corriger</h2>${devs.map(g => { const id = refBranch(g, BR)!; const want = (g.a.expected || []).map(e => e.san).join(' ou ');
      return `<a class="card" href="${lineUrl(id, 'drill', g.id)}"><span class="chip ${g.color}"></span><span class="body"><b>${esc(BR[id].br.titre)}</b>
        <small>Contre ${esc(g.opp)}, ${ago(g.t * 1000)} : tu as joué ${esc(g.a.played)}${want ? `, la ligne joue ${esc(want)}` : ''}</small></span><span class="go">›</span></a>`; }).join('')}` : ''}
    ${getToken() ? `<p class="foot">${store.games.length ? `${plural(store.games.length, 'partie analysée', 'parties analysées')}` : 'Aucune partie reçue pour l\'instant'}${lastSync() ? `, synchronisé ${ago(lastSync())}` : ''}.</p>`
      : `<a class="card link" href="#/reglages"><span class="body"><b>Relier l'app à tes parties</b><small>Entre ton code d'accès pour voir tes sorties de répertoire, tes fautes et retrouver ta progression sur tous tes appareils.</small></span><span class="go">›</span></a>`}`;
  $('#bToday', root)?.addEventListener('click', () => { location.hash = startSession('Séance du jour', pool, '#/', first); });
  $('#bMix', root)?.addEventListener('click', () => go('Drill mixte', ALL_IDS, '#/'));
  $('#bWood', root)?.addEventListener('click', startPriority);
}

export function viewBlocs(root: HTMLElement) {
  const due = ALL_IDS.filter(id => st(id)?.runs && isDue(st(id)));
  root.innerHTML = `
    <div class="stats"><div><b>${ALL_IDS.length}</b><span>lignes</span></div><div><b>${validCount(ALL_IDS)}</b><span>validées</span></div><div><b>${due.length}</b><span>à revoir</span></div></div>
    ${REP.blocs.map(b => { const ids = idsOf(b); return `<a class="card" href="#/rep/${b.id}"><span class="chip ${b.side}"></span><span class="body"><b>${esc(b.titre)}</b><small>${esc(b.sous)}</small>${meter(validCount(ids), ids.length, `${validCount(ids)}/${ids.length} validées`)}</span>${dueTag(ids)}<span class="go">›</span></a>`; }).join('')}
    <details class="help"><summary>Comment ça marche</summary><p>Le drill te fait rejouer une ligne de mémoire ; Explorer la montre avec ses plans. Deux passages sans faute valident une ligne, qui revient ensuite à intervalles de plus en plus longs. Le tirage favorise les lignes neuves et celles où tu es sorti du répertoire en partie.</p></details>`;
}

const dueTag = (ids: string[]) => { const n = dueLines(ids); return n ? `<span class="due">${n} à revoir</span>` : ''; };
const badge = (s: System) => `<span class="badge ${s.statut === 'joué' ? 'ok' : s.statut === 'à apprendre' ? 'learn' : ''}">${esc(s.statut)}</span>`;
export function viewBloc(root: HTMLElement, bloc: Bloc) {
  root.innerHTML = `<div class="row"><button class="btn pri" id="bAll">Drill sur tout le bloc</button></div>
    ${bloc.systemes.map(s => { const ids = idsOf(s); return `<a class="card" href="#/rep/${bloc.id}/${s.id}"><span class="body"><b>${esc(s.titre)}</b> ${badge(s)}<small>${esc(s.resume)}</small>${meter(validCount(ids), ids.length, `${validCount(ids)}/${ids.length} validées`)}</span>${dueTag(ids)}<span class="go">›</span></a>`; }).join('')}`;
  $('#bAll', root).addEventListener('click', () => go(bloc.titre, idsOf(bloc), `#/rep/${bloc.id}`));
}

function lineStatus(br: Branch): string {
  const s = st(br.id), parts = [plural(Math.ceil(br.moves.length / 2), 'coup')];
  if (s?.runs) parts.push(isValid(s) ? (isDue(s) ? 'à revoir' : `validée, revient dans ${plural(Math.max(1, Math.ceil((s.due - Date.now()) / DAY)), 'jour')}`) : `${s.clean}/2 sans faute`);
  else parts.push('jamais jouée');
  return parts.join(' · ');
}
export function viewSystem(root: HTMLElement, bloc: Bloc, sys: System) {
  const back = `#/rep/${bloc.id}/${sys.id}`;
  root.innerHTML = `<p class="intro">${esc(sys.resume)}</p>
    <div class="row"><button class="btn pri" id="bDrill">Drill sur ce système</button></div>
    ${sys.branches.map(br => { const d = store.devs[br.id]; return `<a class="card" href="${lineUrl(br.id, 'explore')}"><span class="body"><b>${esc(br.titre)}</b><small>${lineStatus(br)}${d ? ` · <em class="warn">${plural(d, 'sortie')} en partie</em>` : ''}</small></span>${isValid(st(br.id)) ? '<span class="tick" aria-label="validée">✓</span>' : ''}<span class="go">›</span></a>`; }).join('')}`;
  $('#bDrill', root).addEventListener('click', () => go(sys.titre, idsOf(sys), back));
}
