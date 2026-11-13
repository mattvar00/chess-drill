/** État de l'app en mémoire, chargé depuis IndexedDB. */
import rep from '../data/repertoire.json';
import type { Game, Repertoire, BranchState } from '../core/types';
import { indexBranches } from '../core/book';
import { devCounts } from '../core/drill';
import { addDay } from '../core/streak';
import type { Fault } from '../core/analysis';
import { emptyState, getAllGames, getAllGFaults, getState, migrateLegacy, putGFaults, putGames, putState, type AppState } from '../storage/db';

export const REP = rep as unknown as Repertoire;
export const BR = indexBranches(REP);
export const ALL_IDS = Object.keys(BR);

/** Cycle Woodpecker en cours (repris après une fermeture de l'app) et cycles terminés. */
export interface WoodCur { ids: string[]; i: number; solved: number; elapsed: number; label: string }
export interface WoodCycle { date: number; time: number; solved: number; n: number; label: string }
export const store = { state: emptyState() as AppState, games: [] as Game[], faults: [] as Fault[], devs: {} as Record<string, number> };
export const woodHistory = () => ((store.state.wood ?? []) as WoodCycle[]).filter(c => c && typeof c.date === 'number' && typeof c.time === 'number');
export const woodCur = () => (store.state.woodCur ?? null) as WoodCur | null;

export async function loadStore() {
  await migrateLegacy(); store.state = await getState(); store.games = await getAllGames(); refreshDevs();
  store.faults = sortFaults(Object.values(await getAllGFaults()).flat() as Fault[]);
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
const isFault = (f: Fault) => !!f && typeof f.id === 'string' && !!f.fen && !!f.best?.uci && !!f.played;
const sortFaults = (l: Fault[]) => l.filter(isFault).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
/** Enregistre les fautes reçues du serveur, rangées par partie. */
export async function addFaults(faults: Fault[]) {
  if (!faults.length) return; const byGame: Record<string, Fault[]> = {};
  for (const f of faults) if (isFault(f)) (byGame[f.game] ??= []).push(f);
  await putGFaults(byGame);
  const keep = store.faults.filter(f => !byGame[f.game]); store.faults = sortFaults([...keep, ...Object.values(byGame).flat()]);
}
/** Jours où tu t'es entraîné (pour la série). */
export const trainingDays = () => (Array.isArray(store.state.settings.days) ? store.state.settings.days : []) as string[];
export function markActive() { store.state.settings.days = addDay(trainingDays()); save(); }
