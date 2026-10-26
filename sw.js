/* Offline support: the app shell is cached; data files are fetched fresh
   when online and fall back to the last copy when offline. */
const CACHE = 'election-night-v77';
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
  if (url.pathname.includes('/data/') || /\.(js|css)$/.test(url.pathname) || e.request.mode === 'navigate') {
    // Network first, so new code, polls and results show up right away — but the app shell (page, scripts, styles)
    // never waits more than about a second on a slow connection: after that the saved copy opens the app instantly and the
    // fresh copy is saved in the background for next time. (Waiting on the network was the white screen at launch.)
    const net = fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    });
    const saved = () => caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' || url.pathname.includes('/data/') }).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : null));
    if (url.pathname.includes('/data/')) { e.respondWith(net.catch(() => saved())); return; }
    e.respondWith(new Promise((resolve) => {
      let done = false; const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
      const t = setTimeout(() => saved().then(finish), e.request.mode === 'navigate' ? 800 : 500);
      net.then((r) => { clearTimeout(t); finish(r); }).catch(() => { clearTimeout(t); saved().then((r) => { if (r) finish(r); else { done = true; resolve(Response.error()); } }); });
    }));
    e.waitUntil(net.catch(() => {}));
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
