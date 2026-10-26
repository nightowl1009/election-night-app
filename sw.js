/* Offline support: the app shell is cached; data files are fetched fresh
   when online and fall back to the last copy when offline. */
const CACHE = 'election-night-v78';
const SHELL = ['./', 'index.html', 'd3.min.js', 'dash-lite.js', 'manifest.webmanifest', 'pool.js', 'pool.css', 'pool-config.js', 'sim.js', 'push.js', 'qrcode.js', 'ads.js', 'welcome.js', 'party.js',
  'icons/icon-192.png?v=2026', 'icons/icon-512.png?v=2026', 'icons/apple-touch-icon.png?v=2026',
  'fonts/InstrumentSans-Regular.ttf', 'fonts/InstrumentSans-Bold.ttf', 'fonts/InstrumentSerif-Regular.ttf'];
const DATA = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'usmap', 'earlyvote', 'local', 'changes', 'ads', 'spending', 'meta'].map((d) => 'data/' + d + '.json');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.concat(DATA))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return;
  const save = (res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; };
  // Opening the app: show the saved page instantly (no white screen while the network answers) and save the newest
  // page in the background, so a new version shows up on the next launch. Live polls and results don't depend on this.
  if (e.request.mode === 'navigate') {
    const net = fetch(e.request).then(save);
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')).then((r) => r || net));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  // Scripts and styles: saved copy first. Our own are stamped with a version (?v=…) and never change; the two
  // libraries without a stamp (d3, QR codes) are refreshed in the background.
  if (/\.(js|css)$/.test(url.pathname)) {
    const stamped = url.searchParams.has('v');
    e.respondWith(caches.match(e.request).then((r) => { if (r && !stamped) e.waitUntil(fetch(e.request).then(save).catch(() => {})); return r || fetch(e.request).then(save); }));
    return;
  }
  // Data and anything else: network first, saved copy when offline
  if (url.pathname.includes('/data/')) {
    e.respondWith(fetch(e.request).then(save).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

// Race-call alerts
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Election Night', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'icons/icon-192.png?v=2026', badge: 'icons/icon-192.png?v=2026', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate ? c.navigate(target).catch(() => {}) : null; return c.focus(); } }
    return self.clients.openWindow ? self.clients.openWindow(target) : null;
  }));
});
