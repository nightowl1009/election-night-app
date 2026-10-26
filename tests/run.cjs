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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, serviceWorkers: 'block', colorScheme: opts.scheme || 'light', acceptDownloads: true });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/gstatic|youtube|googleapis/, (r) => r.abort());
    if (opts.live) await page.route(/\.netlify\/functions\/latest/, opts.live); else await page.route(/\.netlify\/functions\//, (r) => r.fulfill({ status: 503, body: '{}' }));
    if (opts.odds) await page.route(/\.netlify\/functions\/odds/, (r) => r.fulfill({ json: opts.odds }));
    if (opts.results) await page.route(/data\/results\.json/, async (r) => { const rows = DATA('results'); opts.results(rows); r.fulfill({ json: rows }); });
    await page.addInitScript((w) => { window.POOL_MOCK = true; if (!w) localStorage.setItem('en-welcome-v1', '1'); }, !!opts.welcome);
    await page.addInitScript((t) => { localStorage.setItem('en-theme', t); }, opts.scheme === 'dark' ? 'dark' : 'light');   // the app's own ☀️/🌙 setting
    if (opts.db) await page.addInitScript((db) => { window.__poolMockDb = db; }, opts.db);
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
    const sen = DATA('senate'), ratings = [...new Set(sen.map((r) => r.rating))];
    ok(await a.page.evaluate(() => document.querySelectorAll('#sen-chips .en-chip').length) === ratings.length + 1, 'senate chips should match the ratings in the data');
    for (const f of ratings) {
      await a.page.click('#sen-chips .en-chip[data-f="' + f + '"]'); await a.page.waitForTimeout(150);
      const want = sen.filter((r) => r.rating === f).length;
      ok(await on('#sen-map') === want, 'senate ' + f + ' map');
      ok(await a.page.evaluate(() => document.querySelectorAll('#sen-grid .en-race').length) === want, 'senate ' + f + ' cards');
    }
    await a.page.click('#sen-chips .en-chip[data-f="all"]'); await a.page.waitForTimeout(150);
    await a.page.click('#sen-map .en-mapmode button:last-child'); await a.page.waitForTimeout(150);
    await a.page.click('#sen-map .en-mapmode button:first-child'); await a.page.waitForTimeout(150);
    ok(await on('#sen-map') === sen.length, 'senate map mode toggle');
    await a.page.click('.en-tab[data-tab="governors"]'); await a.page.waitForTimeout(250);
    await a.page.click('#gov-chips .en-chip[data-f="Toss-up"]'); await a.page.waitForTimeout(150);
    const gt = DATA('governor').filter((r) => r.rating === 'Toss-up').length;
    ok(await on('#gov-map') === gt && await a.page.evaluate(() => document.querySelectorAll('#gov-grid .en-race').length) === gt, 'governor toss-up filter');
    await a.page.click('.en-tab[data-tab="senate"]'); await a.page.waitForTimeout(250);
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
  // ---------- election-night extras ----------
  const ODDS = (() => { const t0 = Math.floor(Date.UTC(2026, 9, 11) / 1000), s = [], h = []; for (let i = 0; i < 200; i++) { s.push([t0 + i * 3600, 0.55 + 0.1 * Math.sin(i / 20)]); h.push([t0 + i * 3600, 0.85 + 0.05 * Math.cos(i / 25)]); } return { ok: true, range: 'weeks', series: { senate: s, house: h }, now: { senate: 0.65, house: 0.9 }, at: Date.UTC(2026, 9, 25, 19) }; })();
  const inject = (page, mut) => page.evaluate((m) => { const rows = JSON.parse(JSON.stringify(window.dash.data('results').data)); new Function('rows', m)(rows); window.dash.simSet('results', rows); }, mut);
  const callJS = (race, party, winner) => `{ const x = rows.find((y) => y.race === '${race}'); Object.assign(x, { status: 'Called', winner: '${winner}', winner_party: '${party}', d_pct: 51, r_pct: 47, reporting: 95, called_at: new Date().toISOString() }); }`;
  await test('a starred race getting called fills the screen; a chamber clinch gets its own moment', async () => {
    const a = await open('#senate');
    await a.page.locator('#sen-grid [data-card="SEN-OH"] .en-star').click(); await a.page.waitForTimeout(300);
    await inject(a.page, callJS('SEN-OH', 'D', 'Sherrod Brown')); await a.page.waitForTimeout(500);
    const t = await a.page.evaluate(() => { const b = document.querySelector('.cb-back'); return b ? b.textContent : ''; });
    ok(/watching/.test(t) && /Sherrod Brown/.test(t), 'celebration text: ' + t);
    ok(await a.page.evaluate(() => !!document.querySelector('.cb-back .cb-confetti')), 'no confetti');
    await a.page.click('.cb-back'); await a.page.waitForTimeout(600);
    const sen = DATA('senate').map((r) => r.id);
    await inject(a.page, sen.map((id) => callJS('SEN-' + id, 'D', 'X')).join(';')); await a.page.waitForTimeout(800);
    const all = await a.page.evaluate(async () => { const seen = []; for (let i = 0; i < 4; i++) { const b = document.querySelector('.cb-back:not(.out)'); if (!b) break; seen.push(b.textContent); b.click(); await new Promise((r) => setTimeout(r, 450)); } return seen.join(' | '); });
    ok(/Democrats clinch the Senate/.test(all), 'clinch moment missing: ' + all);
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
  });
  await test('"Polls just closed" banner appears once per wave', async () => {
    const a = await open('', { time: '2026-11-04T00:02:00Z' }); await a.page.clock.runFor(6000);
    const t = await a.page.evaluate(() => { const b = document.getElementById('en-closed'); return b ? b.textContent : ''; });
    ok(/Polls just closed/.test(t) && /Georgia/.test(t), 'banner: ' + t);
    await a.page.click('#en-closed .go'); await a.page.waitForTimeout(300);
    ok((await tabs(a.page)).sel === 'night', 'What to watch should open Election night');
    await a.page.reload(); await a.page.clock.runFor(10000);
    ok(!(await a.page.evaluate(() => !!document.getElementById('en-closed'))), 'banner came back after reload'); await a.close();
  });
  await test('betting-odds chart draws, toggles chamber, and hides when odds are unavailable', async () => {
    const a = await open('#night', { odds: ODDS }); await a.page.waitForTimeout(800);
    const s = await a.page.evaluate(() => { const b = document.getElementById('en-odds'); return { shown: !b.hidden, line: !!b.querySelector('.od-line'), big: b.querySelector('.od-big') && b.querySelector('.od-big').textContent }; });
    ok(s.shown && s.line && /65%/.test(s.big) && /35%/.test(s.big), JSON.stringify(s));
    await a.page.click('#en-odds .en-mapmode button:last-child'); await a.page.waitForTimeout(200);
    ok(/90%/.test(await a.page.textContent('#en-odds .od-big')) && /House/.test(await a.page.textContent('#en-odds h3')), 'House toggle');
    await a.page.locator('#en-odds .od-svg').scrollIntoViewIfNeeded(); const box = await a.page.locator('#en-odds .od-svg').boundingBox(); await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await a.page.waitForTimeout(100);
    ok(/Dems \d+%/.test(await a.page.textContent('#en-odds .od-read')), 'hover readout');
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
    const b = await open('#night'); await b.page.waitForTimeout(800); ok(await b.page.evaluate(() => document.getElementById('en-odds').hidden), 'odds box should hide when the server is down'); await b.close();
  });
  await test('TV mode: race-call slide, odds slide, and confetti', async () => {
    const a = await open('#night', { odds: ODDS }); await a.page.waitForTimeout(600);
    await a.page.click('#tv-open'); await a.page.waitForTimeout(600);
    ok(await a.page.evaluate(() => !!document.querySelector('.en-tv')), 'TV did not open');
    let saw = false; for (let i = 0; i < 8 && !saw; i++) { saw = await a.page.evaluate(() => !!document.querySelector('.en-tv .tv-odds svg')); if (!saw) { await a.page.click('.en-tv-stage'); await a.page.waitForTimeout(150); } }
    ok(saw, 'odds slide never showed');
    await inject(a.page, callJS('SEN-TX', 'R', 'Ken Paxton')); await a.page.waitForTimeout(700);
    const t = await a.page.evaluate(() => { const c = document.querySelector('.en-tv .tv-call'); return c ? c.textContent : ''; });
    ok(/Race called/i.test(t) && /Ken Paxton/.test(t), 'call slide: ' + t);
    ok(await a.page.evaluate(() => !!document.querySelector('.en-tv .cb-confetti')), 'no confetti on TV');
    ok(!(await a.page.evaluate(() => !!document.querySelector('body > .cb-back'))), 'phone celebration should not cover the TV');
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
  });
  await test('group chat: quick reactions send and float; race-call pop-ups offer reactions', async () => {
    const a = await open('#game'); await a.page.waitForTimeout(500);
    await a.page.click('text=Sign in with Google'); await a.page.waitForTimeout(500);
    await a.page.click('.en-seg button:has-text("Groups")'); await a.page.waitForTimeout(300);
    await a.page.fill('input[placeholder^="Group name"]', 'Boonville crew'); await a.page.click('text=Create group'); await a.page.waitForTimeout(600);
    await a.page.click('.en-seg button:has-text("Chat")'); await a.page.waitForTimeout(300);
    await a.page.click('text=I agree'); await a.page.waitForTimeout(400);
    const grp = await a.page.evaluate(() => [...document.querySelectorAll('.pl-chips .en-chip')].map((b) => b.textContent));
    await a.page.click('.pl-chips .en-chip:has-text("Boonville crew")'); await a.page.waitForTimeout(400);
    await a.page.click('.pl-quick .pl-q >> nth=0'); await a.page.waitForTimeout(300);
    ok(await a.page.evaluate(() => [...document.querySelectorAll('.pl-msgb p')].some((p) => p.textContent === '🔥')), 'reaction not in chat (rooms: ' + grp + ')');
    ok(await a.page.evaluate(() => !!document.querySelector('.fe-layer .fe')), 'no floating emoji');
    await inject(a.page, callJS('SEN-IA', 'R', 'Ashley Hinson')); await a.page.waitForTimeout(500);
    ok(await a.page.evaluate(() => document.querySelectorAll('.pl-pop .pl-poprx .pl-q').length === 4), 'pop-up reactions missing');
    await a.page.waitForTimeout(3600); await a.page.locator('.pl-pop .pl-poprx .pl-q').first().click(); await a.page.waitForTimeout(400);
    ok(await a.page.evaluate(() => [...document.querySelectorAll('.pl-msgb p')].some((p) => /Iowa Senate/.test(p.textContent))), 'pop-up reaction not posted');
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
  });
  await test('map buttons: every state and seat gets the right color in each view', async () => {
    const a = await open('#senate');
    const MAPC = { d3: '#1d4ed8', d2: '#3b82f6', d1: '#93c5fd', r3: '#b91c1c', r2: '#ef4444', r1: '#fca5a5', i3: '#7e22ce', i2: '#a855f7', i1: '#d8b4fe', e: '#fbbf24' };
    const hex = (c) => { const m = String(c).match(/\d+/g); return m ? '#' + m.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('') : c; };
    const r1 = (v) => Math.round(v * 10) / 10;
    const ratingCls = (r) => { const m = /^(Lean|Likely|Solid) ([DRI])$/.exec(r.rating || ''); return m ? m[2].toLowerCase() + { Lean: '1', Likely: '2', Solid: '3' }[m[1]] : 'e'; };
    const pollCls = (r) => { let d, rr; if (r.avg_d != null && r.avg_r != null) { d = +r.avg_d; rr = +r.avg_r; } else if (r.avg2_d != null && r.avg2_r != null) { d = +r.avg2_d; rr = +r.avg2_r; } else { d = +r.poll_d; rr = +r.poll_r; }
      const m = r1(d - rr), side = m > 0 ? ((r.party_d || 'D') === 'I' ? 'i' : 'd') : m < 0 ? 'r' : 'e', a2 = Math.abs(m); return side === 'e' ? 'e' : side + (a2 >= 5 ? '3' : a2 >= 2 ? '2' : '1'); };
    for (const [tab, sel, ds] of [['senate', '#sen-map', 'senate'], ['governors', '#gov-map', 'governor']]) {
      await a.page.click('.en-tab[data-tab="' + tab + '"]'); await a.page.waitForTimeout(300);
      const btns = await a.page.evaluate((s2) => [...document.querySelectorAll(s2 + ' .en-mapmode button')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')), sel);
      ok(JSON.stringify(btns) === JSON.stringify(['Rating:true', 'Poll lead:false']), tab + ' buttons ' + btns);
      for (const [mode, fn] of [['Rating', ratingCls], ['Poll lead', pollCls]]) {
        await a.page.click(sel + ' .en-mapmode button:has-text("' + mode + '")'); await a.page.waitForTimeout(150);
        const fills = await a.page.evaluate((s2) => Object.fromEntries([...document.querySelectorAll(s2 + ' [data-st].on')].map((e) => [e.dataset.st, e.style.fill])), sel);
        const bad = DATA(ds).filter((r) => hex(fills[r.id]) !== MAPC[fn(r)]).map((r) => r.id + ' ' + hex(fills[r.id]) + '≠' + MAPC[fn(r)] + ' (' + r.rating + ')');
        ok(!bad.length && Object.keys(fills).length === DATA(ds).length, tab + ' ' + mode + ': ' + bad.join(', '));
      }
      await a.page.click(sel + ' .en-mapmode button:has-text("Rating")');
    }
    await a.page.click('.en-tab[data-tab="house"]'); await a.page.waitForTimeout(300);
    const hb = await a.page.evaluate(() => [...document.querySelectorAll('#hou-map .en-mapmode button')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')));
    ok(JSON.stringify(hb) === JSON.stringify(['Rating:true', 'Betting odds:false']), 'house buttons ' + hb);
    const house = DATA('house'), byState = {}; house.forEach((r) => { const st = r.id.split('-')[0]; (byState[st] = byState[st] || []).push(r); });
    const cook = (r) => /toss/i.test(r.rating) ? 't' : r.rating === 'Lean D' ? 'ld' : 'lr';
    const kal = (r) => { if (r.kalshi_d == null) return 'kn'; const k = Number(r.kalshi_d); return k >= 65 ? 'kd' : k > 50 ? 'ld' : k === 50 ? 't' : k > 35 ? 'lr' : 'kr'; };
    for (const [mode, fn] of [['Rating', cook], ['Betting odds', kal]]) {
      await a.page.click('#hou-map .en-mapmode button:has-text("' + mode + '")'); await a.page.waitForTimeout(150);
      const dots = await a.page.evaluate(() => { const o = {}; document.querySelectorAll('#hou-map circle.dot').forEach((d) => { (o[d.dataset.st] = o[d.dataset.st] || []).push(d.getAttribute('class').split(' ')[1]); }); return o; });
      const bad = Object.entries(byState).filter(([st, rows]) => JSON.stringify(dots[st]) !== JSON.stringify(rows.map(fn))).map(([st, rows]) => st + ' ' + dots[st] + '≠' + rows.map(fn));
      ok(!bad.length, 'house ' + mode + ': ' + bad.join(' | '));
    }
    // legend colors match the dot colors
    const leg = await a.page.evaluate(() => [...document.querySelectorAll('#hou-map .en-map-key')[0].querySelectorAll('span')].map((s2) => s2.textContent));
    ok(leg.includes('50/50') && leg.includes('No odds yet'), 'betting-odds legend ' + leg);
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
  });
  await test('light by default; the ☀️/🌙 button switches and remembers', async () => {
    const a = await open(''); await a.page.evaluate(() => localStorage.removeItem('en-theme')); await a.page.reload(); await a.page.waitForTimeout(6000);
    const bg = () => a.page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor]);
    let t = await bg(); ok(t[0] === 'light' && t[1] === 'rgb(245, 246, 248)', 'default ' + t);
    await a.page.click('#theme-btn'); t = await bg(); ok(t[0] === 'dark' && t[1] === 'rgb(13, 17, 23)', 'dark ' + t);
    ok(await a.page.evaluate(() => localStorage.getItem('en-theme')) === 'dark', 'not remembered'); await a.close();
  });
  await test('no pinch or double-tap zoom; sideways rows still scroll', async () => {
    const a = await open('', { touch: true });
    const z = await a.page.evaluate(() => ({ meta: document.querySelector('meta[name=viewport]').content, ta: getComputedStyle(document.documentElement).touchAction, ev: (() => { const e = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; })() }));
    ok(/maximum-scale=1/.test(z.meta) && /user-scalable=no/.test(z.meta), 'viewport ' + z.meta);
    ok(/manipulation/.test(z.ta), 'touch-action ' + z.ta);
    const tb = await a.page.evaluate(() => getComputedStyle(document.querySelector('.en-tabs')).touchAction); ok(/pan-x/.test(tb), 'tab bar must pan sideways: ' + tb);
    // a sideways swipe on the tab bar scrolls it
    await a.page.waitForTimeout(1200); // splash gone
    const box = await a.page.locator('.en-tabs').boundingBox(); const cdp = await a.ctx.newCDPSession(a.page);
    const y = Math.round(box.y + box.height / 2); let x = Math.round(box.x + box.width * 0.85);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 0; i < 12; i++) { x -= 20; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await a.page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await a.page.waitForTimeout(400); ok(await a.page.evaluate(() => document.querySelector('.en-tabs').scrollLeft) > 20, 'tab bar did not scroll on swipe');
    // the Election night button row (alerts, poll-closing alerts, sound, TV) fits or swipes — it never pushes the page wider
    await a.page.click('.en-tab[data-tab="night"]'); await a.page.waitForTimeout(300);
    await a.page.evaluate(() => { const w = document.querySelector('.en-hbtns'); ['🔕 Race alerts', '🗳️ Poll-closing alerts on'].forEach((t) => { const b = document.createElement('button'); b.className = 'en-chip'; b.textContent = t; w.prepend(b); }); });
    const hb = await a.page.evaluate(() => { const w = document.querySelector('.en-hbtns'), r = w.getBoundingClientRect(); return { right: r.right, W: document.documentElement.clientWidth, sw: w.scrollWidth, cw: w.clientWidth, x: getComputedStyle(w).overflowX }; });
    ok(hb.right <= hb.W + 0.5 && hb.x === 'auto', 'button row ' + JSON.stringify(hb));
    if (hb.sw > hb.cw) { await a.page.evaluate(() => document.querySelector('.en-hbtns').scrollIntoView({ block: 'center' })); await a.page.waitForTimeout(400); const bb = await a.page.locator('.en-hbtns').boundingBox(); const y2 = Math.round(bb.y + bb.height / 2); let x2 = Math.round(bb.x + bb.width * 0.85);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x2, y: y2 }] }); for (let i = 0; i < 10; i++) { x2 -= 20; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 }] }); await a.page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await a.page.waitForTimeout(300);
      ok(await a.page.evaluate(() => document.querySelector('.en-hbtns').scrollLeft) > 10, 'button row did not swipe'); }
    // a sideways swipe across the page itself doesn't move it
    { let px = 300; const py = 600; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] });
      for (let i = 0; i < 12; i++) { px -= 20; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py }] }); await a.page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await a.page.waitForTimeout(300);
      ok(await a.page.evaluate(() => window.scrollX === 0 && document.documentElement.scrollLeft === 0 && visualViewport.offsetLeft === 0), 'page moved sideways'); } ok(z.ev, 'iPhone pinch gesture not blocked'); await a.close();
  });
  await test('polling-miss slider moves seats; rundown lists the night', async () => {
    const a = await open('#path');
    const at = async (v) => { await a.page.evaluate((x) => { const s = document.querySelector('#en-miss input'); s.value = String(x); s.dispatchEvent(new Event('input')); }, v); return a.page.evaluate(() => [...document.querySelectorAll('.en-miss-nums span')].map((e) => Number(e.textContent))); };
    const [d0, r0] = await at(0), [dm, rm] = await at(-8), [dp, rp] = await at(8);
    ok(d0 + r0 === 100 && dm <= d0 && dp >= d0 && dm < dp, 'seats ' + [d0, r0, dm, rm, dp, rp]);
    ok(/Tipping point/.test(await a.page.textContent('#en-miss')), 'tipping point line');
    await a.page.click('.en-tab[data-tab="night"]'); await a.page.waitForTimeout(300);
    const rd = await a.page.evaluate(() => { const d = document.getElementById('en-rundown'); return { open: d.open, hours: d.querySelectorAll('.en-rd-h').length, close: d.querySelectorAll('.en-rd-r').length }; });
    ok(!rd.open && rd.hours === DATA('pollclose').length && rd.close >= 5, 'rundown before Nov 3 ' + JSON.stringify(rd)); await a.close();
    const b = await open('#night', { time: '2026-11-03T22:30:00Z' }); ok(await b.page.evaluate(() => document.getElementById('en-rundown').open), 'rundown should open itself at 4 PM CT Nov 3'); await b.close();
  });
  await test('game night: win chances, badges, group split, challenges, lightning round', async () => {
    const G = 'ABCDEF', mk = (o) => Object.assign({ seats: null, side: {} }, o);
    const db = { users: { u_brad: { name: 'Brad', groups: [G], agreed: 1 } }, picks: {
      u_brad: mk({ picks: { 'SEN-OH': 'd', 'SEN-TX': 'r', 'SEN-IA': 'r', 'GOV-OH': 'd' }, lock: 'SEN-OH' }),
      u_jake: mk({ picks: { 'SEN-OH': 'r', 'SEN-TX': 'd', 'SEN-IA': 'r', 'GOV-OH': 'r' }, lock: 'SEN-TX' }),
      u_sam: mk({ picks: { 'SEN-OH': 'd', 'SEN-TX': 'd', 'SEN-IA': 'd', 'GOV-OH': 'd' }, lock: 'SEN-IA' }) },
      groups: { [G]: { name: 'Boonville crew', owner: 'u_brad' } }, members: { [G]: { u_brad: { name: 'Brad', pickCount: 4 }, u_jake: { name: 'Jake', pickCount: 4 }, u_sam: { name: 'Sam', pickCount: 4 } } }, admin: {}, chat: {} };
    const a = await open('#game', { time: '2026-11-04T01:00:00Z', db, odds: ODDS });
    await a.page.click('text=Sign in with Google'); await a.page.clock.runFor(800);
    await inject(a.page, callJS('SEN-OH', 'D', 'Sherrod Brown')); await a.page.clock.runFor(800);
    await a.page.evaluate(() => document.querySelectorAll('.cb-back').forEach((x) => x.click())); await a.page.clock.runFor(800);
    await a.page.click('.en-seg button:has-text("Leaderboard")'); await a.page.clock.runFor(1200);
    const b = await a.page.evaluate(() => ({ win: [...document.querySelectorAll('.pl-win small')].map((x) => x.textContent), bdg: [...document.querySelectorAll('.pl-rank')].map((r) => r.textContent), split: document.querySelectorAll('.pl-sp').length, chal: document.querySelectorAll('.pl-chal').length }));
    ok(b.win.length === 3, 'win chances ' + b.win); const tot = b.win.reduce((t, x) => t + (parseInt(x) || 0), 0); ok(tot >= 97 && tot <= 103, 'chances add to ~100: ' + b.win);
    ok(b.bdg.some((t) => /Brad/.test(t) && /🔒/.test(t)), 'Brad should have Lock Legend: ' + b.bdg.join(' | '));
    ok(b.split >= 3 && b.chal >= 1, 'group split ' + JSON.stringify(b));
    await a.page.locator('.pl-chal').first().click(); await a.page.clock.runFor(600);
    const bet = await a.page.evaluate((g) => (window.__poolMockDb.chat[g] || []).map((m) => m.text).join(' | '), G);
    ok(/\{bet:[A-Z]+-[A-Z0-9-]+:u_\w+\}/.test(bet), 'challenge message ' + bet);
    await a.page.click('.en-seg button:has-text("Chat")'); await a.page.clock.runFor(500);
    await a.page.click('.pl-chips .en-chip:has-text("Boonville crew")'); await a.page.clock.runFor(900);
    ok(/vs/.test(await a.page.evaluate(() => (document.querySelector('.pl-bet') || {}).textContent || '')), 'challenge card in chat');
    // lightning: the TV asks
    await a.page.click('.en-tab[data-tab="night"]'); await a.page.clock.runFor(300);
    await a.page.click('#tv-open'); await a.page.clock.runFor(800);
    ok(await a.page.isVisible('.en-tv-voice'), 'voice toggle on TV');
    await a.page.click('.en-tv-top button:has-text("Lightning")'); await a.page.clock.runFor(4100);
    const q = await a.page.evaluate((g) => (window.__poolMockDb.chat[g] || []).map((m) => m.text).filter((t) => /\{ql:/.test(t)), G);
    ok(q.length === 1, 'lightning question ' + q); ok(await a.page.evaluate(() => !!document.querySelector('.en-tv .tv-lr')), 'TV lightning slide');
    await a.page.click('.en-tv-x:has-text("Exit")'); await a.page.clock.runFor(300);
    // a question from someone else's TV reaches this phone
    await a.page.evaluate((g) => { const dl = Date.now() + 60000; window.__poolMockDb.chat[g].push({ id: 'zq', uid: 'u_jake', name: 'Jake', text: '⚡ Lightning round: who wins Georgia governor? {ql:GOV-GA:' + dl + '}', at: Date.now() }); window.__poolMockPush(g); }, G);
    await a.page.clock.runFor(500);
    ok(await a.page.isVisible('#lr-sheet'), 'lightning prompt on phone');
    await a.page.locator('#lr-sheet .lr-o').first().click(); await a.page.clock.runFor(4000);
    const ans = await a.page.evaluate((g) => (window.__poolMockDb.chat[g] || []).filter((m) => m.uid === 'u_brad' && /\{qa:GOV-GA:d:/.test(m.text)).length, G);
    ok(ans === 1, 'answer posted');
    ok(!a.errors.length, a.errors.join(' | ')); await a.close();
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
