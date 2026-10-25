// POST {subscription, picks?, lock?, name?} → save this phone for alerts (picks personalize race-call alerts)
// DELETE {subscription} → turn alerts off for this phone
import { blobs, cleanSub, subKey, json } from '../lib/push.mjs';
const KEY = /^(SEN|GOV|HOU|MO)-[A-Z0-9-]{1,12}$/;
export default async (req) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'method' }, 405);
  let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const sub = cleanSub(body && body.subscription); if (!sub) return json({ error: 'bad subscription' }, 400);
  const id = subKey(sub.endpoint);
  try {
    if (req.method === 'DELETE') { await blobs.del(id); return json({ ok: true }); }
    const picks = {};
    if (body.picks && typeof body.picks === 'object') Object.entries(body.picks).slice(0, 60).forEach(([k, v]) => { if (KEY.test(k) && (v === 'd' || v === 'r')) picks[k] = v; });
    const lock = typeof body.lock === 'string' && KEY.test(body.lock) ? body.lock : null;
    const name = typeof body.name === 'string' ? body.name.slice(0, 40) : '';
    await blobs.set(id, { sub, picks, lock, name, at: Date.now() });
    return json({ ok: true });
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
};
