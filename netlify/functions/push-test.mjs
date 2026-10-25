// POST {subscription} → send a test alert to just this phone
import { vapid, store, cleanSub, idFor, send, json } from '../lib/push.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const sub = cleanSub(body && body.subscription); if (!sub) return json({ error: 'bad subscription' }, 400);
  const rec = await store().get('sub/' + await idFor(sub.endpoint), { type: 'json' });
  if (!rec) return json({ error: 'not subscribed' }, 404);
  await vapid();
  const r = await send(rec.sub, { title: 'Alerts are on ✓', body: 'You’ll get a buzz when races are called on election night.', tag: 'test', url: '/' });
  return json({ ok: r === 'ok', result: r });
};
