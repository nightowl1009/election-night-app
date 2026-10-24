/* Election Night 2026 — Election Night Game (prediction game) section.
   Sign in (Google or email), pick every race, join groups with a code, and
   climb the leaderboard as races are called. Uses Firebase (Auth + Firestore)
   configured in pool-config.js. Picks lock at 5:00 PM CT on Nov 3, 2026. */
(function () {
  const LOCK = Date.UTC(2026, 10, 3, 23, 0, 0); // 5:00 PM CST, Nov 3
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const last = (n) => String(n || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(' ').slice(-1)[0];
  const locked = () => Date.now() >= LOCK;
  const rows = (id) => { const d = window.dash && window.dash.data(id); return d && d.status === 'ok' ? d.data : []; };

  // ---------- Backend: Firebase (real) or an in-memory stand-in for testing ----------
  function firebaseBackend(cfg) {
    firebase.initializeApp(cfg);
    const auth = firebase.auth(), fs = firebase.firestore();
    const admins = (window.POOL_ADMINS || []).map(s => s.toLowerCase());
    const userOf = (u) => u && { uid: u.uid, name: u.displayName || '', email: u.email || '', verified: !!u.emailVerified };
    return {
      onAuth: (cb) => auth.onAuthStateChanged(u => cb(userOf(u))),
      signInGoogle: async () => {
        const p = new firebase.auth.GoogleAuthProvider();
        try { await auth.signInWithPopup(p); }
        catch (e) { if (/popup|operation-not-supported|web-storage/i.test(e.code || '')) await auth.signInWithRedirect(p); else throw e; }
      },
      signInEmail: (email, pw) => auth.signInWithEmailAndPassword(email, pw),
      signUpEmail: async (email, pw, name) => { const c = await auth.createUserWithEmailAndPassword(email, pw); if (name) await c.user.updateProfile({ displayName: name }); return c; },
      resetPassword: (email) => auth.sendPasswordResetEmail(email),
      signOut: () => auth.signOut(),
      isAdmin: (u) => !!u && !!u.email && u.verified && admins.includes(u.email.toLowerCase()),
      getProfile: async (uid) => { const s = await fs.doc('users/' + uid).get(); return s.exists ? s.data() : null; },
      saveProfile: (uid, data) => fs.doc('users/' + uid).set(data, { merge: true }),
      getPicks: async (uid) => { const s = await fs.doc('picks/' + uid).get(); return s.exists ? s.data() : null; },
      savePicks: (uid, data) => fs.doc('picks/' + uid).set(data),
      getGroup: async (code) => { const s = await fs.doc('groups/' + code).get(); return s.exists ? s.data() : null; },
      createGroup: (code, name, uid) => fs.doc('groups/' + code).set({ name, owner: uid, created: Date.now() }),
      addMember: (code, uid, name) => fs.doc('groups/' + code + '/members/' + uid).set({ name, joined: Date.now() }),
      removeMember: (code, uid) => fs.doc('groups/' + code + '/members/' + uid).delete(),
      listMembers: async (code) => { const q = await fs.collection('groups/' + code + '/members').get(); return q.docs.map(d => Object.assign({ uid: d.id }, d.data())); },
      watchAdminResults: (cb) => fs.doc('admin/results').onSnapshot(s => cb(s.exists ? s.data() : {}), () => cb({})),
      saveAdminResult: (key, val) => fs.doc('admin/results').set({ [key]: val || firebase.firestore.FieldValue.delete() }, { merge: true }),
    };
  }
  function mockBackend() {
    const db = window.__poolMockDb || (window.__poolMockDb = { users: {}, picks: {}, groups: {}, members: {}, admin: {} });
    let cur = null; const subs = []; const adminSubs = [];
    const set = (u) => { cur = u; subs.forEach(f => f(u)); };
    return {
      onAuth: (cb) => { subs.push(cb); setTimeout(() => cb(cur), 0); },
      signInGoogle: async () => set({ uid: 'u_brad', name: 'Brad', email: 'brad@example.com', verified: true }),
      signInEmail: async (email) => set({ uid: 'u_' + email.split('@')[0], name: '', email, verified: true }),
      signUpEmail: async (email, pw, name) => set({ uid: 'u_' + email.split('@')[0], name, email, verified: true }),
      resetPassword: async () => {},
      signOut: async () => set(null),
      isAdmin: (u) => !!u && u.uid === 'u_brad',
      getProfile: async (uid) => db.users[uid] || null,
      saveProfile: async (uid, data) => { db.users[uid] = Object.assign({}, db.users[uid], data); },
      getPicks: async (uid) => db.picks[uid] || null,
      savePicks: async (uid, data) => { db.picks[uid] = data; },
      getGroup: async (code) => db.groups[code] || null,
      createGroup: async (code, name, uid) => { db.groups[code] = { name, owner: uid }; },
      addMember: async (code, uid, name) => { (db.members[code] = db.members[code] || {})[uid] = { name }; },
      removeMember: async (code, uid) => { if (db.members[code]) delete db.members[code][uid]; },
      listMembers: async (code) => Object.entries(db.members[code] || {}).map(([uid, v]) => Object.assign({ uid }, v)),
      watchAdminResults: (cb) => { adminSubs.push(cb); cb(db.admin); },
      saveAdminResult: async (key, val) => { if (val) db.admin[key] = val; else delete db.admin[key]; adminSubs.forEach(f => f(Object.assign({}, db.admin))); },
    };
  }

  // ---------- Races ----------
  // pick values: 'd' = Dem (or Independent) candidate / Yes, 'r' = GOP / No
  function races() {
    const out = [];
    rows('senate').forEach(r => out.push({ key: 'SEN-' + r.id, group: 'Senate', label: r.state, held: r.held, a: last(r.cand_d), ap: r.party_d || 'D', b: last(r.cand_r), kd: r.kalshi_d }));
    rows('governor').forEach(r => out.push({ key: 'GOV-' + r.id, group: 'Governors', label: r.state, held: r.held, a: last(r.cand_d), ap: r.party_d || 'D', b: last(r.cand_r), kd: null }));
    rows('house').forEach(r => out.push({ key: 'HOU-' + r.id, group: 'House', label: r.id, held: r.held, a: last(r.cand_d), ap: r.party_d || 'D', b: last(r.cand_r), kd: r.kalshi_d, rating: r.rating }));
    rows('missouri').forEach(m => {
      const race = m.kind === 'Statewide race';
      out.push({ key: 'MO-' + m.id, group: 'Missouri', label: m.title, a: race ? last(m.yes_label.replace(/\s*\(.*\)/, '')) : 'Yes', ap: race ? 'D' : 'Y', b: race ? last(m.no_label.replace(/\s*\(.*\)/, '')) : 'No', kd: null });
    });
    return out;
  }
  // results: dataset rows (filled by Claude on election night), overridden by the admin's own calls
  let adminRes = {};
  function winners() {
    const w = {};
    rows('results').forEach(x => { if (x.winner_party) w[x.race] = /^(R|N)$/.test(x.winner_party) ? 'r' : 'd'; });
    Object.entries(adminRes).forEach(([k, v]) => { if (v) w[k] = v; });
    return w;
  }
  // points for a correct pick: 1, or more for calling an underdog per Kalshi's odds
  function worth(race, side) {
    if (race.kd == null) return 1;
    const p = side === 'd' ? Number(race.kd) : 100 - Number(race.kd);
    return p < 30 ? 3 : p < 50 ? 2 : 1;
  }
  function score(picks, w, list) {
    let pts = 0, right = 0, wrong = 0, best = null;
    list.forEach(r => { const p = picks[r.key], x = w[r.key]; if (!p || !x) return;
      if (p === x) { const v = worth(r, p); pts += v; right++; if (v > 1 && (!best || v > best.v)) best = { v, r }; } else wrong++; });
    return { pts, right, wrong, best };
  }

  // ---------- State ----------
  let be = null, me = null, profile = null, myPicks = {}, mySeats = null, view = 'picks', activeGroup = '', saveT = null, saving = false;
  let pickFilter = 'Senate';

  // ---------- UI ----------
  const root = () => $('#pool-root');
  function render() {
    const box = root(); if (!box) return;
    box.replaceChildren();
    if (!be) { box.append(card('Election Night Game', window.POOL_CONFIG && !window.firebase ? 'The game needs an internet connection — reconnect and reopen the app.' : 'The game is being set up. Check back soon.')); return; }
    if (!me) return renderSignedOut(box);
    const top = el('div', 'pl-top');
    const who = el('div', 'pl-who'); who.append(el('b', '', profile && profile.name || me.name || me.email), el('small', '', me.email));
    const nav = el('div', 'en-seg');
    [['picks', 'My picks'], ['groups', 'Groups'], ['board', 'Leaderboard']].concat(be.isAdmin(me) ? [['admin', 'Admin']] : []).forEach(([k, t]) => {
      const b = btn('', t, () => { view = k; render(); }); b.setAttribute('aria-pressed', String(view === k)); nav.append(b);
    });
    top.append(who, btn('en-chip', 'Sign out', () => be.signOut()));
    box.append(top, lockBanner(), nav);
    if (!profile || !profile.name) return renderName(box);
    if (view === 'picks') renderPicks(box);
    else if (view === 'groups') renderGroups(box);
    else if (view === 'board') renderBoard(box);
    else if (view === 'admin') renderAdmin(box);
  }
  function card(h, p) { const c = el('div', 'pl-card'); c.append(el('h3', '', h)); if (p) c.append(el('p', '', p)); return c; }
  function lockBanner() {
    const b = el('div', 'pl-lock' + (locked() ? ' done' : ''));
    if (locked()) b.textContent = 'Picks are locked — everyone’s picks are now visible. Scores update as races are called.';
    else { const ms = LOCK - Date.now(), d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5); b.textContent = 'Picks lock in ' + (d ? d + 'd ' : '') + h + 'h — 5:00 PM CT on Election Day.'; }
    return b;
  }
  function errText(e) {
    const c = (e && e.code) || '';
    if (/wrong-password|invalid-credential|user-not-found/.test(c)) return 'That email and password don’t match.';
    if (/email-already-in-use/.test(c)) return 'There’s already an account with that email — sign in instead.';
    if (/weak-password/.test(c)) return 'Password needs at least 6 characters.';
    if (/invalid-email/.test(c)) return 'That email doesn’t look right.';
    if (/popup-closed|cancelled-popup/.test(c)) return 'Sign-in window was closed.';
    if (/unauthorized-domain/.test(c)) return 'This site isn’t on the game’s allowed list yet.';
    if (/network/.test(c)) return 'No connection — try again.';
    return 'Something went wrong (' + (c || 'unknown') + ').';
  }
  function renderSignedOut(box) {
    const c = el('div', 'pl-card pl-hero');
    c.append(el('h3', '', 'Play the Election Night Game'), el('p', '', 'Pick every race, start a group with friends and climb the leaderboard as results come in. Picks lock at 5:00 PM CT on Nov 3.'));
    const msg = el('p', 'pl-msg');
    const g = btn('pl-btn primary', 'Sign in with Google', async () => { msg.textContent = ''; try { await be.signInGoogle(); } catch (e) { msg.textContent = errText(e); } });
    const or = el('div', 'pl-or', 'or use email');
    let mode = 'in';
    const f = el('div', 'pl-form');
    const name = el('input'); name.placeholder = 'Your name (shown on leaderboards)'; name.autocomplete = 'nickname'; name.maxLength = 30;
    const email = el('input'); email.type = 'email'; email.placeholder = 'Email'; email.autocomplete = 'email';
    const pw = el('input'); pw.type = 'password'; pw.placeholder = 'Password (6+ characters)'; pw.autocomplete = 'current-password';
    const go = btn('pl-btn', 'Sign in');
    const sw = btn('pl-link', 'New here? Create an account');
    const forgot = btn('pl-link', 'Forgot password?', async () => { if (!email.value) { msg.textContent = 'Type your email first.'; return; } try { await be.resetPassword(email.value.trim()); msg.textContent = 'Reset email sent.'; } catch (e) { msg.textContent = errText(e); } });
    const sync = () => { name.hidden = mode === 'in'; go.textContent = mode === 'in' ? 'Sign in' : 'Create account'; sw.textContent = mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'; pw.autocomplete = mode === 'in' ? 'current-password' : 'new-password'; forgot.hidden = mode !== 'in'; };
    sw.addEventListener('click', () => { mode = mode === 'in' ? 'up' : 'in'; sync(); msg.textContent = ''; });
    go.addEventListener('click', async () => {
      msg.textContent = '';
      try {
        if (mode === 'in') await be.signInEmail(email.value.trim(), pw.value);
        else { if (!name.value.trim()) { msg.textContent = 'Add your name.'; return; } await be.signUpEmail(email.value.trim(), pw.value, name.value.trim()); }
      } catch (e) { msg.textContent = errText(e); }
    });
    sync();
    f.append(name, email, pw, go, el('div', 'pl-links'));
    f.lastChild.append(sw, forgot);
    c.append(g, or, f, msg);
    box.append(c);
  }
  function renderName(box) {
    const c = card('What should we call you?', 'This name shows on leaderboards.');
    const i = el('input'); i.maxLength = 30; i.value = me.name || ''; i.placeholder = 'Name';
    const s = btn('pl-btn primary', 'Save', async () => { const n = i.value.trim(); if (!n) return; profile = Object.assign({}, profile, { name: n, groups: (profile && profile.groups) || [] }); await be.saveProfile(me.uid, profile); render(); });
    c.append(i, s); box.append(c);
  }

  // ---- My picks ----
  function renderPicks(box) {
    const list = races(), w = winners(), lk = locked();
    const made = list.filter(r => myPicks[r.key]).length;
    const sc = score(myPicks, w, list);
    const head = el('div', 'pl-card pl-sum');
    const nums = el('div', 'pl-nums');
    const stat = (v, t) => { const s = el('div'); s.append(el('b', '', v), el('small', '', t)); return s; };
    nums.append(stat(made + '/' + list.length, 'picked'), stat(String(sc.pts), 'points'), stat(sc.right + '–' + sc.wrong, 'right–wrong'));
    head.append(nums);
    if (!lk) {
      const tools = el('div', 'en-path-tools');
      tools.append(
        btn('en-chip', 'Fill blanks with Kalshi favorites', () => fill('kalshi')),
        btn('en-chip', 'Fill blanks with polling leaders', () => fill('polls')),
        btn('en-chip', 'Clear all', () => { if (confirmClear()) { myPicks = {}; queueSave(); render(); } }));
      head.append(tools);
    }
    head.append(el('p', 'pl-note', 'Correct pick = 1 point. Calling an underdog is worth more: 2 points if Kalshi gave them 30–49%, 3 points under 30%.'));
    // tiebreaker
    const tb = el('div', 'pl-tb'); tb.append(el('label', '', 'Tiebreaker: Senate seats Democrats + independents win (of 100)'));
    const ti = el('input'); ti.type = 'number'; ti.min = 40; ti.max = 60; ti.inputMode = 'numeric'; ti.value = mySeats == null ? '' : mySeats; ti.disabled = lk;
    ti.addEventListener('change', () => { const v = parseInt(ti.value, 10); mySeats = isNaN(v) ? null : Math.max(30, Math.min(70, v)); queueSave(); });
    tb.append(ti); head.append(tb);
    head.append(el('p', 'pl-saved', saving ? 'Saving…' : (made ? 'Saved' : '')));
    box.append(head);
    const chips = el('div', 'en-chips pl-chips');
    ['Senate', 'Governors', 'House', 'Missouri'].forEach(g => {
      const n = list.filter(r => r.group === g), m = n.filter(r => myPicks[r.key]).length;
      const c = btn('en-chip', g + ' · ' + m + '/' + n.length, () => { pickFilter = g; render(); }); c.setAttribute('aria-pressed', String(pickFilter === g)); chips.append(c);
    });
    box.append(chips);
    const wrap = el('div', 'pl-list');
    list.filter(r => r.group === pickFilter).forEach(r => wrap.append(pickRow(r, myPicks[r.key], w[r.key], lk, (side) => { myPicks[r.key] = myPicks[r.key] === side ? undefined : side; if (!myPicks[r.key]) delete myPicks[r.key]; queueSave(); render(); })));
    box.append(wrap);
  }
  function confirmClear() { return window.confirm ? window.confirm('Clear all your picks?') : true; }
  function pickRow(r, pick, win, lk, onPick) {
    const row = el('div', 'en-pick compact pl-row' + (win ? (pick === win ? ' ok' : pick ? ' bad' : '') : ''));
    row.append(el('span', 'en-st', r.group === 'Missouri' ? 'MO' : r.key.split('-').slice(1).join('-')));
    const info = el('div', 'info'); info.append(el('b', '', r.label));
    const sm = el('small', '');
    if (r.kd != null) { const kd = Number(r.kd); sm.textContent = 'Kalshi: ' + (kd >= 50 ? r.a + ' ' + kd : r.b + ' ' + (100 - kd)) + '%'; }
    else if (r.rating) sm.textContent = r.rating;
    if (win) sm.textContent += (sm.textContent ? ' · ' : '') + 'Winner: ' + (win === 'd' ? r.a : r.b) + (pick ? (pick === win ? ' ✓ +' + worth(r, pick) : ' ✗') : '');
    info.append(sm); row.append(info);
    const b = el('div', 'btns');
    [['d', r.ap === 'Y' ? 'y' : r.ap === 'I' ? 'i' : 'd', r.a], ['r', r.ap === 'Y' ? 'n' : 'r', r.b]].forEach(([side, cls, name]) => {
      const x = btn('en-pb ' + cls, name, () => onPick(side)); x.setAttribute('aria-pressed', String(pick === side)); x.disabled = lk; b.append(x);
    });
    row.append(b);
    return row;
  }
  function fill(how) {
    races().forEach(r => {
      if (myPicks[r.key]) return;
      if (how === 'kalshi' && r.kd != null && Number(r.kd) !== 50) myPicks[r.key] = Number(r.kd) > 50 ? 'd' : 'r';
      if (how === 'polls') {
        const src = r.key.startsWith('SEN-') ? rows('senate') : r.key.startsWith('GOV-') ? rows('governor') : null;
        const row = src && src.find(x => x.id === r.key.slice(4));
        if (row) { const ha = row.avg_d != null && row.avg_r != null; const d = Number(ha ? row.avg_d : row.poll_d), q = Number(ha ? row.avg_r : row.poll_r); if (d !== q) myPicks[r.key] = d > q ? 'd' : 'r'; }
      }
    });
    queueSave(); render();
  }
  function queueSave() {
    if (!me || locked()) return;
    saving = true; clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const clean = {}; Object.entries(myPicks).forEach(([k, v]) => { if (v === 'd' || v === 'r') clean[k] = v; });
      try { await be.savePicks(me.uid, { picks: clean, seats: mySeats, updated: Date.now() }); await be.saveProfile(me.uid, { pickCount: Object.keys(clean).length }); }
      catch (e) { console.error(e); }
      saving = false; const s = $('.pl-saved'); if (s) s.textContent = 'Saved';
    }, 700);
  }

  // ---- Groups ----
  const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 6 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  async function renderGroups(box) {
    const groups = (profile && profile.groups) || [];
    const mine = el('div', 'pl-card');
    mine.append(el('h3', '', 'Your groups'));
    if (!groups.length) mine.append(el('p', '', 'You’re not in a group yet. Start one and share the code, or join a friend’s.'));
    const ul = el('div', 'pl-groups'); mine.append(ul); box.append(mine);
    for (const code of groups) {
      const g = await be.getGroup(code).catch(() => null);
      const li = el('div', 'pl-group');
      const t = el('div'); t.append(el('b', '', g ? g.name : 'Group'), el('small', '', 'Code ' + code));
      const acts = el('div', 'btns');
      acts.append(btn('en-chip', 'Leaderboard', () => { activeGroup = code; view = 'board'; render(); }),
        btn('en-chip', 'Share', () => share(code, g)),
        btn('en-chip', 'Leave', async () => { if (window.confirm && !window.confirm('Leave this group?')) return; await be.removeMember(code, me.uid); profile.groups = groups.filter(c => c !== code); await be.saveProfile(me.uid, { groups: profile.groups }); render(); }));
      li.append(t, acts); ul.append(li);
    }
    const make = el('div', 'pl-card'); make.append(el('h3', '', 'Start a group'));
    const gn = el('input'); gn.placeholder = 'Group name (e.g. Boonville crew)'; gn.maxLength = 40;
    const mm = el('p', 'pl-msg');
    make.append(gn, btn('pl-btn primary', 'Create group', async () => {
      const n = gn.value.trim(); if (!n) { mm.textContent = 'Name your group.'; return; }
      let code = newCode(); for (let i = 0; i < 4 && await be.getGroup(code).catch(() => null); i++) code = newCode();
      try { await be.createGroup(code, n, me.uid); await join(code); activeGroup = code; render(); }
      catch (e) { mm.textContent = errText(e); }
    }), mm);
    const jn = el('div', 'pl-card'); jn.append(el('h3', '', 'Join a group'));
    const jc = el('input'); jc.placeholder = '6-letter code'; jc.maxLength = 6; jc.autocapitalize = 'characters'; jc.style.textTransform = 'uppercase';
    const jm = el('p', 'pl-msg');
    jn.append(jc, btn('pl-btn', 'Join', async () => {
      const code = jc.value.trim().toUpperCase(); if (code.length !== 6) { jm.textContent = 'Codes are 6 letters/numbers.'; return; }
      const g = await be.getGroup(code).catch(() => null); if (!g) { jm.textContent = 'No group with that code.'; return; }
      try { await join(code); activeGroup = code; view = 'board'; render(); } catch (e) { jm.textContent = errText(e); }
    }), jm);
    box.append(make, jn);
  }
  async function join(code) {
    await be.addMember(code, me.uid, profile.name);
    const groups = Array.from(new Set(((profile && profile.groups) || []).concat(code)));
    profile.groups = groups; await be.saveProfile(me.uid, { groups });
  }
  function share(code, g) {
    const url = location.origin + location.pathname + '#game';
    const text = 'Join my Election Night Game group "' + (g ? g.name : '') + '" — open ' + url + ', scroll to Election Night Game at the bottom, sign in, then Groups → Join with code ' + code;
    if (navigator.share) navigator.share({ title: 'Election Night Game', text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alertish('Invite copied — paste it to your friends.'));
  }
  function alertish(t) { const s = el('div', 'pl-toast', t); document.body.append(s); setTimeout(() => s.remove(), 2600); }

  // ---- Leaderboard ----
  async function renderBoard(box) {
    const groups = (profile && profile.groups) || [];
    if (!groups.length) { box.append(card('No group yet', 'Start or join a group under Groups to see a leaderboard.')); return; }
    if (!groups.includes(activeGroup)) activeGroup = groups[0];
    const pick = el('div', 'en-chips pl-chips');
    for (const code of groups) { const g = await be.getGroup(code).catch(() => null); const c = btn('en-chip', g ? g.name : code, () => { activeGroup = code; render(); }); c.setAttribute('aria-pressed', String(code === activeGroup)); pick.append(c); }
    box.append(pick);
    const c = el('div', 'pl-card'); box.append(c);
    c.append(el('p', 'pl-note', 'Loading…'));
    const members = await be.listMembers(activeGroup).catch(() => []);
    const list = races(), w = winners(), called = Object.keys(w).filter(k => list.some(r => r.key === k)).length;
    const lk = locked();
    const out = [];
    for (const m of members) {
      let p = null; if (lk || m.uid === me.uid) p = await be.getPicks(m.uid).catch(() => null);
      const prof = await be.getProfile(m.uid).catch(() => null);
      const s = p ? score(p.picks || {}, w, list) : { pts: 0, right: 0, wrong: 0, best: null };
      out.push({ m, p, s, count: p ? Object.keys(p.picks || {}).length : (prof && prof.pickCount) || 0, seats: p ? p.seats : null });
    }
    out.sort((a, b) => lk ? (b.s.pts - a.s.pts || b.s.right - a.s.right || String(a.m.name).localeCompare(b.m.name)) : (b.count - a.count || String(a.m.name).localeCompare(b.m.name)));
    c.replaceChildren();
    c.append(el('h3', '', 'Leaderboard'), el('p', 'pl-note', lk ? called + ' of ' + list.length + ' races called' : 'Scores start once races are called. Picks stay hidden until they lock at 5:00 PM CT Nov 3.'));
    const t = el('div', 'pl-board');
    out.forEach((o, i) => {
      const r = el('div', 'pl-rank' + (o.m.uid === me.uid ? ' me' : ''));
      r.append(el('span', 'n', lk ? String(i + 1) : '·'));
      const nm = el('div', 'who'); nm.append(el('b', '', o.m.name || 'Player'), el('small', '', o.count + '/' + list.length + ' picked' + (o.seats != null && lk ? ' · Senate guess ' + o.seats : '') + (o.s.best ? ' · best call: ' + o.s.best.r.label + ' (+' + o.s.best.v + ')' : '')));
      const pts = el('div', 'pts'); if (lk) pts.append(el('b', '', String(o.s.pts)), el('small', '', o.s.right + '–' + o.s.wrong)); else pts.append(el('small', '', o.count >= list.length ? 'All picked ✓' : ''));
      r.append(nm, pts); t.append(r);
    });
    c.append(t);
  }

  // ---- Admin: call races yourself ----
  function renderAdmin(box) {
    const c = card('Call races', 'Tap the winner when a race is called. Everyone’s scores update right away. Calls Claude adds to the app’s results also count — yours override them.');
    box.append(c);
    const chips = el('div', 'en-chips pl-chips');
    ['Senate', 'Governors', 'House', 'Missouri'].forEach(g => { const b = btn('en-chip', g, () => { pickFilter = g; render(); }); b.setAttribute('aria-pressed', String(pickFilter === g)); chips.append(b); });
    box.append(chips);
    const wrap = el('div', 'pl-list');
    races().filter(r => r.group === pickFilter).forEach(r => {
      const cur = adminRes[r.key] || '';
      wrap.append(pickRow(r, cur, null, false, async (side) => { await be.saveAdminResult(r.key, cur === side ? null : side); }));
    });
    box.append(wrap);
  }

  // ---------- Boot ----------
  function boot() {
    const cfg = window.POOL_CONFIG;
    if (window.POOL_MOCK) be = mockBackend();
    else if (cfg && cfg.apiKey && window.firebase) { try { be = firebaseBackend(cfg); } catch (e) { console.error(e); be = null; } }
    render();
    if (!be) return;
    let unsubRes = null;
    be.onAuth(async (u) => {
      me = u; profile = null; myPicks = {}; mySeats = null;
      if (typeof unsubRes === 'function') unsubRes(); unsubRes = null; adminRes = {};
      if (u) unsubRes = be.watchAdminResults((r) => { adminRes = r || {}; if (me && (view === 'board' || view === 'picks' || view === 'admin')) render(); });
      if (u) {
        profile = await be.getProfile(u.uid).catch(() => null);
        if (!profile && u.name) { profile = { name: u.name, groups: [] }; await be.saveProfile(u.uid, profile).catch(() => {}); }
        const p = await be.getPicks(u.uid).catch(() => null);
        if (p) { myPicks = Object.assign({}, p.picks || {}); mySeats = p.seats == null ? null : p.seats; }
      }
      render();
    });
    if (window.dash) window.dash.onData(() => { if (me && !document.activeElement?.closest?.('#pool-root')) render(); });
    setInterval(() => { const b = $('.pl-lock'); if (b) { const nb = lockBanner(); b.replaceWith(nb); } }, 60000);
  }
  const jump = () => { if (location.hash === '#game') setTimeout(() => { const g = document.getElementById('game'); if (g) g.scrollIntoView({ block: 'start' }); }, 600); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot(); jump(); }); else { boot(); jump(); }
})();
