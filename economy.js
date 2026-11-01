/* The Economy tab (app only): debt, jobs, prices, rates and housing as animated cards.
   Numbers live in data/economy.json (one row per card). Everything animated respects "reduce motion". */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; };
  const root = () => document.getElementById('econ-root');
  const rows = () => { const d = window.dash && window.dash.data('economy'); return d && d.status === 'ok' ? d.data : []; };
  const money = (n, dp) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  const FMT = {
    debt: (v) => '$' + v.toFixed(2) + ' trillion', unemployment: (v) => v.toFixed(1) + '%', inflation: (v) => v.toFixed(1) + '%',
    mortgage: (v) => v.toFixed(2) + '%', gas: (v) => '$' + v.toFixed(2), home: (v) => money(Math.round(v)), fed: (v) => v.toFixed(2) + '%'
  };
  const payment = (price, rate) => { const L = price * 0.8, r = rate / 1200, n = 360; return L * r / (1 - Math.pow(1 + r, -n)); };   // 20% down, 30-year fixed, principal + interest only
  const ACCENT = { debt: '#f87171', unemployment: '#38bdf8', inflation: '#fb923c', mortgage: '#a78bfa', gas: '#fbbf24', home: '#34d399', fed: '#f472b6', pay: '#22d3ee' };
  const ICON = { debt: '🏛️', unemployment: '👷', inflation: '🛒', mortgage: '🏠', gas: '⛽', home: '🔑', fed: '🏦', pay: '💳' };

  const CSS = `
.ec-wrap { display:grid; gap:14px; }
.ec-hero { position:relative; overflow:hidden; border-radius:20px; padding:20px 16px; color:#fff; text-align:center; background: radial-gradient(90% 70% at 10% 0%, rgba(239,68,68,.45), transparent 60%), radial-gradient(90% 70% at 100% 10%, rgba(56,189,248,.35), transparent 60%), linear-gradient(160deg,#0b1020,#111a33); box-shadow:0 16px 48px rgba(10,14,40,.4), inset 0 0 0 1px rgba(255,255,255,.08); }
.ec-hero .k { font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; color:#fbbf24; font-weight:700; }
.ec-hero .big { font-family: var(--font-anthropic-serif, Georgia, serif); font-size: clamp(1.7rem, 8.4vw, 2.9rem); line-height:1.1; margin:.35rem 0 .15rem; font-variant-numeric: tabular-nums; text-shadow:0 4px 28px rgba(248,113,113,.55); word-break:break-all; }
.ec-hero .sub { font-size:.82rem; color:rgba(255,255,255,.78); }
.ec-hero .rate { display:inline-block; margin-top:.55rem; padding:.3rem .7rem; border-radius:999px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.18); font-size:.8rem; font-weight:600; }
.ec-hero::after { content:''; position:absolute; inset:-40%; background:conic-gradient(from 0deg, transparent, rgba(251,191,36,.12), transparent 30%, rgba(96,165,250,.14), transparent 60%); animation: ec-spin 18s linear infinite; pointer-events:none; }
.ec-hero > * { position:relative; z-index:1; }
@keyframes ec-spin { to { transform: rotate(360deg); } }
.ec-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap:14px; }
.ec-card { --ac:#60a5fa; position:relative; overflow:hidden; border-radius:18px; padding:14px 14px 12px; color:#fff; background: radial-gradient(80% 60% at 0% 0%, color-mix(in srgb, var(--ac) 32%, transparent), transparent 62%), linear-gradient(165deg,#0d1226,#121a30); box-shadow:0 10px 30px rgba(8,12,30,.35), inset 0 0 0 1px rgba(255,255,255,.08); opacity:0; transform: translateY(18px); transition: opacity .6s, transform .6s var(--cds-ease-out, ease-out); }
.ec-card.in { opacity:1; transform:none; }
.ec-card h3 { margin:0; font-size:.78rem; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.82); font-weight:700; display:flex; gap:.45rem; align-items:center; }
.ec-card h3 i { font-style:normal; font-size:1.15rem; filter: drop-shadow(0 2px 8px var(--ac)); }
.ec-num { font-family: var(--font-anthropic-serif, Georgia, serif); font-size:2.6rem; line-height:1.05; margin:.4rem 0 .1rem; color:#fff; text-shadow:0 4px 24px color-mix(in srgb, var(--ac) 70%, transparent); font-variant-numeric: tabular-nums; }
.ec-asof { font-size:.74rem; color:rgba(255,255,255,.6); }
.ec-chip { display:inline-flex; align-items:center; gap:.3rem; margin:.5rem 0 .2rem; padding:.22rem .6rem; border-radius:999px; font-size:.78rem; font-weight:700; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.16); }
.ec-chip.up { color:#fdba74; } .ec-chip.dn { color:#67e8f9; } .ec-chip.flat { color:#cbd5e1; }
.ec-gfx { margin:.55rem 0 .2rem; }
.ec-gfx svg { display:block; width:100%; height:auto; overflow:visible; }
.ec-note { font-size:.78rem; color:rgba(255,255,255,.72); line-height:1.4; margin:.4rem 0 0; }
.ec-src { display:block; margin-top:.55rem; font-size:.7rem; color:rgba(255,255,255,.5); }
.ec-src a { color:rgba(255,255,255,.75); text-decoration:underline; }
.ec-dots { display:grid; grid-template-columns: repeat(20, 1fr); gap:4px; }
.ec-dots i { aspect-ratio:1; border-radius:50%; background:rgba(255,255,255,.14); transform:scale(.2); opacity:0; }
.ec-card.in .ec-dots i { animation: ec-dot .45s cubic-bezier(.2,1.4,.4,1) forwards; animation-delay: calc(var(--i) * 9ms); }
.ec-dots i.on { background: var(--ac); box-shadow:0 0 10px var(--ac); }
@keyframes ec-dot { to { transform:scale(1); opacity:1; } }
.ec-bars { display:grid; gap:7px; }
.ec-bar { display:grid; grid-template-columns: 5.2rem 1fr; align-items:center; gap:8px; font-size:.75rem; color:rgba(255,255,255,.8); }
.ec-bar b { display:block; height:22px; border-radius:7px; background: rgba(255,255,255,.28); width:0; transition: width 1.1s var(--cds-ease-out, ease-out) .25s; position:relative; }
.ec-bar.now b { background: linear-gradient(90deg, var(--ac), color-mix(in srgb, var(--ac) 55%, #fff)); box-shadow:0 0 14px color-mix(in srgb, var(--ac) 60%, transparent); }
.ec-bar b span { position:absolute; right:6px; top:50%; transform:translateY(-50%); font-size:.72rem; font-weight:700; color:#fff; white-space:nowrap; text-shadow:0 1px 3px rgba(0,0,0,.6); }
.ec-card.in .ec-bar b { width: var(--w); }
.ec-line { fill:none; stroke: var(--ac); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; filter: drop-shadow(0 0 6px var(--ac)); }
.ec-card.in .ec-line { animation: ec-draw 1.4s ease-out .3s forwards; }
@keyframes ec-draw { to { stroke-dashoffset:0; } }
.ec-pt { fill:#fff; opacity:0; } .ec-card.in .ec-pt { animation: ec-fade .4s ease-out forwards; animation-delay: calc(.5s + var(--i) * .3s); }
@keyframes ec-fade { to { opacity:1; } }
.ec-tx { font-size:10px; fill:rgba(255,255,255,.7); } .ec-tv { font-size:11px; font-weight:700; fill:#fff; }
.ec-ref { stroke:rgba(255,255,255,.5); stroke-dasharray:4 4; stroke-width:1.3; }
.ec-track { fill:rgba(255,255,255,.12); } .ec-fill { fill: var(--ac); transform-box: fill-box; transform-origin: left; transform: scaleX(0); filter: drop-shadow(0 0 8px var(--ac)); }
.ec-card.in .ec-fill { animation: ec-grow 1.1s var(--cds-ease-out, ease-out) .3s forwards; } @keyframes ec-grow { to { transform: scaleX(1); } }
.ec-pay { grid-column: 1 / -1; }
.ec-pays { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:.5rem; }
.ec-pays div { background:rgba(255,255,255,.07); border-radius:14px; padding:.7rem; text-align:center; border:1px solid rgba(255,255,255,.1); }
.ec-pays b { display:block; font-family: var(--font-anthropic-serif, Georgia, serif); font-size:1.9rem; font-weight:400; font-variant-numeric: tabular-nums; }
.ec-pays small { font-size:.72rem; color:rgba(255,255,255,.65); }
.ec-foot { font-size:.75rem; color: var(--color-fg-muted); line-height:1.5; }
.ec-foot a { color: inherit; }
@media (prefers-reduced-motion: reduce) { .ec-card { opacity:1; transform:none; transition:none; } .ec-hero::after { animation:none; } .ec-dots i { transform:none; opacity:1; animation:none !important; } .ec-line { stroke-dashoffset:0; animation:none !important; } .ec-pt { opacity:1; animation:none !important; } .ec-fill { transform:none; animation:none !important; } .ec-bar b { width: var(--w); transition:none; } }
`;

  function delta(r) {
    const d = r.value - r.prior, flat = Math.abs(d) < 1e-9, c = h('span', 'ec-chip ' + (flat ? 'flat' : d > 0 ? 'up' : 'dn'));
    let t;
    if (r.id === 'debt') t = '$' + Math.abs(d).toFixed(2) + ' trillion';
    else if (r.id === 'home') t = money(Math.abs(d)) + ' (' + (Math.abs(d) / r.prior * 100).toFixed(1) + '%)';
    else if (r.id === 'gas') t = '$' + Math.abs(d).toFixed(2) + ' (' + (Math.abs(d) / r.prior * 100).toFixed(0) + '%)';
    else t = Math.abs(d).toFixed(2).replace(/0$/, '') + ' pts';
    c.textContent = flat ? '■ Unchanged vs ' + r.prior_label : (d > 0 ? '▲ Up ' : '▼ Down ') + t + ' vs ' + r.prior_label;
    return c;
  }
  function bars(items, ac, max) {
    const b = h('div', 'ec-bars');
    items.forEach(([label, val, text, now]) => { const x = h('div', 'ec-bar' + (now ? ' now' : '')); x.append(h('span', '', label)); const bar = h('b'); bar.style.setProperty('--w', Math.max(6, val / max * 100).toFixed(1) + '%'); bar.append(h('span', '', text)); x.append(bar); b.append(x); });
    return b;
  }
  function spark(series, ref, lo, hi, fmt) {
    const W = 300, H = 120, px = 18, top = 22, bot = 24, svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    const X = (i) => px + i * (W - 2 * px) / (series.length - 1), Y = (v) => top + (hi - v) / (hi - lo) * (H - top - bot);
    if (ref != null) { svg.append(sv('line', { class: 'ec-ref', x1: px, x2: W - px, y1: Y(ref), y2: Y(ref) })); const t = sv('text', { class: 'ec-tx', x: W - px, y: Y(ref) + 13, 'text-anchor': 'end' }); t.textContent = 'a year ago ' + fmt(ref); svg.append(t); }
    const p = sv('path', { class: 'ec-line', pathLength: 1, d: series.map((s, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s[1]).toFixed(1)).join(' ') }); svg.append(p);
    series.forEach((s, i) => {
      const c = sv('circle', { class: 'ec-pt', cx: X(i), cy: Y(s[1]), r: 4, style: '--i:' + i }); svg.append(c);
      const l = sv('text', { class: 'ec-tx', x: X(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle' }); l.textContent = s[0]; svg.append(l);
      const v = sv('text', { class: 'ec-tv ec-pt', x: X(i), y: Y(s[1]) - 9, 'text-anchor': i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle', style: '--i:' + i }); v.textContent = fmt(s[1]); svg.append(v);
    });
    return svg;
  }
  function band(r) {
    const W = 300, H = 74, px = 8, X = (v) => px + v / 6 * (W - 2 * px), svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.append(sv('rect', { class: 'ec-track', x: px, y: 26, width: W - 2 * px, height: 18, rx: 9 }));
    svg.append(sv('rect', { class: 'ec-fill', x: X(r.low), y: 26, width: X(r.value) - X(r.low), height: 18, rx: 9 }));
    for (let v = 0; v <= 6; v++) { const t = sv('text', { class: 'ec-tx', x: X(v), y: 64, 'text-anchor': 'middle' }); t.textContent = v + '%'; svg.append(t); }
    const l = sv('text', { class: 'ec-tv', x: (X(r.low) + X(r.value)) / 2, y: 18, 'text-anchor': 'middle' }); l.textContent = r.low.toFixed(2) + '% – ' + r.value.toFixed(2) + '%'; svg.append(l);
    return svg;
  }
  function dots(v, per) {
    const g = h('div', 'ec-dots'), n = 100, full = Math.floor(v / 100 * n);
    for (let i = 0; i < n; i++) { const d = h('i', i < full ? 'on' : ''); d.style.setProperty('--i', i); g.append(d); }
    return g;
  }
  function card(r, extraCls) {
    const c = h('div', 'ec-card' + (extraCls ? ' ' + extraCls : '')); c.style.setProperty('--ac', ACCENT[r.id] || '#60a5fa');
    const hd = h('h3'); hd.append(h('i', '', ICON[r.id] || '•'), document.createTextNode(r.label)); c.append(hd);
    const n = h('div', 'ec-num', FMT[r.id] ? FMT[r.id](r.value) : String(r.value)); n.dataset.v = r.value; n.dataset.id = r.id; c.append(n);
    c.append(h('div', 'ec-asof', 'As of ' + r.asof));
    if (r.id !== 'fed' || r.value !== r.prior) c.append(delta(r)); else c.append(h('span', 'ec-chip flat', '■ Same range a year ago'));
    const g = h('div', 'ec-gfx'); c.append(g);
    return { c, g };
  }
  function build(data) {
    const by = {}; data.forEach(r => { by[r.id] = r; });
    const wrap = h('div', 'ec-wrap');
    // Hero: estimated live debt counter
    const d = by.debt;
    if (d) {
      const perSec = (d.exact - d.prior_exact) / (365 * 86400), base = Date.UTC(2026, 9, 27, 5), hero = h('div', 'ec-hero');
      const big = h('div', 'big'); big.id = 'ec-debt';
      hero.append(h('div', 'k', '🏛️ The national debt, ticking'), big, h('div', 'sub', 'Treasury’s official figure was ' + FMT.debt(d.value) + ' on ' + d.asof));
      hero.append(h('div', 'rate', 'Growing about ' + money(Math.round(perSec)) + ' every second at the past year’s pace'));
      hero.append(h('div', 'sub', 'The live counter is an estimate: last year’s pace carried forward from the last official reading.'));
      wrap.append(hero);
      const tick = () => { if (big.closest('[hidden]')) return; big.textContent = money(Math.round(d.exact + perSec * Math.max(0, (Date.now() - base) / 1000))); };
      tick(); clearInterval(tmr); tmr = setInterval(tick, calm() ? 5000 : 100);
    }
    const grid = h('div', 'ec-grid'); wrap.append(grid);
    const cards = [];
    const add = (r, cls, fn) => { const k = card(r, cls); fn(k.g, k.c); const s = h('span', 'ec-src'); s.append(document.createTextNode('Source: ')); const a = h('a', '', r.source); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; s.append(a); k.c.append(s); grid.append(k.c); cards.push(k.c); return k.c; };
    const note = (c, t) => { const p = h('p', 'ec-note', t); c.insertBefore(p, c.querySelector('.ec-src')); };
    if (by.debt) add(by.debt, '', (g, c) => { g.append(bars([['A year ago', by.debt.prior, '$' + by.debt.prior.toFixed(2) + 'T'], ['Now', by.debt.value, '$' + by.debt.value.toFixed(2) + 'T', 1]], '', by.debt.value)); note(c, by.debt.extra); });
    if (by.unemployment) add(by.unemployment, '', (g, c) => { g.append(dots(by.unemployment.value)); note(c, 'About ' + Math.round(by.unemployment.value) + ' of every 100 people in the labor force are looking for work. ' + by.unemployment.extra + '.'); });
    if (by.inflation) add(by.inflation, '', (g, c) => { const v = by.inflation.value; g.append(bars([['Basket a year ago', 100, '$100.00'], ['Same basket now', 100 + v * 6, '$' + (100 + v).toFixed(2), 1]], '', 100 + v * 6)); note(c, 'Cost of living: what cost $100 a year ago costs about $' + (100 + v).toFixed(2) + ' now. ' + by.inflation.extra + '.'); });
    if (by.gas) add(by.gas, '', (g, c) => { g.append(spark(by.gas.series, by.gas.prior, 2.8, 4.7, (v) => '$' + v.toFixed(2))); note(c, 'A 15-gallon fill-up: ' + money(by.gas.value * 15, 2) + ' now vs ' + money(by.gas.prior * 15, 2) + ' a year ago. ' + by.gas.extra + '.'); });
    if (by.mortgage) add(by.mortgage, '', (g, c) => { g.append(spark(by.mortgage.series, by.mortgage.prior, 5.9, 7.6, (v) => v.toFixed(2) + '%')); note(c, by.mortgage.extra + '.'); });
    if (by.home) add(by.home, '', (g, c) => { g.append(bars([[by.home.prior_label, by.home.prior, money(by.home.prior)], ['Now', by.home.value, money(by.home.value), 1]], '', by.home.value)); note(c, by.home.extra + '.'); });
    if (by.fed) add(by.fed, '', (g, c) => { g.append(band(by.fed)); note(c, by.fed.extra + '.'); });
    if (by.home && by.mortgage) {
      const now = payment(by.home.value, by.mortgage.value), then = payment(by.home.prior, by.mortgage.prior);
      const r = { id: 'pay', label: 'Monthly payment on the median home', value: now, prior: then, asof: 'our math from the price and rate above', prior_label: 'a year ago', source: 'Calculated from the NAR price and Freddie Mac rate above', url: by.mortgage.url };
      const k = card(r, 'ec-pay'); k.c.querySelector('.ec-num').textContent = money(Math.round(now)) + '/mo'; k.c.querySelector('.ec-chip').textContent = '▲ Up ' + money(Math.round(now - then)) + ' a month vs a year ago';
      const p = h('div', 'ec-pays'); const a = h('div'), b = h('div'); a.append(h('small', '', 'A year ago'), h('b', '', money(Math.round(then))), h('small', '', money(by.home.prior) + ' at ' + by.mortgage.prior.toFixed(2) + '%')); b.append(h('small', '', 'Now'), h('b', '', money(Math.round(now))), h('small', '', money(by.home.value) + ' at ' + by.mortgage.value.toFixed(2) + '%')); p.append(a, b); k.g.append(p);
      k.c.append(h('p', 'ec-note', 'Assumes 20% down and a 30-year fixed loan; principal and interest only, so taxes, insurance and fees are extra.'));
      const s = h('span', 'ec-src', 'Source: calculated from the home price and mortgage rate above'); k.c.append(s); grid.append(k.c); cards.push(k.c);
    }
    const foot = h('p', 'ec-foot'); foot.append(document.createTextNode('Latest readings as of the dates shown; each source updates on its own schedule (jobs and inflation monthly, mortgage rates weekly, gas daily). Arrows compare with the earlier period named on each card and make no judgment about good or bad. Check any number against the source link on its card.')); wrap.append(foot);
    return { wrap, cards };
  }

  let sig = '', io = null, tmr = null;
  function render() {
    const r = root(); if (!r) return; const data = rows(); if (!data.length) return;
    const s = JSON.stringify(data); if (s === sig) return; sig = s;
    if (!document.getElementById('ec-css')) { const st = h('style'); st.id = 'ec-css'; st.textContent = CSS; document.head.append(st); }
    const b = build(data); r.replaceChildren(b.wrap);
    if (io) io.disconnect();
    if ('IntersectionObserver' in window) { io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); countUp(e.target); } }), { threshold: 0.15 }); b.cards.forEach(c => io.observe(c)); }
    else b.cards.forEach(c => c.classList.add('in'));
  }
  function countUp(card) {
    const n = card.querySelector('.ec-num'); if (!n || calm() || !n.dataset.id || !FMT[n.dataset.id]) return;
    const end = Number(n.dataset.v), f = FMT[n.dataset.id], t0 = performance.now(), D = 1100;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); n.textContent = f(end * e); if (k < 1) requestAnimationFrame(step); else n.textContent = f(end); };
    requestAnimationFrame(step);
  }
  const boot = () => { if (window.dash && window.dash.onData) window.dash.onData(render); else setTimeout(boot, 300); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
