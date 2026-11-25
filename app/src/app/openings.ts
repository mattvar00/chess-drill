/**
 * L'onglet Ouvertures, version « diagnostic d'abord » (maquette du prototype, 25 nov. 2026) :
 * - la liste : tes ouvertures par couleur et premier coup adverse, les plus jouées d'abord, un seul chiffre (ton score) ;
 * - la page d'une ouverture : ton score, où se jouent tes défaites, tes variantes, tes parties, puis de quoi travailler.
 * Un score n'est coloré que s'il s'écarte nettement de 50 % ; sous 15 parties, il reste gris (trop peu pour juger).
 */
import { Chess, tryMove, uciToObj } from '../core/chess';
import { refBranch } from '../core/drill';
import { keyMoment, myWp } from '../core/stats';
import { PHASE_LABEL, type Phase } from '../core/phase';
import { variantTitle } from '../core/names';
import type { Bloc, Game, System } from '../core/types';
import { miniBoard } from '../ui/board';
import { $, esc, icon, plural } from '../ui/dom';
import { BR, REP, plansFor, store } from './store';
import { lossPhase } from './course';
import { courseBoard, setCurrentCourse, shortName, unitFor } from './path';
import { lineUrl } from './session';
import { gameUrl } from './games';
import { passed } from '../core/path';

const MIN_N = 15;
const pts = (gs: Game[]) => gs.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? .5 : 0), 0);
const scoreOf = (gs: Game[]) => (gs.length ? Math.round(100 * pts(gs) / gs.length) : null);
/** Nettement au-dessus ou en dessous de 50 % : l'intervalle à 90 % ne contient pas 50 %. */
function verdict(p: number | null, n: number): 'good' | 'bad' | 'mid' | 'few' {
  if (p == null || n < MIN_N) return 'few';
  const half = 164.5 * Math.sqrt(.25 / n);
  return p - 50 > half ? 'good' : 50 - p > half ? 'bad' : 'mid';
}
const bar = (p: number | null, v: string) => `<span class="obar ${v}" aria-hidden="true"><i style="--w:${p ?? 0}%"></i></span>`;
const pct = (p: number | null, v: string) => `<span class="opct ${v}">${p == null ? '–' : p + ' %'}</span>`;

/** Les parties de chaque cours (une partie appartient au cours de la ligne qu'elle a suivie le plus longtemps). */
function gamesBySys(): Map<string, Game[]> {
  const m = new Map<string, Game[]>();
  for (const g of store.games) { const id = refBranch(g, BR); if (!id) continue; const s = BR[id].sys.id; (m.get(s) ?? m.set(s, []).get(s)!).push(g); }
  for (const l of m.values()) l.sort((a, b) => b.t - a.t);
  return m;
}
/** Une ouverture = une famille de cours : « Sveshnikov : ligne principale » et « Sveshnikov : quand il prend en c6 » n'en font qu'une. */
/** Le nom de l'ouverture : la partie avant « : », sauf quand elle ne dit rien (« Les autres : Fermée, Grand Prix… »). */
export const famTitle = (t: string) => { const [a, ...r] = t.split(' : '); return shortName(r.length && /^les autres$/i.test(a.trim()) ? r.join(' : ') : a); };
const famName = (s: System) => famTitle(s.titre);
const partName = (s: System) => { const t = s.titre.split(' : '); return t.length > 1 ? t.slice(1).join(' : ') : 'le cours'; };
function familyOf(sysId: string): { b: Bloc; list: System[] } | null {
  for (const b of REP.blocs) { const s = b.systemes.find(x => x.id === sysId); if (s) return { b, list: b.systemes.filter(x => famName(x) === famName(s) && (x.statut !== 'alternatif' || x.id === s.id)) }; }
  return null;
}
const groupName = (b: Bloc) => `${b.side === 'w' ? 'Avec les Blancs' : 'Avec les Noirs'}, ${b.titre.charAt(0).toLowerCase()}${b.titre.slice(1)}`;
export const openingUrl = (sysId: string) => `#/o/${sysId}`;

/* ---------- la liste ---------- */
export function viewOpeningList(root: HTMLElement) {
  const by = gamesBySys(), unseen: { b: Bloc; s: System }[] = [];
  const groups = REP.blocs.filter(b => b.id !== 'plans').map(b => {
    const fams = new Map<string, { s: System; gs: Game[] }>();
    for (const s of b.systemes) { const gs = by.get(s.id) ?? []; if (!gs.length && s.statut === 'alternatif') continue;
      const f = fams.get(famName(s)); if (f) f.gs = [...f.gs, ...gs]; else fams.set(famName(s), { s, gs: [...gs] }); }
    const rows = [...fams.values()];
    for (const x of rows) if (!x.gs.length) unseen.push({ b, s: x.s });
    const played = rows.filter(x => x.gs.length).sort((a, c) => c.gs.length - a.gs.length);
    return { b, played, all: played.flatMap(x => x.gs) };
  }).filter(g => g.played.length).sort((a, c) => (a.b.side === c.b.side ? c.all.length - a.all.length : a.b.side === 'w' ? -1 : 1));
  const row = (b: Bloc, s: System, gs: Game[]) => { const p = scoreOf(gs), v = verdict(p, gs.length);
    return `<a class="orow" href="${openingUrl(s.id)}">${courseBoard(unitFor(b, s))}<span class="ot"><b>${esc(famName(s))}</b>${bar(p, v)}<small>${plural(gs.length, 'partie')}</small></span>${pct(p, v)}</a>`; };
  root.innerHTML = `<div class="ol">${groups.map(g => { const p = scoreOf(g.all), v = verdict(p, g.all.length);
      return `<section><h2 class="oh">${esc(groupName(g.b))}<span class="opct ${v}">${p} %</span></h2>${g.played.map(x => row(g.b, x.s, x.gs)).join('')}</section>`; }).join('')}
    ${unseen.length ? `<details class="ounseen"><summary>Pas encore jouées <span>${unseen.length}</span></summary>${unseen.map(x => `<a class="orow" href="${openingUrl(x.s.id)}">${courseBoard(unitFor(x.b, x.s))}<span class="ot"><b>${esc(famName(x.s))}</b><small>${x.b.side === 'w' ? 'Blancs' : 'Noirs'} · ${esc(x.b.titre.toLowerCase())}</small></span>${icon('chev', 'chev')}</a>`).join('')}</details>` : ''}
    <p class="onote">Vert ou rouge : nettement au-dessus ou en dessous de 50 %. Gris : moins de ${MIN_N} parties, trop peu pour juger.</p></div>`;
}

/* ---------- la page d'une ouverture ---------- */
function spark(g: Game, w = 84, h = 28): string {
  const v = myWp(g); if (!v || v.length < 3) return `<span class="ospark" style="width:${w}px"></span>`;
  const n = v.length - 1, P = (i: number) => `${(i * w / n).toFixed(1)},${(h - v[i] * h / 100).toFixed(1)}`;
  const k = keyMoment(g), dot = k ? `<circle cx="${(k.ply * w / n).toFixed(1)}" cy="${(h - v[k.ply] * h / 100).toFixed(1)}" r="3.2" class="okey"/>` : '';
  return `<svg class="ospark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" class="omid"/><polyline points="${v.map((_, i) => P(i)).join(' ')}"/>${dot}</svg>`;
}
/** La revue d'une partie, ouverte sur son moment clé (le coup qui t'a coûté le plus). */
const keyUrl = (g: Game, back: string) => { const k = keyMoment(g); return gameUrl(g.id, k ? k.ply + 1 : undefined, back); };
const dateFr = (t: number) => new Date(t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
function ring(p: number, v: string): string {
  const r = 34, c = 2 * Math.PI * r;
  return `<svg class="oring ${v}" width="88" height="88" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="${r}" class="otrack"/><circle cx="44" cy="44" r="${r}" class="ofill" style="--c:${c.toFixed(1)};--off:${(c * (1 - p / 100)).toFixed(1)}" transform="rotate(-90 44 44)"/></svg>`;
}
/** Position au bout d'une variante, pour sa miniature. */
function endBoard(id: string): string {
  const { br, bloc } = BR[id], g = new Chess(); for (const m of br.moves) if (!tryMove(g, uciToObj(m.uci))) break;
  return miniBoard(g, bloc.side).replace('class="mini"', 'class="mini othumb"');
}

export function viewOpeningPage(root: HTMLElement, sysId: string): (() => void) | void {
  const fam = familyOf(sysId);
  if (!fam) { location.replace('#/rep'); return; }
  const { b, list } = fam, s = list[0], byS = gamesBySys(), games = list.flatMap(x => byS.get(x.id) ?? []).sort((x, y) => y.t - x.t);
  const n = games.length, p = scoreOf(games), v = verdict(p, n), here = openingUrl(sysId);
  const ids = new Set(games.map(g => g.id)), faults = store.faults.filter(f => ids.has(f.game)).length;
  const nPlans = new Set(list.flatMap(x => plansFor(x.id).map(pl => pl.id))).size;
  const courseUrl = (x: System) => `#/cours?o=${x.id}`;
  const cRow = (x: System) => { const u = unitFor(b, x), ls = u.sys.branches.filter(y => !y.plus), k = ls.filter(y => passed(store.state.br[y.id])).length;
    return `<a class="orow" href="${courseUrl(x)}" data-course="${x.id}">${courseBoard(u)}<span class="ot"><b>${esc(list.length > 1 ? partName(x).charAt(0).toUpperCase() + partName(x).slice(1) : 'Le cours')}</b>${bar(ls.length ? Math.round(100 * k / ls.length) : 0, 'few')}<small>${k} variantes sur ${ls.length}</small></span>${icon('chev', 'chev')}</a>`; };
  const tiles = `<h2 class="oh">${list.length > 1 ? 'Les cours' : 'Le cours'}</h2>${list.map(cRow).join('')}
    <div class="otiles two"><a href="${courseUrl(s)}&v=plans" data-course="${s.id}"><b>${nPlans}</b><span>${nPlans > 1 ? 'Les plans' : 'Plan'}</span></a>
      <a href="#/wood?o=${list.map(x => x.id).join(',')}&r=${encodeURIComponent(here)}"><b>${faults}</b><span>Tes fautes ici</span></a></div>`;
  if (!n) {
    root.innerHTML = `<div class="op"><p class="osub">${b.side === 'w' ? 'Avec les Blancs' : 'Avec les Noirs'} · ${esc(b.titre.toLowerCase())}</p><p class="oempty">Pas encore de partie dans cette ouverture : le cours t'y prépare.</p>${tiles}</div>`;
    bindCourse(root); return;
  }
  // où se jouent tes défaites (le coup qui a fait le plus chuter tes chances)
  const lost = games.filter(g => g.res === 'L'), ph: Record<Phase, Game[]> = { ouv: [], mil: [], fin: [] };
  for (const g of lost) { const k = lossPhase(g); if (k) ph[k].push(g); }
  const nPh = ph.ouv.length + ph.mil.length + ph.fin.length, PHS: Phase[] = ['ouv', 'mil', 'fin'];
  // les variantes : la ligne de ton cours que chaque partie a suivie le plus longtemps
  const byVar = new Map<string, Game[]>(); for (const g of games) { const id = refBranch(g, BR); if (id) (byVar.get(id) ?? byVar.set(id, []).get(id)!).push(g); }
  const vars = [...byVar].sort((a, c) => c[1].length - a[1].length);
  // une variante se lit d'un coup d'œil : le coup qui la définit, puis l'idée en mots ; la théorie et les erreurs adverses sont séparées
  const vrow = ([id, gs]: [string, Game[]]) => { const br = BR[id].br, vp = scoreOf(gs), vv = verdict(vp, gs.length), dash = br.titre.split(' — '), [idea, mv] = dash.length > 1 ? [dash.slice(1).join(' — '), ''] : br.titre.split(' : ');
    const key = mv ? mv.replace(/\s+([?!]+)$/, '$1') : '', off = br.nom ? variantTitle(br).title : '';
    return `<a class="orow" href="${lineUrl(id, 'explore')}">${endBoard(id)}<span class="ot"><b>${key ? `<span class="okeymv">${esc(key)}</span>` : ''}${esc(idea)}</b>${bar(vp, vv)}<small>${off ? esc(off) + ' · ' : ''}${plural(gs.length, 'partie')}</small></span>${pct(vp, vv)}</a>`; };
  const isErr = (id: string) => BR[id].br.role === 'erreur' || BR[id].br.type === 'punir';
  const theory = vars.filter(x => !isErr(x[0])), errors = vars.filter(x => isErr(x[0]));
  const vblock = (title: string, hint: string, list: [string, Game[]][], k: string) => !list.length ? '' : `<h2 class="oh">${title}${list.length > 3 ? `<button type="button" class="olink" data-more="${k}">Les ${list.length}</button>` : ''}</h2><p class="onote ohint">${hint}</p><div id="v${k}">${list.slice(0, 3).map(vrow).join('')}</div>`;
  const grow = (g: Game) => { const k = keyMoment(g);
    return `<a class="orow" href="${keyUrl(g, here)}">${spark(g)}<span class="ot"><b>${esc(g.opp)}</b><small>${dateFr(g.t)}${k ? ` · ${Math.floor(k.ply / 2) + 1}${k.ply % 2 ? '…' : '.'}${esc(k.san)}, ${k.before} → ${k.after} %` : ''}</small></span><i class="ores ${g.res}"></i></a>`; };
  const phOf = new Map<string, Phase>(); for (const k of PHS) for (const g of ph[k]) phOf.set(g.id, k);
  root.innerHTML = `<div class="op">
    <p class="osub">${b.side === 'w' ? 'Avec les Blancs' : 'Avec les Noirs'} · ${esc(b.titre.toLowerCase())} · ${plural(n, 'partie')}</p>
    <div class="ohero"><div><div class="obig">${p}<small>%</small></div><p>des points${v === 'few' ? ', à confirmer' : v === 'good' ? ', nettement au-dessus de 50 %' : v === 'bad' ? ', nettement en dessous de 50 %' : ''}</p></div>${ring(p ?? 0, v)}</div>
    ${nPh ? `<h2 class="oh">Tes ${plural(nPh, 'défaite')}, par phase</h2>
      <div class="ophases" id="ophases">${PHS.filter(k => ph[k].length).map(k => `<button type="button" data-ph="${k}" class="${k}" style="flex-grow:${ph[k].length}" aria-label="${PHASE_LABEL[k]} : ${plural(ph[k].length, 'défaite')}">${ph[k].length}</button>`).join('')}</div>
      <div class="olegend">${PHS.map(k => `<span><i class="${k}"></i>${PHASE_LABEL[k].replace(' de partie', '')} ${ph[k].length}</span>`).join('')}</div>
      <p class="onote">Touche une phase pour voir ces défaites.</p>` : ''}
    ${vblock('La théorie', 'Les vraies lignes de l\'ouverture, celles que jouent les bons joueurs.', theory, 't')}
    ${vblock('Ses erreurs à punir', 'Des coups douteux de l\'adversaire : il y a une punition à connaître.', errors, 'e')}
    <h2 class="oh">${plural(n, 'partie')}<span class="omute">les plus récentes d'abord</span></h2>
    <div class="odots" id="odots">${games.map(g => `<a href="${keyUrl(g, here)}" class="${g.res}" data-ph="${phOf.get(g.id) ?? ''}" aria-label="${esc(g.opp)}, ${dateFr(g.t)}"></a>`).join('')}</div>
    <div class="olegend"><span><i class="W"></i>gagnée</span><span><i class="L"></i>perdue</span><span><i class="D"></i>nulle</span></div>
    <div id="glist">${games.slice(0, 4).map(grow).join('')}</div>
    ${tiles}</div>`;
  bindCourse(root);
  root.querySelectorAll<HTMLElement>('[data-more]').forEach(bt => bt.addEventListener('click', () => { const k = bt.dataset.more!; $('#v' + k, root).innerHTML = (k === 't' ? theory : errors).map(vrow).join(''); bt.remove(); }));
  const P = root.querySelector<HTMLElement>('#ophases'), D = $('#odots', root), L = $('#glist', root);
  P?.addEventListener('click', e => { const bt = (e.target as HTMLElement).closest<HTMLElement>('[data-ph]'); if (!bt) return;
    const on = bt.classList.contains('on'); P.querySelectorAll('button').forEach(x => x.classList.remove('on')); P.classList.toggle('pick', !on); D.classList.toggle('pick', !on);
    if (on) { D.querySelectorAll('a').forEach(a => a.classList.remove('off')); L.innerHTML = games.slice(0, 4).map(grow).join(''); return; }
    bt.classList.add('on'); const k = bt.dataset.ph as Phase;
    D.querySelectorAll<HTMLElement>('a').forEach(a => a.classList.toggle('off', a.dataset.ph !== k));
    L.innerHTML = ph[k].slice(0, 6).map(grow).join(''); });
}
/** Le cours s'ouvre comme « cours en cours » : c'est lui que montre la page du cours. */
function bindCourse(root: HTMLElement) { root.querySelectorAll<HTMLElement>('[data-course]').forEach(a => a.addEventListener('click', () => setCurrentCourse(a.dataset.course!))); }
