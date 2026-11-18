/**
 * Le chemin des ouvertures (concept « la promotion », façon Duolingo) : la liste des ouvertures, le chemin de chacune
 * (en haut de sa page), et le bilan d'une leçon. Une ouverture = une réponse à un plan adverse, 6 cases au plus ;
 * le pion avance d'une case par leçon réussie, la dame au bout. Une dame gagnée reste gagnée.
 */
import { caseOf, earnedQueen, freshFromGames, ownLines, passed, unitOf, unitsOf, type Lesson, type Unit } from '../core/path';
import type { Bloc, System } from '../core/types';
import { syncSoon } from './api';
import { recommend, type Facts, type Reco, type RecoKind } from '../core/reco';
import { punishLines, punishRow } from './exits';
import { scanExits } from '../core/scan';
import { myWp } from '../core/stats';
import type { Game } from '../core/types';
import { lineName, lineTitle, roleLabel, typeLabel } from '../core/names';
import { recentDeviations, refBranch } from '../core/drill';
import { lineUrl } from './session';
import { isDue } from '../core/schedule';
import { meetCounts } from '../core/rank';
import { pieceSrc } from '../ui/board';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, REP, lastLesson, plansFor, save, store } from './store';
import { startSession } from './session';

const SIDE_KEY = 'cd_rep_side', LAST_KEY = 'cd_last_sys';
const getLS = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const setLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* stockage bloqué */ } };
/** Nom court d'une ouverture : le titre du système sans ses précisions entre parenthèses ni après le tiret. */
export const shortName = (t: string) => t.replace(/\s*\(.*?\)\s*/g, ' ').split(/\s[—–-]\s/)[0].replace(/\s+/g, ' ').trim();
const queens = () => store.state.queens ?? {};
const openingUrl = (u: Unit) => `#/rep/${u.bloc.id}/${u.sys.id}`;
/** Toutes les ouvertures (hors plans), et la dame notée au passage pour celles qui viennent d'être finies. */
function allUnits(): Unit[] {
  const meet = meetCounts(store.games), out = REP.blocs.flatMap(b => unitsOf(b, store.state.br, meet, Date.now(), queens()));
  let fresh = false; for (const u of out) if (earnedQueen(u, queens())) { (store.state.queens ??= {})[u.sys.id] = Date.now(); fresh = true; }
  if (fresh) { save(); syncSoon(); return REP.blocs.flatMap(b => unitsOf(b, store.state.br, meet, Date.now(), queens())); }
  return out;
}
const played = (u: Unit) => u.sys.statut !== 'alternatif';
/** L'ouverture mise en avant (porte Ouvertures de S'entraîner) : celle que l'appli recommande de travailler. */
function currentUnit(units = allUnits()): Unit {
  return recommend(factsOf(units)).todo[0]?.f.u ?? units.find(played) ?? units[0];
}
/** Ouvre la page d'une ouverture (son chemin en haut). */
export function openUnit(blocId: string, sysId: string) { location.hash = `#/rep/${blocId}/${sysId}`; }

/** Les lignes à jouer quand on (re)lance une case : celles qui ne sont pas encore sues pour la case en cours,
 *  celles qui reviennent en révision pour une case à revoir, toutes pour une case réussie qu'on veut rejouer. */
export function lessonIds(L: Lesson): string[] {
  const st = store.state.br;
  const left = L.state === 'cur' ? L.ids.filter(id => !passed(st[id])) : L.state === 'crack' ? L.ids.filter(id => isDue(st[id]) || !passed(st[id])) : L.ids;
  return left.length ? left : L.ids;
}
/** Ouvre une leçon : ses lignes en séance, le bilan à la fin, la croix ramène à la page de l'ouverture. */
function startLesson(u: Unit, i: number) {
  const L = u.lessons[i], ids = lessonIds(L); setLS(LAST_KEY, u.sys.id);
  location.hash = startSession(`${shortName(u.sys.titre)}, case ${i + 1}`, ids, '#/lecon/fin', ids[0],
    { exit: openingUrl(u), lesson: { bloc: u.bloc.id, sys: u.sys.id, idx: i, rank: L.rank, doneBefore: u.done }, ordered: !!L.name });
}

const X = [50, 35, 62, 42, 60, 38, 52];   // position horizontale des cases (en %), pour le zigzag
/** Case choisie sur le chemin, par ouverture : aucune tant qu'on n'en touche pas une (la bulle ne s'ouvre qu'au toucher). */
const selPick: Record<string, number> = {};
const selOf = (u: Unit) => { const s = selPick[u.sys.id]; return s != null && s < u.lessons.length ? s : -1; };
const STATE: Record<Lesson['state'], string> = { done: 'réussie', crack: 'à revoir', cur: 'à jouer', lock: 'pas encore ouverte' };

/** La bulle sous la case choisie : ce qu'elle contient, où elle en est, et l'action qui va avec. */
function bubble(u: Unit, L: Lesson, i: number, x: number) {
  const n = u.lessons.length, last = i === n - 1, st = store.state.br;
  const lineMark = (id: string) => { const s = st[id]; return !s?.runs ? ['new', 'nouvelle'] : s.clean >= 1 && isDue(s) ? ['rev', 'à revoir'] : s.clean >= 1 ? ['ok', 'sue'] : ['new', 'à finir']; };
  const lines = L.ids.slice(0, L.name ? 8 : 4).map(id => { const [c, t] = lineMark(id); const nm = lineName(BR[id].br.titre); const ty = BR[id].br.type, ro = BR[id].br.role; return `<li><span class="lm ${c}">${t}</span><span>${ty ? `<span class="ltype ${ty}">${typeLabel(ty)}</span>` : ro ? `<span class="ltype ${ro}">${roleLabel(ro)}</span>` : ''}${esc(nm.title)}${nm.detail ? `<small>${esc(nm.detail)}</small>` : ''}</span></li>`; }).join('') + (L.ids.length > (L.name ? 8 : 4) ? `<li class="more">et ${plural(L.ids.length - (L.name ? 8 : 4), 'autre ligne', 'autres lignes')}</li>` : '');
  const rest = lessonIds(L).length, partial = L.state === 'cur' && rest < L.ids.length;
  const why = L.state === 'cur' ? (L.name ? `${plural(L.ids.length, 'variante')}, de la plus courte à la plus longue : le coach t'explique chaque coup, puis tu la rejoues de mémoire.${partial ? ' Celles déjà sues ne sont pas à refaire.' : ''}`
      : `Joue ces ${plural(L.ids.length, 'ligne')} une fois chacune sans faute pour avancer le pion.${partial ? ' Celles déjà sues ne sont pas à refaire.' : ''}`)
    : L.state === 'crack' ? 'Une ligne de cette case revient en révision. Rejoue-la sans faute pour garder la case.'
    : L.state === 'done' ? 'Case réussie. Tu peux rejouer ses lignes quand tu veux.'
    : last ? `La dame : termine les ${n} cases pour promouvoir l'ouverture.` : `S'ouvre quand la case ${i} est réussie.`;
  const act = L.state === 'cur' ? `<button class="btn pri" data-go="${i}">${partial ? `Finir la case ${i + 1} : ${L.name ? plural(rest, 'variante restante', 'variantes restantes') : plural(rest, 'ligne restante', 'lignes restantes')}` : `Jouer la case ${i + 1}`}</button>`
    : L.state === 'crack' ? `<button class="btn pri" data-go="${i}">Revoir maintenant</button>`
    : L.state === 'done' ? `<button class="btn" data-go="${i}">Rejouer ces lignes</button>` : '';
  return `<div class="pbubble ${L.state}" style="--x:${x}%" role="region" aria-label="Case ${i + 1} sur ${n}">
    <p class="pbh"><b>Case ${i + 1} sur ${n}</b><span class="pst ${L.state}">${STATE[L.state]}</span></p>${L.name ? `<p class="pbn">${esc(L.name)}</p>` : ''}
    <p class="pbw">${why}</p><ul class="plines">${lines}</ul>${act}</div>`;
}
/** Nom court d'un chapitre pour le chemin : ce qui précède la virgule, les deux-points ou la parenthèse (le nom complet est dans la bulle). */
const shortChap = (n: string) => { const s = n.split(/,| : | \(/)[0].trim(); return s.length >= 3 ? s : n; };
/** Ce que contient une case, en trois mots : combien de pièges à punir, combien de variantes de théorie. */
const trapsOf = (L: Lesson) => { const t = L.ids.filter(id => BR[id].br.role === 'erreur').length, th = L.ids.filter(id => BR[id].br.role === 'theorie').length;
  return t || th ? [t ? plural(t, 'piège') : '', th ? `${th} théorie` : ''].filter(Boolean).join(' · ') : plural(L.ids.length, 'ligne'); };
/** Une case du chemin : réussie (or), à revoir (point rouge), le pion (case en cours), pas encore ouverte, et la dame au bout. Toutes se touchent : la bulle dit ce qu'elles contiennent. */
function step(u: Unit, L: Lesson, i: number, sel: number) {
  const kept = u.promoted && u.lessons.some(l => l.state === 'cur' || l.state === 'lock'), last = i === u.lessons.length - 1 && !kept, x = X[i % X.length], cur = L.state === 'cur', on = i === sel;
  const inner = cur ? `<img src="${pieceSrc('p')}" alt="">` : last ? `<img class="${u.promoted ? '' : 'qghost'}" src="${pieceSrc('q')}" alt="">` : L.state === 'lock' ? `<span class="pn">${i + 1}</span>` : icon('check');
  return `<div class="prow${on ? ' issel' : ''}${cur ? ' iscur' : ''}${last ? ' isgoal' : ''}">
    <button class="psq ${L.state}${last ? ' goal' : ''}${last && u.promoted ? ' won' : ''}${on ? ' sel' : ''}" style="left:${x}%" data-i="${i}" aria-expanded="${on}" aria-label="Case ${i + 1} sur ${u.lessons.length}, ${STATE[L.state]}">${inner}${L.state === 'crack' ? '<i class="dot"></i>' : ''}</button>
    ${L.name && !on ? `<span class="plab ${x <= 50 ? 'r' : 'l'}" style="${x <= 50 ? `left:calc(${x}% + 46px);max-width:calc(${100 - x}% - 50px)` : `right:calc(${100 - x}% + 46px);max-width:calc(${x}% - 50px)`}"><b>${esc(shortChap(L.name))}</b><small>${trapsOf(L)}</small></span>` : ''}
    ${on ? bubble(u, L, i, x) : ''}</div>`;
}
const legend = `<p class="plegend"><span><i class="lg done"></i>réussie</span><span><i class="lg crack"></i>à revoir</span><span><i class="lg cur"></i>le pion : en cours</span><span><i class="lg lock"></i>à venir</span></p>`;

const pathCells = (u: Unit) => { const sel = selOf(u), open = u.lessons.some(l => l.state === 'cur' || l.state === 'lock');
  // dame déjà gagnée et nouvelles lignes ajoutées : la dame reste au bout du chemin, après la nouvelle case
  const kept = u.promoted && open ? `<div class="prow isgoal"><span class="psq goal won done" role="img" aria-label="Dame gagnée"><img src="${pieceSrc('q')}" alt=""></span></div>` : '';
  return u.lessons.map((L, i) => step(u, L, i, sel)).join('') + kept; };
/** Petite bande des cases d'une ouverture, pour les listes : or réussie, rouge à revoir, pion en cours, dame au bout. */
export function strip(u: Unit) {
  return `<span class="estrip mini">${u.lessons.map((l, i) => { const last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${l.state === 'cur' ? ' pawn' : ''}">${l.state === 'cur' ? `<img src="${pieceSrc('p')}" alt="">` : last && !u.promoted && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('')}</span>`;
}
const where = (u: Unit) => { const c = caseOf(u), fresh = u.lessons.some(l => l.state === 'cur');
  return u.promoted ? (fresh ? `Promue, nouvelle case : ${c.k} sur ${c.n}` : 'Promue') : `Case ${c.k} sur ${c.n}`; };

/** Les variantes à revoir d'un cours (déjà jouées, et dues). */
const dueIds = (u: Unit) => ownLines(u.sys).map(b => b.id).filter(id => { const s = store.state.br[id]; return s?.runs && isDue(s); });
const knownN = (u: Unit) => ownLines(u.sys).filter(b => passed(store.state.br[b.id])).length;
/**
 * La page d'un cours : où tu en es, « Apprendre » (la suite du chapitre en cours) et « Réviser » (ce qui est à revoir),
 * puis le chemin, une case par chapitre avec son nom ; toucher une case ouvre sa bulle. `bindPath` branche les gestes.
 */
export function pathBlock(u: Unit): string {
  const cur = u.lessons.findIndex(l => l.state === 'cur'), n = ownLines(u.sys).length, k = knownN(u), due = dueIds(u).length;
  return `<section class="chead${u.promoted ? ' won' : ''}">
      <p class="cprog"><b>${k} ${k > 1 ? 'variantes sues' : 'variante sue'} sur ${n}</b>${due ? `<span class="due">${due} à revoir</span>` : ''}${u.promoted ? `<img class="qwon" src="${pieceSrc('q')}" alt="Dame gagnée">` : ''}</p>
      <div class="cbtns">${cur >= 0 ? `<button class="btn pri" data-go="${cur}">Apprendre</button>` : ''}<button class="btn${cur >= 0 ? '' : ' pri'}" id="bRev">${due ? `Réviser (${due})` : k ? 'Tout rejouer' : 'Jouer librement'}</button></div></section>
    <div class="pboard"><section class="psec"><div class="ppath" data-sys="${u.sys.id}">${pathCells(u)}</div></section></div>`;
}
export function bindPath(root: HTMLElement, u: Unit) {
  setLS(LAST_KEY, u.sys.id); setLS(SIDE_KEY, u.bloc.side);
  root.querySelector('.chead [data-go]')?.addEventListener('click', e => startLesson(u, +(e.currentTarget as HTMLElement).dataset.go!));
  root.querySelector('#bRev')?.addEventListener('click', () => { const due = dueIds(u), known = ownLines(u.sys).map(b => b.id).filter(id => passed(store.state.br[id])), ids = due.length ? due : known.length ? known : ownLines(u.sys).map(b => b.id);
    location.hash = startSession(`${shortName(u.sys.titre)}, révision`, ids, openingUrl(u), ids[0], { exit: openingUrl(u), ordered: true }); });
  const path = root.querySelector<HTMLElement>('.ppath');
  path?.addEventListener('click', e => {
    const t = e.target as HTMLElement, go = t.closest<HTMLElement>('[data-go]'), sq = t.closest<HTMLElement>('.psq');
    if (go) return startLesson(u, +go.dataset.go!);
    if (!sq) return;
    const i = +sq.dataset.i!; selPick[u.sys.id] = selPick[u.sys.id] === i ? -1 : i; path.innerHTML = pathCells(u);
    path.querySelector('.issel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    path.querySelector<HTMLElement>('.psq.sel')?.focus({ preventScroll: true });
  });
}
/** L'ouverture d'une page, avec sa progression (pour `pathBlock`). */
export const unitFor = (bloc: Bloc, sys: System) => allUnits().find(u => u.sys.id === sys.id) ?? unitOf(bloc, sys, store.state.br, {}, Date.now(), queens());

/** Ce qu'on sait de chaque ouverture d'après tes parties et ta progression : la matière des recommandations. */
function factsOf(units: Unit[]): Facts[] {
  const bySys: Record<string, Game[]> = {};
  for (const g of store.games) { if (store.state.ignored[g.id]) continue; const id = refBranch(g, BR), s = id ? BR[id].sys : null; if (s && s.statut !== 'plan') (bySys[s.id] ??= []).push(g); }
  const devBy: Record<string, number> = {};
  for (const g of recentDeviations(store.games, store.state.fixed, BR, Date.now(), 30, 50)) { const s = BR[refBranch(g, BR)!]?.sys.id; if (s) devBy[s] = (devBy[s] || 0) + 1; }
  const punBy: Record<string, number> = {};
  for (const c of scanExits(store.games, store.state.ignored).punir) { if (!c.missed) continue; const s = c.branches.map(id => BR[id]).find(Boolean)?.sys.id; if (s) punBy[s] = (punBy[s] || 0) + 1; }
  return units.map(u => {
    const gs = bySys[u.sys.id] ?? [], an = gs.filter(g => g.st && myWp(g));
    const at = (g: Game, ply: number) => { const w = myWp(g)!; return w[Math.min(ply, w.length - 1)]; };
    return { u, games: gs.length, score: gs.length ? (100 * gs.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? 0.5 : 0), 0)) / gs.length : null,
      devs: devBy[u.sys.id] || 0, due: ownLines(u.sys).filter(b => { const s = store.state.br[b.id]; return s?.runs && isDue(s); }).length,
      fresh: freshFromGames(u.sys, store.state.br), punir: punBy[u.sys.id] || 0,
      drop: an.length >= 3 ? an.reduce((a, g) => a + at(g, 40) - at(g, 20), 0) / an.length : null, plans: plansFor(u.sys.id).length };
  });
}
/** La raison d'une recommandation, en une phrase, sans chiffres. */
const WHY: Record<RecoKind, (f: Facts) => string> = {
  oubli: f => f.devs > 1 ? 'Tu as quitté tes lignes plusieurs fois ces dernières semaines : c\'est ta priorité.' : 'Tu as quitté ta ligne dans une partie récente : rejoue-la tant que c\'est frais.',
  punir: () => 'Un adversaire s\'y est trompé et tu n\'as pas trouvé la punition.',
  revoir: () => 'Des lignes que tu sais reviennent en révision, avant qu\'elles s\'effacent.',
  fragile: () => 'Tu la rencontres souvent, et tu y perds plus de points qu\'ailleurs.',
  milieu: () => 'Tu sors bien de l\'ouverture, mais tu perds le fil juste après : regarde ses plans.',
  nouveau: () => 'De nouvelles lignes tirées de tes parties t\'attendent.',
  avancer: f => f.games ? 'Tu la joues souvent, et il te reste des lignes à apprendre.' : 'La suite de ton chemin.',
  apprendre: () => 'Tu n\'as pas encore de réponse apprise ici.',
};
/** L'action qui va avec une recommandation : son libellé, et soit un lien, soit un geste. */
function actionOf(r: Reco): { label: string; href?: string; run?: () => void } {
  const u = r.f.u, i = u.lessons.findIndex(l => l.state === 'cur' || l.state === 'crack');
  const lesson = i >= 0 ? { label: u.lessons[i].state === 'crack' ? 'Réviser' : 'Apprendre la suite', run: () => startLesson(u, i) } : { label: 'Voir l\'ouverture', href: openingUrl(u) };
  if (r.kind === 'oubli') { const g = recentDeviations(store.games, store.state.fixed, BR, Date.now(), 30, 50).find(x => BR[refBranch(x, BR)!]?.sys.id === u.sys.id);
    return g ? { label: 'Rejouer la ligne', href: lineUrl(refBranch(g, BR)!, 'drill', g.id) } : lesson; }
  if (r.kind === 'milieu') return { label: 'Voir ses plans', href: `#/plans?o=${u.sys.id}&r=${encodeURIComponent('#/rep')}` };
  if (r.kind === 'revoir') { const ids = ownLines(u.sys).map(b => b.id).filter(id => { const s = store.state.br[id]; return s?.runs && isDue(s); });
    return { label: 'Revoir maintenant', run: () => { setLS(LAST_KEY, u.sys.id); location.hash = startSession(`${shortName(u.sys.titre)}, à revoir`, ids, '#/rep'); } }; }
  return lesson;
}
const sideWord = (u: Unit) => `${u.bloc.titre}, ${u.bloc.side === 'w' ? 'avec les Blancs' : 'avec les Noirs'}`;

/** Quoi faire maintenant : le cours que les recommandations mettent en tête, sa raison et son action. Le seul endroit qui en décide. */
export function nextUp(): { u: Unit; why: string; side: string; label: string; href?: string; run?: () => void } | null {
  const top = recommend(factsOf(allUnits())).todo[0]; if (!top) return null;
  return { u: top.f.u, why: WHY[top.kind](top.f), side: sideWord(top.f.u), ...actionOf(top) };
}

/** Ouvertures : la liste des cours, rangés par couleur puis par premier coup adverse, avec l'avancement de chacun. Rien d'autre. */
export function viewPath(root: HTMLElement) {
  const units = allUnits(), up = nextUp();
  const side = (getLS(SIDE_KEY) || up?.u.bloc.side || 'b') as 'w' | 'b';
  const mine = units.filter(u => u.bloc.side === side), playedU = mine.filter(played), others = mine.filter(u => !played(u));
  const row = (u: Unit) => { const n = ownLines(u.sys).length, k = knownN(u), due = dueIds(u).length;
    return `<a class="rowi crow" href="${openingUrl(u)}"><span class="body"><span class="ctop2"><b>${esc(shortName(u.sys.titre))}</b><small>${due ? `<span class="due">${due} à revoir</span>` : ''}${k} sur ${n}</small></span>
      <span class="prog" role="img" aria-label="${k} variantes sues sur ${n}"><b style="width:${n ? Math.round(100 * k / n) : 0}%"></b></span></span>${u.promoted ? `<img class="qwon" src="${pieceSrc('q')}" alt="Dame gagnée">` : ''}${icon('chev', 'chev')}</a>`; };
  const blocs = REP.blocs.filter(b => b.side === side);
  root.innerHTML = `<header class="pagehead"><h1>Ouvertures</h1></header>
    <div class="rsearch"><label class="sr" for="qRep">Chercher une ouverture ou une variante</label><input id="qRep" type="search" placeholder="Chercher : Londres, Alapin, Slave…" autocomplete="off"></div>
    <div id="qRes"></div>
    <div id="olist"><div class="seg" role="group" aria-label="Couleur"><button type="button" data-side="b" aria-pressed="${side === 'b'}">Avec les Noirs</button><button type="button" data-side="w" aria-pressed="${side === 'w'}">Avec les Blancs</button></div>
    ${blocs.map(b => { const us = playedU.filter(u => u.bloc.id === b.id); return us.length ? `<section class="grp"><h2>${esc(b.titre)}</h2><div class="surf card list">${us.map(row).join('')}</div></section>` : ''; }).join('')}
    ${others.length ? `<details class="others"><summary>Ouvertures de rechange (${others.length})</summary><div class="surf card list">${others.map(row).join('')}</div></details>` : ''}
    <a class="quiet" href="#/explorer?r=${encodeURIComponent('#/rep')}">Explorer une position</a></div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(b => b.onclick = () => { setLS(SIDE_KEY, b.dataset.side!); const y = window.scrollY; viewPath(root); window.scrollTo(0, y); });
  const q = $<HTMLInputElement>('#qRep', root), res = $('#qRes', root), list = $('#olist', root);
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  q.addEventListener('input', () => {
    const t = norm(q.value.trim()); list.hidden = !!t; if (!t) { res.innerHTML = ''; return; }
    const us = units.filter(u => norm(u.sys.titre + ' ' + u.bloc.titre).includes(t));
    const ls = Object.values(BR).filter(r => r.sys.statut !== 'plan' && norm(r.br.titre + ' ' + (r.br.ch ?? '')).includes(t)).slice(0, 12);
    res.innerHTML = us.length || ls.length ? `${us.length ? `<section class="grp"><h2>Cours</h2><div class="surf card list">${us.map(row).join('')}</div></section>` : ''}
      ${ls.length ? `<section class="grp"><h2>Variantes</h2><div class="surf card list">${ls.map(r => { const nm = lineName(r.br.titre); return `<a class="rowi" href="${lineUrl(r.br.id, 'explore')}"><span class="body"><b>${esc(nm.title)}</b><small>${esc(shortName(r.sys.titre))}${nm.detail ? ` · ${esc(nm.detail)}` : ''}</small></span>${icon('chev', 'chev')}</a>`; }).join('')}</div></section>` : ''}`
      : '<p class="pnote">Rien trouvé. Essaie un autre nom.</p>';
  });
}

/** Une ligne quittée en partie : contre qui, ce que tu as joué, ce que dit ta ligne. Mène au drill de cette ligne. */
export function devRow(g: import('../core/types').Game) {
  const id = refBranch(g, BR)!, exp = (g.a.expected || []).map(e => e.san).slice(0, 2);
  const when = new Date(g.t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `<a class="rowi" href="${lineUrl(id, 'drill', g.id)}"><span class="body"><b>${esc(lineTitle(BR[id].br.titre))}</b>
    <small>Contre ${esc(g.opp)}, ${when} : tu as joué <span class="mv no">${esc(g.a.played ?? '')}</span>${exp.length ? `, ta ligne dit ${exp.map(x => `<span class="mv yes">${esc(x)}</span>`).join(' ou ')}` : ''}</small></span>${icon('chev', 'chev')}</a>`;
}

/** Ce que la carte « Tes ouvertures » de S'entraîner affiche : l'ouverture en cours et où en est son pion. */
export function pathSummary() {
  const u = currentUnit();
  return { u, cells: u.lessons.map(l => l.state) };
}

/** Bilan d'une leçon : le pion avance (ou pas encore), et la promotion si l'ouverture est finie. */
export function viewLessonEnd(root: HTMLElement) {
  const L = lastLesson; if (!L) { location.replace('#/rep'); return; }
  const u = allUnits().find(x => x.sys.id === L.sys); if (!u) { location.replace('#/rep'); return; }
  const back = openingUrl(u), moved = u.done > L.doneBefore, name = shortName(u.sys.titre), mins = Math.floor(L.ms / 60000), secs = Math.round((L.ms % 60000) / 1000);
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  if (u.promoted && moved) {
    root.innerHTML = `<div class="lend unitdone"><p class="kick">Promotion</p><img class="bigq" src="${pieceSrc('q')}" alt="">
      <h1>${esc(name)} terminée</h1><p class="sub">Les ${plural(ownLines(u.sys).length, 'ligne')} sont acquises. Elles reviendront de temps en temps pour ne pas s'effacer.</p>
      <div class="etiles"><div><b>${ownLines(u.sys).length}</b><span>lignes</span></div>${u.meet ? `<div><b>${u.meet}</b><span>de tes parties couvertes</span></div>` : ''}<div><b>${time}</b><span>pour la dernière case</span></div></div>
      </div><div class="lend-act"><a class="btn pri block" href="${back}">Voir l'ouverture</a></div>`;
    return;
  }
  const strip = u.lessons.map((l, i) => { const isPawn = l.state === 'cur', last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${isPawn ? ' pawn' : ''}">${isPawn ? `<img src="${pieceSrc('p')}" alt="">` : last && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('');
  const left = u.lessons.length - u.done;
  // la case suivante est prête : on y va d'ici, sans repasser par la page de l'ouverture
  const ni = moved ? u.lessons.findIndex(l => l.state === 'cur') : -1, nx = ni >= 0 ? u.lessons[ni] : null;
  root.innerHTML = `<div class="lend"><h1>${moved ? 'Le pion avance' : 'Presque'}</h1>
    <div class="estrip">${strip}</div>
    <p class="sub">${moved ? `${esc(name)} : ${left === 1 ? 'plus qu\'une case avant la dame' : `plus que ${left} cases avant la dame`}` : 'Rejoue sans faute les lignes ratées pour passer à la case suivante.'}</p>
    <div class="etiles"><div><b class="ok">${L.clean}/${L.lines}</b><span>lignes sans faute</span></div><div><b class="combo">×${L.best}</b><span>meilleur combo</span></div><div><b>${time}</b><span>temps</span></div></div></div>
    <div class="lend-act">${nx ? `<button class="btn pri block" id="bNext">${nx.name ? `Chapitre suivant : ${esc(nx.name)}` : `Jouer la case ${ni + 1}`}</button><a class="btn block" href="${back}">Voir l'ouverture</a>` : `<a class="btn pri block" href="${back}">Continuer</a>`}</div>`;
  root.querySelector('#bNext')?.addEventListener('click', () => startLesson(u, ni));
}
