/**
 * Sorties d'ouverture : ce que le scan de tes parties trouve dans les 15 premiers coups.
 * Deux listes seulement : les erreurs adverses à punir, et les coups adverses à connaître. Tes propres oublis restent sur la page
 * de chaque ouverture (« À corriger »), les lignes déjà apprises dans les ouvertures ; l'indicateur suivi est dans Progrès.
 */
import { Chess } from '../core/chess';
import { punishWeeks, scanExits, type ExitCard } from '../core/scan';
import { miniBoard } from '../ui/board';
import { esc, icon, plural } from '../ui/dom';
import { gameUrl } from './games';
import { shortName } from './path';
import { passed } from '../core/path';
import { isDue } from '../core/schedule';
import { lineName } from '../core/names';
import { lineUrl, startSession } from './session';
import { BR, store } from './store';

const HERE = '#/rep/sorties';
/** Les derniers coups d'une ligne, numérotés : « … 3.Nc3 Nf6 4.Nf3 Bg4 ». */
export function tail(sans: string[], n = 4) {
  const from = Math.max(0, sans.length - n);
  return (from ? '… ' : '') + sans.slice(from).map((s, k) => { const i = from + k, no = Math.floor(i / 2) + 1;
    return i % 2 === 0 ? `${no}.${s}` : k === 0 ? `${no}…${s}` : s; }).join(' ');
}
const opening = (c: ExitCard) => { const b = c.branches.map(id => BR[id]).find(Boolean); return b ? shortName(b.sys.titre) : ''; };
export const explorerUrl = (fen: string, orient: 'w' | 'b', back = HERE) => `#/explorer?${new URLSearchParams({ fen, o: orient, r: back })}`;

function card(c: ExitCard) {
  const top = Object.entries(c.replies).sort((a, b) => b[1] - a[1])[0]?.[0], g = c.games[0], op = opening(c);
  const stat = c.kind === 'punir' ? `${plural(c.count, 'partie')}, punie ${c.punished} fois${c.missed ? `, ratée ${c.missed} fois` : ''}` : `${plural(c.count, 'partie')}`;
  const why = c.kind === 'punir'
    ? `Son coup ${esc(c.played)} te donnait ${c.gain} points de chances en plus.${top ? ` Tu as répondu ${esc(top)}${c.missed ? ', et l\'avantage est reparti' : ''}.` : ''}`
    : `Ton répertoire ne prévoit pas ${esc(c.played)} ici.${top ? ` Tu as répondu ${esc(top)}.` : ''}${c.count > 1 ? ' Ça revient : à apprendre.' : ''}`;
  return `<article class="surf card xcard ${c.kind}">
    <div class="xtop">${miniBoard(new Chess(c.fenAfter), c.color)}<div class="xbody"><b>${esc(tail(c.line))}</b><small>${op ? `${esc(op)} · ` : ''}${stat}</small><p>${why}</p></div></div>
    <div class="xact"><a class="btn${c.kind === 'punir' ? ' pri' : ''}" href="${explorerUrl(c.fenAfter, c.color)}">${c.kind === 'punir' ? 'Trouver la punition' : 'Voir la position'}</a>
      <a class="quiet" href="${gameUrl(g.id, c.ply + 1, HERE)}">Voir la partie</a></div></article>`;
}

/** L'indicateur : erreurs adverses punies sur les 4 dernières semaines, et la tendance par rapport aux 4 d'avant. */
export function punishRate() {
  const w = punishWeeks(store.games, 8), sum = (xs: typeof w) => xs.reduce((a, x) => ({ e: a.e + x.errors, p: a.p + x.punished }), { e: 0, p: 0 });
  return { weeks: w, now: sum(w.slice(4)), before: sum(w.slice(0, 4)) };
}

/** Tes punitions : les lignes « Punir » de ton répertoire, celles qui restent à apprendre d'abord. */
export function punishLines() {
  const st = store.state.br, rank = (id: string) => (!st[id]?.runs ? 0 : !passed(st[id]) ? 1 : isDue(st[id]) ? 2 : 3);
  return Object.values(BR).filter(r => r.br.type === 'punir').sort((a, b) => rank(a.br.id) - rank(b.br.id));
}
/** Une punition : son titre, d'où elle vient, et où tu en es (en un mot). */
export function punishRow(r: ReturnType<typeof punishLines>[number]) {
  const s = store.state.br[r.br.id], [c, t] = !s?.runs ? ['new', 'à apprendre'] : !passed(s) ? ['new', 'à finir'] : isDue(s) ? ['rev', 'à revoir'] : ['ok', 'sue'];
  return `<a class="rowi" href="${lineUrl(r.br.id, 'drill')}"><span class="body"><b>${esc(lineName(r.br.titre).title)}</b><small>${esc(shortName(r.sys.titre))}, ${r.bloc.side === 'w' ? 'avec les Blancs' : 'avec les Noirs'}</small></span><span class="lm ${c}">${t}</span>${icon('chev', 'chev')}</a>`;
}

/**
 * Punir les erreurs adverses : d'abord tes punitions (les lignes « Punir » du répertoire, à travailler d'un bouton),
 * puis les erreurs repérées dans tes parties qui n'ont pas encore de ligne, et, repliés, les coups normaux hors répertoire.
 */
export function viewExits(root: HTMLElement) {
  const s = scanExits(store.games, store.state.ignored), lines = punishLines(), todo = lines.filter(r => !passed(store.state.br[r.br.id]) || isDue(store.state.br[r.br.id]));
  const punir = s.punir.slice(0, 12), connaitre = s.connaitre.filter(c => c.count > 1).slice(0, 8);
  root.innerHTML = `
    <p class="intro">Les erreurs que tes adversaires font dans l'ouverture, et le coup qui les punit. Tout vient de tes parties.</p>
    <section class="grp"><h2>Tes punitions</h2><p class="pnote">Des lignes courtes : tu rejoues l'ouverture jusqu'à l'erreur, puis tu trouves le coup qui punit.</p>
      ${lines.length ? `${todo.length ? `<button class="btn pri block" id="bPun">Travailler ${todo.length > 1 ? `les ${todo.length} punitions à apprendre` : 'la punition à apprendre'}</button>` : ''}
      <div class="surf card list">${lines.map(punishRow).join('')}</div>` : '<p class="pnote">Aucune pour l\'instant.</p>'}</section>
    ${punir.length ? `<section class="grp"><h2>Repérées dans tes parties</h2><p class="pnote">Des erreurs adverses récentes qui n'ont pas encore leur ligne. Regarde le coup du moteur.</p>${punir.map(card).join('')}</section>` : ''}
    ${connaitre.length ? `<details class="others"><summary>Coups adverses que ton répertoire ne prévoit pas (${connaitre.length})</summary><p class="pnote">Pas des erreurs : des coups normaux, vus au moins deux fois, pour lesquels tu n'as pas de ligne.</p>${connaitre.map(card).join('')}</details>` : ''}`;
  root.querySelector('#bPun')?.addEventListener('click', () => { location.hash = startSession('Punir les erreurs adverses', todo.map(r => r.br.id), HERE); });
}
