// Cloudflare Worker — proxy CORS pour api.chess.com (gratuit : 100 000 requêtes/jour)
// Déploiement : dash.cloudflare.com → Workers & Pages → Create → coller ce fichier → Deploy.
// Puis dans l'app : ⚙ → "Proxy chess.com" = https://<nom>.<compte>.workers.dev
const UA = 'chess-drill/1.0 (perso ; github pages)';
const ALLOW = '*'; // remplace par 'https://<pseudo>.github.io' pour verrouiller

export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOW,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const u = new URL(req.url);
    if (!u.pathname.startsWith('/pub/')) return new Response('use /pub/…', { status: 400, headers: cors });
    const target = 'https://api.chess.com' + u.pathname + u.search;

    // cache Cloudflare : un mois d'archive change peu, on garde 10 min (mois courant) / 1 jour (mois passés)
    const cache = caches.default;
    const key = new Request(target, { method: 'GET' });
    let res = await cache.match(key);
    if (!res) {
      let up;
      for (let i = 0; i < 4; i++) {                       // sériel + backoff, comme le demande chess.com
        up = await fetch(target, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
        if (up.status !== 429 && up.status < 500) break;
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
      const now = new Date(); const m = /\/games\/(\d{4})\/(\d{2})$/.exec(u.pathname);
      const current = m && +m[1] === now.getUTCFullYear() && +m[2] === now.getUTCMonth() + 1;
      const ttl = up.ok ? (current ? 600 : 86400) : 0;
      res = new Response(up.body, { status: up.status, headers: { 'Content-Type': up.headers.get('Content-Type') || 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
      if (ttl) await cache.put(key, res.clone());
    }
    const h = new Headers(res.headers); for (const k in cors) h.set(k, cors[k]);
    return new Response(res.body, { status: res.status, headers: h });
  },
};
