/* Raw vote counts next to the percentages (app only). When a results row carries d_votes / r_votes (and optionally
   total_votes), every place the app shows that race's percentages gets the counts too: under each candidate's %,
   and the total counted next to "% in". Rows without counts look exactly as before. */
(function () {
  'use strict';
  const nf = (n) => Math.round(Number(n)).toLocaleString('en-US');
  const ok = (v) => v != null && v !== '' && isFinite(Number(v));
  const rowsOf = () => { const d = window.dash && window.dash.data('results'); const m = {}; if (d && d.status === 'ok') d.data.forEach((r) => { m[r.race] = r; }); return m; };
  const keyOf = (sp) => { const w = (sp.getAttribute('data-where') || '').split('='); return w[0] === 'race' ? decodeURIComponent(w.slice(1).join('=')) : ''; };
  function put(host, cls, txt) {
    let e = [...host.children].find((c) => c.classList && c.classList.contains('en-vc') && c.classList.contains(cls));
    if (txt == null) { if (e) e.remove(); return; }
    if (!e) { e = document.createElement('small'); e.className = 'en-vc ' + cls; host.append(e); }
    if (e.textContent !== txt) e.textContent = txt;
  }
  let busy = false;
  function paint() {
    if (busy) return; busy = true;
    try {
      const res = rowsOf();
      document.querySelectorAll('[data-source="results"][data-field="d_pct"], [data-source="results"][data-field="r_pct"]').forEach((sp) => {
        const x = res[keyOf(sp)], host = sp.parentElement; if (!host) return;
        const shared = host.querySelectorAll('[data-field="d_pct"], [data-field="r_pct"]').length > 1;
        const have = x && ok(x.d_votes) && ok(x.r_votes);
        if (shared) { if (sp.dataset.field === 'd_pct') put(host, 'both', have ? nf(x.d_votes) + ' · ' + nf(x.r_votes) + ' votes' : null); return; }
        put(host, 'one', have ? nf(sp.dataset.field === 'd_pct' ? x.d_votes : x.r_votes) + ' votes' : null);
      });
      document.querySelectorAll('[data-source="results"][data-field="reporting"]').forEach((sp) => {
        const x = res[keyOf(sp)], host = sp.parentElement; if (!host) return;
        const tot = x && ok(x.total_votes) ? Number(x.total_votes) : null;
        put(host, 'tot', tot ? ' · ' + nf(tot) + ' counted' : null);
      });
    } finally { busy = false; }
  }
  let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
  function boot() {
    if (!window.dash || !window.dash.onData) return setTimeout(boot, 300);
    window.dash.onData(soon);
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    const st = document.createElement('style');
    st.textContent = '.en-vc { display:block; font-family: var(--font-anthropic-sans, system-ui, sans-serif); font-size:.66rem; font-weight:600; letter-spacing:0; opacity:.78; color: var(--color-fg-muted); white-space:nowrap; } .en-vc.tot { display:inline; margin-left:.2rem; font-size:inherit; font-weight:inherit; opacity:.85; } .en-vc.both { margin-top:.15rem; }';
    document.head.append(st);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
