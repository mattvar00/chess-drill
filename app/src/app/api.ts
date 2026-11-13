/** Lien avec le serveur : parties analysées chaque nuit et progression partagée entre appareils. */
import type { BranchState, Game, PosState } from '../core/types';
import type { Fault } from '../core/analysis';
import { addFaults, addGames, save, store, woodHistory, type WoodCycle } from './store';

const TOKEN = 'cd_token', PUSHED = 'cd_pushed', SYNCED = 'cd_synced', FAULTS = 'cd_faults';
export const getToken = () => localStorage.getItem(TOKEN) || '';
export const setToken = (t: string) => { if (t) localStorage.setItem(TOKEN, t.trim()); else localStorage.removeItem(TOKEN); };
export const lastSync = () => +(localStorage.getItem(SYNCED) || 0);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch('/api' + path, { ...init, headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' } }); }
  catch { throw new Error('Serveur injoignable. Vérifie ta connexion.'); }
  if (r.status === 401) throw new Error("Code d'accès refusé.");
  if (!r.ok || !(r.headers.get('Content-Type') || '').includes('json')) throw new Error(`Le serveur a répondu ${r.status}.`);
  return r.json() as Promise<T>;
}

type Remote = Record<string, { value: unknown; updated: number }>;
const woodStamp = () => woodHistory().reduce((m, c) => Math.max(m, c.date), 0);
/** Récupère les nouvelles parties et fautes, puis fusionne la progression : pour chaque ligne ou position, le passage le plus récent gagne. */
export async function sync(): Promise<{ games: number; lines: number }> {
  if (!getToken()) throw new Error("Aucun code d'accès enregistré.");
  const user = String(store.state.settings.user || 'matt_chess00');
  const newest = store.games.reduce((m, g) => Math.max(m, g.t), 0);
  // Les parties reçues avant l'ajout de la courbe des chances sont redemandées une fois.
  const stale = store.games.some(g => g.st && !g.wp);
  const since = newest && !stale ? newest + 1 : Math.floor(Date.now() / 1000) - 120 * 86400;
  const fetched = await call<Game[]>(`/games?user=${encodeURIComponent(user)}&since=${since}`);
  const known = new Set(store.games.filter(g => g.wp || !g.st).map(g => g.id)), games = fetched.filter(g => !known.has(g.id));
  const fresh = games.filter(g => !store.games.some(x => x.id === g.id)).length;
  await addGames(games.map(g => ({ ...store.games.find(x => x.id === g.id), ...g })));

  // Fautes : on redemande tout ce qui est plus récent que la dernière partie déjà couverte.
  const covered = +(localStorage.getItem(FAULTS) || 0);
  await addFaults(await call<Fault[]>(`/faults?user=${encodeURIComponent(user)}&since=${covered ? covered + 1 : 0}`));
  localStorage.setItem(FAULTS, String(store.games.reduce((m, g) => Math.max(m, g.t), covered)));

  const remote = await call<Remote>('/progress'); let lines = 0;
  const st = store.state, pushed = +(localStorage.getItem(PUSHED) || 0), out: Remote = {};
  for (const [k, v] of Object.entries(remote)) {
    if (k.startsWith('br:')) { const id = k.slice(3); if (v.updated > (st.br[id]?.last || 0)) { st.br[id] = v.value as BranchState; lines++; } }
    else if (k.startsWith('fault:')) { const id = k.slice(6); if (v.updated > (st.fault[id]?.last || 0)) { st.fault[id] = v.value as PosState; lines++; } }
    else if (k === 'wood' && v.updated > woodStamp()) { st.wood = v.value as WoodCycle[]; lines++; }
  }
  const mine = (key: string, updated: number, value: unknown) => { if (updated > pushed && updated > (remote[key]?.updated || 0)) out[key] = { value, updated }; };
  for (const [id, s] of Object.entries(st.br)) mine('br:' + id, s.last, s);
  for (const [id, s] of Object.entries(st.fault)) mine('fault:' + id, s.last || 0, s);
  if (woodHistory().length) mine('wood', woodStamp(), woodHistory());
  if (Object.keys(out).length) await call('/progress', { method: 'PUT', body: JSON.stringify(out) });
  const now = Date.now(); localStorage.setItem(PUSHED, String(now)); localStorage.setItem(SYNCED, String(now));
  if (lines) save();
  return { games: fresh, lines };
}
let pending: ReturnType<typeof setTimeout> | undefined;
/** Synchronisation en arrière-plan après un passage (silencieuse si hors ligne). */
export function syncSoon() { if (!getToken()) return; clearTimeout(pending); pending = setTimeout(() => { sync().catch(() => { /* réessayé au prochain passage */ }); }, 4000); }

/** Partie complète avec les évaluations de chaque position (pour la revue), gardée ensuite sur l'appareil. */
export async function fullGame(id: string): Promise<Game | null> {
  const g = store.games.find(x => x.id === id); if (!g) return null; if (g.ev?.length) return g;
  if (!getToken() || !g.st) return g;
  const user = String(store.state.settings.user || 'matt_chess00');
  const full = await call<Game>(`/games/${encodeURIComponent(user)}/${encodeURIComponent(id)}`);
  if (full.ev?.length) { const merged = { ...g, ev: full.ev }; await addGames([merged]); return merged; }
  return g;
}
