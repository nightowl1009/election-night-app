// Checks every data file the app reads: valid JSON, the columns the page needs, and sane values.
'use strict';
const fs = require('fs'), path = require('path');
const D = path.resolve(__dirname, '..', 'data');
let fails = 0, warns = 0;
const bad = (m) => { fails++; console.log('  ✗ ' + m); }, warn = (m) => { warns++; console.log('  ! ' + m); };
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(D, f + '.json'), 'utf8')); } catch (e) { bad(f + '.json does not parse: ' + e.message); return null; } };
const need = { senate: ['id', 'state', 'held', 'cand_d', 'cand_r'], governor: ['id', 'state', 'held'], house: ['id', 'held', 'rating'], results: ['race', 'status', 'winner', 'winner_party'], pollclose: ['order', 'close_utc'], news: ['nid', 'date', 'source', 'url', 'tag', 'headline', 'summary'], overview: ['key', 'value'], local: ['lid', 'title'], changes: ['cid', 'date', 'text'], spending: ['id', 'kind', 'label', 'source', 'url'], ads: ['id', 'party', 'sponsor', 'title'] };
fs.readdirSync(D).filter((f) => f.endsWith('.json')).forEach((f) => load(f.replace(/\.json$/, '')));
Object.entries(need).forEach(([f, cols]) => {
  const rows = load(f); if (!rows) return;
  if (!Array.isArray(rows) || !rows.length) return bad(f + ': expected a non-empty list');
  rows.forEach((r, i) => cols.forEach((c) => { if (!(c in r)) bad(f + ' row ' + i + ' missing ' + c); }));
});
const res = load('results') || [];
const ids = new Set(); res.forEach((r) => { if (ids.has(r.race)) bad('results: duplicate race ' + r.race); ids.add(r.race); if (r.winner_party && !/^[DRIYN]$/.test(r.winner_party)) bad('results: bad winner_party for ' + r.race); if (r.winner_party && !r.winner) bad('results: ' + r.race + ' has a party but no winner'); });
const news = load('news') || [];
const TAGS = ['National', 'Senate', 'Governors', 'House', 'Missouri'];
news.forEach((n) => { if (!/^https:\/\//.test(n.url)) bad('news ' + n.nid + ': url not https'); if (!TAGS.includes(n.tag)) bad('news ' + n.nid + ': tag ' + n.tag); });
const per = {}; news.forEach((n) => { const s = String(n.source).replace(/\s*\(.*\)$/, ''); per[s] = (per[s] || 0) + 1; });
Object.entries(per).filter(([, c]) => c > 4).forEach(([s, c]) => warn('news: ' + c + ' stories from ' + s + ' (limit is 4)'));
(load('spending') || []).forEach((r) => { if (!/^https:\/\//.test(r.url)) bad('spending ' + r.id + ': source link missing'); if (r.kind !== 'fact' && !(typeof r.value === 'number' && r.value > 0)) bad('spending ' + r.id + ': value'); if (r.share_d != null && !(r.share_d >= 0 && r.share_d <= 1)) bad('spending ' + r.id + ': share_d'); });
(load('ads') || []).forEach((a) => { if (!/^[\w-]{11}$/.test(a.id)) bad('ads: bad YouTube id ' + a.id); });
const meta = load('meta'); if (meta && isNaN(Date.parse(meta.updated))) bad('meta.updated is not a date');
console.log(fails ? '  data: ' + fails + ' problem(s)' : '  ✓ data files OK' + (warns ? ' (' + warns + ' warning(s))' : ''));
process.exit(fails ? 1 : 0);
