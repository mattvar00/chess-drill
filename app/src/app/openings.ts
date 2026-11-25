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
import { lossPhase, plansPanel } from './course';
import { bindPath, courseBoard, pathBlock, setCurrentCourse, shortName, unitFor } from './path';
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

export type OTab = 'chemin' | 'parties' | 'plans';
/**
 * La page d'une ouverture, la seule : ton score en une ligne, puis trois vues.
 * - Chemin : le cours (une case par chapitre, nommée par le coup adverse), avec « Continuer » ;
 * - Mes parties : où se jouent tes défaites, et tes parties ouvertes sur leur moment clé ;
 * - Plans : les plans en images, à jouer contre le moteur.
 * Une ouverture faite de plusieurs cours (Sveshnikov) les propose en haut du chemin.
 */
export function viewOpeningPage(root: HTMLElement, sysId: string, tab: OTab = 'chemin'): (() => void) | void {
  const fam = familyOf(sysId);
  if (!fam) { location.replace('#/rep'); return; }
  const { b, list } = fam, sys = list.find(x => x.id === sysId) ?? list[0], byS = gamesBySys(), games = list.flatMap(x => byS.get(x.id) ?? []).sort((x, y) => y.t - x.t);
  const n = games.length, p = scoreOf(games), v = verdict(p, n), here = openingUrl(sys.id);
  setCurrentCourse(sys.id);
  const nPlans = plansFor(sys.id).length;
  const tabs = `<nav class="csegs" aria-label="Vues de l'ouverture">${([['chemin', 'Chemin'], ['parties', n ? `Mes parties <span class="cn">${n}</span>` : 'Mes parties'], ['plans', nPlans ? `Plans <span class="cn">${nPlans}</span>` : 'Plans']] as [OTab, string][])
    .map(([k, l]) => `<a class="cseg${k === tab ? ' on' : ''}" href="${here}${k === 'chemin' ? '' : '?v=' + k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const head = `<p class="oline">${p == null ? '' : `<b class="${v}">${p} %</b>`}<span>${n ? `des points sur ${plural(n, 'partie')}` : 'Pas encore de partie'} · ${b.side === 'w' ? 'Blancs' : 'Noirs'}</span></p>${tabs}`;
  const wrap = (html: string) => { root.innerHTML = `<div class="opage">${head}${html}</div>`; };

  if (tab === 'plans') { wrap(plansPanel(sys, here)); return; }
  if (tab === 'parties') {
    if (!n) { wrap('<p class="oempty">Pas encore de partie dans cette ouverture.</p>'); return; }
    const lost = games.filter(g => g.res === 'L'), ph: Record<Phase, Game[]> = { ouv: [], mil: [], fin: [] };
    for (const g of lost) { const k = lossPhase(g); if (k) ph[k].push(g); }
    const nPh = ph.ouv.length + ph.mil.length + ph.fin.length, PHS: Phase[] = ['ouv', 'mil', 'fin'];
    const phOf = new Map<string, Phase>(); for (const k of PHS) for (const g of ph[k]) phOf.set(g.id, k);
    const grow = (g: Game) => { const k = keyMoment(g);
      return `<a class="orow" href="${keyUrl(g, here + '?v=parties')}">${spark(g)}<span class="ot"><b>${esc(g.opp)}</b><small>${dateFr(g.t)}${k ? ` · ${Math.floor(k.ply / 2) + 1}${k.ply % 2 ? '…' : '.'}${esc(k.san)}, ${k.before} → ${k.after} %` : ''}</small></span><i class="ores ${g.res}"></i></a>`; };
    const ids = new Set(games.map(g => g.id)), faults = store.faults.filter(f => ids.has(f.game)).length;
    wrap(`<div class="op">${nPh ? `<h2 class="oh">Tes ${plural(nPh, 'défaite')}, par phase</h2>
      <div class="ophases" id="ophases">${PHS.filter(k => ph[k].length).map(k => `<button type="button" data-ph="${k}" class="${k}" style="flex-grow:${ph[k].length}" aria-label="${PHASE_LABEL[k]} : ${plural(ph[k].length, 'défaite')}">${ph[k].length}</button>`).join('')}</div>
      <div class="olegend">${PHS.map(k => `<span><i class="${k}"></i>${PHASE_LABEL[k].replace(' de partie', '')} ${ph[k].length}</span>`).join('')}</div>` : ''}
      <div class="odots" id="odots">${games.map(g => `<a href="${keyUrl(g, here + '?v=parties')}" class="${g.res}" data-ph="${phOf.get(g.id) ?? ''}" aria-label="${esc(g.opp)}, ${dateFr(g.t)}"></a>`).join('')}</div>
      <div class="olegend"><span><i class="W"></i>gagnée</span><span><i class="L"></i>perdue</span><span><i class="D"></i>nulle</span></div>
      <div id="glist">${games.slice(0, 5).map(grow).join('')}</div>
      ${faults ? `<a class="btn block ofaults" href="#/wood?o=${list.map(x => x.id).join(',')}&r=${encodeURIComponent(here + '?v=parties')}">Rejouer mes ${plural(faults, 'faute')} ici</a>` : ''}</div>`);
    const P = root.querySelector<HTMLElement>('#ophases'), D = $('#odots', root), L = $('#glist', root);
    P?.addEventListener('click', e => { const bt = (e.target as HTMLElement).closest<HTMLElement>('[data-ph]'); if (!bt) return;
      const on = bt.classList.contains('on'); P.querySelectorAll('button').forEach(x => x.classList.remove('on')); P.classList.toggle('pick', !on); D.classList.toggle('pick', !on);
      if (on) { D.querySelectorAll('a').forEach(a => a.classList.remove('off')); L.innerHTML = games.slice(0, 5).map(grow).join(''); return; }
      bt.classList.add('on'); const k = bt.dataset.ph as Phase;
      D.querySelectorAll<HTMLElement>('a').forEach(a => a.classList.toggle('off', a.dataset.ph !== k));
      L.innerHTML = ph[k].slice(0, 6).map(grow).join(''); });
    return;
  }
  // le chemin : quand l'ouverture a plusieurs cours, on choisit lequel juste au-dessus
  const u = unitFor(b, sys);
  const pills = list.length > 1 ? `<nav class="opills" aria-label="Les cours de cette ouverture">${list.map(x => `<a href="${openingUrl(x.id)}" class="${x.id === sys.id ? 'on' : ''}" ${x.id === sys.id ? 'aria-current="page"' : ''}>${esc(partName(x).charAt(0).toUpperCase() + partName(x).slice(1))}</a>`).join('')}</nav>` : '';
  wrap(pills + pathBlock(u));
  bindPath(root, u);
}
/** Le cours s'ouvre comme « cours en cours » : c'est lui que montre la page du cours. */
function bindCourse(root: HTMLElement) { root.querySelectorAll<HTMLElement>('[data-course]').forEach(a => a.addEventListener('click', () => setCurrentCourse(a.dataset.course!))); }
