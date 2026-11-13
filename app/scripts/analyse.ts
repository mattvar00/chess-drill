/**
 * Analyse de nuit : récupère les parties chess.com récentes d'un ou plusieurs pseudos,
 * les analyse avec Stockfish natif (plusieurs moteurs en parallèle) et envoie le résultat à l'API.
 *
 *   npx tsx scripts/analyse.ts --user matt_chess00 --days 3 --depth 16
 *   npx tsx scripts/analyse.ts --input parties.json --user matt_chess00 --out resultat.json   (hors ligne)
 *
 * Variables d'environnement : STOCKFISH (chemin du binaire), API_URL + API_TOKEN (envoi des résultats).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { Chess } from '../src/core/chess';
import { replay, rateGame, type RawEval, type Rated } from '../src/core/analysis';
import { toGame, monthsSince, type ChessComGame } from '../src/core/ingest';
import { buildBook, indexBranches } from '../src/core/book';
import type { Game, Repertoire } from '../src/core/types';
import rep from '../src/data/repertoire.json';
import { UciEngine } from './uci';

const { values: a } = parseArgs({ options: {
  user: { type: 'string', multiple: true }, days: { type: 'string', default: '3' }, depth: { type: 'string', default: '16' },
  max: { type: 'string', default: '200' }, 'analyse-days': { type: 'string' }, engines: { type: 'string' }, input: { type: 'string' }, out: { type: 'string' },
  skip: { type: 'string', multiple: true, default: [] },
} });
const users = a.user ?? (process.env.USERS || '').split(',').filter(Boolean);
if (!users.length) throw new Error('--user requis');
const DEPTH = +a.depth!, SINCE = Math.floor(Date.now() / 1000) - +a.days! * 86400;
/** Fenêtre de l'analyse au moteur : par défaut la même que celle de l'import (--days). */
const ANALYSE_SINCE = Math.floor(Date.now() / 1000) - +(a['analyse-days'] || a.days!) * 86400;
const UA = 'chess-drill/2.0 (analyse de nuit ; github.com/mattvar00/chess-drill)';
const API = process.env.API_URL?.replace(/\/$/, ''), TOKEN = process.env.API_TOKEN;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...init?.headers } });
    if (r.ok) return r.json() as Promise<T>;
    if ((r.status === 429 || r.status >= 500) && i < 4) { await new Promise(s => setTimeout(s, 1000 * (i + 1))); continue; }
    throw new Error(`${url} → HTTP ${r.status}`);
  }
}

/** Parties récentes d'un joueur (hors parties par correspondance), de la plus récente à la plus ancienne. */
async function recentGames(user: string): Promise<ChessComGame[]> {
  const { archives } = await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${user.toLowerCase()}/games/archives`);
  const out: ChessComGame[] = [];
  for (const m of monthsSince(archives, SINCE)) out.push(...(await getJson<{ games: ChessComGame[] }>(m)).games); // en série, comme le demande chess.com
  return out.filter(g => g.end_time >= SINCE && g.time_class !== 'daily').sort((x, y) => y.end_time - x.end_time);
}

/** Identifiants déjà côté API : `analysed` (pour ne pas recalculer) ou `known` (parties déjà importées, analysées ou non). */
async function ids(kind: 'analysed' | 'known', user: string): Promise<Set<string>> {
  if (!API) return new Set();
  const r = await getJson<{ ids: string[] }>(`${API}/api/${kind}?user=${encodeURIComponent(user)}&since=${SINCE}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return new Set(r.ids);
}
const post = (results: { user: string; game: Game; rated?: Rated }[]) => getJson(`${API}/api/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ depth: DEPTH, results }) });

/** Position finale : pas de recherche, le résultat est connu. */
function terminal(fen: string): RawEval | null {
  const c = new Chess(fen); if (!c.isGameOver()) return null;
  return c.isCheckmate() ? { cp: null, mate: c.turn() === 'w' ? -1 : 1, best: null, pv: [], end: true } : { cp: 0, mate: null, best: null, pv: [], end: true };
}

async function analyse(g: Game, E: UciEngine): Promise<Rated> {
  const { fens } = replay(g.sans); const ev: RawEval[] = [];
  for (const fen of fens) ev.push(terminal(fen) ?? await E.eval(fen, DEPTH, 2));
  return rateGame(g, ev, DEPTH);
}

async function main() {
  const book = buildBook(rep as unknown as Repertoire), branches = indexBranches(rep as unknown as Repertoire);
  const input: ChessComGame[] | null = a.input ? JSON.parse(await readFile(a.input, 'utf8')) : null;
  const todo: { user: string; game: Game }[] = [];
  for (const user of users) {
    const raw = input ?? await recentGames(user); const skip = new Set([...await ids('analysed', user), ...a.skip!]), have = await ids('known', user);
    const games = raw.map(r => toGame(r, user, book, branches)).filter((g): g is Game => !!g && g.sans.length > 0);
    // 1. Import léger : toutes les parties de la fenêtre, sans moteur (quelques secondes). Elles servent tout de suite aux statistiques.
    const light = games.filter(g => !have.has(g.id));
    if (API) for (let i = 0; i < light.length; i += 100) await post(light.slice(i, i + 100).map(game => ({ user, game })));
    console.log(`${user} : ${games.length} partie(s) dans la fenêtre, ${light.length} importée(s)`);
    // 2. Analyse au moteur : les plus récentes d'abord, dans la fenêtre d'analyse.
    for (const g of games) if (g.t >= ANALYSE_SINCE && !skip.has(g.id)) todo.push({ user, game: g });
  }
  const list = todo.sort((x, y) => y.game.t - x.game.t).slice(0, +a.max!);   // les plus récentes d'abord
  const n = Math.max(1, Math.min(list.length, +(a.engines || cpus().length)));
  console.log(`${list.length} partie(s) à analyser · ${n} moteur(s) · profondeur ${DEPTH}`);
  const results: { user: string; game: Game; rated: Rated }[] = []; let next = 0, done = 0; const t0 = Date.now();
  // Les résultats partent par paquets de 10 dès qu'ils sont prêts : une analyse interrompue ne perd que le paquet en cours.
  let pending: typeof results = [], sending: Promise<unknown> = Promise.resolve();
  const flush = (all = false) => { if (!API || !pending.length || (!all && pending.length < 10)) return; const batch = pending; pending = [];
    sending = sending.then(() => post(batch)).catch(e => { console.error(`envoi : ${(e as Error).message}`); process.exitCode = 1; }); };
  await Promise.all(Array.from({ length: n }, async () => {
    const E = new UciEngine({ threads: 1, hashMb: 64 });
    try {
      for (let k = next++; k < list.length; k = next++) {
        const { user, game } = list[k]; const t = Date.now();
        try { const rated = await analyse(game, E); const r = { user, game, rated }; done++; if (a.out) results.push(r); pending.push(r); flush();
          console.log(`✓ ${game.id} ${game.sans.length} demi-coups · précision ${rated.st.acc ?? '–'} · ${rated.faults.length} faute(s) · ${((Date.now() - t) / 1000).toFixed(1)} s`); }
        catch (e) { console.error(`✗ ${game.id} : ${(e as Error).message}`); }
      }
    } finally { E.quit(); }
  }));
  flush(true); await sending;
  console.log(`Terminé : ${done}/${list.length} en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (a.out) await writeFile(a.out, JSON.stringify({ generatedAt: Date.now(), depth: DEPTH, results }, null, 1));
  if (list.length && !done) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
