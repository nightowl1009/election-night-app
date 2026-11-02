/* Snapshots (app only): a "📸 Snapshot" button on Economy, National Mood and Voting.
   It paints a picture-perfect card (1080 px wide) from the tab's live numbers, shows a preview, and lets you share it
   (phone share sheet), download it, or keep it in a "Saved" history on this device (IndexedDB; falls back to memory). */
(function () {
  'use strict';
  const W = 1080, PAD = 56;
  const SANS = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const data = (k) => { const d = window.dash && window.dash.data && window.dash.data(k); return d && d.status === 'ok' ? d.data : null; };
  const nf = (n) => Math.round(n).toLocaleString('en-US');
  const F = (px, wt, serif) => (wt || '') + ' ' + px + 'px ' + (serif ? SERIF : SANS);
  const KINDS = {
    economy: { tab: 'economy', name: 'Economy', icon: '💵', file: 'economy' },
    mood: { tab: 'mood', name: 'National Mood', icon: '🌡️', file: 'national-mood' },
    voting: { tab: 'voting', name: 'Early Vote', icon: '🗳️', file: 'early-vote' }
  };

  // ---------- storage: IndexedDB with an in-memory fallback ----------
  let mem = [], dbp = null, persisted = true;
  const idb = () => dbp || (dbp = new Promise((res, rej) => {
    try { const q = indexedDB.open('en-snaps', 1); q.onupgradeneeded = () => q.result.createObjectStore('s', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); }
  }));
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('s', mode), r = fn(t.objectStore('s')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  async function listAll() { try { const a = await tx('readonly', (s) => s.getAll()); return (a || []).concat(mem).sort((p, q) => q.at - p.at); } catch (e) { persisted = false; return mem.slice().sort((p, q) => q.at - p.at); } }
  async function putSnap(rec) { try { await tx('readwrite', (s) => s.put(rec)); } catch (e) { persisted = false; mem.push(rec); } }
  async function delSnap(id) { mem = mem.filter((r) => r.id !== id); try { await tx('readwrite', (s) => s.delete(id)); } catch (e) {} }

  // ---------- canvas helpers ----------
  const rr = (x, X, Y, w, hh, r) => { r = Math.min(r, w / 2, hh / 2); x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + hh, r); x.arcTo(X + w, Y + hh, X, Y + hh, r); x.arcTo(X, Y + hh, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const fit = (x, txt, px, wt, serif, max) => { let s = px; x.font = F(s, wt, serif); while (s > 12 && x.measureText(txt).width > max) { s -= 2; x.font = F(s, wt, serif); } return s; };
  const wrap = (x, t, max) => { const out = []; let ln = ''; String(t).split(' ').forEach((w) => { const tr = ln ? ln + ' ' + w : w; if (x.measureText(tr).width > max && ln) { out.push(ln); ln = w; } else ln = tr; }); if (ln) out.push(ln); return out; };
  const glow = (x, cx, cy, r, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, '0')); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fillRect(0, 0, x.canvas.width, x.canvas.height); };
  const stamp = (d) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(',', ',');

  function frame(kind, H, accents, now) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const K = KINDS[kind];
    const bg = x.createLinearGradient(0, 0, W * .4, H); bg.addColorStop(0, '#0a0f24'); bg.addColorStop(.55, '#0f1830'); bg.addColorStop(1, '#0a1022'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    glow(x, 0, 0, 900, accents[0], .42); glow(x, W, H * .28, 800, accents[1], .3); glow(x, W * .5, H, 900, accents[0], .22);
    x.fillStyle = 'rgba(255,255,255,.05)'; for (let gy = 24; gy < H; gy += 48) for (let gx = 24; gx < W; gx += 48) { x.beginPath(); x.arc(gx, gy, 1.6, 0, 6.3); x.fill(); }
    // star ribbon across the top
    const rb = x.createLinearGradient(0, 0, W, 0); rb.addColorStop(0, '#dc2626'); rb.addColorStop(.5, '#f8fafc'); rb.addColorStop(1, '#2563eb'); x.fillStyle = rb; x.fillRect(0, 0, W, 10);
    x.textBaseline = 'alphabetic'; x.fillStyle = '#fbbf24'; x.font = F(26, '700'); if ('letterSpacing' in x) x.letterSpacing = '5px'; x.fillText('ELECTION NIGHT 2026  ·  SNAPSHOT', PAD, 92); if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.fillStyle = '#fff'; const ts = fit(x, K.icon + '  ' + K.name, 88, '', true, W - PAD * 2); x.shadowColor = accents[0] + 'aa'; x.shadowBlur = 36; x.fillText(K.icon + '  ' + K.name, PAD, 196); x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = F(30); x.fillText(stamp(now), PAD, 248);
    return { c, x, y: 300 };
  }
  function footer(x, H, sources, now) {
    x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2; x.beginPath(); x.moveTo(PAD, H - 168); x.lineTo(W - PAD, H - 168); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.58)'; x.font = F(21); const ln = wrap(x, 'Sources: ' + sources, W - PAD * 2).slice(0, 3); ln.forEach((t, i) => x.fillText(t, PAD, H - 128 + i * 28));
    x.fillStyle = '#fbbf24'; x.font = F(26, '700'); x.textAlign = 'right'; x.fillText('election-night.netlify.app', W - PAD, H - 40); x.textAlign = 'left';
    x.fillStyle = 'rgba(255,255,255,.5)'; x.font = F(21); x.fillText('Latest readings when the snapshot was taken', PAD, H - 40);
  }
  function chip(x, X, Y, txt, col, maxW) {
    const s = fit(x, txt, 26, '700', false, maxW - 36); const w = Math.min(maxW, x.measureText(txt).width + 36);
    rr(x, X, Y, w, 44, 22); x.fillStyle = 'rgba(255,255,255,.1)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = col; x.font = F(s, '700'); x.fillText(txt, X + 18, Y + 31);
  }
  const UP = '#fdba74', DN = '#67e8f9', FLAT = '#cbd5e1';
  const arrow = (d) => d > 0 ? '▲' : d < 0 ? '▼' : '■';
  const tone = (d) => d > 0 ? UP : d < 0 ? DN : FLAT;
  const shortSrc = (rows) => { const seen = []; rows.forEach((r) => { const s = String(r.source || '').split(/[,(;]/)[0].trim(); if (s && !seen.includes(s)) seen.push(s); }); return seen.join(' · '); };

  // ---------- Economy ----------
  const pay = (price, rate) => { const L = price * .8, r = rate / 1200; return L * r / (1 - Math.pow(1 + r, -360)); };
  function econSpecs(rows) {
    const by = {}; rows.forEach((r) => { by[r.id] = r; }); const t = [];
    const pts = (r) => { const d = r.value - r.prior; return { d, txt: arrow(d) + ' ' + Math.abs(d).toFixed(1) + ' pts vs ' + r.prior_label }; };
    if (by.unemployment) { const r = by.unemployment, p = pts(r); t.push({ ic: '👷', label: 'Unemployment', val: r.value.toFixed(1) + '%', chip: p.txt, col: tone(p.d), ac: '#38bdf8', asof: r.asof }); }
    if (by.inflation) { const r = by.inflation, p = pts(r); t.push({ ic: '🛒', label: 'Inflation (12 mo)', val: r.value.toFixed(1) + '%', chip: p.txt, col: tone(p.d), ac: '#fb923c', asof: r.asof }); }
    if (by.wages) { const r = by.wages, rl = r.real; t.push({ ic: '💵', label: 'Avg hourly pay', val: '$' + r.value.toFixed(2), chip: rl < 0 ? 'Buys ' + Math.abs(rl).toFixed(1) + '% less than last year' : 'Buys ' + rl.toFixed(1) + '% more than last year', col: rl < 0 ? UP : DN, ac: '#4ade80', asof: r.asof }); }
    if (by.mortgage) { const r = by.mortgage, p = pts(r); t.push({ ic: '🏠', label: '30-yr mortgage', val: r.value.toFixed(2) + '%', chip: p.txt, col: tone(p.d), ac: '#a78bfa', asof: r.asof }); }
    if (by.gas) { const r = by.gas, d = r.value - r.prior; t.push({ ic: '⛽', label: 'Gas (regular)', val: '$' + r.value.toFixed(2), chip: arrow(d) + ' $' + Math.abs(d).toFixed(2) + ' vs ' + r.prior_label, col: tone(d), ac: '#fbbf24', asof: r.asof }); }
    if (by.home) { const r = by.home, d = (r.value / r.prior - 1) * 100; t.push({ ic: '🔑', label: 'Median home price', val: '$' + nf(r.value), chip: arrow(d) + ' ' + Math.abs(d).toFixed(1) + '% vs ' + r.prior_label, col: tone(d), ac: '#34d399', asof: r.asof }); }
    if (by.fed) { const r = by.fed; t.push({ ic: '🏦', label: 'Fed rate target', val: (r.low != null ? r.low.toFixed(2) + '–' : '') + r.value.toFixed(2) + '%', chip: r.value === r.prior ? '■ Unchanged vs ' + r.prior_label : arrow(r.value - r.prior) + ' ' + Math.abs(r.value - r.prior).toFixed(2) + ' pts vs ' + r.prior_label, col: tone(r.value - r.prior), ac: '#f472b6', asof: r.asof }); }
    if (by.home && by.mortgage) { const a = pay(by.home.value, by.mortgage.value), b = pay(by.home.prior, by.mortgage.prior), d = a - b; t.push({ ic: '💳', label: 'Monthly home payment', val: '$' + nf(a) + '/mo', chip: arrow(d) + ' $' + nf(Math.abs(d)) + ' a month vs last year', col: tone(d), ac: '#22d3ee', asof: 'our math: 20% down, 30-yr fixed' }); }
    return { by, tiles: t };
  }
  function drawEcon(rows, now) {
    const { by, tiles } = econSpecs(rows), nr = Math.ceil(tiles.length / 2), heroH = by.debt ? 360 : 0, H = 300 + (heroH ? heroH + 24 : 0) + nr * 294 + 190;
    const f = frame('economy', H, ['#ef4444', '#38bdf8'], now), x = f.x; let y = f.y;
    if (by.debt) {
      const r = by.debt, d = r.value - r.prior; rr(x, PAD, y, W - PAD * 2, heroH, 34); x.save(); x.clip();
      const g = x.createLinearGradient(PAD, y, W - PAD, y + heroH); g.addColorStop(0, '#2a0f1c'); g.addColorStop(1, '#0f1d3a'); x.fillStyle = g; x.fillRect(PAD, y, W - PAD * 2, heroH); glow(x, PAD + 120, y + 40, 520, '#f87171', .38); glow(x, W - PAD, y + heroH, 520, '#38bdf8', .3); x.restore();
      rr(x, PAD, y, W - PAD * 2, heroH, 34); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#fbbf24'; x.font = F(26, '700'); if ('letterSpacing' in x) x.letterSpacing = '4px'; x.fillText('🏛️  NATIONAL DEBT', PAD + 40, y + 70); if ('letterSpacing' in x) x.letterSpacing = '0px';
      x.fillStyle = '#fff'; fit(x, '$' + r.value.toFixed(2) + ' trillion', 150, '', true, W - PAD * 2 - 80); x.shadowColor = '#f87171'; x.shadowBlur = 40; x.fillText('$' + r.value.toFixed(2) + ' trillion', PAD + 40, y + 205); x.shadowBlur = 0;
      chip(x, PAD + 40, y + 236, arrow(d) + ' $' + Math.abs(d).toFixed(2) + 'T vs ' + r.prior_label, tone(d), W - PAD * 2 - 80);
      x.fillStyle = 'rgba(255,255,255,.7)'; x.font = F(22); x.fillText('As of ' + r.asof, PAD + 40, y + 326); y += heroH + 24;
    }
    tiles.forEach((t, i) => {
      const col = i % 2, X = PAD + col * (484 + 0), tw = 484 - 12 + (col ? 12 : 0), TX = col ? W - PAD - 478 : PAD, Y = y + Math.floor(i / 2) * 294, tw2 = 478;
      rr(x, TX, Y, tw2, 270, 28); x.save(); x.clip(); x.fillStyle = '#0d1226'; x.fillRect(TX, Y, tw2, 270); glow(x, TX, Y, 380, t.ac, .38); x.restore();
      rr(x, TX, Y, tw2, 270, 28); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.85)'; const ls = fit(x, t.ic + '  ' + t.label.toUpperCase(), 24, '700', false, tw2 - 56); x.fillText(t.ic + '  ' + t.label.toUpperCase(), TX + 28, Y + 52);
      x.fillStyle = '#fff'; fit(x, t.val, 86, '', true, tw2 - 56); x.shadowColor = t.ac + 'cc'; x.shadowBlur = 28; x.fillText(t.val, TX + 28, Y + 148); x.shadowBlur = 0;
      chip(x, TX + 28, Y + 172, t.chip, t.col, tw2 - 56);
      x.fillStyle = 'rgba(255,255,255,.55)'; fit(x, t.asof, 20, '', false, tw2 - 56); x.fillText(t.asof, TX + 28, Y + 250);
    });
    footer(x, H, shortSrc(rows), now); return f.c;
  }

  // ---------- National mood ----------
  const MOOD = {
    trump: { ac: ['#34d399', '#f87171'], icon: '🇺🇸' }, congress: { ac: ['#34d399', '#f87171'], icon: '🏛️' }, gop_congress: { ac: ['#34d399', '#f87171'], icon: '🐘' }, dem_congress: { ac: ['#34d399', '#f87171'], icon: '🫏' },
    direction: { ac: ['#38bdf8', '#fb923c'], icon: '🧭' }, generic: { ac: ['#3b82f6', '#ef4444'], icon: '🗳️' }
  };
  function drawMood(rows, now) {
    const list = rows.filter((r) => r.a != null && r.b != null), RH = 262, H = 300 + list.length * RH + 190;
    const f = frame('mood', H, ['#3b82f6', '#ef4444'], now), x = f.x; let y = f.y;
    list.forEach((r, i) => {
      const m = MOOD[r.key] || { ac: ['#38bdf8', '#fb923c'], icon: '📊' }, Y = y + i * RH, bw = W - PAD * 2;
      rr(x, PAD, Y, bw, RH - 22, 28); x.save(); x.clip(); x.fillStyle = '#0d1226'; x.fillRect(PAD, Y, bw, RH); glow(x, PAD, Y, 520, m.ac[0], .22); glow(x, W - PAD, Y + RH, 520, m.ac[1], .2); x.restore();
      rr(x, PAD, Y, bw, RH - 22, 28); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#fff'; fit(x, m.icon + '  ' + r.label, 36, '700', false, bw - 70); x.fillText(m.icon + '  ' + r.label, PAD + 32, Y + 58);
      // bar
      const BX = PAD + 32, BW = bw - 64, BY = Y + 84, BH = 62, aw = BW * Math.max(0, r.a) / 100, bwid = BW * Math.max(0, r.b) / 100;
      rr(x, BX, BY, BW, BH, 18); x.fillStyle = 'rgba(255,255,255,.1)'; x.fill(); x.save(); rr(x, BX, BY, BW, BH, 18); x.clip();
      let g = x.createLinearGradient(BX, 0, BX + aw, 0); g.addColorStop(0, m.ac[0]); g.addColorStop(1, m.ac[0] + 'cc'); x.fillStyle = g; x.fillRect(BX, BY, aw, BH);
      g = x.createLinearGradient(BX + BW - bwid, 0, BX + BW, 0); g.addColorStop(0, m.ac[1] + 'cc'); g.addColorStop(1, m.ac[1]); x.fillStyle = g; x.fillRect(BX + BW - bwid, BY, bwid, BH);
      x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(BX, BY, BW, BH / 2); x.restore();
      x.fillStyle = '#fff'; x.font = F(34, '700', true); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 6; x.fillText(r.a.toFixed(1) + '%', BX + 20, BY + 43); x.textAlign = 'right'; x.fillText(r.b.toFixed(1) + '%', BX + BW - 20, BY + 43); x.textAlign = 'left'; x.shadowBlur = 0;
      x.font = F(24, '600'); x.fillStyle = 'rgba(255,255,255,.9)'; x.fillText(r.a_label, BX, BY + BH + 38); x.textAlign = 'right'; x.fillText(r.b_label, BX + BW, BY + BH + 38); x.textAlign = 'left';
      const net = r.a - r.b; const lead = Math.abs(net) < .05 ? 'Even' : (net > 0 ? r.a_label : r.b_label) + ' +' + Math.abs(net).toFixed(1);
      x.fillStyle = '#fbbf24'; x.font = F(24, '700'); x.textAlign = 'center'; x.fillText(lead, BX + BW / 2, BY + BH + 38); x.textAlign = 'left';
      x.fillStyle = 'rgba(255,255,255,.55)'; fit(x, (r.source || '') + ' · ' + (r.dates || ''), 20, '', false, bw - 64); x.fillText((r.source || '') + ' · ' + (r.dates || ''), BX, BY + BH + 72);
    });
    footer(x, H, 'RealClearPolling averages, Quinnipiac and other national polls, as listed on each bar. Polls are snapshots with margins of error.', now); return f.c;
  }

  // ---------- Early vote ----------
  const MAIL = '#a78bfa', INP = '#2dd4bf';
  function drawVote(rows, now) {
    const us = rows.find((r) => r.st === 'US'), states = rows.filter((r) => r.st !== 'US').sort((a, b) => b.total - a.total).slice(0, 10), max = states.length ? states[0].total : 1, RH = 98;
    const H = 300 + (us ? 470 : 0) + (states.length ? 90 + states.length * RH : 0) + 190;
    const f = frame('voting', H, ['#a78bfa', '#2dd4bf'], now), x = f.x; let y = f.y;
    if (us) {
      const bw = W - PAD * 2; rr(x, PAD, y, bw, 440, 34); x.save(); x.clip(); x.fillStyle = '#0d1226'; x.fillRect(PAD, y, bw, 440); glow(x, PAD + 100, y, 560, MAIL, .36); glow(x, W - PAD, y + 440, 560, INP, .3); x.restore();
      rr(x, PAD, y, bw, 440, 34); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#fbbf24'; x.font = F(26, '700'); if ('letterSpacing' in x) x.letterSpacing = '4px'; x.fillText('BALLOTS CAST NATIONWIDE', PAD + 40, y + 70); if ('letterSpacing' in x) x.letterSpacing = '0px';
      const big = nf(us.total); x.fillStyle = '#fff'; fit(x, big, 160, '', true, bw - 80); x.shadowColor = '#c4b5fd'; x.shadowBlur = 40; x.fillText(big, PAD + 40, y + 205); x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,255,255,.75)'; x.font = F(26); x.fillText('Early and mail voting · as of ' + us.as_of, PAD + 40, y + 252);
      const mp = us.mail / us.total, BX = PAD + 40, BW = bw - 80, BY = y + 292;
      x.save(); rr(x, BX, BY, BW, 56, 18); x.clip(); x.fillStyle = MAIL; x.fillRect(BX, BY, BW * mp, 56); x.fillStyle = INP; x.fillRect(BX + BW * mp, BY, BW * (1 - mp), 56); x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(BX, BY, BW, 28); x.restore();
      x.fillStyle = '#fff'; x.font = F(26, '700'); x.fillText(Math.round(mp * 100) + '% by mail', BX + 18, BY + 38); x.textAlign = 'right'; x.fillText(Math.round((1 - mp) * 100) + '% in person', BX + BW - 18, BY + 38); x.textAlign = 'left';
      x.fillStyle = 'rgba(255,255,255,.8)'; x.font = F(24); x.fillText(nf(us.mail) + ' mail', BX, BY + 92); x.textAlign = 'right'; x.fillText(nf(us.inperson) + ' in person', BX + BW, BY + 92); x.textAlign = 'left';
      y += 470;
    }
    if (states.length) {
      x.fillStyle = '#fff'; x.font = F(40, '', true); x.fillText('Top states so far', PAD, y + 44);
      x.font = F(22, '600'); x.fillStyle = MAIL; x.fillRect(W - PAD - 300, y + 24, 18, 18); x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText('Mail', W - PAD - 274, y + 42); x.fillStyle = INP; x.fillRect(W - PAD - 190, y + 24, 18, 18); x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText('In person', W - PAD - 164, y + 42);
      y += 90;
      states.forEach((s, i) => {
        const Y = y + i * RH, LX = PAD, BX = PAD + 250, BWm = W - PAD - BX - 150, bwid = Math.max(6, BWm * s.total / max), mw = bwid * (s.mail / s.total);
        x.fillStyle = '#fff'; fit(x, s.state, 30, '700', false, 230); x.fillText(s.state, LX, Y + 50);
        x.save(); rr(x, BX, Y + 14, bwid, 54, 14); x.clip(); x.fillStyle = MAIL; x.fillRect(BX, Y + 14, mw, 54); x.fillStyle = INP; x.fillRect(BX + mw, Y + 14, bwid - mw, 54); x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(BX, Y + 14, bwid, 27); x.restore();
        x.fillStyle = '#fff'; x.font = F(32, '700', true); x.textAlign = 'right'; x.fillText(s.total >= 1e6 ? (s.total / 1e6).toFixed(2) + 'M' : Math.round(s.total / 1e3) + 'K', W - PAD, Y + 52); x.textAlign = 'left';
      });
    }
    footer(x, H, 'On Point Politics tracker, compiled by civicAPI from state and county election offices (counts as of ' + (us ? us.as_of : 'the date shown') + ').', now); return f.c;
  }

  // ---------- make, preview, share, history ----------
  const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
  function toast(t) { const s = h('div', 'sn-toast', t); document.body.append(s); setTimeout(() => s.remove(), 2400); }
  async function render(kind) {
    const now = new Date(); let cv;
    if (kind === 'economy') { const r = data('economy'); if (!r || !r.length) return null; cv = drawEcon(r, now); }
    else if (kind === 'mood') { const r = data('mood'); if (!r || !r.length) return null; cv = drawMood(r, now); }
    else { const r = data('earlyvote'); if (!r || !r.length) return null; cv = drawVote(r, now); }
    const blob = await toBlob(cv); return blob && { id: kind + '-' + now.getTime(), kind, at: now.getTime(), w: cv.width, h: cv.height, blob };
  }
  const label = (rec) => KINDS[rec.kind].name + ' · ' + new Date(rec.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fname = (rec) => 'election-night-' + KINDS[rec.kind].file + '-' + new Date(rec.at).toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.png';
  async function send(rec) {
    const file = new File([rec.blob], fname(rec), { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: label(rec) }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    save(rec); toast('Picture downloaded — send it to anyone.');
  }
  function save(rec) { const a = document.createElement('a'); a.href = URL.createObjectURL(rec.blob); a.download = fname(rec); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  let layer = null;
  function closeLayer() { if (!layer) return; const l = layer; layer = null; document.documentElement.classList.remove('sn-open'); if (l.animate && !calm()) { const a = l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }); a.onfinish = () => l.remove(); } else l.remove(); }
  function sheet(title) {
    closeLayer(); const ov = h('div', 'sn-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', title); const sh = h('div', 'sn-sheet');
    const top = h('div', 'sn-top'); top.append(h('b', '', title)); const x = h('button', 'sn-x', '✕'); x.setAttribute('aria-label', 'Close'); x.onclick = closeLayer; top.append(x); sh.append(top); ov.append(sh);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeLayer(); }); document.body.append(ov); layer = ov; document.documentElement.classList.add('sn-open'); return sh;
  }
  const btn = (cls, txt, fn) => { const b = h('button', cls, txt); b.type = 'button'; b.onclick = fn; return b; };
  function viewer(rec, saved) {
    const sh = sheet(label(rec)), url = URL.createObjectURL(rec.blob), im = h('img', 'sn-img'); im.src = url; im.alt = label(rec); sh.append(im);
    const row = h('div', 'sn-row');
    row.append(btn('sn-b gold', '📤 Share', () => send(rec)));
    if (!saved) { const sv = btn('sn-b', '💾 Save to history', async () => { sv.disabled = true; await putSnap(rec); sv.textContent = '✓ Saved'; refreshCounts(); toast(persisted ? 'Saved to your snapshots.' : 'Saved for this visit (this browser blocks storage).'); }); row.append(sv); }
    row.append(btn('sn-b', '⬇️ Download', () => save(rec)));
    if (saved) row.append(btn('sn-b warn', '🗑️ Delete', async () => { await delSnap(rec.id); refreshCounts(); toast('Deleted.'); gallery(); }));
    sh.append(row); if (saved) { const back = btn('sn-link', '← All saved snapshots', gallery); sh.append(back); }
  }
  async function gallery() {
    const sh = sheet('Saved snapshots'), all = await listAll();
    if (!all.length) { sh.append(h('p', 'sn-empty', 'Nothing saved yet. Tap 📸 Snapshot on the Economy, National Mood or Voting tab, then “Save to history”.')); return; }
    if (!persisted) sh.append(h('p', 'sn-empty', 'This browser is blocking storage, so these are kept only until you close the app.'));
    const g = h('div', 'sn-grid');
    all.forEach((r) => { const c = h('button', 'sn-th'); c.type = 'button'; const im = h('img'); im.src = URL.createObjectURL(r.blob); im.alt = label(r); im.loading = 'lazy'; c.append(im, h('span', '', label(r))); c.onclick = () => viewer(r, true); g.append(c); });
    sh.append(g);
  }
  function flash() { if (calm()) return; const f = h('div', 'sn-flash'); document.body.append(f); f.animate([{ opacity: .85 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = () => f.remove(); }
  const busy = {};
  async function snap(kind) {
    if (busy[kind]) return; busy[kind] = 1;
    try { const rec = await render(kind); if (!rec) { toast('Still loading the numbers — try again in a moment.'); return; } flash(); viewer(rec, false); }
    catch (e) { toast('Could not make the picture.'); } finally { busy[kind] = 0; }
  }

  // ---------- buttons on the tabs ----------
  let count = 0;
  async function refreshCounts() { const n = (await listAll()).length; count = n; document.querySelectorAll('.sn-saved b').forEach((b) => { b.textContent = n ? ' (' + n + ')' : ''; }); }
  const BLURB = {
    economy: 'Freeze today\'s debt, jobs, prices, pay and mortgage numbers into one picture you can text to a friend, or keep to look back on later and see what changed.',
    mood: 'Lock in where the country stands right now: presidential and congressional approval, which way people say things are headed, and the generic ballot. Save it, then compare after the votes are counted.',
    voting: 'Capture the early-vote total, the mail vs in-person split and the biggest states as of this moment. Early numbers move every day, so a snapshot shows what the race looked like then.'
  };
  function addBars() {
    Object.keys(KINDS).forEach((kind) => {
      const p = document.getElementById(KINDS[kind].tab); if (!p) return;
      let bar = p.querySelector('.sn-bar');
      if (!bar) {
        bar = h('div', 'sn-bar'); bar.dataset.noswipe = '';
        bar.append(h('div', 'sn-hd', '📸 Take a snapshot'), h('p', 'sn-blurb', BLURB[kind] + ' Pictures are saved on this device only, and nothing is posted anywhere until you share it.'));
        const row = h('div', 'sn-btns');
        row.append(btn('sn-go', '📸 Take snapshot', () => snap(kind)));
        const sv = btn('sn-saved', '🗂️ Saved snapshots', gallery); sv.append(h('b', '', count ? ' (' + count + ')' : '')); row.append(sv);
        bar.append(row);
      }
      if (p.lastElementChild !== bar) p.append(bar);
    });
  }
  const CSS = `
.sn-bar { margin:22px 0 8px; padding:16px; border-radius:18px; border:1px solid rgba(120,120,140,.3); background:var(--cds-surface-2, rgba(120,120,140,.12)); }
.sn-hd { font-weight:800; font-size:1rem; margin-bottom:4px; }
.sn-blurb { margin:0 0 12px; font-size:.88rem; line-height:1.45; opacity:.85; }
.sn-btns { display:flex; gap:8px; flex-wrap:wrap; }
.sn-go, .sn-saved, .sn-b { font:inherit; cursor:pointer; border-radius:999px; border:1px solid rgba(255,255,255,.2); }
.sn-go { padding:.5rem 1rem; font-weight:700; font-size:.88rem; color:#1a1300; background:linear-gradient(135deg,#fde68a,#fbbf24 55%,#f59e0b); box-shadow:0 6px 18px rgba(245,158,11,.38), inset 0 1px 0 rgba(255,255,255,.55); border:none; transition: transform .15s; }
.sn-go:active { transform: scale(.95); }
.sn-saved { padding:.5rem .9rem; font-weight:600; font-size:.85rem; color:var(--cds-text-primary, #111); background:var(--cds-surface-2, rgba(120,120,140,.14)); border-color:rgba(120,120,140,.35); }
.sn-ov { position:fixed; inset:0; z-index:100000; display:flex; align-items:flex-end; justify-content:center; background:rgba(5,8,20,.8); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: sn-fade .2s ease-out; }
.sn-sheet { width:min(100%, 560px); max-height:94vh; overflow:auto; border-radius:24px 24px 0 0; padding:14px 16px calc(18px + env(safe-area-inset-bottom)); color:#fff; background:linear-gradient(170deg,#121a33,#0a0f24); box-shadow:0 -20px 60px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.1); animation: sn-up .38s cubic-bezier(.22,1,.36,1); }
@media (min-width:700px) { .sn-ov { align-items:center; } .sn-sheet { border-radius:24px; } }
.sn-top { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; } .sn-top b { font-size:.95rem; }
.sn-x { width:34px; height:34px; border-radius:50%; border:none; background:rgba(255,255,255,.12); color:#fff; font-size:1rem; cursor:pointer; }
.sn-img { display:block; width:100%; max-height:66vh; object-fit:contain; border-radius:16px; box-shadow:0 14px 40px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.12); animation: sn-pop .55s cubic-bezier(.2,1.2,.4,1); background:#0a0f24; }
.sn-row { display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:12px; }
.sn-b { padding:.7rem .6rem; font-weight:700; font-size:.88rem; color:#fff; background:rgba(255,255,255,.1); } .sn-b:disabled { opacity:.7; }
.sn-b.gold { color:#1a1300; border:none; background:linear-gradient(135deg,#fde68a,#fbbf24 55%,#f59e0b); } .sn-b.warn { color:#fecaca; }
.sn-link { display:block; margin:12px auto 0; background:none; border:none; color:#93c5fd; font:inherit; font-size:.85rem; cursor:pointer; text-decoration:underline; }
.sn-empty { margin:8px 2px 14px; font-size:.9rem; color:rgba(255,255,255,.78); line-height:1.45; }
.sn-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; }
.sn-th { padding:0; border:none; background:rgba(255,255,255,.06); border-radius:14px; overflow:hidden; cursor:pointer; color:#fff; text-align:left; box-shadow:inset 0 0 0 1px rgba(255,255,255,.1); }
.sn-th img { display:block; width:100%; aspect-ratio: 3/4; object-fit:cover; object-position:top; } .sn-th span { display:block; padding:.45rem .55rem .55rem; font-size:.74rem; line-height:1.25; color:rgba(255,255,255,.85); }
.sn-flash { position:fixed; inset:0; z-index:100001; background:#fff; pointer-events:none; }
.sn-toast { position:fixed; left:50%; bottom:calc(24px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:100002; max-width:90vw; padding:.65rem 1rem; border-radius:999px; background:#111827; color:#fff; font-size:.88rem; box-shadow:0 10px 30px rgba(0,0,0,.4); animation: sn-fade .2s ease-out; }
html.sn-open, html.sn-open body { overflow:hidden; }
@keyframes sn-fade { from { opacity:0; } } @keyframes sn-up { from { transform: translateY(60px); opacity:0; } } @keyframes sn-pop { from { transform: scale(.86) rotate(-1.5deg); opacity:0; } }
@media (prefers-reduced-motion: reduce) { .sn-ov, .sn-sheet, .sn-img, .sn-toast { animation:none; } }`;
  function boot() {
    if (!window.dash || !window.dash.onData) return setTimeout(boot, 300);
    const st = h('style'); st.id = 'sn-css'; st.textContent = CSS; document.head.append(st);
    addBars(); refreshCounts().then(addBars); new MutationObserver(addBars).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });
    window.enSnap = { make: snap, render, gallery, list: listAll };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
