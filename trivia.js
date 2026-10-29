/* Election Trivia — a fast, flashy quiz game (app only).
   Quick 10: 10 questions (history, civics, Missouri, plus live questions built from this app's own polls and ratings).
   Daily 5: the same 5 questions for everyone today, so friends can compare. 15 seconds a question; faster = more points;
   streaks multiply the score. Best scores stay on this phone, and — once you sign in on the Game tab — on the global
   leaderboard (all-time best, plus today's Daily 5), kept in Firebase so they survive a new phone. */
(function () {
  'use strict';
  const SECS = 15, BASE = 100, SPEED = 100;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const btn = (cls, txt, fn) => { const b = h('button', cls, txt); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = (n) => { if (window.enSound) window.enSound.play(n); };
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const rows = (id) => { const d = window.dash && window.dash.data(id); return d && d.status === 'ok' ? d.data : []; };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

  // ---------- Question bank (facts that don't change) ----------
  // q, a (right answer first; shuffled when shown), why (shown after answering), cat
  const BANK = [
    { cat: 'Civics', q: 'How many electoral votes does it take to win the presidency?', a: ['270', '269', '300', '218'], why: 'There are 538 electors; a majority is 270.' },
    { cat: 'Civics', q: 'How many voting members sit in the U.S. House?', a: ['435', '438', '450', '400'], why: 'The House has had 435 voting seats since 1913 (fixed by law in 1929).' },
    { cat: 'Civics', q: 'How long is a U.S. senator’s term?', a: ['6 years', '4 years', '2 years', '8 years'], why: 'Senators serve 6-year terms, staggered so about a third are up every two years.' },
    { cat: 'Civics', q: 'How long is a U.S. House member’s term?', a: ['2 years', '4 years', '6 years', '3 years'], why: 'Every House seat is on the ballot every two years.' },
    { cat: 'Civics', q: 'Who breaks a 50–50 tie in the Senate?', a: ['The vice president', 'The Speaker of the House', 'The chief justice', 'The Senate majority leader'], why: 'The vice president is president of the Senate and can cast tie-breaking votes.' },
    { cat: 'Civics', q: 'Which amendment lowered the voting age to 18?', a: ['26th', '19th', '24th', '15th'], why: 'The 26th Amendment was ratified in 1971.' },
    { cat: 'Civics', q: 'Which amendment guarantees women the right to vote?', a: ['19th', '14th', '21st', '26th'], why: 'The 19th Amendment was ratified in 1920.' },
    { cat: 'Civics', q: 'Which amendment made senators directly elected by voters?', a: ['17th', '12th', '20th', '22nd'], why: 'Before the 17th Amendment (1913), state legislatures chose senators.' },
    { cat: 'Civics', q: 'What is the minimum age to serve as a U.S. senator?', a: ['30', '25', '35', '21'], why: 'The Constitution sets 30 for the Senate, 25 for the House and 35 for president.' },
    { cat: 'Civics', q: 'What is the minimum age to serve in the U.S. House?', a: ['25', '21', '30', '18'], why: 'House members must be at least 25.' },
    { cat: 'Civics', q: 'Federal Election Day is set by law as…', a: ['The Tuesday after the first Monday in November', 'The first Tuesday in November', 'The second Tuesday in November', 'The first Monday in November'], why: 'That rule means Election Day always falls between Nov 2 and Nov 8.' },
    { cat: 'Civics', q: 'About what share of Senate seats is on the ballot in a regular election year?', a: ['One-third', 'Half', 'All of them', 'One-quarter'], why: 'Senate terms are staggered into three classes.' },
    { cat: 'Civics', q: 'How many senators does each state get?', a: ['2', '1', 'It depends on population', '3'], why: 'Every state gets two, no matter its size.' },
    { cat: 'Civics', q: 'Which two states can split their electoral votes by congressional district?', a: ['Maine and Nebraska', 'Maine and Vermont', 'Nebraska and Kansas', 'Alaska and Hawaii'], why: 'Every other state is winner-take-all.' },
    { cat: 'Civics', q: 'How many electors are in the Electoral College?', a: ['538', '535', '540', '270'], why: '435 House seats + 100 senators + 3 for D.C. = 538.' },
    { cat: 'Civics', q: 'Which amendment gave Washington, D.C., electoral votes?', a: ['23rd', '22nd', '25th', '27th'], why: 'The 23rd Amendment (1961) gives D.C. as many electors as the smallest state — 3.' },
    { cat: 'Civics', q: 'Who is next in line for the presidency after the vice president?', a: ['Speaker of the House', 'Secretary of State', 'Senate president pro tempore', 'Chief Justice'], why: 'The Presidential Succession Act puts the Speaker second.' },
    { cat: 'Civics', q: 'How many votes does it take to end a filibuster in the Senate?', a: ['60', '51', '67', '50'], why: 'Cloture on most legislation needs three-fifths of the Senate — 60 votes.' },
    { cat: 'Civics', q: 'Which amendment barred denying the vote because of race?', a: ['15th', '13th', '19th', '24th'], why: 'The 15th Amendment was ratified in 1870.' },
    { cat: 'History', q: 'In what year was the Voting Rights Act signed?', a: ['1965', '1964', '1957', '1970'], why: 'President Lyndon Johnson signed it on Aug 6, 1965.' },
    { cat: 'History', q: 'Who is the only president elected to more than two terms?', a: ['Franklin D. Roosevelt', 'Theodore Roosevelt', 'Ulysses S. Grant', 'Woodrow Wilson'], why: 'FDR won four times; the 22nd Amendment later set a two-term limit.' },
    { cat: 'History', q: 'The word “gerrymander” comes from which politician?', a: ['Elbridge Gerry', 'Aaron Burr', 'John Adams', 'Gerald Ford'], why: 'A Massachusetts district drawn under Gov. Elbridge Gerry in 1812 was said to look like a salamander.' },
    { cat: 'History', q: 'Which state’s recount decided the 2000 presidential election?', a: ['Florida', 'Ohio', 'Pennsylvania', 'New Mexico'], why: 'The Supreme Court’s Bush v. Gore ruling ended the Florida recount.' },
    { cat: 'History', q: 'The famous “Dewey Defeats Truman” headline ran after which election?', a: ['1948', '1952', '1944', '1960'], why: 'The Chicago Daily Tribune printed it before the votes were counted — Truman won.' },
    { cat: 'History', q: 'Which territory first gave women the vote, in 1869?', a: ['Wyoming', 'Utah', 'Colorado', 'New York'], why: 'Wyoming did it as a territory, more than 50 years before the 19th Amendment.' },
    { cat: 'History', q: 'In the 2010 midterms, how many House seats did Republicans gain?', a: ['63', '54', '41', '30'], why: 'It was the biggest midterm House swing since 1938.' },
    { cat: 'History', q: 'When did a president’s party most recently GAIN House seats in a midterm?', a: ['2002', '1998', '2010', '2018'], why: 'Republicans gained seats in 2002 under George W. Bush — it rarely happens.' },
    { cat: 'History', q: 'Before 2020, who was the last president to lose a re-election bid?', a: ['George H. W. Bush', 'Jimmy Carter', 'Gerald Ford', 'Bill Clinton'], why: 'He lost to Bill Clinton in 1992.' },
    { cat: 'History', q: 'Which cartoonist made the elephant the symbol of the Republican Party?', a: ['Thomas Nast', 'Norman Rockwell', 'Charles Schulz', 'Ben Franklin'], why: 'Thomas Nast’s cartoons in Harper’s Weekly popularized the elephant (and the Democratic donkey).' },
    { cat: 'History', q: 'Which state was first to use ranked-choice voting statewide for federal races?', a: ['Maine', 'Alaska', 'California', 'Vermont'], why: 'Maine first used it in 2018. Alaska followed in 2022.' },
    { cat: 'History', q: 'Which state was first to hold all of its elections by mail?', a: ['Oregon', 'Washington', 'Colorado', 'Utah'], why: 'Oregon voters approved all-mail elections in 1998.' },
    { cat: 'History', q: 'Georgia requires a majority to win. If no one gets one, what happens?', a: ['A runoff between the top two', 'The legislature picks', 'The plurality winner takes it', 'A coin flip'], why: 'This year a Georgia runoff would be Dec 1.' },
    { cat: 'Missouri', q: 'What is the capital of Missouri?', a: ['Jefferson City', 'Columbia', 'Springfield', 'St. Louis'], why: 'Jefferson City has been the capital since 1826.' },
    { cat: 'Missouri', q: 'Which president came from Missouri?', a: ['Harry Truman', 'Dwight Eisenhower', 'Abraham Lincoln', 'Andrew Jackson'], why: 'Truman was born in Lamar and grew up in Independence.' },
    { cat: 'Missouri', q: 'How many electoral votes does Missouri have?', a: ['10', '11', '8', '12'], why: 'Missouri has 8 House seats + 2 senators = 10.' },
    { cat: 'Missouri', q: 'Missouri picked the presidential winner every time from 1904 to 2004 — except once. Which year?', a: ['1956', '1960', '1976', '1992'], why: 'Missouri narrowly backed Adlai Stevenson in 1956; Eisenhower won.' },
    { cat: 'Missouri', q: 'What is Missouri’s nickname?', a: ['The Show-Me State', 'The Gateway State', 'The Heartland State', 'The River State'], why: 'Popularly credited to Rep. Willard Vandiver’s 1899 line, “I’m from Missouri — you’ve got to show me.”' },
    { cat: 'Missouri', q: 'How many U.S. House seats does Missouri have?', a: ['8', '9', '10', '6'], why: 'Missouri dropped from 9 to 8 seats after the 2010 census.' },
  ];

  // ---------- Live questions built from the app's own data (always matches what the app shows) ----------
  function liveQuestions() {
    const out = [], sen = rows('senate'), ov = rows('overview');
    const lead = (r) => { const d = r.avg_d != null ? +r.avg_d : r.avg2_d != null ? +r.avg2_d : +r.poll_d, rr = r.avg_r != null ? +r.avg_r : r.avg2_r != null ? +r.avg2_r : +r.poll_r; return { m: Math.round((d - rr) * 10) / 10, src: r.avg_d != null ? 'RealClearPolling average' : r.avg2_d != null ? '270toWin average' : 'latest poll' }; };
    const last = (n) => String(n || '').split(' ').slice(-1)[0];
    sen.forEach(r => {
      const L = lead(r); if (!isFinite(L.m) || Math.abs(L.m) < 1) return;
      const w = L.m > 0 ? r.cand_d : r.cand_r, l = L.m > 0 ? r.cand_r : r.cand_d;
      out.push({ kind: 'lead', cat: 'This year', q: 'Who leads the polls in the ' + r.state + ' Senate race right now?', a: [w, l], why: w + ' is up ' + Math.abs(L.m) + ' in the ' + L.src + ' (see the Senate tab).' });
    });
    const RT = ['Toss-up', 'Lean D', 'Lean R', 'Likely D', 'Likely R', 'Solid D', 'Solid R'];
    sen.filter(r => r.rater === 'Cook' && RT.includes(r.rating)).forEach(r => {
      const wrong = RT.filter(x => x !== r.rating).sort(() => Math.random() - .5).slice(0, 3);
      out.push({ kind: 'rating', cat: 'This year', q: 'How does the Cook Political Report rate the ' + r.state + ' Senate race?', a: [r.rating].concat(wrong), why: 'Cook rates it ' + r.rating + '.' });
    });
    const need = ov.find(o => o.key === 'dems_need'), rNow = ov.find(o => o.key === 'senate_r_now');
    if (need && rNow) { const n = Number(need.value); out.push({ cat: 'This year', q: 'Republicans hold ' + rNow.value + ' Senate seats. How many must Democrats gain for a majority?', a: [String(n), String(n - 1), String(n + 1), String(n + 2)], why: 'The VP breaks 50–50 ties for the GOP, so Democrats need 51 seats.' }); }
    const ks = ov.find(o => o.key === 'kalshi_house');
    if (ks && ks.value != null) { const p = Number(ks.value); if (Math.abs(p - .5) > .05) out.push({ cat: 'This year', q: 'Betting markets (Kalshi): which party is favored to win the House?', a: p > .5 ? ['Democrats', 'Republicans'] : ['Republicans', 'Democrats'], why: 'Kalshi traders give ' + (p > .5 ? 'Democrats ' + Math.round(p * 100) : 'Republicans ' + Math.round((1 - p) * 100)) + '%.' }); }
    let close = null; sen.forEach(r => { const L = lead(r); if (isFinite(L.m) && (!close || Math.abs(L.m) < Math.abs(close.L.m))) close = { r, L }; });
    if (close && sen.length >= 4) { const others = sen.filter(r => r !== close.r).sort(() => Math.random() - .5).slice(0, 3).map(r => r.state); out.push({ cat: 'This year', q: 'Which Senate race is closest in the polls right now?', a: [close.r.state].concat(others), why: close.r.state + ' is within ' + Math.abs(close.L.m) + ' points.' }); }
    return out;
  }

  // ---------- Picking questions ----------
  function seeded(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((rnd || Math.random)() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function pick(mode) {
    if (mode === 'daily') { const rnd = seeded('trivia-' + today()); return shuffle(BANK, rnd).slice(0, 5).map(q => Object.assign({}, q, { opts: shuffle(q.a, rnd) })); }
    const seen = new Set(), live = shuffle(liveQuestions()).filter(q => { const k = q.kind || q.q; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3), stat = shuffle(BANK).slice(0, 10 - live.length);   // at most one of each kind of live question
    return shuffle(stat.concat(live)).map(q => Object.assign({}, q, { opts: shuffle(q.a) }));
  }

  // ---------- Game ----------
  const TITLES = [[0, 'Rookie Voter'], [400, 'Poll Watcher'], [900, 'Campaign Staffer'], [1500, 'Political Junkie'], [2200, 'Pundit'], [3000, 'Election Night Legend']];
  const titleFor = (s, max) => { const f = s / max * 3600; let t = TITLES[0][1]; TITLES.forEach(([m, n]) => { if (f >= m) t = n; }); return t; };
  let G = null, root = null, onHome = false;
  const best = () => Number(store.get('en-trivia-best')) || 0;

  function home() {
    stop(); root.replaceChildren();
    const arena = h('div', 'tq-arena'); root.append(arena);
    arena.append(h('div', 'tq-glow'));
    const top = h('div', 'tq-home');
    const t = h('h2', 'tq-title'); t.append(h('span', 'w1', 'ELECTION'), h('span', 'w2', 'TRIVIA'));
    top.append(h('p', 'tq-kick', '⚡ How sharp is your political brain? ⚡'), t);
    const stats = h('div', 'tq-stats');
    const bs = best(); const dd = store.get('en-trivia-daily-' + today());
    stats.append(stat('🏆', bs ? bs.toLocaleString() : '—', 'Your best'), stat('📅', dd ? Number(dd).toLocaleString() : 'Ready', 'Today’s Daily 5'));
    top.append(stats);
    const modes = h('div', 'tq-modes');
    modes.append(modeBtn('▶', 'Quick 10', '10 questions · history, civics, Missouri and this year’s races', () => start('quick')),
      modeBtn('📅', dd ? 'Daily 5 — played' : 'Daily 5', dd ? 'Come back tomorrow for a new set · you can replay for fun' : 'Same 5 questions for everyone today — challenge your friends', () => start('daily')));
    top.append(modes, h('p', 'tq-rules', SECS + ' seconds a question · answer fast for bonus points · 3 in a row = 2× · 5 in a row = 3×'));
    const lb = h('div', 'tq-lb'); top.append(lb);
    arena.append(top); onHome = true;
    drawBoard(lb);
  }
  function stat(i, v, l) { const d = h('div', 'tq-stat'); d.append(h('span', 'i', i), h('b', '', v), h('small', '', l)); return d; }
  function modeBtn(i, t, s, fn) { const b = btn('tq-mode', null, fn); b.append(h('span', 'i', i), h('b', '', t), h('small', '', s)); return b; }

  function start(mode) {
    onHome = false;
    const qs = pick(mode); if (!qs.length) return;
    G = { mode, qs, i: -1, score: 0, streak: 0, best: 0, right: 0, timer: null, t0: 0, locked: false };
    sfx('chime'); next();
  }
  function stop() { if (G && G.timer) cancelAnimationFrame(G.timer); if (G) G.timer = null; }
  function mult() { return G.streak >= 5 ? 3 : G.streak >= 3 ? 2 : 1; }

  function next() {
    stop(); G.i++; if (G.i >= G.qs.length) return finish();
    const q = G.qs[G.i]; G.locked = false;
    root.replaceChildren(); const arena = h('div', 'tq-arena'); root.append(arena); arena.append(h('div', 'tq-glow'));
    const hud = h('div', 'tq-hud');
    const prog = h('div', 'tq-prog'); G.qs.forEach((_, k) => prog.append(h('i', k < G.i ? 'done' : k === G.i ? 'on' : '')));
    const sc = h('div', 'tq-score'); sc.append(h('small', '', 'SCORE'), h('b', 'n', G.score.toLocaleString()));
    const st = h('div', 'tq-streak' + (G.streak >= 3 ? ' hot' : '')); st.append(h('span', '', G.streak >= 3 ? '🔥' : '✦'), h('b', '', mult() + '×'));
    hud.append(prog, h('div', 'tq-hudr')); hud.lastChild.append(st, sc);
    const ring = h('div', 'tq-ring'); ring.innerHTML = '<svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52"/></svg><b>' + SECS + '</b>';
    const card = h('div', 'tq-card'); card.append(h('span', 'tq-cat ' + q.cat.toLowerCase().replace(/\s+/g, '-'), q.cat), h('p', 'tq-num', 'Question ' + (G.i + 1) + ' of ' + G.qs.length), h('h3', 'tq-q', q.q));
    const ans = h('div', 'tq-ans' + (q.opts.length === 2 ? ' two' : ''));
    q.opts.forEach((o, k) => { const b = btn('tq-a', null, () => answer(o, b)); b.append(h('span', 'l', 'ABCD'[k]), h('span', 't', o)); b.style.animationDelay = (k * 70) + 'ms'; b.dataset.v = o; ans.append(b); });
    arena.append(hud, ring, card, ans);
    G.ui = { arena, ring, ans, sc: sc.querySelector('.n'), st };
    const fg = ring.querySelector('.fg'), num = ring.querySelector('b'), C = 2 * Math.PI * 52; fg.style.strokeDasharray = C;
    G.t0 = performance.now(); let lastSec = SECS;
    const tick = (t) => {
      const left = Math.max(0, SECS - (t - G.t0) / 1000); fg.style.strokeDashoffset = C * (1 - left / SECS);
      const s = Math.ceil(left); if (s !== lastSec) { lastSec = s; num.textContent = s; if (s <= 5 && s > 0) { ring.classList.add('warn'); sfx('pop'); } }
      if (left <= 0) { answer(null, null); return; }
      G.timer = requestAnimationFrame(tick);
    };
    G.timer = requestAnimationFrame(tick);
  }

  function answer(v, b) {
    if (!G || G.locked) return; G.locked = true; stop();
    const q = G.qs[G.i], right = q.a[0], ok = v === right, left = Math.max(0, SECS - (performance.now() - G.t0) / 1000);
    G.ui.ans.querySelectorAll('.tq-a').forEach(x => { x.disabled = true; if (x.dataset.v === right) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); else x.classList.add('dim'); });
    let gain = 0;
    if (ok) {
      G.streak++; G.right++; G.best = Math.max(G.best, G.streak);
      gain = Math.round((BASE + SPEED * left / SECS) * mult()); G.score += gain;
      pop('+' + gain + (mult() > 1 ? '  ' + mult() + '×' : ''), 'ok', b);
      if (window.enConfetti && !calm()) window.enConfetti(G.ui.arena, 'g', G.streak >= 3 ? 120 : 60);
      sfx(G.streak === 3 || G.streak === 5 ? 'fanfare' : 'chime'); buzz(40);
      if (G.streak === 3 || G.streak === 5) banner(G.streak === 3 ? '🔥 ON FIRE! 2× POINTS' : '🚀 UNSTOPPABLE! 3× POINTS');
    } else {
      G.streak = 0; G.ui.arena.classList.add('shake'); setTimeout(() => G && G.ui && G.ui.arena.classList.remove('shake'), 500);
      pop(v == null ? '⏰ Time’s up!' : '✗ Not quite', 'no', b); sfx('womp'); buzz([60, 40, 60]);
    }
    countUp(G.ui.sc, G.score - gain, G.score);
    G.ui.st.className = 'tq-streak' + (G.streak >= 3 ? ' hot' : ''); G.ui.st.replaceChildren(h('span', '', G.streak >= 3 ? '🔥' : '✦'), h('b', '', mult() + '×'));
    const why = h('div', 'tq-why ' + (ok ? 'ok' : 'no')); why.append(h('b', '', ok ? '✓ Correct' : 'Answer: ' + right), h('span', '', q.why));
    const nx = btn('tq-next', G.i + 1 >= G.qs.length ? 'See my score →' : 'Next question →', () => next()); why.append(nx);
    G.ui.arena.append(why); nx.focus({ preventScroll: true });
    why.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
  }
  function pop(txt, cls, near) {
    const p = h('div', 'tq-pop ' + cls, txt); G.ui.arena.append(p);
    if (near) { const a = G.ui.arena.getBoundingClientRect(), r = near.getBoundingClientRect(); p.style.left = (r.left - a.left + r.width / 2) + 'px'; p.style.top = (r.top - a.top) + 'px'; } else { p.style.left = '50%'; p.style.top = '40%'; }
    setTimeout(() => p.remove(), 1400);
  }
  function banner(txt) { const b = h('div', 'tq-banner', txt); G.ui.arena.append(b); setTimeout(() => b.remove(), 1800); }
  function countUp(el, a, b) { if (calm() || a === b) { el.textContent = b.toLocaleString(); return; } const t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / 600); el.textContent = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); }

  function finish() {
    stop(); const max = G.qs.length * (BASE + SPEED) * 3, s = G.score, prevBest = best(), newBest = s > prevBest;
    if (newBest) { store.set('en-trivia-best', String(s)); store.set('en-trivia-best-right', String(G.right)); }
    if (G.mode === 'daily' && !store.get('en-trivia-daily-' + today())) store.set('en-trivia-daily-' + today(), String(s));
    root.replaceChildren(); const arena = h('div', 'tq-arena tq-end'); root.append(arena); arena.append(h('div', 'tq-glow'));
    const ttl = titleFor(s, max);
    arena.append(h('p', 'tq-kick', G.mode === 'daily' ? '📅 DAILY 5 · ' + today() : '⚡ QUICK 10 COMPLETE'), h('div', 'tq-big', '0'), h('p', 'tq-rank', ttl));
    const facts = h('div', 'tq-stats'); facts.append(stat('✅', G.right + '/' + G.qs.length, 'Right'), stat('🔥', String(G.best), 'Best streak'), stat('🏆', Math.max(s, prevBest).toLocaleString(), newBest ? 'NEW BEST!' : 'Your best'));
    arena.append(facts);
    const glob = h('div', 'tq-glob'); arena.append(glob); recordCloud(G.mode, s, G.right, glob);
    const acts = h('div', 'tq-acts');
    acts.append(btn('tq-btn primary', '▶ Play again', () => start(G.mode === 'daily' ? 'quick' : 'quick')), btn('tq-btn', '📤 Share score', () => share(s, ttl)));
    if (window.enGroup && window.enGroup.ready()) acts.append(btn('tq-btn', '💬 Post to my group', async (e) => { const b = e.currentTarget; b.disabled = true; const ok = await window.enGroup.post('🧠 Election Trivia' + (G.mode === 'daily' ? ' Daily 5' : '') + ': ' + s.toLocaleString() + ' pts (' + G.right + '/' + G.qs.length + ') — ' + ttl + '. Beat that!'); b.textContent = ok ? '✓ Posted' : '💬 Post to my group'; b.disabled = !!ok; }));
    acts.append(btn('tq-btn ghost', 'Back', () => home()));
    arena.append(acts);
    countUp(arena.querySelector('.tq-big'), 0, s);
    if (newBest || G.right === G.qs.length) { if (window.enCelebrate) window.enCelebrate({ side: 'g', big: true, kicker: newBest ? '🏆 New high score' : '💯 Perfect round', title: s.toLocaleString() + ' points', sub: ttl }); }
    else { if (window.enConfetti && !calm()) window.enConfetti(arena, 'g', 140); sfx('fanfare'); }
  }

  // ---------- Global leaderboard ----------
  // Scores live in Firebase (trivia/{uid}: your best ever; triviaDaily/{day}/scores/{uid}: your first Daily 5 of the day).
  // The rules only let a best go up, never past a perfect game, and only under your own game name.
  const acct = () => (window.enAccount && window.enAccount.ready() ? window.enAccount : null);
  const TOP = 50, SHOW = 10;
  let cloud = { best: null, daily: null, day: '' }, boardTab = 'all', boardOpen = false, cache = {};
  const fresh = (k) => cache[k] && Date.now() - cache[k].t < 60000 ? cache[k].rows : null;
  async function topRows(tab, force) {
    const A = acct(); if (!A) return [];
    const k = tab === 'all' ? 'all' : 'd' + today(); const hit = !force && fresh(k); if (hit) return hit;
    const rows = tab === 'all' ? await A.trivia.top(TOP) : await A.trivia.dailyTop(today(), TOP);
    const key = tab === 'all' ? 'best' : 'score';
    rows.sort((a, b) => (b[key] - a[key]) || ((a.at || 0) - (b.at || 0)));   // ties: whoever got there first
    cache[k] = { t: Date.now(), rows }; return rows;
  }
  // when you sign in (or change your name): load your saved scores, carry this phone's best up, fix an old name
  async function syncCloud() {
    const A = acct(); if (!A) { cloud = { best: null, daily: null, day: '' }; return; }
    try {
      const day = today(); const [c, d] = await Promise.all([A.trivia.get(), A.trivia.dailyGet(day)]);
      cloud = { best: c, daily: d, day };
      const local = best(), lr = Number(store.get('en-trivia-best-right')) || 0;
      if (A.verified()) {
        if (local > (c ? c.best : -1)) { await saveBest(local, lr); }
        else if (c && c.name !== A.name()) { const n = { name: A.name(), best: c.best, right: c.right, at: Date.now() }; await A.trivia.save(n); cloud.best = n; }
      }
      if (cloud.best && cloud.best.best > local) { store.set('en-trivia-best', String(cloud.best.best)); store.set('en-trivia-best-right', String(cloud.best.right)); }
      if (d && !store.get('en-trivia-daily-' + day)) store.set('en-trivia-daily-' + day, String(d.score));
      cache = {};
    } catch (e) { console.error(e); }
  }
  async function saveBest(s, right) {
    const A = acct(); const n = { name: A.name(), best: s, right: Math.min(10, right), at: Date.now() };
    await A.trivia.save(n); cloud.best = n; cache = {};
  }
  async function recordCloud(mode, s, right, box) {
    const A = acct();
    if (!A) { box.append(btn('tq-btn tq-join', '🌎 Sign in to put your scores on the global leaderboard', () => A0signIn())); return; }
    if (!A.verified()) { box.append(h('p', 'tq-note', 'Verify your email (Game tab) to post scores to the global leaderboard.')); return; }
    box.append(h('p', 'tq-note', 'Saving to the global leaderboard…'));
    try {
      if (cloud.day !== today()) { cloud.daily = await A.trivia.dailyGet(today()); cloud.day = today(); }
      let dailyNew = false;
      if (mode === 'daily' && !cloud.daily) { const n = { name: A.name(), score: s, right, at: Date.now() }; await A.trivia.dailySave(today(), n); cloud.daily = n; dailyNew = true; cache = {}; }
      const cb = cloud.best ? cloud.best.best : -1; const bestNew = s > cb;
      if (bestNew) await saveBest(s, right);
      const rows = await topRows('all', true); const at = rows.findIndex(r => r.uid === A.uid());
      box.replaceChildren();
      const chip = h('div', 'tq-rankchip' + (bestNew ? ' new' : ''));
      chip.append(h('span', '', '🌎'), h('b', '', at >= 0 ? 'Global rank #' + (at + 1) : 'Outside the top ' + TOP), h('small', '', bestNew ? 'New personal best saved' : 'Your best: ' + cb.toLocaleString()));
      box.append(chip);
      if (dailyNew) {
        const dr = await topRows('daily', true); const di = dr.findIndex(r => r.uid === A.uid());
        if (di >= 0) box.append(h('p', 'tq-note', '📅 Today’s Daily 5: #' + (di + 1) + ' of ' + dr.length));
      } else if (mode === 'daily' && cloud.daily) box.append(h('p', 'tq-note', '📅 Only your first Daily 5 of the day counts (' + Number(cloud.daily.score).toLocaleString() + ').'));
    } catch (e) { console.error(e); box.replaceChildren(h('p', 'tq-note', 'Couldn’t reach the leaderboard — your best is saved on this phone and will post next time.')); }
  }
  const A0signIn = () => { if (window.enAccount) window.enAccount.signIn(); };
  async function drawBoard(box) {
    box.replaceChildren();
    const head = h('div', 'tq-lb-head'); head.append(h('b', '', '🌎 Global leaderboard'));
    const seg = h('div', 'tq-seg');
    [['all', 'All-time'], ['daily', 'Today’s Daily 5']].forEach(([k, t]) => { const b = btn(boardTab === k ? 'on' : '', t, () => { boardTab = k; boardOpen = false; drawBoard(box); }); b.setAttribute('aria-pressed', boardTab === k); seg.append(b); });
    head.append(seg); box.append(head);
    const A = acct();
    if (!A) {
      const c = h('div', 'tq-lb-empty'); c.append(h('p', '', 'Sign in on the Game tab to see where you rank — your best score is saved to your account for good.'), btn('tq-btn tq-join', 'Sign in →', A0signIn));
      box.append(c); return;
    }
    const list = h('ol', 'tq-lb-list'); list.append(h('li', 'tq-lb-load', 'Loading…')); box.append(list);
    let rows; try { rows = await topRows(boardTab); } catch (e) { console.error(e); list.replaceChildren(h('li', 'tq-lb-load', 'Couldn’t load the leaderboard right now.')); return; }
    if (!box.isConnected) return;
    list.replaceChildren();
    const key = boardTab === 'all' ? 'best' : 'score', of = boardTab === 'all' ? null : 5, mine = rows.findIndex(r => r.uid === A.uid());
    if (!rows.length) list.append(h('li', 'tq-lb-load', boardTab === 'all' ? 'No scores yet — play a round and claim #1!' : 'No Daily 5 scores yet today — be the first!'));
    rows.slice(0, boardOpen ? TOP : SHOW).forEach((r, i) => {
      const li = h('li', 'tq-lb-row' + (i < 3 ? ' top' + (i + 1) : '') + (r.uid === A.uid() ? ' me' : ''));
      li.append(h('span', 'rk', i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)), h('span', 'nm', r.name + (r.uid === A.uid() ? ' (you)' : '')), h('small', 'rt', of ? r.right + '/' + of : ''), h('b', 'sc', Number(r[key]).toLocaleString()));
      list.append(li);
    });
    if (rows.length > SHOW && !boardOpen) box.append(btn('tq-btn ghost tq-more', 'Show top ' + Math.min(TOP, rows.length) + ' ↓', () => { boardOpen = true; drawBoard(box); }));
    const you = h('p', 'tq-note');
    if (mine >= 0) you.textContent = 'You’re #' + (mine + 1) + (boardTab === 'all' ? ' all-time' : ' today') + '.';
    else if (boardTab === 'all') you.textContent = cloud.best ? 'Your best (' + cloud.best.best.toLocaleString() + ') is outside the top ' + TOP + ' — keep going!' : 'Play a round to get on the board.';
    else you.textContent = cloud.daily ? 'Your Daily 5 (' + Number(cloud.daily.score).toLocaleString() + ') is outside the top ' + TOP + '.' : 'Play today’s Daily 5 to get on today’s board — only your first try counts.';
    if (!A.verified()) you.textContent += ' Verify your email (Game tab) to post scores.';
    box.append(you);
  }

  // shareable picture
  function share(s, ttl) {
    const W = 1080, H = 1080, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1e1b4b'); g.addColorStop(.5, '#0b1020'); g.addColorStop(1, '#4c0519'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) { x.fillStyle = ['#fbbf24', '#60a5fa', '#f87171', '#ffffff', '#a78bfa'][i % 5]; x.globalAlpha = .5; x.fillRect(Math.random() * W, Math.random() * H, 10, 18); } x.globalAlpha = 1;
    x.textAlign = 'center'; x.fillStyle = '#fbbf24'; x.font = '800 44px system-ui, sans-serif'; x.fillText('⚡ ELECTION TRIVIA ⚡', W / 2, 200);
    x.fillStyle = '#fff'; x.font = '800 220px system-ui, sans-serif'; x.fillText(s.toLocaleString(), W / 2, 520);
    x.font = '600 48px system-ui, sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText('points', W / 2, 590);
    x.fillStyle = '#fbbf24'; x.font = '800 64px system-ui, sans-serif'; x.fillText(ttl, W / 2, 720);
    x.fillStyle = 'rgba(255,255,255,.85)'; x.font = '600 44px system-ui, sans-serif'; x.fillText(G.right + ' of ' + G.qs.length + ' right · best streak ' + G.best, W / 2, 800);
    x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '500 36px system-ui, sans-serif'; x.fillText('Think you can beat it? election-night.netlify.app', W / 2, 980);
    c.toBlob(async (blob) => {
      if (!blob) return; const file = new File([blob], 'election-trivia.png', { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Election Trivia' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'election-trivia.png'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  function boot() {
    root = document.getElementById('trivia-root'); if (!root) return;
    home();
    if (window.enAccount) window.enAccount.onChange(async () => { await syncCloud(); if (onHome && root.isConnected) home(); });
    const tab = document.querySelector('.en-tab[data-tab="trivia"]'); if (tab) tab.addEventListener('click', () => { if (!G || G.i < 0 || G.i >= G.qs.length) home(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.timer) { /* paused questions end as time's up when you come back */ } });
  }
  window.enTrivia = { bank: BANK, live: liveQuestions, start: (m) => start(m), home: () => home() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
