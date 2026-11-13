/** État de l'app en mémoire, chargé depuis IndexedDB. */
import rep from '../data/repertoire.json';
import type { Game, Repertoire, BranchState } from '../core/types';
import { indexBranches } from '../core/book';
import { devCounts } from '../core/drill';
import { emptyState, getAllGames, getState, migrateLegacy, putGames, putState, type AppState } from '../storage/db';

export const REP = rep as unknown as Repertoire;
export const BR = indexBranches(REP);
export const ALL_IDS = Object.keys(BR);

export const store = { state: emptyState() as AppState, games: [] as Game[], devs: {} as Record<string, number> };

export async function loadStore() {
  await migrateLegacy(); store.state = await getState(); store.games = await getAllGames(); refreshDevs();
}
export function refreshDevs() { store.devs = devCounts(store.games, store.state.fixed, BR); }
/** État d'une ligne pour le tirage : la progression, plus les déviations vues en partie. */
export function weightStates(): Record<string, BranchState | undefined> {
  const out: Record<string, BranchState | undefined> = { ...store.state.br };
  for (const id in store.devs) { const s = out[id]; out[id] = { clean: 0, runs: 0, last: 0, due: 0, ivl: 0, ease: 2.3, fails: 0, ...s, devs: store.devs[id] }; }
  return out;
}
let timer: ReturnType<typeof setTimeout> | undefined;
export function save() { clearTimeout(timer); timer = setTimeout(() => { void putState(store.state); }, 150); }
export async function addGames(games: Game[]) {
  if (!games.length) return; await putGames(games);
  const byId = new Map(store.games.map(g => [g.id, g])); for (const g of games) byId.set(g.id, g);
  store.games = [...byId.values()]; refreshDevs();
}
