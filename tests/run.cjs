// Automated checks for the Election Night app. Run from the repo root:
//   node tests/run.cjs            (needs Node 18+ and Playwright with Chromium: npm i -g playwright && npx playwright install chromium)
// It serves the repo on a local port, opens the app in a headless phone-sized browser, and checks the things that
// matter on election night. Firebase, YouTube and the Netlify functions are stubbed, so nothing real is touched.
// Exit code 0 = all passed. Also runs tests/data.cjs and tests/functions.mjs.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push([true, name, Date.now() - t0]); console.log('  ✓ ' + name); }
  catch (e) { results.push([false, name, Date.now() - t0, e]); console.log('  ✗ ' + name + '\n      ' + String(e && e.message || e).split('\n')[0]); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const DATA = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f + '.json'), 'utf8'));

(async () => {
  console.log('Data files'); try { execFileSync(process.execPath, [path.join(__dirname, 'data.cjs')], { stdio: 'inherit' }); results.push([true, 'data files']); } catch (e) { results.push([false, 'data files', 0, e]); }
  console.log('Server functions'); try { execFileSync(process.execPath, [path.join(__dirname, 'functions.mjs')], { stdio: 'inherit' }); results.push([true, 'functions']); } catch (e) { results.push([false, 'functions', 0, e]); }

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  // opts: time (fake clock), scheme, results (mutate results.json), live (stub for the latest function), welcome (show first-visit card)
  async function open(hash = '', opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', colorScheme: opts.scheme || 'light', acceptDownloads: true });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/gstatic|youtube|googleapis/, (r) => r.abort());
    if (opts.live) await page.route(/\.netlify\/functions\/latest/, opts.live); else await page.route(/\.netlify\/functions\//, (r) => r.fulfill({ status: 503, body: '{}' }));
    if (opts.results) await page.route(/data\/results\.json/, async (r) => { const rows = DATA('results'); opts.results(rows); r.fulfill({ json: rows }); });
    await page.addInitScript((w) => { window.POOL_MOCK = true; if (!w) localStorage.setItem('en-welcome-v1', '1'); }, !!opts.welcome);
    if (opts.time) await page.clock.install({ time: new Date(opts.time) });
    await page.goto(BASE + hash);
    if (opts.time) await page.clock.runFor(4500); else await page.waitForTimeout(3500);
    await page.waitForTimeout(400);
    return { page, ctx, errors, close: () => ctx.close() };
  }
  const tabs = (page) => page.evaluate(() => ({ order: [...document.querySelectorAll('.en-tab')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.dataset.tab), sel: document.querySelector('.en-tab[aria-selected="true"]').dataset.tab, open: [...document.querySelectorAll('.en-panel')].filter((x) => !x.hidden).map((x) => x.id) }));
  const call = (race, party, winner) => (rows) => { const x = rows.find((y) => y.race === race); Object.assign(x, { status: 'Called', winner, winner_party: party, d_pct: 51, r_pct: 47, reporting: 95, called_at: '2026-11-04T01:30:00Z' }); };

  console.log('App');
  await test('every tab opens with no script errors (light and dark)', async () => {
    for (const scheme of ['light', 'dark']) {
      const a = await open('', { scheme });
      for (const id of (await tabs(a.page)).order) { await a.page.click('.en-tab[data-tab="' + id + '"]'); await a.page.waitForTimeout(250); }
      ok(!a.errors.length, scheme + ': ' + a.errors.join(' | ')); ok(await a.page.evaluate(() => document.documentElement.scrollWidth <= 391), scheme + ': page scrolls sideways');
      await a.close();
    }
  });
  await test('tabs follow the calendar (Senate first before Nov 3, Election night from polls closing, no Voting after)', async () => {
    const cases = [['2026-10-25T15:00:00Z', 'senate', 'senate', true], ['2026-11-04T02:00:00Z', 'night', 'night', true], ['2026-11-05T15:00:00Z', 'night', 'night', false]];
    for (const [t, first, sel, voting] of cases) {
      const a = await open('', { time: t }); const s = await tabs(a.page);
      ok(s.order[0] === first, t + ' first tab ' + s.order[0]); ok(s.sel === sel, t + ' selected ' + s.sel); ok(s.order.includes('voting') === voting, t + ' voting tab'); await a.close();
    }
    const g = await open('#game', { time: '2026-10-25T15:00:00Z' }); ok((await tabs(g.page)).sel === 'game', 'invite link should open the game'); await g.close();
  });
  await test('scoreboard and seat charts always agree', async () => {
    for (const mut of [null, (r) => { call('SEN-NC', 'D', 'A')(r); call('SEN-GA', 'R', 'B')(r); r.filter((x) => x.race.startsWith('HOU-')).slice(0, 3).forEach((x, i) => call(x.race, i % 2 ? 'R' : 'D', 'H')(r)); }]) {
      const a = await open('', { results: mut || undefined });
      const top = await a.page.evaluate(() => [...document.querySelectorAll('.sb-nums')].map((x) => [...x.querySelectorAll('.n')].map((n) => n.textContent).join('-')));
      const ch = await a.page.evaluate(() => ['#en-strip', '#en-house'].map((id) => [...document.querySelectorAll(id + ' .en-ch-num')].map((t) => t.textContent).filter((t) => t !== '–').join('-')));
      ok(JSON.stringify(top) === JSON.stringify(ch), 'scoreboard ' + top + ' vs charts ' + ch); await a.close();
    }
  });
  await test('filter chips also filter the maps; race cards show our own average', async () => {
    const a = await open('#house');
    const on = (sel) => a.page.evaluate((s) => document.querySelectorAll(s + ' .st.on').length, sel);
    const dots = () => a.page.evaluate(() => document.querySelectorAll('#hou-map .dot').length);
    const all = await on('#hou-map'), allDots = await dots();
    for (const f of ['Toss-up', 'Lean D', 'Lean R']) {
      await a.page.click('#house-chips .en-chip[data-f="' + f + '"]'); await a.page.waitForTimeout(150);
      const want = DATA('house').filter((r) => r.rating === f);
      ok(await dots() === want.length, f + ': ' + (await dots()) + ' dots, want ' + want.length);
      ok(await on('#hou-map') === new Set(want.map((r) => r.id.split('-')[0])).size, f + ': wrong states lit');
    }
    await a.page.click('#house-chips .en-chip[data-f="all"]'); await a.page.waitForTimeout(150);
    ok(await on('#hou-map') === all && await dots() === allDots, 'All should restore the map');
    await a.page.click('.en-tab[data-tab="senate"]'); await a.page.waitForTimeout(250);
    for (const f of ['R', 'D']) {
      await a.page.click('#sen-chips .en-chip[data-f="' + f + '"]'); await a.page.waitForTimeout(150);
      ok(await on('#sen-map') === DATA('senate').filter((r) => r.held === f).length, 'senate ' + f + ' map');
    }
    const n3 = await a.page.evaluate(() => [document.querySelectorAll('#sen-grid .en-lead3').length, document.querySelectorAll('#sen-grid .en-race').length]);
    ok(n3[0] === n3[1] && n3[0] > 0, 'every senate card needs an "Ours" chip ' + n3);
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
  });
  await test('live data: reads the newest version, skips repeats, falls back when the server is down', async () => {
    const files = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'earlyvote', 'local', 'changes', 'spending', 'meta'];
    let sha = 'a'.repeat(40), bundles = 0;
    const live = (r) => { const u = new URL(r.request().url()); const s = u.searchParams.get('sha'); if (!s) return r.fulfill({ json: { sha } }); bundles++;
      const data = {}; files.forEach((f) => { data[f] = DATA(f); }); if (s.startsWith('b')) call('SEN-NC', 'D', 'Test')(data.results);
      return r.fulfill({ json: { sha: s, complete: true, data } }); };
    const a = await open('', { live }); const before = await a.page.textContent('.sb-nums .n.d');
    await a.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await a.page.waitForTimeout(600);
    ok(bundles === 1, 'same version should not be downloaded again (' + bundles + ')');
    sha = 'b'.repeat(40); await a.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await a.page.waitForTimeout(1200);
    const after = await a.page.textContent('.sb-nums .n.d'); ok(bundles === 2 && Number(after) === Number(before) + 1, 'new version not shown: ' + before + ' → ' + after); await a.close();
    const b = await open(''); ok(/^\d+$/.test(await b.page.textContent('.sb-nums .n.d')), 'fallback to built-in data failed'); await b.close();
  });
  await test('race-called share picture downloads', async () => {
    const a = await open('', { results: call('SEN-NC', 'D', 'Roy Cooper') });
    await a.page.click('.en-tab[data-tab="night"]'); await a.page.waitForTimeout(400);
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.locator('.en-rc-share').first().click()]);
    ok(dl.suggestedFilename() === 'race-called.png', 'filename ' + dl.suggestedFilename()); await a.close();
  });
  await test('first-visit welcome shows once and its game tip opens the game', async () => {
    const a = await open('', { welcome: true }); await a.page.waitForTimeout(800);
    ok(await a.page.isVisible('#en-welcome'), 'welcome not shown');
    await a.page.click('.wl-tip >> text=Join the Prediction Game'); await a.page.waitForTimeout(400);
    ok((await tabs(a.page)).sel === 'game', 'tip did not open the game');
    await a.page.reload(); await a.page.waitForTimeout(4000); ok(!(await a.page.isVisible('#en-welcome')), 'welcome shown twice'); await a.close();
  });
  await test('starring a race shows the watchlist; empty watchlist stays hidden', async () => {
    const a = await open(''); ok(await a.page.evaluate(() => document.getElementById('watchlist').hidden), 'empty watchlist visible');
    await a.page.locator('#senate .en-star').first().scrollIntoViewIfNeeded(); await a.page.locator('#senate .en-star').first().click(); await a.page.waitForTimeout(400);
    ok(!(await a.page.evaluate(() => document.getElementById('watchlist').hidden)), 'watchlist did not appear'); await a.close();
  });
  await test('Money tab renders every section with sources', async () => {
    const a = await open('#money'); const m = await a.page.evaluate(() => ({ cards: document.querySelectorAll('#mn-wrap .mn-card').length, stats: document.querySelectorAll('.mn-stat').length, links: document.querySelectorAll('#mn-wrap .mn-src[href^="https://"]').length }));
    ok(m.cards >= 10 && m.stats >= 3 && m.links >= 10, JSON.stringify(m)); await a.close();
  });
  await test('Ad Wars loops, skips broken videos and alternates sides', async () => {
    const ads = DATA('ads'); ok(ads.every((x, i) => x.party === (i % 2 ? 'D' : 'R')), 'ads should alternate R/D');
    const a = await open('');
    await a.page.evaluate(() => { window.__yt = []; window.YT = { Player: function (id, o) { const me = this; me.mute = () => {}; me.unMute = () => {}; me.isMuted = () => true; me.setVolume = () => {}; me.playVideo = () => {}; me.pauseVideo = () => window.__yt.push('pause'); me.loadVideoById = (v) => window.__yt.push(v); window.__ytO = o; setTimeout(() => o.events.onReady({ target: me }), 5); } }; });
    await a.page.click('.en-tab[data-tab="ads"]'); await a.page.waitForTimeout(400);
    await a.page.evaluate(() => { window.__ytO.events.onStateChange({ data: 0 }); window.__ytO.events.onError({}); });
    const log = await a.page.evaluate(() => window.__yt); ok(log[0] === ads[1].id && log[1] === ads[2].id, 'advance/skip order ' + log);
    await a.page.click('.en-tab[data-tab="news"]'); await a.page.waitForTimeout(200); ok((await a.page.evaluate(() => window.__yt)).includes('pause'), 'did not pause when leaving the tab'); await a.close();
  });
  await test('top of the page is readable (text contrast, light and dark)', async () => {
    for (const scheme of ['light', 'dark']) {
      const a = await open('', { scheme }); await a.page.click('#en-more summary');
      const bad = await a.page.evaluate(() => {
        const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] == null ? 1 : v[3] }; };
        const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const mix = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
        const hero = [{ r: 11, g: 16, b: 32, a: 1 }, { r: 30, g: 58, b: 138, a: 1 }, { r: 127, g: 29, b: 29, a: 1 }];
        const out = [];
        document.querySelectorAll('#top *').forEach((e) => {
          if (!e.offsetParent || ![...e.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim())) return;
          const cs = getComputedStyle(e), fg = parse(cs.color); if (!fg || fg.a === 0) return; // gradient-clipped headline
          const layers = []; let n = e; while (n && !n.classList.contains('en-hero')) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) layers.push(c); n = n.parentElement; }
          const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          const worst = Math.min(...hero.map((h) => { let bg = h; layers.slice().reverse().forEach((l) => { bg = mix(l, bg); }); const f = fg.a < 1 ? mix(fg, bg) : fg; const a1 = lum(f), a2 = lum(bg); return (Math.max(a1, a2) + 0.05) / (Math.min(a1, a2) + 0.05); }));
          if (worst < (large ? 3 : 4.5)) out.push(e.textContent.trim().slice(0, 30) + ' ' + worst.toFixed(2));
        });
        return out;
      });
      ok(!bad.length, scheme + ': ' + bad.join('; ')); await a.close();
    }
  });

  await browser.close(); server.close();
  const failed = results.filter((r) => !r[0]);
  console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
