/* Election Night 2026 — small data runtime.
   Loads the JSON files in ./data, runs the page's calculations, keeps your
   watchlist and Path-to-51 picks on this device, and re-checks for new data
   every 2 minutes while the app is open. */
(function () {
  const DATASETS = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'usmap'];
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

  async function loadAll() {
    const changed = await Promise.all(DATASETS.map(load));
    if (changed.some(Boolean) || !window.__enLoadedOnce) { window.__enLoadedOnce = true; notify(); }
    try {
      const m = await (await fetch('data/meta.json', { cache: 'no-cache' })).json();
      const el = document.getElementById('app-updated');
      if (el && m.updated) el.textContent = 'Data updated ' + new Date(m.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { /* optional */ }
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

  loadAll();
  setInterval(() => { if (navigator.onLine !== false && document.visibilityState === 'visible') loadAll(); }, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadAll(); });
})();
