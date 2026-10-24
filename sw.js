/* Offline support: the app shell is cached; data files are fetched fresh
   when online and fall back to the last copy when offline. */
const CACHE = 'election-night-v31';
const SHELL = ['./', 'index.html', 'd3.min.js', 'dash-lite.js', 'manifest.webmanifest', 'pool.js', 'pool.css', 'pool-config.js',
  'icons/icon-192.png?v=2026', 'icons/icon-512.png?v=2026', 'icons/apple-touch-icon.png?v=2026',
  'fonts/InstrumentSans-Regular.ttf', 'fonts/InstrumentSans-Bold.ttf', 'fonts/InstrumentSerif-Regular.ttf'];
const DATA = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'usmap', 'meta'].map((d) => 'data/' + d + '.json');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.concat(DATA))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/') || url.pathname.includes('/pool') || e.request.mode === 'navigate') {
    // network first, so new polls/results show up right away
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
