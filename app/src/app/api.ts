/** Lien avec le serveur : parties analysées chaque nuit et progression partagée entre appareils. */
import type { BranchState, Game, PosState } from '../core/types';
import type { Fault } from '../core/analysis';
import { addFaults, addGames, save, store, woodHistory, type WoodCycle } from './store';

const TOKEN = 'cd_token', PUSHED = 'cd_pushed', SYNCED = 'cd_synced', CURSOR = 'cd_games_cursor';
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
  // Parties : tout ce qui a changé côté serveur depuis la dernière fois (nouvelles parties, ou anciennes tout juste analysées),
  // page par page. Le curseur n'avance qu'une fois la page enregistrée : une synchro interrompue reprend où elle en était.
  let fresh = 0;
  for (let page = 0; page < 200; page++) {
    const r = await call<{ games: Game[]; cursor: string; more: boolean }>(`/games?user=${encodeURIComponent(user)}&cursor=${encodeURIComponent(localStorage.getItem(CURSOR + ':' + user) || '0:')}`);
    const known = new Map(store.games.map(g => [g.id, g]));
    fresh += r.games.filter(g => !known.has(g.id)).length;
    // les évaluations complètes déjà téléchargées pour une revue sont gardées
    await addGames(r.games.map(g => ({ ...(known.get(g.id)?.ev ? { ev: known.get(g.id)!.ev } : {}), ...g })));
    // les fautes des parties analysées de cette page (une ancienne partie peut venir d'être analysée)
    const an = r.games.filter(g => g.st);
    if (an.length) await addFaults(await call<Fault[]>(`/faults?user=${encodeURIComponent(user)}&since=${Math.min(...an.map(g => g.t))}&until=${Math.max(...an.map(g => g.t))}`));
    localStorage.setItem(CURSOR + ':' + user, r.cursor);
    if (!r.more) break;
  }

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
