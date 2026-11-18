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
import { lineName, lineTitle, nomTitle, plainName, popBars, roleLabel, shortNom, typeLabel, variantTitle } from '../core/names';
import { recentDeviations, refBranch } from '../core/drill';
import { lineUrl } from './session';
import { isDue } from '../core/schedule';
import { meetCounts } from '../core/rank';
import { miniBoard, pieceSrc } from '../ui/board';
import { confetti } from '../ui/fx';
import { Chess, tryMove, uciToObj } from '../core/chess';
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
  // Peu de mots : le nom de la case, à quelle fréquence on la rencontre, ses variantes (cochées quand elles sont sues), un bouton.
  const n = u.lessons.length, st = store.state.br;
  const mark = (id: string) => { const s = st[id]; return s?.clean && s.clean >= 1 ? (isDue(s) ? 'rev' : 'ok') : 'new'; };
  const pips = `<span class="ppips" role="img" aria-label="${L.ids.filter(id => mark(id) === 'ok').length} sur ${L.ids.length}">${L.ids.map(id => `<i class="${mark(id)}"></i>`).join('')}</span>`;
  const lines = `<details class="pmore"><summary>${plural(L.ids.length, 'variante')}</summary><ul class="plines simple">${L.ids.map(id => `<li class="${mark(id)}">${mark(id) === 'ok' ? icon('check') : '<i class="pdot" aria-hidden="true"></i>'}<span>${esc(variantTitle(BR[id].br).sub || variantTitle(BR[id].br).title)}</span></li>`).join('')}</ul></details>`;
  const share = L.name ? u.sys.shares?.[L.name] : undefined, rest = lessonIds(L).length;
  const note = L.state === 'lock' ? `Finis d'abord la case ${i}.` : '';
  const act = L.state === 'cur' ? `<button class="btn pri" data-go="${i}">${rest < L.ids.length ? 'Continuer' : 'Commencer'}</button>`
    : L.state === 'crack' ? `<button class="btn pri" data-go="${i}">Réviser</button>`
    : L.state === 'done' ? `<button class="btn" data-go="${i}">Rejouer</button>` : '';
  return `<div class="pbubble ${L.state}" style="--x:${x}%" role="region" aria-label="Case ${i + 1} sur ${n}, ${STATE[L.state]}">
    ${L.name ? `<p class="pbn">${esc(chapLabel(L))}</p>${chapLabel(L) !== shortChap(L.name) ? `<p class="pbo">${esc(shortChap(L.name))}</p>` : ''}` : `<p class="pbn">Case ${i + 1}</p>`}
    ${share ? `<p class="pbf">Environ 1 partie sur ${Math.max(2, Math.round(1 / share))}</p>` : ''}${note ? `<p class="pbw">${note}</p>` : ''}${pips}${act}${lines}</div>`;
}
/** Nom court d'un chapitre pour le chemin : ce qui précède la virgule, les deux-points ou la parenthèse (le nom complet est dans la bulle). */
/** Sur le chemin : un chapitre nommé par ses coups (« 7.Bc4 Nb6… ») prend le nom officiel que partagent ses variantes, quand il y en a un. */
const chapLabel = (L: Lesson) => { const n = L.name!;
  const c = new Map<string, number>(); for (const id of L.ids) { const x = BR[id].br.nom; if (x) c.set(x, (c.get(x) ?? 0) + 1); }
  const best = [...c].sort((a, b) => b[1] - a[1])[0]; return best && best[1] * 2 >= L.ids.length ? nomTitle(best[0]) : shortChap(n); };
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
    ${L.name && !on ? `<span class="plab ${x <= 50 ? 'r' : 'l'}" style="${x <= 50 ? `left:calc(${x}% + 46px);max-width:calc(${100 - x}% - 50px)` : `right:calc(${100 - x}% + 46px);max-width:calc(${x}% - 50px)`}"><b>${esc(chapLabel(L))}</b></span>` : ''}
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
/** Les variantes du chemin (l'essentiel) : celles rangées dans « Pour aller plus loin » n'entrent pas dans le compte. */
const pathLines = (u: Unit) => ownLines(u.sys).filter(b => !b.plus);
const knownN = (u: Unit) => pathLines(u).filter(b => passed(store.state.br[b.id])).length;
/**
 * La page d'un cours : où tu en es, « Apprendre » (la suite du chapitre en cours) et « Réviser » (ce qui est à revoir),
 * puis le chemin, une case par chapitre avec son nom ; toucher une case ouvre sa bulle. `bindPath` branche les gestes.
 */
export function pathBlock(u: Unit): string {
  const cur = u.lessons.findIndex(l => l.state === 'cur'), n = pathLines(u).length, k = knownN(u), due = dueIds(u).length;
  return `<section class="chead${u.promoted ? ' won' : ''}" style="--fam:${familyColor(u.bloc.id)}">
      <span class="prog cbar" role="img" aria-label="${k} sur ${n}"><b style="width:${n ? Math.max(k ? 3 : 0, Math.round(100 * k / n)) : 0}%"></b></span>
      <p class="cprog"><b>${k} sur ${n}</b>${due ? `<span class="due">${due} à revoir</span>` : ''}${u.promoted ? `<img class="qwon" src="${pieceSrc('q')}" alt="Dame gagnée">` : ''}</p>
      <div class="cbtns">${cur >= 0 ? `<button class="btn pri" data-go="${cur}">Continuer</button>` : ''}${due || k || cur < 0 ? `<button class="btn${cur >= 0 ? '' : ' pri'}" id="bRev">${due ? `Réviser (${due})` : 'Tout rejouer'}</button>` : ''}</div></section>
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
  for (const g of recentDeviations(store.games, store.state.fixed, BR, Date.now(), 30, 50)) { const s = BR[refBranch(g, BR)!]?.sys.id; if (s && !devBy[s]) devBy[s] = 1; else if (s && passed(store.state.br[refBranch(g, BR)!])) devBy[s]++; }   // quitter une variante jamais apprise ne s'additionne pas : avec beaucoup de lignes, ça arrive à chaque partie
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
  oubli: f => f.devs > 1 ? 'Tu en es sorti plusieurs fois en partie.' : 'Tu en es sorti dans une partie récente.',
  punir: () => 'Un adversaire s\'y est trompé, et tu ne l\'as pas puni.',
  revoir: () => 'À revoir avant d\'oublier.',
  fragile: () => 'Tu la rencontres souvent et tu y perds des points.',
  milieu: () => 'Tu sors bien de l\'ouverture, puis tu perds le fil.',
  nouveau: f => f.games ? 'Vue dans tes parties, pas encore apprise.' : 'La suite de ton cours.',
  avancer: f => f.games ? 'Tu la joues souvent.' : 'La suite de ton cours.',
  apprendre: () => 'Tu n\'as pas encore de réponse ici.',
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
export function nextUp(): { u: Unit; why: string; side: string; label: string; line?: string; href?: string; run?: () => void } | null {
  const top = recommend(factsOf(allUnits())).todo[0]; if (!top) return null;
  // une partie récente est passée par une variante précise : c'est elle qu'on lance, pas le chapitre en cours
  if (top.kind === 'oubli') { const g = recentDeviations(store.games, store.state.fixed, BR, Date.now(), 30, 50).find(x => BR[refBranch(x, BR)!]?.sys.id === top.f.u.sys.id), id = g ? refBranch(g, BR)! : null;
    if (g && id) { const br = BR[id].br, known = passed(store.state.br[id]), name = lineTitle(br.titre);
      return { u: top.f.u, side: sideWord(top.f.u), line: id, href: lineUrl(id, 'drill', g.id), label: known ? 'Rejouer cette variante' : 'Apprendre cette variante',
        why: `${known ? 'Tu la connaissais et tu l\'as quittée' : br.role === 'erreur' ? 'Ton adversaire a joué ce piège et tu n\'as pas trouvé la punition' : 'Tu l\'as rencontrée et tu ne la connais pas encore'} contre ${esc(g.opp)} : ${esc(name)}.` }; } }
  const L = top.f.u.lessons.find(l => l.state === 'cur' || l.state === 'crack');
  return { u: top.f.u, why: WHY[top.kind](top.f), side: sideWord(top.f.u), line: L ? lessonIds(L)[0] ?? L.ids[0] : undefined, ...actionOf(top) };
}
/** La carte du cours recommandé : la position qui t'attend, pourquoi maintenant, où en est le pion, et un bouton. La même sur l'accueil et sur Ouvertures. */
export function featured(up: NonNullable<ReturnType<typeof nextUp>>, id = 'bUp'): string {
  let board = ''; if (up.line && BR[up.line]) { const { br, bloc } = BR[up.line], g = new Chess(); for (const m of br.moves) if (!tryMove(g, uciToObj(m.uci))) break; board = miniBoard(g, bloc.side); }
  return `<section class="surf today feat2"><p class="label">Recommandé maintenant</p>
    <div class="today-top"><div class="today-text"><h2>${esc(shortName(up.u.sys.titre))}</h2><p class="rside">${esc(up.side)}</p><p>${up.why}</p></div>${board}</div>
    ${strip(up.u)}
    <button class="btn pri block" id="${id}">${up.label}</button><a class="quiet" href="${openingUrl(up.u)}">Voir le cours</a></section>`;
}
export const runUp = (up: NonNullable<ReturnType<typeof nextUp>>) => { if (up.run) up.run(); else location.hash = up.href!; };

/** Une couleur par famille d'ouvertures (le premier coup de l'adversaire) : on repère d'un coup d'œil où l'on est. */
const FAMILY: Record<string, string> = { A: '#7FB0FF', B: '#F58CA8', F: '#4FD1C5', C: '#5FC58A', D: '#F0A35E', E: '#B79CFF' };
export const familyColor = (blocId: string) => FAMILY[blocId] ?? 'var(--accent-text)';
/** Les recommandations suivantes, après celle de la carte : pour avoir le choix sans chercher. */
export function otherUps(skip: string): { u: Unit; why: string }[] {
  return recommend(factsOf(allUnits()), 6).todo.filter(r => r.f.u.sys.id !== skip).slice(0, 2).map(r => ({ u: r.f.u, why: WHY[r.kind](r.f) }));
}
/** Ouvertures : la liste des cours, rangés par couleur puis par premier coup adverse, avec l'avancement de chacun. Rien d'autre. */
/** La vignette d'un cours : la position où ses variantes se séparent, vue de ton côté. */
export function courseBoard(u: Unit): string {
  const ls = ownLines(u.sys).map(b => b.moves); let k = ls.length ? ls[0].length : 0;
  for (const m of ls) { let j = 0; while (j < k && j < m.length && m[j].uci === ls[0][j].uci) j++; k = j; }
  const g = new Chess(); for (let i = 0; i < k; i++) if (!tryMove(g, uciToObj(ls[0][i].uci))) break;
  return miniBoard(g, u.bloc.side).replace('class="mini"', 'class="mini cthumb"');
}
/**
 * L'onglet Ouvertures tombe tout de suite sur le chemin du cours en cours : rien à chercher. Le nom du cours, en haut,
 * est un bouton : il ouvre « Tes cours » (#/rep/choisir) pour en changer.
 */
export function viewPath(root: HTMLElement) {
  const units = allUnits(), up = nextUp(), cur = units.find(u => u.sys.id === getLS(LAST_KEY)) ?? up?.u ?? currentUnit(units);
  if (location.hash.startsWith('#/rep/choisir')) return pickCourse(root, units, cur, up?.u.sys.id);
  // la recommandation reste visible : une ligne en haut quand elle porte sur un autre cours, un mot sous le nom quand c'est celui-ci
  root.innerHTML = `<a class="cpick surf" href="#/rep/choisir" aria-label="Changer de cours : ${esc(shortName(cur.sys.titre))}">${courseBoard(cur)}<span class="body"><b>${esc(shortName(cur.sys.titre))}</b><small>${cur.bloc.side === 'w' ? 'Avec les Blancs' : 'Avec les Noirs'}</small></span>${icon('chev', 'chev')}</a>
    ${pathBlock(cur)}
    <a class="quiet" href="${openingUrl(cur)}">Plus sur ce cours</a>`;
  bindPath(root, cur);
}
/** « Tes cours » : ceux que tu rencontres ou que tu as commencés, Blancs puis Noirs ; les autres sont repliés. */
function pickCourse(root: HTMLElement, units: Unit[], cur: Unit, reco?: string) {
  const seen = (u: Unit) => u.sys.id === cur.sys.id || (played(u) && (u.meet > 0 || knownN(u) > 0));
  const mine = units.filter(seen).length >= 4 ? seen : (u: Unit) => seen(u) || played(u);   // pas encore de parties : on montre tout ton répertoire
  const row = (u: Unit) => { const n = pathLines(u).length, k = knownN(u), on = u.sys.id === cur.sys.id;
    return `<button type="button" class="rowi crow" data-pick="${u.sys.id}" data-name="${esc(norm(u.sys.titre))}" style="--fam:${familyColor(u.bloc.id)}">${courseBoard(u)}<span class="body"><span class="ctop2"><b>${esc(shortName(u.sys.titre))}</b><small>${on ? 'en cours' : `${k} sur ${n}`}</small></span>
      <span class="prog" role="img" aria-label="${k} variantes sues sur ${n}"><b style="width:${n ? Math.round(100 * k / n) : 0}%"></b></span></span>${u.promoted ? `<img class="qwon" src="${pieceSrc('q')}" alt="Dame gagnée">` : ''}</button>`; };
  const sec = (side: 'w' | 'b', title: string) => { const us = units.filter(u => u.bloc.side === side && mine(u)).sort((a, b) => +(b.sys.id === reco) - +(a.sys.id === reco)); return us.length ? `<section class="grp"><h2>${title}</h2><div class="surf card list">${us.map(row).join('')}</div></section>` : ''; };
  const others = units.filter(u => !mine(u));
  root.innerHTML = `<header class="pagehead pickhead"><h1>Tes cours</h1><a class="btn" href="#/rep">Fermer</a></header>
    <div class="rsearch"><label class="sr" for="qRep">Chercher une ouverture</label><input id="qRep" type="search" placeholder="Chercher : Londres, Alapin, Slave…" autocomplete="off"></div>
    ${sec('w', 'Avec les Blancs')}${sec('b', 'Avec les Noirs')}
    ${others.length ? `<details class="others"><summary>Autres ouvertures (${others.length})</summary><div class="surf card list">${others.map(row).join('')}</div></details>` : ''}
    <a class="quiet" href="#/explorer?r=${encodeURIComponent('#/rep')}">Explorer une position</a>`;
  root.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]'); if (!b) return; setLS(LAST_KEY, b.dataset.pick!); location.hash = '#/rep'; });
  const q = $<HTMLInputElement>('#qRep', root);
  q.addEventListener('input', () => { const t = norm(q.value.trim()); const det = root.querySelector<HTMLDetailsElement>('details.others'); if (det && t) det.open = true;
    root.querySelectorAll<HTMLElement>('[data-pick]').forEach(r => { r.hidden = !!t && !r.dataset.name!.includes(t); }); });
}
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
  const back = openingUrl(u), moved = u.done > L.doneBefore, name = shortName(u.sys.titre), tsec = Math.round(L.ms / 1000), mins = Math.floor(tsec / 60), secs = tsec % 60;
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  if (u.promoted && moved) {
    confetti(90);
    root.innerHTML = `<div class="lend unitdone"><p class="kick">Promotion</p><img class="bigq" src="${pieceSrc('q')}" alt="">
      <h1>${esc(name)} : cours terminé</h1><p class="sub">Les ${plural(ownLines(u.sys).length, 'variante')} sont acquises. Elles reviendront de temps en temps pour ne pas s'effacer.</p>
      <div class="etiles"><div><b>${ownLines(u.sys).length}</b><span>variantes</span></div>${u.meet ? `<div><b>${u.meet}</b><span>de tes parties couvertes</span></div>` : ''}<div><b>${time}</b><span>pour la dernière case</span></div></div>
      </div><div class="lend-act"><a class="btn pri block" href="${back}">Voir le cours</a></div>`;
    return;
  }
  const strip = u.lessons.map((l, i) => { const isPawn = l.state === 'cur', last = i === u.lessons.length - 1;
    return `<span class="ecell ${l.state}${isPawn ? ' pawn' : ''}">${isPawn ? `<img src="${pieceSrc('p')}" alt="">` : last && l.state === 'lock' ? `<img class="qghost" src="${pieceSrc('q')}" alt="">` : ''}</span>`; }).join('');
  const left = u.lessons.length - u.done;
  // la case suivante est prête : on y va d'ici, sans repasser par la page de l'ouverture
  const ni = moved ? u.lessons.findIndex(l => l.state === 'cur') : -1, nx = ni >= 0 ? u.lessons[ni] : null;
  root.innerHTML = `<div class="lend"><h1>${moved ? 'Le pion avance' : 'Presque'}</h1>
    <div class="estrip${moved ? ' moved' : ''}">${strip}</div>
    <p class="sub">${moved ? `${esc(name)} : ${left === 1 ? 'plus qu\'une case avant la dame' : `plus que ${left} cases avant la dame`}` : 'Rejoue sans faute les lignes ratées pour passer à la case suivante.'}</p>
    <div class="etiles"><div><b class="ok">${L.clean}/${L.lines}</b><span>variantes sans faute</span></div><div><b class="combo">×${L.best}</b><span>meilleur combo</span></div><div><b>${time}</b><span>temps</span></div></div></div>
    <div class="lend-act">${nx ? `<button class="btn pri block" id="bNext">${nx.name ? `Chapitre suivant : ${esc(nx.name)}` : `Jouer la case ${ni + 1}`}</button><a class="btn block" href="${back}">Voir le cours</a>` : `<a class="btn pri block" href="${back}">Continuer</a>`}</div>`;
  if (moved) confetti(36);
  root.querySelector('#bNext')?.addEventListener('click', () => startLesson(u, ni));
}

/** Le cours d'une carte « Pour toi » : on l'ouvre comme cours en cours. */
export function openCourse(u: Unit) { setLS(LAST_KEY, u.sys.id); location.hash = '#/rep'; }
