/* Election Night 2026 — the "over the top" layer (app only):
   sound effects, full-screen celebrations, floating emoji, and the live betting-odds chart. */
(function () {
  'use strict';
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const calm = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = { d: ['#1d4ed8', '#3b82f6', '#93c5fd', '#fbbf24', '#ffffff'], r: ['#b91c1c', '#ef4444', '#fca5a5', '#fbbf24', '#ffffff'], i: ['#7e22ce', '#a855f7', '#d8b4fe', '#fbbf24', '#ffffff'], g: ['#fbbf24', '#f59e0b', '#ffffff', '#3b82f6', '#ef4444'] };

  // ---------- Sound (made in the browser; nothing to download). Phones only allow sound after you've tapped the app once. ----------
  let ac = null;
  const soundOn = () => store.get('en-sound') !== '0';
  function ctx() { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); } if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { if (soundOn()) ctx(); }, { once: true, passive: true }));
  function tone(freq, at, dur, type, vol) {
    const c = ctx(); if (!c || c.state !== 'running') return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const SFX = {
    fanfare() { [[523.25, 0, .16], [659.25, .14, .16], [783.99, .28, .16], [1046.5, .42, .55]].forEach(([f, a, d]) => { tone(f, a, d, 'triangle', .2); tone(f / 2, a, d, 'sawtooth', .04); }); },
    big() { SFX.fanfare(); [[783.99, .95, .2], [1046.5, 1.12, .2], [1318.5, 1.3, .8]].forEach(([f, a, d]) => { tone(f, a, d, 'triangle', .22); tone(f / 2, a, d, 'square', .03); }); },
    womp() { [[392, 0, .3], [370, .3, .3], [349.2, .6, .7]].forEach(([f, a, d]) => tone(f, a, d, 'sawtooth', .07)); },
    chime() { [[880, 0, .5], [1318.5, .12, .7]].forEach(([f, a, d]) => tone(f, a, d, 'sine', .16)); },
    pop() { tone(660, 0, .12, 'sine', .12); },
  };
  window.enSound = {
    on: soundOn,
    set(v) { store.set('en-sound', v ? '1' : '0'); if (v) { ctx(); SFX.chime(); } paintSound(); },
    play(name) { if (!soundOn()) return; try { (SFX[name] || SFX.pop)(); } catch (e) {} },
    chime() { window.enSound.play('chime'); },
  };
  function paintSound() { document.querySelectorAll('.en-sound-btn').forEach(b => { b.textContent = soundOn() ? '🔊 Sound on' : '🔇 Sound off'; b.setAttribute('aria-pressed', String(soundOn())); }); }
  function addSoundButton() {
    const tv = document.getElementById('tv-open'); if (!tv || document.getElementById('sound-btn')) return;
    let wrap = tv.closest('.en-hbtns'); if (!wrap) { wrap = h('div', 'en-hbtns'); tv.replaceWith(wrap); wrap.append(tv); }
    const b = h('button', 'en-chip en-sound-btn'); b.type = 'button'; b.id = 'sound-btn';
    b.addEventListener('click', () => window.enSound.set(!soundOn()));
    wrap.insertBefore(b, tv); paintSound();
  }

  // ---------- Confetti ----------
  function confetti(host, side, n) {
    if (calm()) return;
    const cv = h('canvas', 'cb-confetti'); host.append(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); if (!x) return; x.scale(dpr, dpr);
    const pal = COLORS[side] || COLORS.g, P = [];
    for (let i = 0; i < (n || 160); i++) {
      const fromLeft = i % 2 === 0;
      P.push({ x: fromLeft ? -10 : W + 10, y: H * (.55 + Math.random() * .35), vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7), vy: -(9 + Math.random() * 9), w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .35, c: pal[i % pal.length] });
    }
    const t0 = performance.now();
    (function frame(t) {
      if (!cv.isConnected) return;
      const age = t - t0; x.clearRect(0, 0, W, H);
      P.forEach(p => { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2600) / 1200); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r))); x.restore(); });
      if (age < 3800) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }

  // ---------- Full-screen celebration ----------
  // opts: { side: 'd'|'r'|'i'|'g', kicker, title, sub, note, big, miss }
  const queue = []; let showing = false;
  function celebrate(opts) { queue.push(opts); if (!showing) next(); }
  function next() {
    const o = queue.shift(); if (!o) { showing = false; return; } showing = true;
    const tvl = window.enTvLayer && window.enTvLayer();
    if (tvl && o.tvOnly) { confetti(tvl, o.side, 220); window.enSound.play(o.big ? 'big' : 'fanfare'); setTimeout(next, 600); return; }
    const back = h('div', 'cb-back cb-' + (o.side || 'g') + (o.miss ? ' cb-miss' : '')); back.setAttribute('role', 'alertdialog'); back.setAttribute('aria-label', (o.kicker || '') + ' ' + (o.title || ''));
    const card = h('div', 'cb-card');
    if (o.kicker) card.append(h('p', 'cb-k', o.kicker));
    card.append(h('h2', 'cb-t', o.title || ''));
    if (o.sub) card.append(h('p', 'cb-s', o.sub));
    if (o.note) card.append(h('p', 'cb-n', o.note));
    card.append(h('p', 'cb-tap', 'Tap anywhere to close'));
    back.append(card); (tvl || document.body).append(back);
    if (!o.miss) confetti(back, o.side, o.big ? 260 : 170);
    window.enSound.play(o.miss ? 'womp' : o.big ? 'big' : 'fanfare');
    try { if (navigator.vibrate) navigator.vibrate(o.miss ? [120] : o.big ? [80, 60, 80, 60, 240] : [70, 50, 160]); } catch (e) {}
    let done = false;
    const close = () => { if (done) return; done = true; back.classList.add('out'); setTimeout(() => { back.remove(); next(); }, 260); };
    back.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    setTimeout(close, o.big ? 7000 : 5200);
  }
  window.enCelebrate = celebrate;

  // ---------- Floating emoji (group reactions) ----------
  function floatEmoji(emoji, opts) {
    const host = (window.enTvLayer && window.enTvLayer()) || document.body;
    if (calm()) { const t = h('div', 'pl-toast', (opts && opts.who ? opts.who + ' ' : '') + emoji); host.append(t); setTimeout(() => t.remove(), 2200); return; }
    const n = (opts && opts.n) || 9, layer = h('div', 'fe-layer'); host.append(layer);
    for (let i = 0; i < n; i++) {
      const s = h('span', 'fe', emoji); s.style.left = (8 + Math.random() * 84) + '%'; s.style.animationDelay = (i * 90 + Math.random() * 120) + 'ms'; s.style.fontSize = (28 + Math.random() * 26) + 'px'; s.style.setProperty('--dx', ((Math.random() - .5) * 120) + 'px');
      layer.append(s);
    }
    if (opts && opts.who) { const w = h('div', 'fe-who', opts.who + ' ' + emoji); layer.append(w); }
    window.enSound.play('pop');
    setTimeout(() => layer.remove(), 3600);
  }
  window.enFloat = floatEmoji;

  // ---------- Live betting odds: chance Democrats win each chamber (Kalshi) ----------
  const ODDS_URL = '/.netlify/functions/odds';
  let odds = null, oddsMode = store.get('en-odds-mode') === 'house' ? 'house' : 'senate', oddsT = null, oddsFail = 0;
  const pct = (v) => Math.round(v * 100);
  const tf = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  const df = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  async function loadOdds() {
    try { const r = await fetch(ODDS_URL, { cache: 'no-store' }); const j = r.ok ? await r.json() : null; if (j && j.ok) { odds = j; oddsFail = 0; } else oddsFail++; }
    catch (e) { oddsFail++; }
    paintOdds();
  }
  let clipN = 0;
  function chart(series, w, hgt, night) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt); svg.setAttribute('width', '100%'); svg.setAttribute('class', 'od-svg'); svg.setAttribute('role', 'img');
    const L = 34, R = 10, T = 10, B = 22, iw = w - L - R, ih = hgt - T - B;
    const t0 = series[0][0], t1 = series[series.length - 1][0] || t0 + 1;
    const X = (t) => L + (t1 === t0 ? iw : (t - t0) / (t1 - t0) * iw), Y = (v) => T + (1 - v) * ih;
    const mk = (tag, a) => { const n = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
    [0, .25, .5, .75, 1].forEach(v => { svg.append(mk('line', { x1: L, x2: w - R, y1: Y(v), y2: Y(v), class: v === .5 ? 'od-mid' : 'od-grid' })); const t = mk('text', { x: L - 6, y: Y(v) + 4, class: 'od-ax', 'text-anchor': 'end' }); t.textContent = pct(v) + '%'; svg.append(t); });
    // shading: above 50% leans Dem, below leans GOP
    const cid = 'od' + (++clipN), clipUp = mk('clipPath', { id: cid + 'u' }), clipDn = mk('clipPath', { id: cid + 'd' });
    clipUp.append(mk('rect', { x: L, y: T, width: iw, height: ih / 2 })); clipDn.append(mk('rect', { x: L, y: T + ih / 2, width: iw, height: ih / 2 }));
    svg.append(clipUp, clipDn);
    const pts = series.map(([t, v]) => X(t).toFixed(1) + ',' + Y(v).toFixed(1));
    const area = 'M' + X(t0) + ',' + Y(.5) + ' L' + pts.join(' L') + ' L' + X(t1) + ',' + Y(.5) + ' Z';
    svg.append(mk('path', { d: area, class: 'od-ad', 'clip-path': 'url(#' + cid + 'u)' }), mk('path', { d: area, class: 'od-ar', 'clip-path': 'url(#' + cid + 'd)' }));
    svg.append(mk('path', { d: 'M' + pts.join(' L'), class: 'od-line' }));
    const last = series[series.length - 1]; svg.append(mk('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4.5, class: 'od-dot' }));
    // x labels: start, middle, end
    [t0, (t0 + t1) / 2, t1].forEach((t, k) => { const tx = mk('text', { x: X(t), y: hgt - 6, class: 'od-ax', 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' }); tx.textContent = night ? tf.format(new Date(t * 1000)) : df.format(new Date(t * 1000)); svg.append(tx); });
    // hover: crosshair + readout
    const hair = mk('line', { x1: 0, x2: 0, y1: T, y2: T + ih, class: 'od-hair' }); hair.style.display = 'none';
    const hd = mk('circle', { r: 4, class: 'od-dot' }); hd.style.display = 'none'; svg.append(hair, hd);
    svg.__hover = (clientX, rect, readout) => {
      const px = (clientX - rect.left) / rect.width * w; let best = series[0];
      series.forEach(p => { if (Math.abs(X(p[0]) - px) < Math.abs(X(best[0]) - px)) best = p; });
      hair.setAttribute('x1', X(best[0])); hair.setAttribute('x2', X(best[0])); hair.style.display = ''; hd.setAttribute('cx', X(best[0])); hd.setAttribute('cy', Y(best[1])); hd.style.display = '';
      readout((night ? tf.format(new Date(best[0] * 1000)) + ' CT' : df.format(new Date(best[0] * 1000)) + ', ' + tf.format(new Date(best[0] * 1000)) + ' CT') + ' · Dems ' + pct(best[1]) + '% · GOP ' + (100 - pct(best[1])) + '%');
    };
    svg.__leave = () => { hair.style.display = 'none'; hd.style.display = 'none'; };
    return svg;
  }
  function paintOdds() {
    const box = document.getElementById('en-odds'); if (!box) return;
    let s = odds && odds.series && odds.series[oddsMode];
    if (!s || s.length < 2) { box.hidden = true; return; }
    if (odds.now && odds.now[oddsMode] != null && odds.at / 1000 > s[s.length - 1][0]) s = s.concat([[Math.floor(odds.at / 1000), odds.now[oddsMode]]]);   // end the line at the live price
    box.hidden = false; box.replaceChildren();
    const night = odds.range === 'night';
    const now = (odds.now && odds.now[oddsMode] != null) ? odds.now[oddsMode] : s[s.length - 1][1];
    const first = s[0][1], move = Math.round((now - first) * 100);
    const hd = h('div', 'od-h');
    const tt = h('div', ''); tt.append(h('h3', '', 'Betting odds: who wins the ' + (oddsMode === 'senate' ? 'Senate' : 'House') + '?'), h('p', '', 'Kalshi traders’ chance Democrats win control · ' + (night ? 'tonight, live' : 'last 2 weeks') + ' · updates every minute'));
    const mm = h('div', 'en-mapmode'); mm.setAttribute('role', 'group'); mm.setAttribute('aria-label', 'Chamber');
    [['senate', 'Senate'], ['house', 'House']].forEach(([k, t]) => { const b = h('button', '', t); b.type = 'button'; b.setAttribute('aria-pressed', String(oddsMode === k)); b.addEventListener('click', () => { oddsMode = k; store.set('en-odds-mode', k); paintOdds(); }); mm.append(b); });
    hd.append(tt, mm);
    const big = h('div', 'od-big');
    const dB = h('span', 'd'); dB.append(h('b', '', pct(now) + '%'), h('small', '', 'Dems'));
    const rB = h('span', 'r'); rB.append(h('b', '', (100 - pct(now)) + '%'), h('small', '', 'GOP'));
    const mv = h('span', 'mv ' + (move > 0 ? 'up' : move < 0 ? 'dn' : ''), move === 0 ? 'No change' : (move > 0 ? '▲ Dems +' : '▼ Dems ') + move + ' pts ' + (night ? 'tonight' : 'in 2 weeks'));
    big.append(dB, rB, mv);
    const wrap = h('div', 'od-chart'); const svg = chart(s, 600, 190, night); svg.setAttribute('aria-label', 'Chance Democrats win the ' + oddsMode + ', from ' + pct(first) + '% to ' + pct(now) + '%');
    const read = h('p', 'od-read', 'Touch the chart to see any moment'); wrap.append(svg);
    const hover = (e) => { const pt = e.touches ? e.touches[0] : e; svg.__hover(pt.clientX, svg.getBoundingClientRect(), (t) => { read.textContent = t; }); };
    svg.addEventListener('pointermove', hover); svg.addEventListener('pointerdown', hover);
    svg.addEventListener('pointerleave', () => { svg.__leave(); read.textContent = 'Touch the chart to see any moment'; });
    const src = h('p', 'od-src'); const a = h('a', '', 'Kalshi'); a.href = 'https://kalshi.com/markets/controls/senate-winner'; if (oddsMode === 'house') a.href = 'https://kalshi.com/markets/controlh/house-winner'; a.target = '_blank'; a.rel = 'noopener';
    src.append(document.createTextNode('Source: '), a, document.createTextNode(' prediction market prices — what traders are betting, not a poll or forecast. As of ' + tf.format(new Date(odds.at)) + ' CT.'));
    box.append(hd, big, wrap, read, src);
  }
  function oddsLoop() {
    clearTimeout(oddsT);
    const visible = !document.hidden && ((document.getElementById('night') && !document.getElementById('night').hidden) || (window.enTvIsOpen && window.enTvIsOpen()));
    if (visible) loadOdds();
    oddsT = setTimeout(oddsLoop, oddsFail > 3 ? 300000 : 60000);
  }
  // TV slide: both chambers at a glance
  window.enTvSlides = window.enTvSlides || [];
  window.enTvSlides.push(() => {
    if (!odds || !odds.series) return null;
    const w = h('div', 'tv-odds'); w.append(h('h2', '', 'Betting odds right now'));
    const row = h('div', 'tv-odds-row');
    [['senate', 'Senate'], ['house', 'House']].forEach(([k, t]) => {
      const s = odds.series[k]; if (!s || s.length < 2) return;
      const now = odds.now && odds.now[k] != null ? odds.now[k] : s[s.length - 1][1];
      const c = h('div', 'tv-odds-c'); c.append(h('h3', '', t));
      const n = h('div', 'tv-nums'); n.append(h('span', 'd', pct(now) + '%'), h('small', '', '–'), h('span', 'r', (100 - pct(now)) + '%')); c.append(n);
      c.append(chart(s, 600, 170, odds.range === 'night')); row.append(c);
    });
    if (!row.children.length) return null;
    w.append(row, h('p', 'tv-src', 'Chance Democrats (blue) or Republicans (red) win control · Kalshi prediction market'));
    return w;
  });
  window.enTvOnOpen = window.enTvOnOpen || []; window.enTvOnOpen.push(() => { if (!odds) loadOdds(); });

  function boot() {
    addSoundButton(); setTimeout(addSoundButton, 2500);
    document.querySelectorAll('.en-tab[data-tab="night"]').forEach(t => t.addEventListener('click', () => setTimeout(() => { if (!odds) loadOdds(); else paintOdds(); }, 0)));
    oddsLoop();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) oddsLoop(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
