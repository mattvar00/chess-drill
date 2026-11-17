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

export function viewExits(root: HTMLElement) {
  const s = scanExits(store.games, store.state.ignored), R = punishRate();
  const pct = (x: { e: number; p: number }) => (x.e ? Math.round((100 * x.p) / x.e) : null), now = pct(R.now), before = pct(R.before);
  const punir = s.punir.slice(0, 12), connaitre = s.connaitre.filter(c => c.count > 1).slice(0, 8), once = s.connaitre.filter(c => c.count === 1).length;
  root.innerHTML = `
    <p class="intro">Là où tes adversaires sortent de ton répertoire, dans les 15 premiers coups. Une erreur, c'est un coup qui te donne environ +0,8 ou plus.</p>
    ${now != null ? `<p class="pnote">Ces 4 dernières semaines, tu as puni ${R.now.p} erreur${R.now.p > 1 ? 's' : ''} adverse${R.now.p > 1 ? 's' : ''} sur ${R.now.e} (${now} %)${before != null ? ` ; les 4 d'avant : ${before} %` : ''}.</p>` : ''}
    <section class="grp"><h2>À punir <span class="dim">${punir.length}</span></h2>
      ${punir.length ? punir.map(card).join('') : '<p class="pnote">Aucune erreur adverse repérée dans tes parties analysées.</p>'}</section>
    <section class="grp"><h2>À connaître <span class="dim">${connaitre.length}</span></h2><p class="pnote">Des coups adverses normaux que ton répertoire ne prévoit pas, vus au moins deux fois.${once ? ` ${plural(once, 'autre', 'autres')}, vu${once > 1 ? 's' : ''} une seule fois, ne sont pas montrés.` : ''}</p>
      ${connaitre.map(card).join('')}</section>`;
}
