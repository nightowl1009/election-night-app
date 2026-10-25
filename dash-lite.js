/* Election Night 2026 — small data runtime.
   Loads the JSON files in ./data, runs the page's calculations, keeps your
   watchlist and Path-to-51 picks on this device, and re-checks for new data
   every 2 minutes while the app is open. */
(function () {
  const DATASETS = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'usmap', 'earlyvote', 'local', 'changes', 'spending'];
  const KEY = 'en-params-v1';
  const DEFAULTS = { watch: [], picks: [], hpicks: [] };
  const state = {};
  const calcs = {};
  const subs = [];
  const sim = {};  // practice-run stand-in data (never saved)
  let calcCache = {};

  DATASETS.forEach((id) => { state[id] = { status: 'loading', data: [] }; });

  const readParams = () => {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  };
  let params = readParams();
  const saveParams = () => { try { localStorage.setItem(KEY, JSON.stringify(params)); } catch (e) { /* private mode */ } };

  function notify() {
    calcCache = {};
    subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }

  async function load(id) {
    try {
      const res = await fetch('data/' + id + '.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      const before = JSON.stringify(state[id].data);
      state[id] = { status: 'ok', data: rows, columns: rows.length ? Object.keys(rows[0]) : [] };
      return before !== JSON.stringify(rows);
    } catch (e) {
      if (state[id].status !== 'ok') state[id] = { status: 'error', data: [], message: String(e) };
      return false;
    }
  }

  // Data updates are GitHub commits that don't redeploy the site. Ask which version is newest (a tiny request);
  // when it changes, fetch that version's bundle of every data file in one go. If either step fails, read the
  // copy that ships with the site instead.
  let liveSha = null;
  async function getJSON(url, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(t); }
  }
  function apply(id, rows) {
    if (!Array.isArray(rows)) return false;
    const before = JSON.stringify(state[id].data);
    state[id] = { status: 'ok', data: rows, columns: rows.length ? Object.keys(rows[0]) : [] };
    return before !== JSON.stringify(rows);
  }
  function showMeta(m) {
    if (!m || !m.updated) return;
    const el = document.getElementById('app-updated');
    if (el) el.textContent = 'Data updated ' + new Date(m.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    window.__enMetaAt = Date.parse(m.updated); fresh();
  }
  async function loadAll() {
    const head = await getJSON('/.netlify/functions/latest?t=' + Math.floor(Date.now() / 10000), 5000);
    const sha = head && /^[0-9a-f]{40}$/.test(head.sha) ? head.sha : null;
    if (sha && sha === liveSha && window.__enLoadedOnce) return; // nothing new
    const b = sha ? await getJSON('/.netlify/functions/latest?sha=' + sha, 15000) : null;
    let changed;
    if (b && b.data && Array.isArray(b.data.results)) {
      changed = DATASETS.map((id) => b.data[id] ? apply(id, b.data[id]) : false);
      const missing = DATASETS.filter((id) => state[id].status !== 'ok');
      if (missing.length) changed = changed.concat(await Promise.all(missing.map((id) => load(id))));
      if (b.complete !== false) liveSha = sha; // partial bundle: ask again next time
      if (b.data.meta) showMeta(b.data.meta); else { try { showMeta(await (await fetch('data/meta.json', { cache: 'no-cache' })).json()); } catch (e) { /* optional */ } }
    } else {
      changed = await Promise.all(DATASETS.map((id) => load(id)));
      try { showMeta(await (await fetch('data/meta.json', { cache: 'no-cache' })).json()); } catch (e) { /* optional */ }
    }
    if (changed.some(Boolean) || !window.__enLoadedOnce) { window.__enLoadedOnce = true; notify(); }
  }

  function runCalc(id) {
    if (calcCache[id]) return calcCache[id];
    const c = calcs[id];
    const inputs = c.inputs.map((i) => window.dash.data(i));
    let out;
    if (inputs.some((d) => d.status === 'error')) out = { status: 'error', data: [], message: 'An input failed to load' };
    else if (inputs.some((d) => d.status !== 'ok')) out = { status: 'loading', data: [] };
    else {
      try { out = { status: 'ok', data: c.fn(...inputs.map((d) => d.data)) }; }
      catch (e) { console.error(e); out = { status: 'error', data: [], message: String(e) }; }
    }
    calcCache[id] = out;
    return out;
  }

  // Only redraw when the width changes: phones fire resize while scrolling (address bar
  // showing/hiding), and redrawing then made the page jump.
  let resizeT, lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth; clearTimeout(resizeT); resizeT = setTimeout(notify, 200);
  });

  window.dash = {
    data(id) {
      if (calcs[id]) return Object.assign({ refreshing: false, meta: [] }, runCalc(id));
      if (!state[id] && !calcs[id]) { state[id] = { status: 'loading', data: [] }; load(id).then(notify); }
      if (sim[id]) return { refreshing: false, meta: [], status: 'ok', data: sim[id], columns: sim[id].length ? Object.keys(sim[id][0]) : [] };
      return Object.assign({ refreshing: false, meta: [] }, state[id] || { status: 'missing', data: [] });
    },
    calc(id, spec) { calcs[id] = spec; },
    loader() {},
    onData(fn) { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params() { return params; },
    setParams(obj) { params = Object.assign({}, params, obj); saveParams(); notify(); },
    resetParams() { params = Object.assign({}, DEFAULTS); saveParams(); notify(); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
    refresh(id) { load(id).then(notify); },
    simSet(id, rows) { sim[id] = rows; notify(); },
    simClear() { Object.keys(sim).forEach(k => delete sim[k]); notify(); },
    colors: ['#3b82f6', '#ef4444', '#fbbf24', '#a855f7', '#10b981', '#f97316', '#06b6d4', '#ec4899']
  };

  // Election night: a small "results updated X min ago" badge that turns amber, then red, if updates stall
  // (updates are scheduled every ~15 minutes from 5:45 PM to 2:15 AM CT).
  function fresh() {
    const now = Date.now(), on = now >= Date.UTC(2026, 10, 3, 23, 30) && now < Date.UTC(2026, 10, 4, 9, 0) && !window.__simOn;
    let b = document.getElementById('en-fresh');
    if (!on || !window.__enMetaAt) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'en-fresh'; b.setAttribute('role', 'status'); document.body.append(b); }
    const mins = Math.max(0, Math.round((now - window.__enMetaAt) / 60000));
    b.className = mins >= 45 ? 'bad' : mins >= 25 ? 'warn' : '';
    b.textContent = (mins >= 25 ? '⚠ ' : '● ') + 'Results updated ' + (mins < 1 ? 'just now' : mins + ' min ago') + (mins >= 45 ? ' — updates may be stuck' : mins >= 25 ? ' — running behind' : '');
  }
  setInterval(fresh, 30000);
  window.__enFresh = fresh;

  loadAll();
  // every 2 minutes; every minute on election night (Nov 3, 5 PM CT – Nov 4, 6 AM CT)
  let lastLoad = Date.now();
  setInterval(() => {
    const now = Date.now(), night = now >= Date.UTC(2026, 10, 3, 23) && now < Date.UTC(2026, 10, 4, 12);
    if (now - lastLoad < (night ? 30000 : 120000) - 500) return;
    if (navigator.onLine !== false && document.visibilityState === 'visible') { lastLoad = now; loadAll(); }
  }, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadAll(); });
})();
