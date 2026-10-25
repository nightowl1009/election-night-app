// Tests the live-data server function with GitHub stubbed out (no network, no Netlify needed).
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let api = 0, raw = 0, apiStatus = 200, missing = new Set(), kalshi = 0, kalshiDown = false, lastPeriod = null;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.includes('api.github.com')) { api++; const h = (opt.headers || {})['If-None-Match']; if (h === '"e1"' && apiStatus === 200) return new Response(null, { status: 304 }); return apiStatus === 200 ? new Response(JSON.stringify({ sha: 'f'.repeat(40) }), { headers: { etag: '"e1"' } }) : new Response('x', { status: apiStatus }); }
  if (u.includes('raw.githubusercontent.com')) { raw++; const f = u.split('/data/')[1].replace('.json', ''); if (missing.has(f)) return new Response('nf', { status: 404 }); return new Response(fs.readFileSync(path.join(ROOT, 'data', f + '.json'))); }
  if (u.includes('kalshi.com')) { kalshi++; if (kalshiDown) return new Response('down', { status: 502 });
    if (u.includes('/candlesticks')) { const q = new URL(u).searchParams; lastPeriod = q.get('period_interval'); const st = Number(q.get('start_ts')); const cs = []; for (let i = 1; i <= 400; i++) cs.push({ end_period_ts: st + i * 60, price: i % 7 === 0 ? { close: null } : (i % 2 ? { close: 61 } : { close_dollars: '0.6300' }) }); return new Response(JSON.stringify({ candlesticks: cs })); }
    return new Response(JSON.stringify({ market: { last_price: 66, yes_bid: 64, yes_ask: 66 } })); }
  throw new Error('unexpected fetch ' + u); // Blobs calls fail without Netlify — the code must cope
};
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const fn = (await import(path.join(ROOT, 'netlify/functions/latest.mjs'))).default;
const lib = await import(path.join(ROOT, 'netlify/lib/latest.mjs'));
let r = await fn(new Request('https://x/.netlify/functions/latest')); let j = await r.json();
ok(r.status === 200 && j.sha === 'f'.repeat(40) && /max-age=10/.test(r.headers.get('cache-control')), 'latest version lookup');
await fn(new Request('https://x/.netlify/functions/latest')); ok(api === 1, 'lookups within 15 s reuse the cached answer');
missing = new Set(['mood']);
r = await fn(new Request('https://x/.netlify/functions/latest?sha=' + 'f'.repeat(40))); j = await r.json();
ok(r.status === 200 && j.complete === false && r.headers.get('cache-control') === 'no-store', 'a partial bundle is never cached');
missing = new Set();
r = await fn(new Request('https://x/.netlify/functions/latest?sha=' + 'f'.repeat(40))); j = await r.json();
ok(j.complete === true && lib.FILES.every((f) => f in j.data) && /immutable/.test(r.headers.get('cache-control')), 'a complete bundle has every file and is cached for good');
const before = raw; await fn(new Request('https://x/.netlify/functions/latest?sha=' + 'f'.repeat(40))); ok(raw === before, 'a complete bundle is built once per version');
ok(Array.isArray(await lib.dataFile('results')), 'alert sender can read results');
const filesInApp = fs.readFileSync(path.join(ROOT, 'dash-lite.js'), 'utf8').match(/const DATASETS = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1)).filter((f) => f !== 'usmap');
ok(filesInApp.every((f) => lib.FILES.includes(f)), 'every dataset the app shows is in the live bundle');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); ok(filesInApp.every((f) => sw.includes("'" + f + "'")), 'every dataset is cached for offline use');
// betting odds
const od = await import(path.join(ROOT, 'netlify/lib/odds.mjs'));
ok(od.candlePrice({ price: { close: 65 } }) === 0.65 && od.candlePrice({ price: { close_dollars: '0.6500' } }) === 0.65 && od.candlePrice({ price: { close: null }, yes_bid: { close: 60 }, yes_ask: { close: 64 } }) === 0.62 && od.candlePrice({ price: {} }) === null, 'odds prices: cents, dollars, bid/ask midpoint, missing');
let o = await od.buildOdds(Date.UTC(2026, 9, 25, 19));
ok(o.ok && o.range === 'weeks' && lastPeriod === '60' && o.series.senate.length <= 240 && o.series.senate.every((p) => p[1] > 0.6 && p[1] < 0.64) && o.now.senate === 0.65, 'odds before election night: hourly, thinned, gaps carried, live midpoint');
o = await od.buildOdds(Date.UTC(2026, 10, 4, 2));
ok(o.range === 'night' && lastPeriod === '1' && o.series.house[0][0] > od.NIGHT_START, 'odds on election night: minute by minute from 4 PM CT');
const ofn = (await import(path.join(ROOT, 'netlify/functions/odds.mjs'))).default;
r = await ofn(); j = await r.json(); ok(r.status === 200 && j.ok && /max-age=60/.test(r.headers.get('netlify-cdn-cache-control') || ''), 'odds function shares one copy a minute');
kalshiDown = true; r = await ofn(); ok(r.status === 503 && r.headers.get('cache-control') === 'no-store', 'odds function reports Kalshi outages without caching them');
process.exit(fails ? 1 : 0);
