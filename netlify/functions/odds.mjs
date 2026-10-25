// GET → { ok, range: 'weeks'|'night', series: { senate: [[unixSec, chanceDem]], house: [...] }, now: { senate, house }, at }
// Kalshi prices for "Democrats win the Senate/House"; the CDN shares one copy a minute across every phone.
import { odds } from '../lib/odds.mjs';
export default async () => {
  const o = await odds();
  const r = new Response(JSON.stringify(o), { status: o.ok ? 200 : 503, headers: { 'content-type': 'application/json', 'cache-control': o.ok ? 'public, max-age=30' : 'no-store' } });
  if (o.ok) r.headers.set('Netlify-CDN-Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  return r;
};
