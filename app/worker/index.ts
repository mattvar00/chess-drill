/**
 * Worker : sert l'app (assets) et l'API sous /api/*.
 *  - /api/chesscom/*  proxy CORS vers api.chess.com (public, mis en cache)
 *  - le reste exige « Authorization: Bearer <APP_TOKEN> » (un seul compte pour l'instant : « me »)
 */
import type { Fault, GameStats } from '../src/core/analysis';
import type { Game, EvalEntry } from '../src/core/types';
import { winPct } from '../src/core/winpct';

export interface Env {
  ASSETS: Fetcher; DB: D1Database;
  APP_TOKEN: string;                       // secret : code d'accès de l'app et du job d'analyse
  GH_TOKEN?: string;                       // secret : jeton GitHub (actions:write) pour « analyser maintenant »
  GH_REPO?: string; GH_WORKFLOW?: string;  // ex. mattvar00/chess-drill, analyse.yml
}
/** `rated` absent : import léger (la partie seule, sans analyse au moteur). */
interface IngestBody { depth: number; results: { user: string; game: Game; rated?: { ev: EvalEntry[]; cls: string[]; st: GameStats; faults: Fault[] } }[] }

const UA = 'chess-drill/2.0 (perso)';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const err = (msg: string, status: number) => json({ error: msg }, status);
const lower = (s: string | null) => (s || '').trim().toLowerCase();

/** Comparaison en temps constant du jeton. */
function authed(req: Request, env: Env): string | null {
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), want = env.APP_TOKEN || '';
  if (!want || got.length !== want.length) return null;
  let d = 0; for (let i = 0; i < want.length; i++) d |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0 ? 'me' : null;
}

async function chesscom(url: URL, ctx: ExecutionContext): Promise<Response> {
  const target = 'https://api.chess.com/pub/' + url.pathname.slice('/api/chesscom/'.length) + url.search;
  const cache = caches.default, key = new Request(target);
  let res = await cache.match(key);
  if (!res) {
    let up: Response | undefined;
    for (let i = 0; i < 4; i++) { up = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (up.status !== 429 && up.status < 500) break; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
    const m = /\/games\/(\d{4})\/(\d{2})$/.exec(target), now = new Date();
    const current = !m || (+m[1] === now.getUTCFullYear() && +m[2] === now.getUTCMonth() + 1);
    const ttl = up!.ok ? (current ? 600 : 86400) : 0;
    res = new Response(up!.body, { status: up!.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
    if (ttl) ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

async function ingest(env: Env, body: IngestBody): Promise<Response> {
  if (!Array.isArray(body?.results)) return err('results manquant', 400);
  const now = Date.now(), stmts: D1PreparedStatement[] = [];
  for (const { user, game, rated } of body.results) {
    const u = lower(user); if (!u || !game?.id) return err('entrée invalide', 400);
    const { ev: _ev, ...light } = game as Game;
    // import léger : on n'écrase jamais une partie déjà là (elle est peut-être analysée)
    if (!rated) { stmts.push(env.DB.prepare('INSERT OR IGNORE INTO games (username, id, t, data, updated) VALUES (?, ?, ?, ?, ?)').bind(u, game.id, game.t, JSON.stringify(light), now)); continue; }
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO games (username, id, t, data, updated) VALUES (?, ?, ?, ?, ?)').bind(u, game.id, game.t, JSON.stringify(light), now));
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO analyses (username, game_id, depth, ev, cls, st, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(u, game.id, body.depth | 0, JSON.stringify(rated.ev), JSON.stringify(rated.cls), JSON.stringify(rated.st), now));
    stmts.push(env.DB.prepare('DELETE FROM faults WHERE username = ? AND game_id = ?').bind(u, game.id));
    for (const f of rated.faults) stmts.push(env.DB.prepare('INSERT OR REPLACE INTO faults (username, id, game_id, t, data) VALUES (?, ?, ?, ?, ?)').bind(u, f.id, game.id, game.t, JSON.stringify(f)));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, games: body.results.length });
}

async function analyseNow(env: Env, account: string, user: string): Promise<Response> {
  if (!env.GH_TOKEN || !env.GH_REPO) return err('déclenchement non configuré (GH_TOKEN / GH_REPO)', 501);
  const users = user ? [user] : (await env.DB.prepare('SELECT username FROM follows WHERE account_id = ?').bind(account).all<{ username: string }>()).results.map(r => r.username);
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW || 'analyse.yml'}/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': UA, 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main', inputs: { users: users.join(','), days: '7' } }),
  });
  return r.ok ? json({ ok: true, users }) : err(`GitHub : HTTP ${r.status}`, 502);
}

async function api(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const p = url.pathname, q = url.searchParams;
  if (p.startsWith('/api/chesscom/') && req.method === 'GET') return chesscom(url, ctx);
  if (p === '/api/health') return json({ ok: true });
  const account = authed(req, env); if (!account) return err('non autorisé', 401);
  const user = lower(q.get('user')), since = +(q.get('since') || 0);

  if (p === '/api/follows' && req.method === 'GET')
    return json((await env.DB.prepare('SELECT username, own FROM follows WHERE account_id = ? ORDER BY own DESC, username').bind(account).all()).results);
  if (p === '/api/follows' && req.method === 'POST') {
    const u = lower(((await req.json()) as { username?: string }).username ?? null); if (!/^[a-z0-9_-]{2,25}$/.test(u)) return err('pseudo invalide', 400);
    await env.DB.prepare('INSERT OR IGNORE INTO follows (account_id, username, own, added) VALUES (?, ?, 0, ?)').bind(account, u, Date.now()).run();
    return json({ ok: true });
  }
  if (p === '/api/known' && req.method === 'GET')   // toutes les parties déjà importées, analysées ou non
    return json({ ids: (await env.DB.prepare('SELECT id FROM games WHERE username = ? AND t >= ?').bind(user, since).all<{ id: string }>()).results.map(r => r.id) });
  if (p === '/api/analysed' && req.method === 'GET')
    return json({ ids: (await env.DB.prepare('SELECT a.game_id FROM analyses a JOIN games g ON g.username = a.username AND g.id = a.game_id WHERE a.username = ? AND g.t >= ?').bind(user, since).all<{ game_id: string }>()).results.map(r => r.game_id) });
  if (p === '/api/ingest' && req.method === 'POST') return ingest(env, await req.json());
  if (p === '/api/analyse-now' && req.method === 'POST') return analyseNow(env, account, lower(((await req.json().catch(() => ({}))) as { username?: string }).username ?? null));

  const withAnalysis = (r: { data: string; st: string | null; ev: string | null; cls: string | null }) => ({ ...JSON.parse(r.data), ...(r.st ? { st: JSON.parse(r.st), cls: JSON.parse(r.cls || '[]'), wp: (JSON.parse(r.ev || '[]') as EvalEntry[]).map(e => Math.round(winPct(e.c, e.m))) } : {}) });
  if (p === '/api/games' && req.method === 'GET' && q.has('cursor')) {
    // Ce qui a changé depuis le curseur « date:identifiant », par pages : nouvelles parties comme anciennes parties tout juste analysées.
    const [cu, cid = ''] = (q.get('cursor') || '0:').split(':'), limit = Math.max(1, Math.min(300, +(q.get('limit') || 300)));
    const rows = (await env.DB.prepare('SELECT g.id, g.updated, g.data, a.st, a.ev, a.cls FROM games g LEFT JOIN analyses a ON a.username = g.username AND a.game_id = g.id WHERE g.username = ?1 AND (g.updated > ?2 OR (g.updated = ?2 AND g.id > ?3)) ORDER BY g.updated, g.id LIMIT ?4')
      .bind(user, +cu || 0, cid, limit).all<{ id: string; updated: number; data: string; st: string | null; ev: string | null; cls: string | null }>()).results;
    const last = rows[rows.length - 1];
    return json({ games: rows.map(withAnalysis), cursor: last ? `${last.updated}:${last.id}` : q.get('cursor'), more: rows.length === limit });
  }
  if (p === '/api/games' && req.method === 'GET') {
    // Pour chaque partie analysée : la courbe des chances (Blancs, 0-100) et la classe de chaque coup, assez légères pour la liste
    // et suffisantes pour les statistiques. Les évaluations complètes restent sur /api/games/:user/:id.
    const rows = (await env.DB.prepare('SELECT g.data, a.st, a.ev, a.cls FROM games g LEFT JOIN analyses a ON a.username = g.username AND a.game_id = g.id WHERE g.username = ? AND g.t >= ? ORDER BY g.t DESC LIMIT 500')
      .bind(user, since).all<{ data: string; st: string | null; ev: string | null; cls: string | null }>()).results;
    return json(rows.map(withAnalysis));
  }
  const gm = /^\/api\/games\/([^/]+)\/([^/]+)$/.exec(p);
  if (gm && req.method === 'GET') {
    const [u, id] = [lower(decodeURIComponent(gm[1])), decodeURIComponent(gm[2])];
    const g = await env.DB.prepare('SELECT data FROM games WHERE username = ? AND id = ?').bind(u, id).first<{ data: string }>();
    if (!g) return err('partie inconnue', 404);
    const a = await env.DB.prepare('SELECT depth, ev, cls, st FROM analyses WHERE username = ? AND game_id = ?').bind(u, id).first<{ depth: number; ev: string; cls: string; st: string }>();
    return json({ ...JSON.parse(g.data), ...(a ? { ev: JSON.parse(a.ev), cls: JSON.parse(a.cls), st: JSON.parse(a.st) } : {}) });
  }
  if (p === '/api/faults' && req.method === 'GET')
    return json((await env.DB.prepare('SELECT data FROM faults WHERE username = ? AND t >= ? AND t <= ? ORDER BY t DESC LIMIT 2000').bind(user, since, +(q.get('until') || 0) || 9e12).all<{ data: string }>()).results.map(r => JSON.parse(r.data)));

  if (p === '/api/progress' && req.method === 'GET')
    return json(Object.fromEntries((await env.DB.prepare('SELECT key, value, updated FROM progress WHERE account_id = ? AND updated > ?').bind(account, since).all<{ key: string; value: string; updated: number }>())
      .results.map(r => [r.key, { value: JSON.parse(r.value), updated: r.updated }])));
  if (p === '/api/progress' && req.method === 'PUT') {
    const body = (await req.json()) as Record<string, { value: unknown; updated: number }>;
    // la dernière écriture gagne : on n'écrase pas une valeur plus récente venue d'un autre appareil
    const stmts = Object.entries(body).map(([k, v]) => env.DB.prepare(
      'INSERT INTO progress (account_id, key, value, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (account_id, key) DO UPDATE SET value = excluded.value, updated = excluded.updated WHERE excluded.updated > progress.updated')
      .bind(account, k, JSON.stringify(v.value), +v.updated || Date.now()));
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, keys: stmts.length });
  }
  return err('route inconnue', 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, ctx, url); }
      catch (e) { return err((e as Error).message || 'erreur interne', 500); }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
