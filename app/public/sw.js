/* Hors ligne : la page et ses fichiers sont gardés en cache ; l'API n'est jamais mise en cache. */
const CACHE = 'chess-drill-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add('./')).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const put = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (req.mode === 'navigate') {            // page : réseau d'abord, cache si hors ligne
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req).then(r => r || caches.match('./'))));
  } else {                                  // fichiers : cache d'abord, mis à jour en arrière-plan
    e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(put); if (hit) { net.catch(() => {}); return hit; } return net; }));
  }
});
