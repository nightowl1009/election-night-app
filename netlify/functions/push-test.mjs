// POST {subscription} → send a test alert to just this phone
import { vapid, blobs, cleanSub, subKey, send, json } from '../lib/push.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const sub = cleanSub(body && body.subscription); if (!sub) return json({ error: 'bad subscription' }, 400);
  try {
    const id = subKey(sub.endpoint), rec = await blobs.get(id); if (!rec) return json({ error: 'not subscribed' }, 404);
    // POST {subscription, practice: {title, body}} → a practice-run alert to this same phone (at most one every 8 seconds)
    const pr = body.practice;
    let msg = { title: 'Alerts are on ✓', body: 'You’ll get a buzz when races are called on election night.', tag: 'test', url: '/' };
    if (pr && typeof pr === 'object') {
      if (rec.lastPractice && Date.now() - rec.lastPractice < 8000) return json({ ok: false, result: 'slow down' }, 429);
      const clip = (t, n) => String(t || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
      msg = { title: 'Practice · ' + clip(pr.title, 60), body: clip(pr.body, 180), tag: 'practice-' + Date.now(), url: '/#game' };
      rec.lastPractice = Date.now(); await blobs.set(id, rec);
    }
    const r = await send(rec.sub, msg, await vapid());
    return json({ ok: r === 'ok', result: r });
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
};
