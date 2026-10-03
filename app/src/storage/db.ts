/**
 * Stockage local : IndexedDB (plus de plafond à 5 Mo).
 *  - store « games » : une entrée par partie (avec ses évaluations)
 *  - store « gfaults » : les positions d'exercice extraites d'une partie
 *  - store « kv » : la progression (lignes, positions, réglages…)
 * Au premier lancement, les données de l'ancienne version (localStorage « drill_matt_v3 ») sont importées.
 */
import type { Game, BranchState, PosState } from '../core/types';

export interface AppState {
  br: Record<string, BranchState>; fault: Record<string, PosState>; ignored: Record<string, boolean>;
  pref: Record<string, string>; fixed: Record<string, boolean>; settings: Record<string, unknown>;
  wood?: unknown[]; woodCur?: unknown; maia?: unknown; planDone?: Record<string, unknown>;
}
export const emptyState = (): AppState => ({ br: {}, fault: {}, ignored: {}, pref: {}, fixed: {}, settings: { user: 'matt_chess00', depth: 12, movetime: 350 } });
const DB_NAME = 'chess-drill', VERSION = 1, LEGACY_KEY = 'drill_matt_v3';

let dbp: Promise<IDBDatabase> | null = null;
export function openDB(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = factory.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => { const db = r.result;
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' }).createIndex('t', 't');
      if (!db.objectStoreNames.contains('gfaults')) db.createObjectStore('gfaults');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
export function _resetForTests() { dbp = null; }
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function getAllGames(): Promise<Game[]> { const db = await openDB(); return req(db.transaction('games').objectStore('games').getAll()) as Promise<Game[]>; }
export async function putGames(games: Game[]): Promise<void> { if (!games.length) return; const db = await openDB(); const t = db.transaction('games', 'readwrite'); const s = t.objectStore('games'); for (const g of games) s.put(stripCache(g)); return done(t); }
export async function deleteGames(ids: string[]): Promise<void> { const db = await openDB(); const t = db.transaction('games', 'readwrite'); for (const id of ids) t.objectStore('games').delete(id); return done(t); }
export async function getAllGFaults(): Promise<Record<string, unknown[]>> { const db = await openDB(); const t = db.transaction('gfaults'); const s = t.objectStore('gfaults');
  const [keys, vals] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]); const out: Record<string, unknown[]> = {}; keys.forEach((k, i) => { out[String(k)] = vals[i] as unknown[]; }); return out; }
export async function putGFaults(map: Record<string, unknown[]>): Promise<void> { const db = await openDB(); const t = db.transaction('gfaults', 'readwrite'); for (const k in map) t.objectStore('gfaults').put(map[k], k); return done(t); }
export async function getState(): Promise<AppState> { const db = await openDB(); const v = await req(db.transaction('kv').objectStore('kv').get('state')); return { ...emptyState(), ...(v as AppState | undefined) }; }
export async function putState(s: AppState): Promise<void> { const db = await openDB(); const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(s, 'state'); return done(t); }
async function getFlag(k: string): Promise<unknown> { const db = await openDB(); return req(db.transaction('kv').objectStore('kv').get(k)); }
async function setFlag(k: string, v: unknown) { const db = await openDB(); const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); return done(t); }

/** Les champs préfixés par « _ » sont des caches calculés : on ne les écrit pas. */
function stripCache<T extends object>(o: T): T { const c: Record<string, unknown> = {}; for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) c[k] = v; return c as T; }

/** Import unique des données de l'ancienne version. Renvoie le nombre de parties importées. */
export async function migrateLegacy(ls: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): Promise<number> {
  if (await getFlag('migrated')) return 0; let n = 0;
  const raw = ls ? ls.getItem(LEGACY_KEY) : null;
  if (raw) { const L = JSON.parse(raw) as AppState & { games?: Record<string, Game>; gfaults?: Record<string, unknown[]> };
    const games = Object.values(L.games || {}); await putGames(games); n = games.length;
    await putGFaults(L.gfaults || {});
    const { games: _g, gfaults: _f, ...rest } = L; await putState({ ...emptyState(), ...rest }); }
  await setFlag('migrated', { at: Date.now(), from: raw ? LEGACY_KEY : null, games: n }); return n;
}
