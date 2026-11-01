// Checks every data file the app reads: valid JSON, the columns the page needs, and sane values.
'use strict';
const fs = require('fs'), path = require('path');
const D = path.resolve(__dirname, '..', 'data');
let fails = 0, warns = 0;
const bad = (m) => { fails++; console.log('  ✗ ' + m); }, warn = (m) => { warns++; console.log('  ! ' + m); };
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(D, f + '.json'), 'utf8')); } catch (e) { bad(f + '.json does not parse: ' + e.message); return null; } };
const need = { senate: ['id', 'state', 'held', 'cand_d', 'cand_r'], governor: ['id', 'state', 'held'], house: ['id', 'held', 'rating'], results: ['race', 'status', 'winner', 'winner_party'], pollclose: ['order', 'close_utc'], news: ['nid', 'date', 'source', 'url', 'tag', 'headline', 'summary'], overview: ['key', 'value'], local: ['lid', 'title'], changes: ['cid', 'date', 'text'], spending: ['id', 'kind', 'label', 'source', 'url'], ads: ['id', 'party', 'sponsor', 'title'], economy: ['id', 'label', 'value', 'source', 'url'] };
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
// The totals on the scoreboard must tie to the rows underneath them (a rating changed in one place but not the other shows up here)
{
  const ov = {}; (load('overview') || []).forEach((o) => { ov[o.key] = Number(o.value); });
  const hs = load('house') || [], hl = load('house_lean') || [], cnt = (r) => hs.filter((x) => x.rating === r).length;
  const eq = (what, a, b) => { if (a !== b) bad('totals: ' + what + ' is ' + a + ' but the rows say ' + b); };
  eq('overview house_toss', ov.house_toss, cnt('Toss-up')); eq('overview cook_house_tossups', ov.cook_house_tossups, cnt('Toss-up'));
  eq('overview house_d_fav (Solid/Likely D + Lean D)', ov.house_d_fav, ov.house_d_safe + cnt('Lean D')); eq('overview house_r_fav (Solid/Likely R + Lean R)', ov.house_r_fav, ov.house_r_safe + cnt('Lean R'));
  eq('House seats by rating (D fav + toss-ups + R fav)', ov.house_d_fav + ov.house_toss + ov.house_r_fav, 435);
  eq('House seats today (D + R + Ind + vacant)', ov.house_d_now + ov.house_r_now + (ov.house_i_now || 0) + (ov.house_vacant || 0), 435);
  eq('Senate seats today (D + R)', ov.senate_d_now + ov.senate_r_now, 100);
  hl.forEach((r) => { const m = hs.find((x) => x.id === r.id); if (!m) bad('house_lean ' + r.id + ' is not in house.json'); else if (m.rating !== r.rating) bad('house_lean ' + r.id + ' is ' + r.rating + ' but house.json says ' + m.rating); });
  hs.filter((x) => x.rating !== 'Toss-up').forEach((x) => { if (!hl.some((r) => r.id === x.id)) bad('house.json ' + x.id + ' (' + x.rating + ') is missing from house_lean.json'); });
  const rid = new Set(res.map((r) => r.race));
  [['senate', 'SEN-'], ['governor', 'GOV-'], ['house', 'HOU-']].forEach(([f, pre]) => (load(f) || []).forEach((r) => { if (!rid.has(pre + r.id)) bad('results.json has no row for ' + pre + r.id); }));
}
const meta = load('meta'); if (meta && isNaN(Date.parse(meta.updated))) bad('meta.updated is not a date');
console.log(fails ? '  data: ' + fails + ' problem(s)' : '  ✓ data files OK' + (warns ? ' (' + warns + ' warning(s))' : ''));
process.exit(fails ? 1 : 0);
