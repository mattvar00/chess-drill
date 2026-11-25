/**
 * « Ce qui te coûte des points » et « Ce qui marche » : les quelques constats de tes parties qui méritent un exercice.
 * Un constat n'est montré que s'il repose sur assez de parties, et chacun mène à l'exercice qui le travaille.
 */
import { refBranch } from '../core/drill';
import { myWp } from '../core/stats';
import { themeLabel } from '../core/wood';
import type { Game } from '../core/types';
import { plural } from '../ui/dom';
import { BR, store } from './store';
import { famTitle } from './openings';

export interface Insight { tone: 'bad' | 'warn' | 'good'; title: string; sub: string; cta: string; href: string }
const pts = (gs: Game[]) => gs.reduce((a, g) => a + (g.res === 'W' ? 1 : g.res === 'D' ? .5 : 0), 0);
const score = (gs: Game[]) => Math.round(100 * pts(gs) / gs.length);
/** L'écart à 50 % dépasse la marge du hasard (intervalle à 90 %). */
const clear = (p: number, n: number) => Math.abs(p - 50) > 164.5 * Math.sqrt(.25 / n);
const fam = famTitle;
/** Parties où tes chances ont atteint 75 % sans que tu gagnes : les positions gagnantes laissées filer. */
export const thrown = (list: Game[]) => list.filter(g => g.res !== 'W' && (myWp(g) ?? []).some(w => w >= 75));
const HANG = new Set(['Pièce en prise oubliée', 'Pièce déposée en prise', 'Pièce mise en prise']);

export function insights(list: Game[]): { cost: Insight[]; good: Insight[] } {
  const cost: Insight[] = [], good: Insight[] = [];
  // 1. les ouvertures : par groupe (couleur et premier coup adverse), puis par ouverture
  const byBloc = new Map<string, { title: string; side: string; gs: Game[]; fams: Map<string, { id: string; gs: Game[] }> }>();
  for (const g of list) { const id = refBranch(g, BR); if (!id) continue; const { bloc, sys } = BR[id];
    const b = byBloc.get(bloc.id) ?? byBloc.set(bloc.id, { title: bloc.titre, side: bloc.side, gs: [], fams: new Map() }).get(bloc.id)!; b.gs.push(g);
    const f = b.fams.get(fam(sys.titre)) ?? b.fams.set(fam(sys.titre), { id: sys.id, gs: [] }).get(fam(sys.titre))!; f.gs.push(g); }
  const blocs = [...byBloc.values()].filter(b => b.gs.length >= 30).map(b => ({ ...b, p: score(b.gs) }));
  const worst = blocs.filter(b => b.p < 50 && clear(b.p, b.gs.length)).sort((a, c) => a.p - c.p)[0];
  if (worst) { const f = [...worst.fams.values()].filter(x => x.gs.length >= 5).sort((a, c) => score(a.gs) - score(c.gs))[0];
    cost.push({ tone: 'bad', title: `${worst.side === 'w' ? 'Les Blancs' : 'Les Noirs'} ${worst.title.toLowerCase()} : ${worst.p} %`, sub: `Sur ${plural(worst.gs.length, 'partie')}, nettement en dessous de 50 %.`, cta: 'Voir l\'ouverture', href: f ? `#/o/${f.id}` : '#/rep' }); }
  // 2. les parties gagnées laissées filer
  const lost = list.filter(g => g.res === 'L' && g.wp?.length), th = thrown(list);
  if (th.length >= 5 && lost.length >= 10) cost.push({ tone: 'warn', title: `${th.filter(g => g.res === 'L').length} défaites sur ${lost.length} depuis une position gagnante`, sub: `Tu avais au moins 75 % de chances de gagner${th.some(g => g.res === 'D') ? ` (et ${plural(th.filter(g => g.res === 'D').length, 'nulle')})` : ''}.`, cta: 'S\'entraîner à conclure', href: '#/conclure' });
  // 3. la faute qui revient le plus (les pièces en prise comptent ensemble ; le « coup calme » n'apprend rien de précis)
  const ids = new Set(list.map(g => g.id)), fs = store.faults.filter(f => ids.has(f.game) && f.theme !== 'Coup calme'), c: Record<string, number> = {};
  for (const f of fs) { const k = HANG.has(f.theme) ? 'prise' : f.theme; c[k] = (c[k] || 0) + 1; }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 10) { const hang = top[0] === 'prise', withIt = new Set(fs.filter(f => hang ? HANG.has(f.theme) : f.theme === top[0]).map(f => f.game));
    const inLost = list.filter(g => g.res === 'L' && withIt.has(g.id)).length, nLost = list.filter(g => g.res === 'L').length;
    cost.push({ tone: 'warn', title: `Ta faute n°1 : ${hang ? 'une pièce laissée en prise' : themeLabel(top[0]).toLowerCase()}`, sub: `${top[1]} fois${nLost ? `, dans ${inLost} défaites sur ${nLost}` : ''}.`, cta: 'Refaire 10 positions', href: hang ? '#/wood?g=prise&r=%23%2Fprogres' : `#/wood?t=${encodeURIComponent(top[0])}&r=%23%2Fprogres` }); }
  // ce qui marche : les ouvertures nettement au-dessus de 50 %
  const fams = [...byBloc.values()].flatMap(b => [...b.fams].map(([name, f]) => ({ name, side: b.side, ...f, p: score(f.gs) })));
  for (const f of fams.filter(x => x.gs.length >= 15 && x.p > 50 && clear(x.p, x.gs.length)).sort((a, b) => b.p - a.p).slice(0, 2))
    good.push({ tone: 'good', title: `${f.name} : ${f.p} %`, sub: `Avec les ${f.side === 'w' ? 'Blancs' : 'Noirs'}, sur ${plural(f.gs.length, 'partie')}.`, cta: 'Voir l\'ouverture', href: `#/o/${f.id}` });
  return { cost, good };
}

export function insightsHtml(list: Game[]): string {
  const { cost, good } = insights(list); if (!cost.length && !good.length) return '';
  const row = (x: Insight) => `<a class="irow" href="${x.href}"><i class="idot ${x.tone}"></i><span><b>${x.title}</b><small>${x.sub}</small><em>${x.cta}</em></span></a>`;
  return `${cost.length ? `<section class="isec"><h2>Ce qui te coûte des points</h2>${cost.map(row).join('')}</section>` : ''}
    ${good.length ? `<section class="isec"><h2>Ce qui marche</h2>${good.map(row).join('')}</section>` : ''}`;
}
