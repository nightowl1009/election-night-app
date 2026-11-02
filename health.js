/* Health check (app only, for the owner): a private panel that tests everything election night depends on.
   Open it by tapping the "Data updated …" line at the bottom of the page 5 times, or add ?health to the address.
   It only reads: it makes the same requests the app already makes, shows what came back, and never sends anything anywhere
   except to this app's own host. Buttons: re-check, copy a text report, refresh data, clear the app's cache and reload. */
(function () {
  'use strict';
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const DATASETS = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'usmap', 'earlyvote', 'local', 'changes', 'spending', 'economy'];
  const errs = [];
  const note = (m) => { errs.push(new Date().toLocaleTimeString('en-US') + '  ' + String(m).slice(0, 200)); if (errs.length > 12) errs.shift(); };
  window.addEventListener('error', (e) => note((e.message || 'error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  window.addEventListener('unhandledrejection', (e) => note('promise: ' + (e.reason && (e.reason.message || e.reason))));

  const ago = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 90 ? m + ' min' : m < 2880 ? (m / 60).toFixed(1) + ' hours' : Math.round(m / 1440) + ' days'; };
  async function timed(url, ms) {
    const t0 = performance.now(), c = new AbortController(), to = setTimeout(() => c.abort(), ms || 8000);
    try { const r = await fetch(url, { signal: c.signal, cache: 'no-store' }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* not JSON */ } return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0), j, date: r.headers.get('date') }; }
    catch (e) { return { ok: false, status: 0, ms: Math.round(performance.now() - t0), err: e && e.name === 'AbortError' ? 'timed out' : String(e && e.message || e) }; }
    finally { clearTimeout(to); }
  }
  const row = (st, label, detail) => ({ st, label, detail });   // st: ok | warn | bad | info

  async function runChecks() {
    const out = []; const dd = (k) => window.dash && window.dash.data && window.dash.data(k);
    // 1. data freshness + datasets
    const at = window.__enMetaAt; const age = at ? Date.now() - at : null;
    out.push(row(age == null ? 'warn' : age < 20 * 60e3 ? 'ok' : age < 90 * 60e3 ? 'warn' : 'bad', 'Data bundle', age == null ? 'No update time yet' : 'Updated ' + ago(age) + ' ago (' + new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ')'));
    const bad = DATASETS.filter((k) => { const d = dd(k); return !d || d.status !== 'ok'; });
    out.push(row(bad.length ? 'bad' : 'ok', 'Datasets loaded', bad.length ? bad.length + ' not loaded: ' + bad.join(', ') : 'All ' + DATASETS.length + ' loaded'));
    const res = dd('results'), rr = res && res.status === 'ok' ? res.data : [];
    const called = rr.filter((r) => r.winner_party), reporting = rr.filter((r) => Number(r.reporting) > 0), last = called.map((r) => r.called_at).filter(Boolean).sort().pop();
    out.push(row(rr.length ? 'info' : 'warn', 'Results', rr.length ? rr.length + ' races tracked · ' + reporting.length + ' reporting · ' + called.length + ' called' + (last ? ' · last call ' + new Date(last).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '') : 'No results rows'));
    // 2. server functions (parallel)
    const [lat, od, pk] = await Promise.all([timed('/.netlify/functions/latest?t=' + Date.now()), timed('/.netlify/functions/odds'), timed('/.netlify/functions/push-key')]);
    out.push(row(lat.ok && lat.j && lat.j.sha ? (lat.ms > 3000 ? 'warn' : 'ok') : 'bad', 'Live data feed', lat.ok && lat.j && lat.j.sha ? 'Reachable · version ' + lat.j.sha.slice(0, 7) + ' · ' + lat.ms + ' ms' : 'Not reachable (' + (lat.err || 'HTTP ' + lat.status) + '). The app falls back to its saved data'));
    const so = od.j && od.j.now ? od.j.now : null;
    out.push(row(od.ok && od.j && od.j.ok ? 'ok' : 'warn', 'Betting odds (Kalshi)', od.ok && od.j && od.j.ok ? 'Working' + (so ? ' · Dem Senate ' + Math.round(so.senate * 100) + '% · House ' + Math.round(so.house * 100) + '%' : '') + ' · ' + od.ms + ' ms' : 'Unavailable (' + (od.err || 'HTTP ' + od.status) + '). The chart hides itself; nothing else is affected'));
    out.push(row(pk.ok && pk.j && (pk.j.key || pk.j.publicKey || pk.j.k) ? 'ok' : 'warn', 'Alerts server', pk.ok ? 'Push key served · ' + pk.ms + ' ms' : 'Push key not reachable (' + (pk.err || 'HTTP ' + pk.status) + '). Race-call alerts may not subscribe'));
    // 3. clock
    const sd = [lat, od, pk].map((x) => x.date && Date.parse(x.date)).find(Boolean);
    if (sd) { const skew = Date.now() - sd; out.push(row(Math.abs(skew) > 90e3 ? 'bad' : Math.abs(skew) > 30e3 ? 'warn' : 'ok', 'Phone clock', Math.abs(skew) < 5e3 ? 'In sync with the server' : (skew > 0 ? 'Fast' : 'Slow') + ' by ' + Math.round(Math.abs(skew) / 1000) + ' s. Countdowns and the poll-closing banner follow this clock')); }
    // 4. this device
    let swInfo = 'Not supported', swSt = 'warn';
    if ('serviceWorker' in navigator) {
      try { const reg = await navigator.serviceWorker.getRegistration(); const keys = window.caches ? await caches.keys() : []; swInfo = (reg && reg.active ? 'Active' : reg ? 'Installing' : 'Not registered') + (navigator.serviceWorker.controller ? ' · controlling this page' : ' · not controlling yet (reload once)') + (keys.length ? ' · cache ' + keys.filter((k) => /^election-night/.test(k)).join(', ') : ''); swSt = reg && reg.active && navigator.serviceWorker.controller ? 'ok' : 'warn'; } catch (e) { swInfo = 'Could not read (' + e.message + ')'; }
    }
    out.push(row(swSt, 'Offline copy', swInfo));
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    out.push(row(navigator.onLine ? 'ok' : 'bad', 'Connection', navigator.onLine ? 'Online' + (navigator.connection && navigator.connection.effectiveType ? ' · ' + navigator.connection.effectiveType : '') : 'Offline'));
    out.push(row('info', 'Install', standalone ? 'Running from the Home Screen' : 'Running in the browser (Alerts on iPhone need the Home Screen app)'));
    let perm = 'Not supported', pst = 'warn';
    if ('Notification' in window) { perm = Notification.permission; pst = perm === 'granted' ? 'ok' : perm === 'denied' ? 'bad' : 'warn'; try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; perm += sub ? ' · this phone is subscribed' : ' · not subscribed yet'; if (perm.startsWith('granted') && !sub) pst = 'warn'; } catch (e) { /* ignore */ } }
    out.push(row(pst, 'Alerts on this phone', perm.replace(/^./, (c) => c.toUpperCase())));
    // 5. game, storage
    const A = window.enAccount; out.push(row(A && A.ready && A.ready() ? 'ok' : 'info', 'Prediction game', A && A.ready && A.ready() ? 'Signed in as ' + A.name() : 'Not signed in on this phone'));
    let ls = 'ok'; try { localStorage.setItem('en-hc', '1'); localStorage.removeItem('en-hc'); } catch (e) { ls = 'bad'; }
    let idb = 'ok'; try { await new Promise((ok, no) => { const q = indexedDB.open('en-hc-test', 1); q.onsuccess = () => { q.result.close(); indexedDB.deleteDatabase('en-hc-test'); ok(); }; q.onerror = () => no(q.error); }); } catch (e) { idb = 'bad'; }
    out.push(row(ls === 'ok' && idb === 'ok' ? 'ok' : 'bad', 'Phone storage', 'Settings ' + (ls === 'ok' ? 'OK' : 'blocked') + ' · Saved snapshots ' + (idb === 'ok' ? 'OK' : 'blocked')));
    out.push(row(errs.length ? 'warn' : 'ok', 'Errors this visit', errs.length ? errs.length + ' logged (listed below)' : 'None'));
    return out;
  }

  const CSS = `.hc-ov{position:fixed;inset:0;z-index:100010;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,8,20,.82);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.hc-sh{width:min(100%,560px);max-height:94vh;overflow:auto;border-radius:24px 24px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom));color:#fff;background:linear-gradient(170deg,#121a33,#0a0f24);box-shadow:0 -20px 60px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.1)}
@media(min-width:700px){.hc-ov{align-items:center}.hc-sh{border-radius:24px}}
.hc-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.hc-top b{font-size:1.05rem}
.hc-x{width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,.12);color:#fff;font-size:1rem;cursor:pointer}
.hc-sum{margin:12px 0;padding:.7rem .9rem;border-radius:14px;font-weight:700;font-size:.95rem}.hc-sum.ok{background:rgba(52,211,153,.16);color:#6ee7b7}.hc-sum.warn{background:rgba(251,191,36,.16);color:#fcd34d}.hc-sum.bad{background:rgba(248,113,113,.18);color:#fca5a5}
.hc-r{display:grid;grid-template-columns:14px 1fr;gap:10px;padding:.55rem 0;border-top:1px solid rgba(255,255,255,.09)}.hc-r i{width:12px;height:12px;border-radius:50%;margin-top:5px;background:#64748b}.hc-r i.ok{background:#34d399}.hc-r i.warn{background:#fbbf24}.hc-r i.bad{background:#f87171}
.hc-r b{display:block;font-size:.9rem}.hc-r span{display:block;font-size:.82rem;line-height:1.4;color:rgba(255,255,255,.72)}
.hc-err{margin:10px 0 0;padding:.6rem .7rem;border-radius:12px;background:rgba(248,113,113,.1);font:12px/1.45 ui-monospace,Menlo,monospace;color:#fecaca;white-space:pre-wrap;word-break:break-word}
.hc-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.hc-b{padding:.65rem .5rem;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font:inherit;font-weight:700;font-size:.85rem;cursor:pointer}.hc-b.gold{background:linear-gradient(135deg,#fde68a,#fbbf24 55%,#f59e0b);color:#1a1300;border:none}.hc-b:disabled{opacity:.6}
.hc-foot{margin-top:10px;font-size:.72rem;color:rgba(255,255,255,.5);text-align:center}`;

  let layer = null, running = false, lastOut = [];
  const report = () => 'Election Night health check · ' + new Date().toLocaleString('en-US') + '\n' + lastOut.map((r) => ({ ok: '[ok]  ', warn: '[warn]', bad: '[BAD] ', info: '[info]' }[r.st]) + ' ' + r.label + ': ' + r.detail).join('\n') + (errs.length ? '\nErrors:\n' + errs.join('\n') : '');
  function close() { if (layer) { layer.remove(); layer = null; document.documentElement.classList.remove('sn-open'); } }
  async function draw(sh) {
    if (running) return; running = true; const body = sh.querySelector('.hc-body'); body.replaceChildren(h('div', 'hc-sum warn', 'Checking…'));
    let out; try { out = await runChecks(); } catch (e) { out = [row('bad', 'Health check', 'Failed to run: ' + e.message)]; }
    lastOut = out; running = false; if (!layer) return;
    const bads = out.filter((r) => r.st === 'bad').length, warns = out.filter((r) => r.st === 'warn').length;
    body.replaceChildren(h('div', 'hc-sum ' + (bads ? 'bad' : warns ? 'warn' : 'ok'), bads ? bads + ' problem' + (bads > 1 ? 's' : '') + ' to fix' + (warns ? ' · ' + warns + ' to look at' : '') : warns ? warns + ' thing' + (warns > 1 ? 's' : '') + ' to look at' : 'All good ✅'));
    out.forEach((r) => { const d = h('div', 'hc-r'); const t = h('div'); t.append(h('b', '', r.label), h('span', '', r.detail)); d.append(h('i', r.st), t); body.append(d); });
    if (errs.length) body.append(h('div', 'hc-err', errs.join('\n')));
  }
  function open() {
    close(); const ov = h('div', 'hc-ov'); ov.dataset.noswipe = ''; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Health check');
    const sh = h('div', 'hc-sh'), top = h('div', 'hc-top'); top.append(h('b', '', '🩺 Health check')); const x = h('button', 'hc-x', '✕'); x.setAttribute('aria-label', 'Close'); x.onclick = close; top.append(x);
    const body = h('div', 'hc-body'), row2 = h('div', 'hc-row');
    const mk = (cls, txt, fn) => { const b = h('button', 'hc-b ' + cls, txt); b.type = 'button'; b.onclick = () => fn(b); return b; };
    row2.append(
      mk('gold', '🔄 Check again', () => draw(sh)),
      mk('', '📋 Copy report', async (b) => { try { await navigator.clipboard.writeText(report()); b.textContent = '✓ Copied'; } catch (e) { b.textContent = 'Copy blocked'; } setTimeout(() => { b.textContent = '📋 Copy report'; }, 1800); }),
      mk('', '⬇️ Refresh data now', async (b) => { b.disabled = true; try { DATASETS.forEach((k) => window.dash.refresh(k)); } catch (e) { /* ignore */ } await new Promise((r) => setTimeout(r, 2500)); b.disabled = false; draw(sh); }),
      mk('', '🧹 Clear cache + reload', async (b) => { b.disabled = true; try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) { /* ignore */ } location.reload(); })
    );
    sh.append(top, body, row2, h('div', 'hc-foot', 'Only you see this. It reads from this app\'s own host and sends nothing to anyone else.'));
    ov.append(sh); ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); document.body.append(ov); layer = ov; document.documentElement.classList.add('sn-open'); draw(sh);
  }

  function boot() {
    const st = h('style'); st.id = 'hc-css'; st.textContent = CSS; document.head.append(st);
    // 5 quick taps on the "Data updated" line (taps within 3 seconds of each other)
    let taps = 0, last = 0;
    document.addEventListener('click', (e) => { const t = e.target && e.target.closest && e.target.closest('#app-updated'); if (!t) return; const n = Date.now(); taps = n - last < 3000 ? taps + 1 : 1; last = n; if (taps >= 5) { taps = 0; open(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.enHealth = { open, run: runChecks, close };
    if (/[?&]health\b/.test(location.search)) setTimeout(open, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
