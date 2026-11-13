/** Lien avec le serveur : parties analysées chaque nuit et progression partagée entre appareils. */
import type { BranchState, Game } from '../core/types';
import { addGames, save, store } from './store';

const TOKEN = 'cd_token', PUSHED = 'cd_pushed', SYNCED = 'cd_synced';
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
/** Récupère les nouvelles parties, puis fusionne la progression : pour chaque ligne, le passage le plus récent gagne. */
export async function sync(): Promise<{ games: number; lines: number }> {
  if (!getToken()) throw new Error("Aucun code d'accès enregistré.");
  const user = String(store.state.settings.user || 'matt_chess00');
  const newest = store.games.reduce((m, g) => Math.max(m, g.t), 0);
  const since = newest ? newest + 1 : Math.floor(Date.now() / 1000) - 120 * 86400;
  const games = await call<Game[]>(`/games?user=${encodeURIComponent(user)}&since=${since}`);
  await addGames(games);

  const remote = await call<Remote>('/progress'); let lines = 0;
  for (const [k, v] of Object.entries(remote)) {
    if (!k.startsWith('br:')) continue; const id = k.slice(3), local = store.state.br[id];
    if (v.updated > (local?.last || 0)) { store.state.br[id] = v.value as BranchState; lines++; }
  }
  const pushed = +(localStorage.getItem(PUSHED) || 0), out: Remote = {};
  for (const [id, s] of Object.entries(store.state.br)) if (s.last > pushed && s.last > (remote['br:' + id]?.updated || 0)) out['br:' + id] = { value: s, updated: s.last };
  if (Object.keys(out).length) await call('/progress', { method: 'PUT', body: JSON.stringify(out) });
  const now = Date.now(); localStorage.setItem(PUSHED, String(now)); localStorage.setItem(SYNCED, String(now));
  if (lines) save();
  return { games: games.length, lines };
}
let pending: ReturnType<typeof setTimeout> | undefined;
/** Synchronisation en arrière-plan après un passage (silencieuse si hors ligne). */
export function syncSoon() { if (!getToken()) return; clearTimeout(pending); pending = setTimeout(() => { sync().catch(() => { /* réessayé au prochain passage */ }); }, 4000); }
