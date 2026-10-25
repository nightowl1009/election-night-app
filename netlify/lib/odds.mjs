// Kalshi prediction-market odds that Democrats win each chamber, as a time series for the app's chart.
// Kalshi's market data is public (no login). Before election night: the last 14 days, hourly.
// From 4 PM CT on Nov 3: the night so far, minute by minute (thinned to ≤ 240 points).
import { blobs } from './push.mjs';

const BASES = ['https://api.elections.kalshi.com/trade-api/v2', 'https://external-api.kalshi.com/trade-api/v2'];
export const MARKETS = { senate: ['CONTROLS', 'CONTROLS-2026-D'], house: ['CONTROLH', 'CONTROLH-2026-D'] };
export const NIGHT_START = Date.UTC(2026, 10, 3, 22, 0, 0) / 1000;  // 4 PM CT, Nov 3
const NIGHT_END = Date.UTC(2026, 10, 4, 18, 0, 0) / 1000;           // noon CT, Nov 4

const num = (v) => (v == null || v === '' ? null : typeof v === 'string' ? parseFloat(v) : Number(v));
// Kalshi has sent prices both as cents (65) and as dollar strings ("0.6500"); always return 0–1
const norm = (v) => { v = num(v); if (v == null || !isFinite(v)) return null; if (v > 1.0001) v /= 100; return v >= 0 && v <= 1 ? v : null; };
const pick = (o, k) => (o ? norm(o[k + '_dollars'] ?? o[k]) : null);
export function candlePrice(c) {
  const p = c.price || {};
  let v = pick(p, 'close');
  if (v == null) {
    const b = pick(c.yes_bid || c.bid, 'close'), a = pick(c.yes_ask || c.ask, 'close');
    if (b != null && a != null) v = (a + b) / 2;
  }
  return v;
}
export function marketPrice(m) {
  if (!m) return null;
  const last = norm(m.last_price_dollars ?? m.last_price);
  const b = norm(m.yes_bid_dollars ?? m.yes_bid), a = norm(m.yes_ask_dollars ?? m.yes_ask);
  if (b != null && a != null && a >= b && a - b <= 0.1) return (a + b) / 2;   // tight market: use the midpoint
  return last;
}
export function thin(series, max) {
  if (series.length <= max) return series;
  const step = series.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(series[Math.floor(i * step)]);
  out[out.length - 1] = series[series.length - 1];
  return out;
}
async function getJSON(path, fetchFn) {
  let last = null;
  for (const b of BASES) {
    try { const r = await fetchFn(b + path, { headers: { Accept: 'application/json', 'User-Agent': 'election-night-app' } }); if (r.ok) return await r.json(); last = 'HTTP ' + r.status; }
    catch (e) { last = String(e && e.message || e); }
  }
  throw new Error(last || 'unavailable');
}
export async function buildOdds(nowMs = Date.now(), fetchFn = fetch) {
  const now = Math.floor(nowMs / 1000);
  const night = now >= NIGHT_START;
  const end = Math.min(now, night ? NIGHT_END : now);
  const start = night ? NIGHT_START : end - 14 * 86400;
  const period = night ? 1 : 60;
  const out = { ok: true, range: night ? 'night' : 'weeks', series: {}, now: {}, at: nowMs };
  for (const [k, [series, ticker]] of Object.entries(MARKETS)) {
    try {
      const j = await getJSON(`/series/${series}/markets/${ticker}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=${period}`, fetchFn);
      let lastV = null; const s = [];
      (j.candlesticks || []).forEach(c => { const v = candlePrice(c); if (v != null) lastV = v; if (lastV != null && c.end_period_ts) s.push([Number(c.end_period_ts), Math.round(lastV * 1000) / 1000]); });
      out.series[k] = thin(s, 240);
    } catch (e) { out.series[k] = []; }
    try { const m = await getJSON(`/markets/${ticker}`, fetchFn); const v = marketPrice(m.market || m); if (v != null) out.now[k] = Math.round(v * 1000) / 1000; } catch (e) { /* the series' last point stands in */ }
  }
  out.ok = Object.values(out.series).some(s => s.length >= 2);
  return out;
}
// one shared copy for everyone, refreshed at most once a minute; the last good copy covers Kalshi hiccups
export async function odds(nowMs = Date.now(), fetchFn = fetch) {
  let cached = null; try { cached = await blobs.get('odds'); } catch (e) { /* none yet */ }
  if (cached && nowMs - cached.at < 55000) return cached;
  const fresh = await buildOdds(nowMs, fetchFn).catch(() => null);
  if (fresh && fresh.ok) { try { await blobs.set('odds', fresh); } catch (e) { /* cache only */ } return fresh; }
  return cached ? { ...cached, stale: true } : { ok: false };
}
