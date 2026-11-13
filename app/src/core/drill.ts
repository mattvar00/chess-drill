/** Choix des lignes à travailler : tirage pondéré, séance du jour, déviations vues en partie. Logique pure. */
import { branchWeight, isDue, isValid } from './schedule';
import type { BranchState, Color, Game, Repertoire } from './types';
import type { BranchRef } from './book';

const DAY = 86400;
export type States = Record<string, BranchState | undefined>;

export function weightedPick<T>(items: T[], weight: (x: T) => number, rnd: () => number = Math.random): T {
  const ws = items.map(x => Math.max(0.01, weight(x))); let r = rnd() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/** Prochaine ligne d'une séance : d'abord celles qui ne sont pas validées ou qui sont à réviser. */
export function pickNext(pool: string[], st: States, exclude?: string, now = Date.now(), rnd: () => number = Math.random): string {
  const c = exclude && pool.length > 1 ? pool.filter(id => id !== exclude) : pool;
  const hot = c.filter(id => !isValid(st[id]) || isDue(st[id], now));
  return weightedPick(hot.length ? hot : c, id => branchWeight(st[id], now), rnd);
}

/** Séance du jour : les lignes déjà vues arrivées à échéance, plus quelques lignes jamais jouées des systèmes en cours. */
export function todayPool(rep: Repertoire, st: States, now = Date.now(), maxNew = 5): { due: string[]; fresh: string[] } {
  const due: string[] = [], fresh: string[] = [];
  for (const bloc of rep.blocs) for (const sys of bloc.systemes) for (const br of sys.branches) {
    const s = st[br.id];
    if (s && s.runs) { if (s.due <= now) due.push(br.id); }
    else if (sys.statut !== 'alternatif') fresh.push(br.id);
  }
  fresh.sort((a, b) => branchWeight(st[b], now) - branchWeight(st[a], now));
  return { due, fresh: fresh.slice(0, maxNew) };
}

/** Ligne de référence d'une déviation : de préférence une ligne d'un système réellement joué. */
export function refBranch(g: Game, branches: Record<string, BranchRef>): string | null {
  const ids = (g.a.branches || []).filter(id => branches[id]);
  return ids.find(id => branches[id].sys.statut === 'joué') ?? ids[0] ?? null;
}
const isDeviation = (g: Game) => g.a.status === 'dev' && !g.a.soft;

/** Parties récentes où tu es sorti de ton répertoire, de la plus récente à la plus ancienne. */
export function recentDeviations(games: Game[], fixed: Record<string, boolean>, branches: Record<string, BranchRef>, now = Date.now(), days = 30, max = 6): Game[] {
  const since = now / 1000 - days * DAY;
  return games.filter(g => isDeviation(g) && g.t >= since && !fixed[g.id] && refBranch(g, branches))
    .sort((a, b) => b.t - a.t).slice(0, max);
}
/** Nombre de déviations récentes par ligne (pèse sur le tirage). */
export function devCounts(games: Game[], fixed: Record<string, boolean>, branches: Record<string, BranchRef>, now = Date.now(), days = 90): Record<string, number> {
  const since = now / 1000 - days * DAY, out: Record<string, number> = {};
  for (const g of games) { if (!isDeviation(g) || g.t < since || fixed[g.id]) continue; const id = refBranch(g, branches); if (id) out[id] = (out[id] || 0) + 1; }
  return out;
}

export const isUserPly = (ply: number, side: Color) => (ply % 2 === 0) === (side === 'w');
/** Demi-coup où commencer pour arriver directement au premier commentaire de la ligne. */
export function theoryStart(notes: Record<string, string>, side: Color): number {
  const keys = Object.keys(notes).map(Number); if (!keys.length) return 0;
  const first = Math.min(...keys); return Math.max(0, isUserPly(first, side) ? first : first - 1);
}
