/**
 * Sorties d'ouverture : ce que le scan de tes parties trouve dans les 15 premiers coups.
 * En haut, l'indicateur (erreurs adverses punies, semaine après semaine) ; puis les erreurs à punir, les positions à connaître,
 * les lignes « Punir » / « Bon coup » déjà dans ton répertoire, et tes propres oublis.
 */
import { Chess } from '../core/chess';
import { punishWeeks, scanExits, type ExitCard } from '../core/scan';
import { lineName, typeLabel } from '../core/names';
import { miniBoard } from '../ui/board';
import { esc, icon, plural } from '../ui/dom';
import { gameUrl } from './games';
import { devRow, shortName } from './path';
import { lineUrl } from './session';
import { BR, REP, store } from './store';

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

/** Ce qu'en montre la page Ouvertures : combien d'erreurs à punir et de positions à connaître. */
export function exitsSummary() {
  const s = scanExits(store.games, store.state.ignored);
  return { punir: s.punir.filter(c => c.missed).length, connaitre: s.connaitre.filter(c => c.count > 1).length };
}
/** L'indicateur : erreurs adverses punies sur les 4 dernières semaines, et la tendance par rapport aux 4 d'avant. */
export function punishRate() {
  const w = punishWeeks(store.games, 8), sum = (xs: typeof w) => xs.reduce((a, x) => ({ e: a.e + x.errors, p: a.p + x.punished }), { e: 0, p: 0 });
  return { weeks: w, now: sum(w.slice(4)), before: sum(w.slice(0, 4)) };
}

export function viewExits(root: HTMLElement) {
  const s = scanExits(store.games, store.state.ignored), R = punishRate(), max = Math.max(1, ...R.weeks.map(x => x.errors));
  const pct = (x: { e: number; p: number }) => (x.e ? Math.round((100 * x.p) / x.e) : null), now = pct(R.now), before = pct(R.before);
  const typed = REP.blocs.flatMap(b => b.systemes.flatMap(sys => sys.branches.filter(br => br.type).map(br => ({ br, sys }))))
    .sort((a, b) => (a.br.type === 'punir' ? 0 : 1) - (b.br.type === 'punir' ? 0 : 1));
  const punir = s.punir.slice(0, 12), connaitre = s.connaitre.filter(c => c.count > 1).slice(0, 8), once = s.connaitre.filter(c => c.count === 1).length;
  root.innerHTML = `
    <p class="intro">Les 15 premiers coups de tes parties analysées, là où elles sortent de ton répertoire. Une erreur adverse, c'est un coup qui te donne au moins 8 points de chances (environ +0,8) ; elle est punie si ta réponse garde l'avantage.</p>
    <section class="surf card padded ptile">
      <div class="pchead"><b>${now == null ? 'Aucune erreur adverse sur la période' : `${now} % des erreurs punies`}</b><span>4 dernières semaines</span></div>
      ${now != null ? `<p class="pnote">${R.now.p} sur ${R.now.e}${before != null ? `. Les 4 semaines d'avant : ${before} %.` : '.'}</p>` : ''}
      <div class="wbars" role="img" aria-label="Erreurs adverses et erreurs punies, semaine par semaine, sur 8 semaines">${R.weeks.map(x => `<span><i style="height:${Math.round((100 * x.errors) / max)}%"><b style="height:${x.errors ? Math.round((100 * x.punished) / x.errors) : 0}%"></b></i></span>`).join('')}</div>
      <p class="wleg"><span><i class="k"></i>punies</span><span><i class="e"></i>pas punies</span></p>
    </section>
    <section class="grp"><h2>À punir <span class="dim">${punir.length}</span></h2>
      ${punir.length ? punir.map(card).join('') : '<p class="pnote">Aucune erreur adverse repérée dans tes parties analysées.</p>'}</section>
    <section class="grp"><h2>À connaître <span class="dim">${connaitre.length}</span></h2><p class="pnote">Des coups adverses normaux que ton répertoire ne prévoit pas, vus au moins deux fois.${once ? ` ${plural(once, 'autre', 'autres')}, vu${once > 1 ? 's' : ''} une seule fois, ne sont pas montrés.` : ''}</p>
      ${connaitre.map(card).join('')}</section>
    ${typed.length ? `<section class="grp"><h2>Déjà dans ton répertoire <span class="dim">${typed.length}</span></h2><p class="pnote">Les lignes « Punir » et « Bon coup » tirées de tes parties.</p><div class="surf card list">${typed.map(({ br, sys }) => { const nm = lineName(br.titre);
      return `<a class="rowi" href="${lineUrl(br.id, 'drill')}"><span class="body"><b><span class="ltype ${br.type}">${typeLabel(br.type)}</span>${esc(nm.title)}</b><small>${esc(shortName(sys.titre))}</small></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>` : ''}
    ${s.mineDev.length ? `<section class="grp fix"><h2>Tes oublis <span class="dim">${s.mineDev.length}</span></h2><p class="pnote">Là où tu as quitté une ligne que tu connais : à rejouer.</p><div class="surf card list">${s.mineDev.slice(0, 6).map(g => devRow(g)).join('')}</div></section>` : ''}`;
}
