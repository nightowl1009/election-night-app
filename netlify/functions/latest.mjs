// GET            → { sha }  the newest data version (cheap; phones poll this)
// GET ?sha=<sha> → { sha, data: { results: [...], senate: [...], ..., meta: {...} } }  every data file for that version
import { latestSha, bundle } from '../lib/latest.mjs';
const out = (obj, status, cache) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });
export default async (req) => {
  const want = new URL(req.url).searchParams.get('sha');
  if (want && /^[0-9a-f]{40}$/.test(want)) {
    const b = await bundle(want);
    if (!b) return out({ error: 'unavailable' }, 503, 'no-store');
    if (!b.complete) return out(b, 200, 'no-store'); // partial: phones fill the gaps and ask again next time
    const r = out(b, 200, 'public, max-age=31536000, immutable'); // a complete version never changes
    r.headers.set('Netlify-CDN-Cache-Control', 'public, max-age=31536000, immutable');
    return r;
  }
  const sha = await latestSha();
  return sha ? out({ sha }, 200, 'public, max-age=10') : out({ error: 'unavailable' }, 503, 'no-store');
};
