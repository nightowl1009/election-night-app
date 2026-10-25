// Shared helpers for Election Night alerts (Web Push).
// The VAPID key pair is created on first use and kept in this site's private Netlify Blobs store,
// so no secret lives in the code. Subscriptions are stored there too.
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

export const store = () => getStore({ name: 'push', consistency: 'strong' });

export async function vapid() {
  const s = store();
  let k = await s.get('vapid', { type: 'json' });
  if (!k || !k.publicKey || !k.privateKey) {
    const fresh = webpush.generateVAPIDKeys();
    const again = await s.get('vapid', { type: 'json' });   // another request may have just made one
    if (again && again.publicKey) k = again; else { await s.setJSON('vapid', fresh); k = fresh; }
  }
  webpush.setVapidDetails('https://election-night.netlify.app', k.publicKey, k.privateKey);
  return k;
}

// Only real browser push services
const HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)fcm\.googleapis\.com$/, /(^|\.)android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.api\.chrome\.com$/];
export function cleanSub(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return null;
  let u; try { u = new URL(sub.endpoint); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !HOSTS.some(h => h.test(u.hostname))) return null;
  const k = sub.keys || {};
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) return null;
  return { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

export async function idFor(endpoint) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(b)).slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Send one alert; returns 'gone' when the phone unsubscribed (so we can forget it)
export async function send(sub, payload) {
  try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3 * 3600, urgency: 'high' }); return 'ok'; }
  catch (e) { return e && (e.statusCode === 404 || e.statusCode === 410) ? 'gone' : 'error'; }
}
