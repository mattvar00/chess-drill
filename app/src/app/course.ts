/**
 * La page d'un cours, en trois vues : le chemin (les leçons), les plans (en images), l'arbre (les embranchements avec tes parties).
 * En tête, ton bilan dans cette ouverture. Et la page « Tes ouvertures » : le bilan de toutes, les plus faibles d'abord.
 */
import { Chess, tryMove } from '../core/chess';
import { devOk, refBranch } from '../core/drill';
import { phaseAt, type Phase } from '../core/phase';
import { myWp } from '../core/stats';
import type { Bloc, Branch, Color, Game, System } from '../core/types';
import { miniBoard } from '../ui/board';
import { esc, icon, plural } from '../ui/dom';
import { BR, REP, plansFor, store, type Plan } from './store';
import { lineUrl } from './session';

const chev = icon('chev', 'chev');
export type CourseTab = 'chemin' | 'plans' | 'arbre';
export const gamesOfSystem = (sys: System) => store.games.filter(g => { const id = refBranch(g, BR); return !!id && BR[id].sys.id === sys.id; }).sort((a, b) => b.t - a.t);

/* ---------- le bilan ---------- */
/**
 * Où une partie perdue a basculé : ton coup qui a fait le plus chuter tes chances, et la phase de la position avant ce coup
 * (d'après le matériel, calculée à l'analyse ; à défaut, d'après le numéro du coup).
 */
export function lossPhase(g: Game): Phase | null {
  const c = myWp(g); if (!c || c.length < 4) return null;
  let worst = 0, at = -1; for (let i = g.color === 'w' ? 0 : 1; i + 1 < c.length; i += 2) { const d = c[i] - c[i + 1]; if (d > worst) { worst = d; at = i; } }
  return at < 0 ? null : phaseAt(at, g.st?.ph);
}
const PH: Record<Phase, string> = { ouv: "dès l'ouverture", mil: 'en milieu de partie', fin: 'en finale' };
const WHY: Record<Phase, string> = { ouv: 'c\'est la théorie qui te manque.', mil: 'ce sont les plans qui te manquent.', fin: 'c\'est la finale qui te coûte.' };
export interface Bilan { n: number; score: number; losses: number; phase: Phase | null; inPhase: number; exit: string; exitN: number }
export function bilanOf(sys: System, games = gamesOfSystem(sys)): Bilan {
  const n = games.length, pts = games.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? .5 : 0), 0);
  const lost = games.filter(g => g.res === 'L'), ph: Record<Phase, number> = { ouv: 0, mil: 0, fin: 0 };
  for (const g of lost) { const p = lossPhase(g); if (p) ph[p]++; }
  const top = (Object.entries(ph) as [Phase, number][]).sort((a, b) => b[1] - a[1])[0];
  // la sortie du cours la plus fréquente
  const ex = new Map<string, number>();
  // « dev » : c'est toi qui as quitté le cours ; « gap » : c'est lui (le cours ne prévoyait pas son coup). `ply` compte depuis 0.
  for (const g of games) { const a = g.a; if ((a.status !== 'dev' && a.status !== 'gap') || a.ply == null || !a.played || devOk(g)) continue;
    const k = `${a.ply}|${a.played}|${a.status}|${a.expected?.[0]?.san ?? ''}`; ex.set(k, (ex.get(k) ?? 0) + 1); }
  const e = [...ex].sort((a, b) => b[1] - a[1])[0];
  const exit = e && e[1] >= 2 ? (() => { const [pl, mv, st, exp] = e[0].split('|'), ply = +pl, k2 = Math.floor(ply / 2) + 1, n2 = k2 === 1 ? '1er' : `${k2}e`, d = ply % 2 ? '…' : '';
    return st === 'dev' && exp ? `Tu sors du cours au ${n2} coup : ${d}${mv} au lieu de ${d}${exp}` : `Il sort du cours au ${n2} coup : ${d}${mv}`; })() : '';
  return { n, score: n ? Math.round(100 * pts / n) : 0, losses: lost.length, phase: top && top[1] ? top[0] : null, inPhase: top ? top[1] : 0, exit, exitN: e?.[1] ?? 0 };
}
const scoreCls = (p: number) => p < 40 ? 'low' : p < 55 ? 'mid' : 'high';
function bilanBlock(b: Bilan): string {
  if (!b.n) return '<section class="surf card cbilan"><span class="dim">Pas encore de partie dans cette ouverture.</span></section>';
  return `<section class="surf card cbilan"><div class="cbtop"><b class="cbs ${scoreCls(b.score)}">${b.score} %</b><span class="dim">sur tes ${plural(b.n, 'partie')}</span></div>
    ${b.phase && b.inPhase >= 2 ? `<p>${b.inPhase} défaite${b.inPhase > 1 ? 's' : ''} sur ${b.losses} se jouent <b>${PH[b.phase]}</b> : ${WHY[b.phase]}</p>` : ''}</section>`;
}

/* ---------- les vues ---------- */
export function courseTabs(base: string, tab: CourseTab, nPlans: number): string {
  const t = (k: CourseTab, label: string) => `<a class="cseg${k === tab ? ' on' : ''}" href="${base}${k === 'chemin' ? '' : '?v=' + k}" ${k === tab ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="csegs" aria-label="Vue du cours">${t('chemin', 'Chemin')}${t('plans', nPlans ? `Plans <span class="cn">${nPlans}</span>` : 'Plans')}${t('arbre', 'Arbre')}</nav>`;
}
/** En tête du cours : ses trois vues. Le bilan (score, phases) est sur la page de l'ouverture, juste avant. */
export function courseHead(sys: System, base: string, tab: CourseTab): string {
  return courseTabs(base, tab, plansFor(sys.id).length);
}
export const bilanHtml = (sys: System) => bilanBlock(bilanOf(sys));

/** Un petit échiquier avec les flèches et les cases d'une étape de plan. */
function miniPlan(game: Chess, side: Color, arrows: string[][], keys: string[]): string {
  const xy = (q: string) => { let x = q.charCodeAt(0) - 97, y = 8 - +q[1]; if (side === 'b') { x = 7 - x; y = 7 - y; } return [x + .5, y + .5]; };
  let o = keys.map(q => { const [x, y] = xy(q); return `<rect x="${x - .5}" y="${y - .5}" width="1" height="1" class="mk"/>`; }).join('');
  for (const [a, b] of arrows) { const [x1, y1] = xy(a), [x2, y2] = xy(b), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ex = x2 - ux * .42, ey = y2 - uy * .42;
    o += `<line x1="${x1}" y1="${y1}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}"/><polygon points="${(x2 - ux * .12).toFixed(2)},${(y2 - uy * .12).toFixed(2)} ${(ex - uy * .3).toFixed(2)},${(ey + ux * .3).toFixed(2)} ${(ex + uy * .3).toFixed(2)},${(ey - ux * .3).toFixed(2)}"/>`; }
  return `<span class="minip">${miniBoard(game, side)}<svg viewBox="0 0 8 8" aria-hidden="true">${o}</svg></span>`;
}
/** L'étape la plus parlante d'un plan : celle qui a le plus de flèches (la dernière à égalité). */
function keyStep(P: Plan) { return P.steps.reduce((b, s) => (s.a.length >= b.a.length ? s : b), P.steps[0]); }

export function plansPanel(sys: System, back: string): string {
  const plans = plansFor(sys.id);
  const cards = plans.map(P => { const st = keyStep(P), g = new Chess(); P.sans.slice(0, st.p).forEach(s => tryMove(g, s));
    const line = P.title.includes(' · ') ? P.title.split(' · ').slice(1).join(' · ') : P.title;
    return `<div class="surf card pcard2"><a class="pmain" href="#/plan/${P.id}?vu=1&r=${encodeURIComponent(back + '?v=plans')}">${miniPlan(g, P.side, st.a, st.h)}<span class="body"><b>${esc(P.sub)}</b><small>${esc(line)} · ${plural(P.steps.length, 'étape')}</small></span></a><a class="btn pjouer" href="#/plan/${P.id}/jouer" aria-label="Jouer ce plan contre le moteur">Jouer</a></div>`; }).join('');
  const models = (sys.modeles ?? []).map(m => `<a class="surf card lk1" href="${lineUrl(m.id, 'explore')}"><b>Partie modèle</b><span class="dim">${esc(m.titre)}</span>${chev}</a>`).join('');
  if (!plans.length && !models) return '<p class="pnote">Pas encore de plan en images pour cette ouverture.</p>';
  return `${cards ? `<div class="pcards">${cards}</div><a class="btn pri block" href="#/plan/${plans[0].id}?vu=1&r=${encodeURIComponent(back + '?v=plans')}">Voir les plans en images</a>` : ''}${models ? `<section class="grp"><h2>Pour voir le plan en vrai</h2>${models}</section>` : ''}`;
}

/* ---------- l'arbre ---------- */
interface TNode { san: string; ply: number; kids: Map<string, TNode>; brs: string[] }
const num = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '…' : '.'}${san}`;
export function mountTree(root: HTMLElement, bloc: Bloc, sys: System, lines: Branch[]) {
  const side = bloc.side, top: TNode = { san: '', ply: -1, kids: new Map(), brs: [] };
  for (const br of lines) { let t = top; br.moves.forEach((m, i) => { let k = t.kids.get(m.san); if (!k) t.kids.set(m.san, k = { san: m.san, ply: i, kids: new Map(), brs: [] }); k.brs.push(br.id); t = k; }); }
  // le tronc commun, puis les embranchements
  const trunk: TNode[] = []; let t = top; while (t.kids.size === 1) { t = [...t.kids.values()][0]; trunk.push(t); }
  const mine = store.games.filter(g => g.color === side);
  const stat = (path: string[]) => { const gs = mine.filter(g => path.every((s, i) => g.sans[i] === s)), n = gs.length; return { n, p: n ? Math.round(100 * gs.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? .5 : 0), 0) / n) : 0 }; };
  interface Row { node: TNode; path: string[]; depth: number; last: boolean; n: number; p: number }
  const rows: Row[] = [];
  const walk = (node: TNode, path: string[], depth: number) => {
    const kids = [...node.kids.values()].map(k => ({ k, s: stat([...path, k.san]) })).sort((a, b) => b.s.n - a.s.n || b.k.brs.length - a.k.brs.length);
    kids.forEach(({ k, s }, i) => { const pth = [...path, k.san]; rows.push({ node: k, path: pth, depth, last: i === kids.length - 1, ...s });
      let c = k, cp = pth; while (c.kids.size === 1) { c = [...c.kids.values()][0]; cp = [...cp, c.san]; }
      if (c.kids.size > 1) walk(c, cp, depth + 1); });
  };
  walk(t, trunk.map(x => x.san), 0);
  let sel = rows.findIndex(r => r.n > 0); if (sel < 0) sel = 0;
  const trunkLine = trunk.map(x => (x.ply % 2 === 0 ? `${x.ply / 2 + 1}.` : '') + x.san).join(' ');
  const draw = () => {
    const r = rows[sel], g = new Chess(); r?.path.forEach(s => tryMove(g, s));
    // la variante à apprendre : la plus courte qui passe par ce coup ; sous le coup, la suite jusqu'au prochain embranchement
    const br = r ? r.node.brs.map(id => BR[id]?.br).filter(Boolean).sort((a, b) => a!.moves.length - b!.moves.length)[0] : undefined;
    const next: string[] = []; if (r) { let c = r.node; while (c.kids.size === 1 && next.length < 6) { c = [...c.kids.values()][0]; next.push(num(c.ply, c.san).replace(/^\d+…/, m => c.ply % 2 && next.length ? '' : m)); } }
    root.innerHTML = `${r ? `<section class="surf card tprev">${miniBoard(g, side)}<div class="body"><b>${esc(num(r.node.ply, r.node.san))}</b><small>${next.length ? `Suite : ${esc(next.join(' '))}${r.node.kids.size === 1 && next.length >= 6 ? '…' : ''}` : 'Fin de la variante.'}</small>
      ${br ? `<a class="btn pri" href="${lineUrl(br.id, 'drill')}">Apprendre cette variante</a>` : ''}</div></section>` : ''}
      <p class="pnote">${trunkLine ? `Après ${esc(trunkLine)}. ` : ''}Touche un coup pour voir la position.</p>
      <div class="surf card tree" role="list">${rows.map((x, i) => `<button class="trow${i === sel ? ' on' : ''}${x.last ? ' last' : ''}" role="listitem" data-i="${i}" style="--d:${x.depth}" aria-pressed="${i === sel}">
        <b>${esc(num(x.node.ply, x.node.san))}</b><span class="tst"><i class="sdot ${x.n ? scoreCls(x.p) : 'none'}"></i>${x.n ? `${plural(x.n, 'partie')} · ${x.p} %` : 'jamais jouée'}</span></button>`).join('')}</div>`;
    root.querySelectorAll<HTMLElement>('.trow').forEach(b => b.addEventListener('click', () => { sel = +b.dataset.i!; draw(); root.querySelector<HTMLElement>(`.trow[data-i="${sel}"]`)?.focus(); }));
  };
  draw();
}

/* ---------- Tes ouvertures : le bilan de toutes ---------- */
export function viewOpenings(root: HTMLElement) {
  const all = REP.blocs.flatMap(b => b.systemes.map(s => ({ b, s, x: bilanOf(s) }))).filter(o => o.x.n >= 5).sort((a, z) => a.x.score - z.x.score || z.x.n - a.x.n);
  const nAn = store.games.filter(g => g.st).length;
  root.innerHTML = all.length ? `<p class="intro">D'après tes ${plural(nAn, 'partie analysée', 'parties analysées')}. Les plus faibles d'abord.</p>
    <div class="obil">${all.map(({ b, s, x }) => `<a class="surf card orow" href="#/o/${s.id}">
      <span class="ohead"><b>${esc(s.titre)}</b><span class="dim">${b.side === 'w' ? 'Blancs' : 'Noirs'} · ${plural(x.n, 'partie')}</span><b class="cbs ${scoreCls(x.score)}">${x.score} %</b></span>
      <span class="prog"><b class="${scoreCls(x.score)}" style="width:${x.score}%"></b></span>
      ${x.phase && x.inPhase >= 2 ? `<small class="dim">${x.inPhase} défaite${x.inPhase > 1 ? 's' : ''} sur ${x.losses} ${PH[x.phase]}</small>` : ''}
      ${x.exit ? `<small>${esc(x.exit)} (${x.exitN} fois)</small>` : ''}</a>`).join('')}</div>`
    : '<section class="empty"><p>Il faut au moins 5 parties dans une ouverture pour en faire le bilan.</p></section>';
}
