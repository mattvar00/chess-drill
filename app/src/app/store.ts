/** État de l'app en mémoire, chargé depuis IndexedDB. */
import rep from '../data/repertoire.json';
import plansJson from '../data/plans.json';
import { Chess, tryMove, uciOf } from '../core/chess';
import type { Game, Repertoire, BranchState } from '../core/types';
import { indexBranches } from '../core/book';
import { devCounts } from '../core/drill';
import { addDay } from '../core/streak';
import type { Fault } from '../core/analysis';
import { emptyState, getAllGames, getAllGFaults, getState, migrateLegacy, putGFaults, putGames, putState, type AppState } from '../storage/db';

export const REP = rep as unknown as Repertoire;
export const BR = indexBranches(REP);
export const ALL_IDS = Object.keys(BR);

/** Plans animés : chacun se rejoue aussi comme une ligne (« plan-<id> »), hors des tirages du répertoire. */
export interface PlanStep { p: number; a: [string, string][]; h: string[]; c: string }
export interface Plan { id: string; sans: string[]; steps: PlanStep[]; cat: string; title: string; side: 'w' | 'b'; sys: string[]; sub: string; src: string[] }
export const PLANS = plansJson as Plan[];
export const planBranch = (id: string) => 'plan-' + id;
for (const P of PLANS) {
  const g = new Chess(), moves = P.sans.slice(0, P.steps[P.steps.length - 1].p).map(san => { const m = tryMove(g, san)!; return { san: m.san, uci: uciOf(m) }; });
  const br = { id: planBranch(P.id), titre: P.title, moves, notes: {} };
  BR[br.id] = { br, sys: { id: 'plan', titre: P.title, statut: 'plan', resume: P.sub, branches: [br] }, bloc: { id: 'plans', titre: P.cat, sous: '', side: P.side, systemes: [] } };
}
export const plansFor = (sysId: string) => PLANS.filter(p => p.sys.includes(sysId));

/** Cycle Woodpecker en cours (repris après une fermeture de l'app) et cycles terminés. */
export interface WoodCur { ids: string[]; i: number; solved: number; elapsed: number; label: string; back?: string; plan?: boolean }
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

/** Plan du jour : étapes faites aujourd'hui (« tac », « lines », « review »). Il repart de zéro chaque matin. */
const today = () => new Date().toLocaleDateString('sv');
export const planDone = (): string[] => { const p = store.state.settings.plan as { day: string; done: string[] } | undefined; return p?.day === today() && Array.isArray(p.done) ? p.done : []; };
export function markPlan(step: string) { const d = planDone(); if (!d.includes(step)) { store.state.settings.plan = { day: today(), done: [...d, step] }; save(); } }
