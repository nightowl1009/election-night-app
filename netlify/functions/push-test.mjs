// POST {subscription} → send a test alert to just this phone
import { vapid, blobs, cleanSub, subKey, send, json } from '../lib/push.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const sub = cleanSub(body && body.subscription); if (!sub) return json({ error: 'bad subscription' }, 400);
  try {
    const rec = await blobs.get(subKey(sub.endpoint)); if (!rec) return json({ error: 'not subscribed' }, 404);
    const r = await send(rec.sub, { title: 'Alerts are on ✓', body: 'You’ll get a buzz when races are called on election night.', tag: 'test', url: '/' }, await vapid());
    return json({ ok: r === 'ok', result: r });
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
};
