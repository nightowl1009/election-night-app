// Tests the live-data server function with GitHub stubbed out (no network, no Netlify needed).
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let api = 0, raw = 0, apiStatus = 200, missing = new Set();
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.includes('api.github.com')) { api++; const h = (opt.headers || {})['If-None-Match']; if (h === '"e1"' && apiStatus === 200) return new Response(null, { status: 304 }); return apiStatus === 200 ? new Response(JSON.stringify({ sha: 'f'.repeat(40) }), { headers: { etag: '"e1"' } }) : new Response('x', { status: apiStatus }); }
  if (u.includes('raw.githubusercontent.com')) { raw++; const f = u.split('/data/')[1].replace('.json', ''); if (missing.has(f)) return new Response('nf', { status: 404 }); return new Response(fs.readFileSync(path.join(ROOT, 'data', f + '.json'))); }
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
process.exit(fails ? 1 : 0);
