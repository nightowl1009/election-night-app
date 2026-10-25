/* Election Night 2026 — race-call alerts (Web Push, app only).
   iPhone: works once the app is on the Home Screen (iOS 16.4+). Android/desktop: works in the browser.
   Your phone's push address — plus your picks, if you play, to personalize alerts — is kept with Netlify, the app's host. */
(function () {
  const FN = '/.netlify/functions/';
  const LS = 'en-push-on';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let last = {};   // latest picks we were handed, to personalize alerts

  const toast = (t, ms) => { const s = document.createElement('div'); s.className = 'pl-toast'; s.textContent = t; document.body.append(s); setTimeout(() => s.remove(), ms || 3200); };
  const b64 = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  async function reg() { return navigator.serviceWorker.ready; }
  async function current() { if (!supported) return null; const r = await reg(); return r.pushManager.getSubscription(); }
  async function post(path, body, method) { const r = await fetch(FN + path, { method: method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('Alerts server said ' + r.status); return r.json(); }

  function why() {
    if (ios && !standalone) return 'On iPhone, alerts work once the app is on your Home Screen: tap Share → Add to Home Screen, open it from there, then turn alerts on.';
    if (!supported) return 'This browser can’t do alerts. On iPhone, install the app to your Home Screen (iOS 16.4 or newer).';
    if (Notification.permission === 'denied') return 'Notifications are blocked for this app. Turn them on in your phone’s Settings → Notifications → Election Night, then try again.';
    return '';
  }
  async function enable() {
    const w = why(); if (w) { toast(w, 6000); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('No problem — alerts stay off.'); return false; }
    try {
      const { publicKey } = await (await fetch(FN + 'push-key', { cache: 'no-store' })).json();
      const r = await reg();
      let sub = await r.pushManager.getSubscription();
      if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
      await post('push-subscribe', Object.assign({ subscription: sub.toJSON() }, last));
      store.set(LS, '1'); paint();
      post('push-test', { subscription: sub.toJSON() }).catch(() => {});
      toast('Alerts are on ✓ — a test alert is on its way.');
      return true;
    } catch (e) { console.error(e); toast('Couldn’t turn on alerts: ' + (e && e.message || e)); return false; }
  }
  async function disable() {
    try { const sub = await current(); if (sub) { await post('push-subscribe', { subscription: sub.toJSON() }, 'DELETE').catch(() => {}); await sub.unsubscribe(); } } catch (e) { console.error(e); }
    store.set(LS, '0'); paint(); toast('Alerts are off.');
  }
  // the game hands us your picks so race-call alerts can say "you called it"
  let syncT = null;
  function sync(doc) {
    last = { picks: (doc && doc.picks) || {}, lock: (doc && doc.lock) || null, name: (doc && doc.name) || '' };
    if (store.get(LS) !== '1') return;
    clearTimeout(syncT);
    syncT = setTimeout(async () => { try { const sub = await current(); if (sub) await post('push-subscribe', Object.assign({ subscription: sub.toJSON() }, last)); } catch (e) { console.error(e); } }, 1500);
  }
  const isOn = () => store.get(LS) === '1';
  // practice run: a real alert through the alert server to this phone only
  async function practice(title, body) {
    if (!isOn()) return false;
    try { const sub = await current(); if (!sub) return false; const r = await post('push-test', { subscription: sub.toJSON(), practice: { title, body } }); return !!(r && r.ok); }
    catch (e) { return false; }
  }
  function paint() {
    document.querySelectorAll('.en-alert-btn').forEach(b => { b.textContent = isOn() ? '🔔 Alerts on' : '🔕 Race alerts'; b.setAttribute('aria-pressed', String(isOn())); });
  }
  function addButton() {
    const tv = document.getElementById('tv-open');
    if (!tv || document.getElementById('alert-btn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'alert-btn'; b.className = 'en-chip en-alert-btn';
    b.addEventListener('click', () => (isOn() ? disable() : enable()));
    const wrap = document.createElement('div'); wrap.className = 'en-hbtns'; tv.replaceWith(wrap); wrap.append(b, tv);
    paint();
  }
  // keep the saved subscription in step with the phone (it can expire or be revoked)
  async function check() { if (!supported || !isOn()) return; try { const sub = await current(); if (!sub || Notification.permission !== 'granted') { store.set(LS, '0'); paint(); } } catch (e) {} }

  // Alerts appear only once the alert server is live (it answers with a public key)
  let ready = false;
  async function probe() { try { const r = await fetch(FN + 'push-key', { cache: 'no-store' }); const j = r.ok ? await r.json() : null; ready = !!(j && j.publicKey); } catch (e) { ready = false; } if (ready) { addButton(); check(); } }
  window.enPush = { enable, disable, sync, isOn, why, practice, ready: () => ready, supported: () => supported && !(ios && !standalone) };
  const boot = () => { probe(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
