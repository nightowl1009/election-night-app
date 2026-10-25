// Election Night alerts — no outside libraries (Node's built-in crypto + fetch only).
//  • Storage: this site's private Netlify Blobs store, called directly over HTTPS.
//  • Web Push: RFC 8291 (aes128gcm message encryption) + RFC 8292 (VAPID signing).
// The VAPID key pair is created on first use and kept in the store, so no secret lives in the code.
import crypto from 'node:crypto';

const STORE = 'site:election-alerts';
const SUBJECT = 'https://election-night.netlify.app';

// ---------- Netlify Blobs (same requests the official @netlify/blobs client makes) ----------
function blobsContext() {
  const raw = globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) throw new Error('Netlify Blobs is not available in this environment');
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}
async function blobRequest(method, key, { body, params } = {}) {
  const c = blobsContext();
  const path = '/' + c.siteID + '/' + STORE + (key ? '/' + key : '');
  const auth = { authorization: 'Bearer ' + c.token };
  const ct = body != null ? { 'content-type': 'application/json' } : {};
  if (c.uncachedEdgeURL || c.edgeURL) {
    const u = new URL(path, c.uncachedEdgeURL || c.edgeURL);   // uncached = read-your-writes
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    return fetch(u, { method, headers: { ...auth, ...ct }, body });
  }
  const u = new URL('/api/v1/blobs' + path, c.apiURL || 'https://api.netlify.com');
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  if (!key || method === 'DELETE' || method === 'HEAD') return fetch(u, { method, headers: auth });
  const r = await fetch(u, { method, headers: { ...auth, accept: 'application/json;type=signed-url' } });
  if (r.status !== 200) throw new Error('Blobs ' + method + ' ' + r.status);
  const { url } = await r.json();
  return fetch(url, { method, headers: ct, body });
}
export const blobs = {
  async get(key) { const r = await blobRequest('GET', key); if (r.status === 404) return null; if (!r.ok) throw new Error('Blobs get ' + r.status); return r.json(); },
  async set(key, value) { const r = await blobRequest('PUT', key, { body: JSON.stringify(value) }); if (!r.ok) throw new Error('Blobs set ' + r.status); },
  async del(key) { const r = await blobRequest('DELETE', key); if (!r.ok && r.status !== 404) throw new Error('Blobs delete ' + r.status); },
  async keys(prefix) {
    const out = []; let cursor = null;
    for (let i = 0; i < 50; i++) {
      const params = { prefix }; if (cursor) params.cursor = cursor;
      const r = await blobRequest('GET', null, { params });
      if (r.status === 404 || r.status === 204) break;
      if (!r.ok) throw new Error('Blobs list ' + r.status);
      const page = await r.json();
      (page.blobs || []).forEach(b => b && b.key && out.push(b.key));
      if (!page.next_cursor) break; cursor = page.next_cursor;
    }
    return out;
  },
};

// ---------- base64url helpers ----------
export const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// ---------- VAPID keys ----------
export function makeVapid() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { jwk, publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)])) };
}
let vapidCache = null;
export async function vapid() {
  if (vapidCache) return vapidCache;
  let k = await blobs.get('vapid');
  if (!k || !k.jwk || !k.publicKey) {
    const fresh = makeVapid();
    const again = await blobs.get('vapid');             // another request may have just made one
    if (again && again.publicKey) k = again; else { await blobs.set('vapid', fresh); k = (await blobs.get('vapid')) || fresh; }
  }
  vapidCache = k; return k;
}
export function vapidHeader(endpoint, k, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: SUBJECT }));
  const key = crypto.createPrivateKey({ key: k.jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + k.publicKey;
}

// ---------- RFC 8291 message encryption (aes128gcm) ----------
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
export function encrypt(payload, p256dh, auth, { salt = crypto.randomBytes(16), ecdh = null } = {}) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const as = ecdh || crypto.createECDH('prime256v1'); if (!ecdh) as.generateKeys();
  const asPublic = as.getPublicKey();
  const shared = as.computeSecret(uaPublic);
  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

// ---------- subscriptions ----------
const HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)fcm\.googleapis\.com$/, /(^|\.)android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.api\.chrome\.com$/];
export function cleanSub(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return null;
  let u; try { u = new URL(sub.endpoint); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !HOSTS.some(h => h.test(u.hostname))) return null;
  const k = sub.keys || {};
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length !== 16) return null;
  return { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}
export const subKey = (endpoint) => 'sub-' + crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Send one alert. Returns 'ok', 'gone' (phone unsubscribed — forget it) or 'error'.
export async function send(sub, payload, k) {
  try {
    const body = encrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
    const r = await fetch(sub.endpoint, { method: 'POST', body, headers: { authorization: vapidHeader(sub.endpoint, k), ttl: '10800', urgency: 'high', 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream' } });
    if (r.status === 404 || r.status === 410) return 'gone';
    return r.ok ? 'ok' : 'error:' + r.status;
  } catch (e) { return 'error'; }
}
