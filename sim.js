/* Election Night 2026 — practice run.
   Plays a made-up election night (6 PM ET to 1:30 AM ET) in about 3 minutes, on this
   phone only. Nothing is saved or sent anywhere; real data comes back when it ends.
   Start it from the "Practice run" button at the bottom of the page, or open the app
   with ?sim in the address. */
(function () {
  const START = Date.UTC(2026, 10, 3, 22, 58, 0);   // 5:58 PM ET, Nov 3
  const END = Date.UTC(2026, 10, 4, 6, 30, 0);      // 1:30 AM ET, Nov 4
  const REAL_MS = 180000;                            // 3 minutes
  const STEP_MS = 2500;                              // redraw every 2.5 seconds
  let t0 = 0, timer = null, plan = null, bar = null;

  const rows = (id) => { const d = window.dash && window.dash.data(id); return d && d.status === 'ok' ? d.data : []; };
  const simNow = () => Math.min(END, START + (Date.now() - t0) * (END - START) / REAL_MS);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const etClock = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

  // Build a made-up outcome for every race the app tracks, loosely anchored on today's polls/odds
  function buildPlan() {
    const closeOf = new Map();
    rows('pollclose').forEach(c => String(c.races || '').split(',').forEach(k => closeOf.set(k.trim(), Date.parse(c.close_utc))));
    const base = new Map();
    const fromRow = (r) => {
      if (r.avg_d != null && r.avg_r != null) return Number(r.avg_d) - Number(r.avg_r);
      if (r.poll_d != null && r.poll_r != null) return Number(r.poll_d) - Number(r.poll_r);
      if (r.kalshi_d != null) return (Number(r.kalshi_d) - 50) / 6;
      return r.rating === 'Lean D' ? 4 : r.rating === 'Lean R' ? -4 : 0;
    };
    rows('senate').forEach(r => base.set('SEN-' + r.id, { m: fromRow(r), d: r.cand_d, r: r.cand_r, pd: r.party_d || 'D' }));
    rows('governor').forEach(r => base.set('GOV-' + r.id, { m: fromRow(r), d: r.cand_d, r: r.cand_r, pd: r.party_d || 'D' }));
    rows('house').forEach(r => base.set('HOU-' + r.id, { m: fromRow(r), d: r.cand_d, r: r.cand_r, pd: r.party_d || 'D' }));
    // Cooper County ballot: candidate names come from the local dataset ("Name (R, incumbent) · Name (D)")
    const LOCAL_LEAN = { 'MO-03': -22, 'MO-H48': -40, 'MO-H58': -45 };
    rows('local').forEach(r => {
      if (!(r.race in LOCAL_LEAN)) return;
      const nm = (p) => { const m = String(r.cands || '').split('·').map(t => t.trim()).find(t => new RegExp('\\(' + p + '\\b').test(t)); return m ? m.replace(/\s*\(.*$/, '') : ''; };
      base.set(r.race, { m: LOCAL_LEAN[r.race], d: nm('D') || 'Democrat', r: nm('R') || 'Republican', pd: 'D' });
    });
    const swing = gauss() * 2;              // a national polling miss, same for every race tonight
    return rows('results').map(x => {
      const b = base.get(x.race), mo = /^MO-/.test(x.race), retain = /^MO-J/.test(x.race), measure = mo && !b && x.race !== 'MO-AUD';
      const margin = retain ? rnd(8, 30) : measure ? rnd(-14, 16) : (b ? b.m : x.race === 'MO-AUD' ? -4 : 0) + swing + gauss() * 3.5;
      const other = measure || retain ? 0 : rnd(1, 3);
      const d = (100 - other + margin) / 2, r = (100 - other - margin) / 2;
      const close = closeOf.get(x.race) || Date.UTC(2026, 10, 4, 1, 0, 0);
      const absM = Math.abs(margin);
      return {
        race: x.race, close, d, r, margin,
        tau: rnd(70, 140) * 60000,                         // how fast the count comes in
        early: rnd(-6, 6),                                 // early-count lean that fades as votes are counted
        callAt: absM >= 12 ? 0 : absM >= 6 ? rnd(20, 45) : absM >= 3 ? rnd(55, 80) : absM >= 1.2 ? rnd(85, 95) : 101,
        win: retain ? (margin > 0 ? ['Retained', 'Y'] : ['Not retained', 'N'])
          : measure ? (margin > 0 ? ['Passes', 'Y'] : ['Fails', 'N'])
          : x.race === 'MO-AUD' ? (margin > 0 ? ['Quentin Wilson', 'D'] : ['Scott Fitzpatrick', 'R'])
          : margin > 0 ? [b ? b.d : 'Democrat', b ? b.pd : 'D'] : [b ? b.r : 'Republican', 'R'],
        calledAt: ''
      };
    });
  }
  function frame(now) {
    return plan.map(p => {
      if (now < p.close) return { race: p.race, status: 'Not yet reporting', winner: '', winner_party: '', d_pct: null, r_pct: null, reporting: 0, called_at: '' };
      const rep = Math.min(99, 100 * (1 - Math.exp(-(now - p.close) / p.tau)));
      const lean = p.early * (1 - rep / 100);
      const d = Math.round((p.d + lean / 2) * 10) / 10, r = Math.round((p.r - lean / 2) * 10) / 10;
      const called = rep >= p.callAt;
      if (called && !p.calledAt) p.calledAt = new Date(now).toISOString();
      return { race: p.race, status: called ? 'Called' : 'Counting', winner: called ? p.win[0] : '', winner_party: called ? p.win[1] : '',
        d_pct: rep > 0.5 ? d : null, r_pct: rep > 0.5 ? r : null, reporting: Math.round(rep), called_at: called ? p.calledAt : '' };
    });
  }

  function paintBar(now, data) {
    const called = data.filter(x => x.winner_party).length, done = now >= END;
    bar.querySelector('.sim-t').textContent = done ? 'Simulation over · ' + called + ' races called' : 'PRACTICE RUN · ' + etClock(now) + ' ET · ' + called + ' called';
    bar.querySelector('.sim-p i').style.width = ((now - START) / (END - START) * 100).toFixed(1) + '%';
    bar.querySelector('.sim-x').textContent = done ? 'Back to real data' : 'End';
  }
  function step() {
    const now = simNow(), data = frame(now);
    window.__simDone = now >= END;
    window.dash.simSet('results', data);
    paintBar(now, data);
    if (now >= END) { clearInterval(timer); timer = null; }
  }
  function start() {
    if (timer || !window.dash || !window.dash.simSet) return;
    if (!rows('results').length || !rows('pollclose').length) { setTimeout(start, 800); return; }
    plan = buildPlan(); t0 = Date.now();
    window.__simOn = true; window.__simNow = simNow; window.__simDone = false;
    document.documentElement.classList.add('sim-on');
    bar = document.createElement('div'); bar.className = 'sim-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="sim-t"></span><span class="sim-btns"><button type="button" class="sim-g">Practice group</button><button type="button" class="sim-x">End</button></span><span class="sim-p"><i></i></span>';
    bar.querySelector('.sim-x').addEventListener('click', stop);
    bar.querySelector('.sim-g').addEventListener('click', () => { const t = document.querySelector('.en-tab[data-tab="game"]'); if (t) t.click(); const g = document.getElementById('game'); if (g) g.scrollIntoView({ block: 'start' }); });
    document.body.append(bar);
    window.scrollTo({ top: 0 });
    const nt = document.querySelector('.en-tab[data-tab="night"]'); if (nt) nt.click();
    step(); timer = setInterval(step, STEP_MS);
    if (window.enPush && window.enPush.ready && window.enPush.ready() && !window.enPush.isOn()) {
      const t = document.createElement('div'); t.className = 'pl-toast'; t.textContent = 'Tip: turn on 🔔 Race alerts (Election night tab) to get practice alerts on your phone too.'; document.body.append(t); setTimeout(() => t.remove(), 6000);
    }
  }
  function stop() {
    if (timer) clearInterval(timer); timer = null;
    window.__simOn = false; window.__simNow = null; window.__simDone = false;
    document.documentElement.classList.remove('sim-on');
    if (bar) bar.remove(); bar = null;
    window.dash.simClear();
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }
  window.enSim = { start, stop };

  // footer button
  function addButton() {
    const host = document.getElementById('app-updated'); if (!host || document.getElementById('sim-go')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'sim-go'; b.className = 'sim-go';
    b.innerHTML = '▶ Practice run<small>Watch a made-up election night play out in 3 minutes, with a practice group to play against · only on this phone</small>';
    b.addEventListener('click', start);
    host.after(b);
  }
  const boot = () => { addButton(); if (/[?&]sim\b/.test(location.search)) setTimeout(start, 3500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
