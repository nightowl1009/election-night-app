/* Election Night 2026 — Election Night Game (prediction game) section.
   Sign in (Google or email), pick the 28 toss-ups, choose a lock of the night,
   answer the side questions, join groups with a code, chat with your group, and
   climb the leaderboard as races are called. Uses Firebase (Auth + Firestore)
   configured in pool-config.js. Picks lock at 5:00 PM CT on Nov 3, 2026. */
(function () {
  const LOCK = Date.UTC(2026, 10, 3, 23, 0, 0); // 5:00 PM CST, Nov 3
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
  const last = (n) => String(n || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(' ').slice(-1)[0];
  const locked = () => (window.__simNow ? window.__simNow() : Date.now()) >= LOCK;
  const rows = (id) => { const d = window.dash && window.dash.data(id); return d && d.status === 'ok' ? d.data : []; };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // chat rooms: 'ALL' is the everyone chat (lobby), anything else is a group code
  const ALL = 'ALL';
  const chatPath = (code) => code === ALL ? 'lobby' : 'groups/' + code + '/chat';

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
      signUpEmail: async (email, pw, name) => { const c = await auth.createUserWithEmailAndPassword(email, pw); if (name) await c.user.updateProfile({ displayName: name }); try { await c.user.sendEmailVerification(); } catch (e) { console.error(e); } return c; },
      resendVerify: () => auth.currentUser ? auth.currentUser.sendEmailVerification() : Promise.resolve(),
      refreshUser: async () => { const u = auth.currentUser; if (!u) return null; await u.reload(); await u.getIdToken(true); return userOf(auth.currentUser); },
      resetPassword: (email) => auth.sendPasswordResetEmail(email),
      signOut: () => auth.signOut(),
      isAdmin: (u) => !!u && !!u.email && u.verified && admins.includes(u.email.toLowerCase()),
      getProfile: async (uid) => { const s = await fs.doc('users/' + uid).get(); return s.exists ? s.data() : null; },
      saveProfile: (uid, data) => fs.doc('users/' + uid).set(data, { merge: true }),
      getPicks: async (uid) => { const s = await fs.doc('picks/' + uid).get(); return s.exists ? s.data() : null; },
      savePicks: (uid, data) => fs.doc('picks/' + uid).set(data),
      getGroup: async (code) => { const s = await fs.doc('groups/' + code).get(); return s.exists ? s.data() : null; },
      createGroup: (code, name, uid) => fs.doc('groups/' + code).set({ name, owner: uid, created: Date.now() }),
      addMember: (code, uid, data) => fs.doc('groups/' + code + '/members/' + uid).set(data, { merge: true }),
      removeMember: (code, uid) => fs.doc('groups/' + code + '/members/' + uid).delete(),
      listMembers: async (code) => { const q = await fs.collection('groups/' + code + '/members').get(); return q.docs.map(d => Object.assign({ uid: d.id }, d.data())); },
      watchAdminResults: (cb) => fs.doc('admin/results').onSnapshot(s => cb(s.exists ? s.data() : {}), () => cb({})),
      saveAdminResult: (key, val) => fs.doc('admin/results').set({ [key]: (val == null || val === '') ? firebase.firestore.FieldValue.delete() : val }, { merge: true }),
      watchChat: (code, cb, err) => fs.collection(chatPath(code)).orderBy('at', 'desc').limit(100)
        .onSnapshot(q => cb(q.docs.map(d => Object.assign({ id: d.id }, d.data())).reverse()), e => { console.error(e); if (err) err(e); }),
      // the message and your "last posted" time are written together; the rules enforce a short cooldown
      sendChat: (code, msg) => { const b = fs.batch(); b.set(fs.collection(chatPath(code)).doc(), msg); b.set(fs.doc('users/' + msg.uid), { lastChat: msg.at }, { merge: true }); return b.commit(); },
      deleteChat: (code, id) => fs.doc(chatPath(code) + '/' + id).delete(),
    };
  }
  function mockBackend() {
    const db = window.__poolMockDb || (window.__poolMockDb = { users: {}, picks: {}, groups: {}, members: {}, admin: {}, chat: {} });
    let cur = null; const subs = []; const adminSubs = []; const chatSubs = {};
    const set = (u) => { cur = u; subs.forEach(f => f(u)); };
    const pushChat = (code) => (chatSubs[code] || []).forEach(f => f((db.chat[code] || []).slice(-100)));
    return {
      onAuth: (cb) => { subs.push(cb); setTimeout(() => cb(cur), 0); },
      signInGoogle: async () => set({ uid: 'u_brad', name: 'Brad', email: 'brad@example.com', verified: true }),
      signInEmail: async (email) => set({ uid: 'u_' + email.split('@')[0], name: '', email, verified: true }),
      signUpEmail: async (email, pw, name) => set({ uid: 'u_' + email.split('@')[0], name, email, verified: !window.POOL_MOCK_UNVERIFIED }),
      resendVerify: async () => {},
      refreshUser: async () => { cur = Object.assign({}, cur, { verified: true }); return cur; },
      resetPassword: async () => {},
      signOut: async () => set(null),
      isAdmin: (u) => !!u && u.uid === 'u_brad',
      getProfile: async (uid) => db.users[uid] || null,
      saveProfile: async (uid, data) => { db.users[uid] = Object.assign({}, db.users[uid], data); },
      getPicks: async (uid) => db.picks[uid] || null,
      savePicks: async (uid, data) => { db.picks[uid] = data; },
      getGroup: async (code) => db.groups[code] || null,
      createGroup: async (code, name, uid) => { db.groups[code] = { name, owner: uid }; },
      addMember: async (code, uid, data) => { const m = (db.members[code] = db.members[code] || {}); m[uid] = Object.assign({}, m[uid], data); },
      removeMember: async (code, uid) => { if (db.members[code]) delete db.members[code][uid]; },
      listMembers: async (code) => Object.entries(db.members[code] || {}).map(([uid, v]) => Object.assign({ uid }, v)),
      watchAdminResults: (cb) => { adminSubs.push(cb); cb(db.admin); },
      saveAdminResult: async (key, val) => { if (val != null && val !== '') db.admin[key] = val; else delete db.admin[key]; adminSubs.forEach(f => f(Object.assign({}, db.admin))); },
      watchChat: (code, cb) => { (chatSubs[code] = chatSubs[code] || []).push(cb); setTimeout(() => pushChat(code), 0); return () => { chatSubs[code] = chatSubs[code].filter(f => f !== cb); }; },
      sendChat: async (code, msg) => { (db.chat[code] = db.chat[code] || []).push(Object.assign({ id: 'm' + Math.random().toString(36).slice(2) }, msg)); pushChat(code); },
      deleteChat: async (code, id) => { db.chat[code] = (db.chat[code] || []).filter(m => m.id !== id); pushChat(code); },
    };
  }

  // ---------- Races ----------
  // pick values: 'd' = Dem (or Independent) candidate, 'r' = GOP
  // The game's 28 races, frozen Oct 24, 2026: the Senate, governor and House races Cook rated Toss-up.
  const GAME = ["SEN-OH", "SEN-AK", "SEN-ME", "SEN-TX", "SEN-IA", "SEN-KS", "SEN-MI", "GOV-OH", "GOV-GA", "GOV-NV", "GOV-KS", "HOU-FL-14", "HOU-FL-22", "HOU-NC-01", "HOU-OH-09", "HOU-TX-35", "HOU-CA-22", "HOU-IA-02", "HOU-KY-06", "HOU-MI-04", "HOU-MI-07", "HOU-MI-10", "HOU-MT-01", "HOU-NY-17", "HOU-OH-07", "HOU-PA-08", "HOU-TX-15", "HOU-VA-01"];
  function races() {
    const out = [];
    rows('senate').forEach(r => out.push({ key: 'SEN-' + r.id, group: 'Senate', label: r.state, long: r.state + ' Senate', held: r.held, a: last(r.cand_d), ap: r.party_d || 'D', b: last(r.cand_r), kd: r.kalshi_d }));
    rows('governor').forEach(r => out.push({ key: 'GOV-' + r.id, group: 'Governors', label: r.state, long: r.state + ' governor', held: r.held, a: last(r.cand_d), ap: r.party_d || 'D', b: last(r.cand_r), kd: null }));
    rows('house').forEach(r => out.push({ key: 'HOU-' + r.id, group: 'House', label: r.id, long: r.id, held: r.held, a: last(r.cand_d), ap: r.party_d || 'D', b: last(r.cand_r), kd: r.kalshi_d, rating: r.rating }));
    return out.filter(r => GAME.includes(r.key));
  }
  // results: dataset rows (filled by Claude on election night), overridden by the admin's own calls
  let adminRes = {};
  function winners() {
    const w = {};
    rows('results').forEach(x => { if (x.winner_party) w[x.race] = /^(R|N)$/.test(x.winner_party) ? 'r' : 'd'; });
    Object.entries(adminRes).forEach(([k, v]) => { if (GAME.includes(k) && (v === 'd' || v === 'r')) w[k] = v; });
    return w;
  }
  // when each race was called (results dataset), newest first
  function callOrder(list) {
    const at = {}; rows('results').forEach(x => { if (x.winner_party && x.called_at) at[x.race] = x.called_at; });
    return list.filter(r => at[r.key]).sort((a, b) => String(at[b.key]).localeCompare(String(at[a.key])));
  }

  // ---------- Side questions (1 point each) ----------
  const senStates = () => rows('senate').map(r => [r.id, r.state]);
  const SIDE = [
    { id: 'first', q: 'Which Senate race is called first?', type: 'choice', opts: senStates, hint: 'Of the 11 Senate races in this app' },
    { id: 'house', q: 'How many House seats will Democrats win? (of 435)', type: 'num', min: 180, max: 260, hint: 'Within 3 seats of the final count = 1 point' },
    { id: 'mid', q: 'Will both the Senate and House be called by midnight CT?', type: 'yn', hint: 'Called by AP or the major networks' },
  ];
  function answers() {
    const a = {};
    // first Senate race called: earliest called_at in the results, unless the admin set it
    let first = null; rows('results').forEach(x => { if (/^SEN-/.test(x.race) && x.winner_party && x.called_at && (!first || String(x.called_at) < String(first.called_at))) first = x; });
    if (first) a.first = first.race.slice(4);
    if (adminRes['Q-first']) a.first = adminRes['Q-first'];
    if (adminRes['Q-house'] != null && adminRes['Q-house'] !== '') a.house = Number(adminRes['Q-house']);
    if (adminRes['Q-mid']) a.mid = adminRes['Q-mid'];
    return a;
  }
  function sideRight(q, mine, ans) {
    if (mine == null || mine === '' || ans[q.id] == null) return null;
    if (q.type === 'num') return Math.abs(Number(mine) - Number(ans[q.id])) <= 3;
    return String(mine) === String(ans[q.id]);
  }

  // points for a correct pick: 1, or more for calling an underdog per Kalshi's odds; lock of the night doubles it
  function worth(race, side) {
    if (race.kd == null) return 1;
    const p = side === 'd' ? Number(race.kd) : 100 - Number(race.kd);
    return p < 30 ? 3 : p < 50 ? 2 : 1;
  }
  function score(doc, w, list) {
    const picks = (doc && doc.picks) || {}, lockKey = doc && doc.lock, side = (doc && doc.side) || {}, ans = answers();
    let pts = 0, right = 0, wrong = 0, best = null, max = 0;
    list.forEach(r => {
      const p = picks[r.key], x = w[r.key]; if (!p) return;
      const v = worth(r, p) * (r.key === lockKey ? 2 : 1);
      if (!x) { max += v; return; }
      if (p === x) { pts += v; right++; if (v > 1 && (!best || v > best.v)) best = { v, r }; } else wrong++;
    });
    let sidePts = 0;
    SIDE.forEach(q => { const ok = sideRight(q, side[q.id], ans); if (ok) sidePts++; else if (ok == null && side[q.id] != null && side[q.id] !== '') max++; });
    pts += sidePts;
    return { pts, right, wrong, best, max: pts + max, sidePts };
  }

  // ---------- State ----------
  let be = null, me = null, profile = null, myPicks = {}, mySeats = null, myLock = null, mySide = {}, view = 'picks', activeGroup = '', saveT = null, saving = false;
  let pickFilter = 'Senate', finaleJumped = false;
  let chatUnsub = null, chatCode = '', chatMsgs = [], chatErr = '', chatRoom = ALL, lastSent = 0;
  const myDoc = () => ({ picks: myPicks, seats: mySeats, lock: myLock, side: mySide });

  // ---------- UI ----------
  const root = () => $('#pool-root');
  function render() {
    const box = root(); if (!box) return;
    box.replaceChildren();
    if (view !== 'chat') stopChat();
    if (!be) { box.append(card('Election Night Game', window.POOL_CONFIG && !window.firebase ? 'The game needs an internet connection — reconnect and reopen the app.' : 'The game is being set up. Check back soon.')); return; }
    if (!me) return renderSignedOut(box);
    if (!finaleJumped && locked() && (adminRes['Q-final'] === 'y' || (races().length && races().every(r => winners()[r.key]))) && profile && (profile.groups || []).length) { finaleJumped = true; if (view === 'picks') view = 'board'; }
    const top = el('div', 'pl-top');
    const who = el('div', 'pl-who'); who.append(el('b', '', profile && profile.name || me.name || me.email), el('small', '', me.email));
    const nav = el('div', 'en-seg');
    [['picks', 'My picks'], ['groups', 'Groups'], ['chat', 'Chat'], ['board', 'Leaderboard']].concat(be.isAdmin(me) ? [['admin', 'Admin']] : []).forEach(([k, t]) => {
      const b = btn('', t, () => { view = k; render(); }); b.setAttribute('aria-pressed', String(view === k)); nav.append(b);
    });
    top.append(who, btn('en-chip', 'Sign out', () => be.signOut()));
    box.append(top, lockBanner(), nav);
    if (!me.verified) return renderVerify(box);
    if (!profile || !profile.name) return renderName(box);
    if (view === 'picks') renderPicks(box);
    else if (view === 'groups') renderGroups(box);
    else if (view === 'chat') renderChat(box);
    else if (view === 'board') renderBoard(box);
    else if (view === 'admin') renderAdmin(box);
  }
  function card(h, p) { const c = el('div', 'pl-card'); c.append(el('h3', '', h)); if (p) c.append(el('p', '', p)); return c; }
  function lockBanner() {
    const b = el('div', 'pl-lock' + (locked() ? ' done' : ''));
    if (window.__simOn) { b.textContent = 'Practice run: picks are shown as locked and scored against the made-up results. Nothing is saved.'; return b; }
    if (locked()) { b.textContent = 'Picks are locked — everyone’s picks are now visible. Scores update as races are called.'; return b; }
    const ms = LOCK - Date.now(), d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    const when = d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm';
    b.append(el('span', '', 'Picks lock in ' + when + ' — 5:00 PM CT on Election Day.'));
    if (me && profile && profile.name) {
      const n = races().length, made = races().filter(r => myPicks[r.key]).length;
      const sideLeft = SIDE.filter(q => mySide[q.id] == null || mySide[q.id] === '').length;
      const todo = [];
      if (made < n) todo.push((n - made) + ' race' + (n - made === 1 ? '' : 's'));
      if (!myLock) todo.push('your lock of the night');
      if (sideLeft) todo.push(sideLeft + ' side question' + (sideLeft === 1 ? '' : 's'));
      if (todo.length) { b.classList.add('todo'); b.append(el('b', 'pl-todo', 'Still to do: ' + todo.join(', ') + '.')); }
      else b.append(el('b', 'pl-done', 'Your ballot is complete ✓'));
      if (d === 0 && h < 3 && todo.length) b.classList.add('urgent');
    }
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
    if (/permission-denied/.test(c)) return 'Not allowed — the game’s database rules may need updating.';
    if (/network/.test(c)) return 'No connection — try again.';
    return 'Something went wrong (' + (c || 'unknown') + ').';
  }
  function renderSignedOut(box) {
    const c = el('div', 'pl-card pl-hero');
    c.append(el('h3', '', 'Play the Election Night Game'), el('p', '', 'Pick the winner of the 28 toss-up races: 7 for Senate, 4 for governor and 17 for the House. Choose a lock of the night for double points, answer 3 side questions, start a group with friends, chat, and climb the leaderboard as results come in. Picks lock at 5:00 PM CT on Nov 3.'));
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
  function renderVerify(box) {
    const c = card('Verify your email to play', 'We sent a link to ' + me.email + '. Tap it, then come back and tap “I’ve verified.” This keeps bots out of the game and chat. Check your spam folder if it isn’t there.');
    const msg = el('p', 'pl-msg');
    c.append(btn('pl-btn primary', 'I’ve verified', async () => {
      msg.textContent = '';
      try { const u = await be.refreshUser(); if (u && u.verified) { me = u; render(); } else msg.textContent = 'Not verified yet — tap the link in the email first.'; } catch (e) { msg.textContent = errText(e); }
    }), btn('pl-btn', 'Resend the email', async () => { try { await be.resendVerify(); msg.textContent = 'Sent — check your inbox.'; } catch (e) { msg.textContent = errText(e); } }), msg);
    box.append(c);
  }
  function renderName(box) {
    const c = card('What should we call you?', 'This name shows on leaderboards and in group chat.');
    const i = el('input'); i.maxLength = 30; i.value = me.name || ''; i.placeholder = 'Name';
    const s = btn('pl-btn primary', 'Save', async () => { const n = i.value.trim(); if (!n) return; profile = Object.assign({}, profile, { name: n, groups: (profile && profile.groups) || [] }); await be.saveProfile(me.uid, profile); render(); });
    c.append(i, s); box.append(c);
  }

  // ---- My picks ----
  function renderPicks(box) {
    const list = races(), w = winners(), lk = locked();
    const made = list.filter(r => myPicks[r.key]).length;
    const sc = score(myDoc(), w, list);
    const head = el('div', 'pl-card pl-sum');
    const nums = el('div', 'pl-nums');
    const stat = (v, t) => { const s = el('div'); s.append(el('b', '', v), el('small', '', t)); return s; };
    nums.append(stat(made + '/' + list.length, 'picked'), stat(String(sc.pts), 'points'), stat(lk ? String(sc.max) : sc.right + '–' + sc.wrong, lk ? 'max possible' : 'right–wrong'));
    head.append(nums);
    const tools = el('div', 'en-path-tools');
    if (!lk) tools.append(
      btn('en-chip', 'Fill blanks with Kalshi favorites', () => fill('kalshi')),
      btn('en-chip', 'Fill blanks with polling leaders', () => fill('polls')),
      btn('en-chip', 'Clear all', () => { if (confirmClear()) { myPicks = {}; myLock = null; queueSave(); render(); } }));
    if (made) tools.append(btn('en-chip pl-share', 'Share my picks', () => sharePicks()));
    head.append(tools);
    head.append(el('p', 'pl-note', 'Correct pick = 1 point. Calling an underdog is worth more: 2 points if Kalshi gave them 30–49%, 3 points under 30%. Tap ★ on one race to make it your lock of the night — double points if you’re right. Side questions are 1 point each.'));
    head.append(el('p', 'pl-saved', saving ? 'Saving…' : (made ? 'Saved' : '')));
    box.append(head);
    const chips = el('div', 'en-chips pl-chips');
    ['Senate', 'Governors', 'House'].forEach(g => {
      const n = list.filter(r => r.group === g), m = n.filter(r => myPicks[r.key]).length;
      const c = btn('en-chip', g + ' · ' + m + '/' + n.length, () => { pickFilter = g; render(); }); c.setAttribute('aria-pressed', String(pickFilter === g)); chips.append(c);
    });
    const sideDone = SIDE.filter(q => mySide[q.id] != null && mySide[q.id] !== '').length;
    const sc2 = btn('en-chip', 'Side questions · ' + sideDone + '/' + SIDE.length, () => { pickFilter = 'Side'; render(); }); sc2.setAttribute('aria-pressed', String(pickFilter === 'Side')); chips.append(sc2);
    box.append(chips);
    if (pickFilter === 'Side') { box.append(renderSide(lk)); return; }
    const wrap = el('div', 'pl-list');
    list.filter(r => r.group === pickFilter).forEach(r => wrap.append(pickRow(r, myPicks[r.key], w[r.key], lk, (side) => { myPicks[r.key] = myPicks[r.key] === side ? undefined : side; if (!myPicks[r.key]) delete myPicks[r.key]; queueSave(); render(); }, true)));
    box.append(wrap);
  }
  function renderSide(lk) {
    const wrap = el('div', 'pl-list'), ans = answers();
    SIDE.forEach(q => {
      const c = el('div', 'pl-card pl-side');
      const mine = mySide[q.id], ok = sideRight(q, mine, ans);
      c.append(el('b', '', q.q), el('p', '', q.hint + (ans[q.id] != null ? ' · Answer: ' + sideLabel(q, ans[q.id]) + (ok == null ? '' : ok ? ' ✓ +1' : ' ✗') : '')));
      if (ok != null) c.classList.add(ok ? 'ok' : 'bad');
      const set = (v) => { mySide = Object.assign({}, mySide); if (v === '' || v == null) delete mySide[q.id]; else mySide[q.id] = v; queueSave(); render(); };
      if (q.type === 'choice') {
        const s = el('select'); s.disabled = lk; s.append(new Option('Choose…', ''));
        q.opts().forEach(([v, t]) => s.append(new Option(t, v)));
        s.value = mine || ''; s.addEventListener('change', () => set(s.value)); c.append(s);
      } else if (q.type === 'num') {
        const i = el('input'); i.type = 'number'; i.inputMode = 'numeric'; i.min = q.min; i.max = q.max; i.placeholder = 'e.g. 220'; i.disabled = lk; i.value = mine == null ? '' : mine;
        i.addEventListener('change', () => { const v = parseInt(i.value, 10); set(isNaN(v) ? '' : Math.max(q.min, Math.min(q.max, v))); }); c.append(i);
      } else {
        const b = el('div', 'btns pl-yn');
        [['y', 'Yes'], ['n', 'No']].forEach(([v, t]) => { const x = btn('en-pb ' + v, t, () => set(mine === v ? '' : v)); x.setAttribute('aria-pressed', String(mine === v)); x.disabled = lk; b.append(x); });
        c.append(b);
      }
      wrap.append(c);
    });
    // tiebreaker lives with the side questions
    const tb = el('div', 'pl-card pl-side'); tb.append(el('b', '', 'Tiebreaker: Senate seats Democrats + independents win (of 100)'), el('p', '', 'Only used to break ties — closest guess wins.'));
    const ti = el('input'); ti.type = 'number'; ti.min = 40; ti.max = 60; ti.inputMode = 'numeric'; ti.value = mySeats == null ? '' : mySeats; ti.disabled = lk; ti.placeholder = 'e.g. 50';
    ti.addEventListener('change', () => { const v = parseInt(ti.value, 10); mySeats = isNaN(v) ? null : Math.max(30, Math.min(70, v)); queueSave(); });
    tb.append(ti); wrap.append(tb);
    return wrap;
  }
  function sideLabel(q, v) {
    if (q.type === 'choice') { const o = q.opts().find(x => x[0] === v); return o ? o[1] : v; }
    if (q.type === 'yn') return v === 'y' ? 'Yes' : 'No';
    return String(v);
  }
  function confirmClear() { return window.confirm ? window.confirm('Clear all your picks?') : true; }
  function pickRow(r, pick, win, lk, onPick, withLock) {
    const isLock = withLock && myLock === r.key;
    const row = el('div', 'en-pick compact pl-row' + (win ? (pick === win ? ' ok' : pick ? ' bad' : '') : '') + (isLock ? ' locked-pick' : ''));
    row.append(el('span', 'en-st', r.key.split('-').slice(1).join('-')));
    const info = el('div', 'info'); info.append(el('b', '', r.label));
    const sm = el('small', '');
    if (r.kd != null) { const kd = Number(r.kd); sm.textContent = 'Kalshi: ' + (kd >= 50 ? r.a + ' ' + kd : r.b + ' ' + (100 - kd)) + '%'; }
    else if (r.rating) sm.textContent = r.rating;
    if (isLock) sm.textContent += (sm.textContent ? ' · ' : '') + 'Lock of the night · 2×';
    if (win) sm.textContent += (sm.textContent ? ' · ' : '') + 'Winner: ' + (win === 'd' ? r.a : r.b) + (pick ? (pick === win ? ' ✓ +' + worth(r, pick) * (isLock ? 2 : 1) : ' ✗') : '');
    info.append(sm); row.append(info);
    const b = el('div', 'btns');
    if (withLock) {
      const st = btn('pl-star' + (isLock ? ' on' : ''), isLock ? '★' : '☆', () => { myLock = isLock ? null : r.key; queueSave(); render(); });
      st.setAttribute('aria-label', isLock ? 'Remove lock of the night' : 'Make ' + r.label + ' your lock of the night'); st.setAttribute('aria-pressed', String(isLock)); st.disabled = lk; b.append(st);
    }
    [['d', r.ap === 'I' ? 'i' : 'd', r.a], ['r', 'r', r.b]].forEach(([side, cls, name]) => {
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
      const valid = new Set(races().map(r => r.key));
      const clean = {}; Object.entries(myPicks).forEach(([k, v]) => { if ((v === 'd' || v === 'r') && valid.has(k)) clean[k] = v; });
      const side = {}; SIDE.forEach(q => { const v = mySide[q.id]; if (v != null && v !== '') side[q.id] = v; });
      try {
        try { await be.savePicks(me.uid, { picks: clean, seats: mySeats, lock: valid.has(myLock) ? myLock : null, side, updated: Date.now() }); }
        catch (e) {
          // older database rules only accept picks + seats: save those so nothing is lost
          if (!/permission-denied/.test((e && e.code) || '')) throw e;
          await be.savePicks(me.uid, { picks: clean, seats: mySeats, updated: Date.now() });
          alertish('Picks saved — lock of the night and side questions will save once the game is updated.');
        }
        const n = Object.keys(clean).length;
        await be.saveProfile(me.uid, { pickCount: n });
        for (const code of ((profile && profile.groups) || [])) await be.addMember(code, me.uid, { name: profile.name, pickCount: n }).catch(() => {});
      }
      catch (e) { console.error(e); alertish(errText(e)); }
      saving = false; const s = $('.pl-saved'); if (s) s.textContent = 'Saved';
      const lb = $('.pl-lock'); if (lb) lb.replaceWith(lockBanner());
    }, 700);
  }

  // ---- Share my picks as an image ----
  function sharePicks() {
    const list = races(), W = 1080, rowH = 46, groups = ['Senate', 'Governors', 'House'];
    const H = 250 + list.length * rowH + groups.length * 84 + 50 + SIDE.length * 46 + 110;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#1e3a8a'); g.addColorStop(.5, '#0b1020'); g.addColorStop(1, '#991b1b');
    x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H); x.fillStyle = g; x.fillRect(0, 0, W, 190);
    x.fillStyle = '#fff'; x.font = '600 30px system-ui, sans-serif'; x.fillText('ELECTION NIGHT GAME · 2026', 60, 80);
    x.font = '700 60px system-ui, sans-serif'; x.fillText((profile && profile.name || 'My') + '’s picks', 60, 150);
    let y = 250;
    groups.forEach(grp => {
      x.fillStyle = '#fbbf24'; x.font = '700 30px system-ui, sans-serif'; x.fillText(grp.toUpperCase(), 60, y); y += 8;
      list.filter(r => r.group === grp).forEach(r => {
        y += rowH; const p = myPicks[r.key];
        x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '500 30px system-ui, sans-serif'; x.fillText(r.label, 60, y);
        const name = p ? (p === 'd' ? r.a : r.b) : '—';
        x.fillStyle = !p ? '#6b7280' : p === 'r' ? '#f87171' : r.ap === 'I' ? '#c084fc' : '#60a5fa';
        x.font = '700 30px system-ui, sans-serif'; const t = name + (myLock === r.key ? '  ★ 2×' : ''); x.fillText(t, W - 60 - x.measureText(t).width, y);
      });
      y += 76;
    });
    x.fillStyle = '#fbbf24'; x.font = '700 30px system-ui, sans-serif'; x.fillText('SIDE QUESTIONS', 60, y); y += 4;
    SIDE.forEach(q => { y += 46; x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '500 26px system-ui, sans-serif'; x.fillText(q.q.replace(/\s*\(of 435\)/, ''), 60, y);
      const v = mySide[q.id]; const t = v == null || v === '' ? '—' : sideLabel(q, v); x.fillStyle = '#fff'; x.font = '700 28px system-ui, sans-serif'; x.fillText(t, W - 60 - x.measureText(t).width, y); });
    x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '500 24px system-ui, sans-serif'; x.fillText('election-night.netlify.app', 60, H - 40);
    c.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'my-election-picks.png', { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'My Election Night picks' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-election-picks.png'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); alertish('Picture saved — send it to your group.');
    }, 'image/png');
  }

  // ---- Groups ----
  const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 6 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  async function groupChips(box, after) {
    const groups = (profile && profile.groups) || [];
    if (!groups.includes(activeGroup)) activeGroup = groups[0];
    const pick = el('div', 'en-chips pl-chips');
    for (const code of groups) { const g = await be.getGroup(code).catch(() => null); const c = btn('en-chip', g ? g.name : code, () => { activeGroup = code; render(); }); c.setAttribute('aria-pressed', String(code === activeGroup)); pick.append(c); }
    box.insertBefore(pick, after || null);
  }
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
      acts.append(btn('en-chip', 'Chat', () => { activeGroup = code; chatRoom = code; view = 'chat'; render(); }),
        btn('en-chip', 'Leaderboard', () => { activeGroup = code; view = 'board'; render(); }),
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
    await be.addMember(code, me.uid, { name: profile.name, joined: Date.now(), pickCount: races().filter(r => myPicks[r.key]).length });
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

  // ---- Group chat ----
  function stopChat() { if (typeof chatUnsub === 'function') chatUnsub(); chatUnsub = null; chatCode = ''; chatMsgs = []; chatErr = ''; }
  async function renderChat(box) {
    const groups = (profile && profile.groups) || [];
    if (chatRoom !== ALL && !groups.includes(chatRoom)) chatRoom = ALL;
    const chips = el('div', 'en-chips pl-chips');
    const chip = (code, label) => { const b = btn('en-chip', label, () => { chatRoom = code; render(); }); b.setAttribute('aria-pressed', String(chatRoom === code)); chips.append(b); };
    chip(ALL, 'Everyone');
    for (const code of groups) { const g = await be.getGroup(code).catch(() => null); chip(code, g ? g.name : code); }
    box.append(chips);
    const c = el('div', 'pl-card pl-chat'); box.append(c);
    if (chatRoom === ALL) c.append(el('p', 'pl-chat-note', 'Everyone chat · open to every player' + (groups.length ? '' : ' · start or join a group under Groups for a private chat')));
    if (chatCode !== chatRoom) {
      stopChat(); chatCode = chatRoom;
      chatUnsub = be.watchChat(chatRoom, (m) => { chatMsgs = m; chatErr = ''; paintChat(); }, (e) => { chatErr = errText(e); paintChat(); });
    }
    const log = el('div', 'pl-chat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
    const form = el('form', 'pl-chat-form');
    const inp = el('input'); inp.placeholder = chatRoom === ALL ? 'Message everyone' : 'Message your group'; inp.maxLength = 500; inp.enterKeyHint = 'send'; inp.autocomplete = 'off';
    const send = btn('pl-btn primary', 'Send'); send.type = 'submit';
    form.append(inp, send);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const t = inp.value.trim(); if (!t) return;
      const now = Date.now(); if (now - lastSent < 3500) { alertish('Easy there — wait a couple seconds between messages.'); return; }
      lastSent = now;
      inp.value = ''; inp.focus();
      try { await be.sendChat(chatCode, { uid: me.uid, name: profile.name, text: t.slice(0, 500), at: now }); }
      catch (e) { inp.value = t; alertish(errText(e)); }
    });
    c.append(log, form);
    paintChat();
  }
  function paintChat() {
    const log = $('.pl-chat-log'); if (!log) return;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren();
    if (chatErr) { log.append(el('p', 'pl-msg', chatErr)); return; }
    if (!chatMsgs.length) { log.append(el('p', 'pl-chat-empty', 'No messages yet — say hi and talk some trash.')); return; }
    const tf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }), df = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    let lastDay = '';
    chatMsgs.forEach(m => {
      const d = new Date(Number(m.at) || 0), day = df.format(d);
      if (day !== lastDay) { log.append(el('div', 'pl-chat-day', day)); lastDay = day; }
      const mine = m.uid === me.uid;
      const b = el('div', 'pl-msgb' + (mine ? ' mine' : ''));
      const h = el('div', 'h'); h.append(el('b', '', mine ? 'You' : (m.name || 'Player')), el('small', '', tf.format(d)));
      if (mine || be.isAdmin(me)) { const x = btn('pl-del', '✕', async () => { try { await be.deleteChat(chatCode, m.id); } catch (e) { alertish(errText(e)); } }); x.setAttribute('aria-label', 'Delete message'); h.append(x); }
      b.append(h, el('p', '', String(m.text || '')));
      log.append(b);
    });
    if (atBottom || log.dataset.first !== '1') { log.scrollTop = log.scrollHeight; log.dataset.first = '1'; }
  }

  // ---- Leaderboard ----
  async function renderBoard(box) {
    const groups = (profile && profile.groups) || [];
    if (!groups.length) { box.append(card('No group yet', 'Start or join a group under Groups to see a leaderboard.')); return; }
    const c = el('div', 'pl-card'); box.append(c);
    await groupChips(box, c);
    c.append(el('p', 'pl-note', 'Loading…'));
    const members = await be.listMembers(activeGroup).catch(() => []);
    const list = races(), w = winners(), called = list.filter(r => w[r.key]).length;
    const lk = locked();
    const out = [];
    for (const m of members) {
      let p = null; if (lk || m.uid === me.uid) p = await be.getPicks(m.uid).catch(() => null);
      const s = p ? score(p, w, list) : { pts: 0, right: 0, wrong: 0, best: null, max: 0 };
      out.push({ m, p, s, count: p ? list.filter(r => (p.picks || {})[r.key]).length : Math.min(Number(m.pickCount) || 0, list.length), seats: p ? p.seats : null });
    }
    // ties: closest Senate seat guess wins when the admin has entered the final count
    const final = adminRes['Q-senate'] != null && adminRes['Q-senate'] !== '' ? Number(adminRes['Q-senate']) : null;
    const tbd = (o) => final == null || o.seats == null ? 99 : Math.abs(o.seats - final);
    out.sort((a, b) => lk ? (b.s.pts - a.s.pts || tbd(a) - tbd(b) || b.s.right - a.s.right || String(a.m.name).localeCompare(b.m.name)) : (b.count - a.count || String(a.m.name).localeCompare(b.m.name)));
    c.replaceChildren();
    const done = lk && (called === list.length || adminRes['Q-final'] === 'y');
    if (done && out.length) {
      const g = await be.getGroup(activeGroup).catch(() => null);
      c.append(finale(out, g ? g.name : 'your group', list, w));
    }
    c.append(el('h3', '', done ? 'Final standings' : 'Leaderboard'), el('p', 'pl-note', lk ? called + ' of ' + list.length + ' races called' + (done ? ' — that’s a wrap!' : '') : 'Scores start once races are called. Picks stay hidden until they lock at 5:00 PM CT Nov 3.'));
    if (lk && called) c.append(liveExtras(out, list, w));
    const t = el('div', 'pl-board');
    const leader = out.length ? out[0].s.pts : 0;
    out.forEach((o, i) => {
      const r = el('div', 'pl-rank' + (o.m.uid === me.uid ? ' me' : ''));
      r.append(el('span', 'n', lk ? String(i + 1) : '·'));
      const bits = [o.count + '/' + list.length + ' picked'];
      if (lk && o.p && o.p.lock) { const lr = list.find(x => x.key === o.p.lock); if (lr) bits.push('★ ' + lr.label); }
      if (lk && o.seats != null) bits.push('Senate guess ' + o.seats);
      if (o.s.best) bits.push('best call: ' + o.s.best.r.label + ' (+' + o.s.best.v + ')');
      if (lk && called && !done) bits.push(o.s.max < leader ? 'max ' + o.s.max + ' · can’t catch the leader' : 'max ' + o.s.max);
      const nm = el('div', 'who'); nm.append(el('b', '', o.m.name || 'Player'), el('small', '', bits.join(' · ')));
      const pts = el('div', 'pts'); if (lk) pts.append(el('b', '', String(o.s.pts)), el('small', '', o.s.right + '–' + o.s.wrong)); else pts.append(el('small', '', o.count >= list.length ? 'All picked ✓' : ''));
      r.append(nm, pts); t.append(r);
    });
    c.append(t);
  }
  // ---- Season finale: winner banner, podium, your finish, shareable standings ----
  function finale(out, gname, list, w) {
    const top = out[0].s.pts, champs = out.filter(o => o.s.pts === top && (o === out[0] || sameRank(o, out[0])));
    const box = el('div', 'pl-finale');
    const conf = el('div', 'pl-confetti'); conf.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 28; i++) { const b = el('i'); b.style.left = (i * 3.6 + Math.random() * 3) + '%'; b.style.animationDelay = (Math.random() * 2.2).toFixed(2) + 's'; b.style.background = ['#fbbf24', '#3b82f6', '#ef4444', '#fff', '#a855f7'][i % 5]; conf.append(b); }
    box.append(conf, el('span', 'k', '🏆 SEASON FINALE'));
    const nm = (o) => o.m.uid === me.uid ? 'You' : (o.m.name || 'Player');
    box.append(el('h4', '', champs.length > 1 ? champs.map(nm).join(' & ') + ' tie for the win!' : (champs[0].m.uid === me.uid ? 'You win ' : nm(champs[0]) + ' wins ') + gname + '!'));
    box.append(el('p', '', top + ' points · ' + champs[0].s.right + ' of ' + list.length + ' races right' + (champs[0].s.best ? ' · best call: ' + champs[0].s.best.r.label + ' (+' + champs[0].s.best.v + ')' : '')));
    const pod = el('div', 'pl-podium');
    [1, 0, 2].forEach(i => { const o = out[i]; if (!o) return; const d = el('div', 'p' + (i + 1)); d.append(el('span', 'm', ['🥇', '🥈', '🥉'][i]), el('b', '', nm(o)), el('small', '', o.s.pts + ' pts'), el('i', '', String(i + 1))); pod.append(d); });
    box.append(pod);
    const mine = out.findIndex(o => o.m.uid === me.uid);
    if (mine >= 0) { const o = out[mine]; box.append(el('p', 'you', 'Your finish: ' + ordinal(mine + 1) + ' of ' + out.length + ' · ' + o.s.pts + ' pts · ' + o.s.right + '–' + o.s.wrong + (o.s.sidePts ? ' · ' + o.s.sidePts + ' side question' + (o.s.sidePts > 1 ? 's' : '') : ''))); }
    const bt = el('div', 'btns');
    bt.append(btn('pl-btn primary', 'Share final standings', () => shareStandings(out, gname, list)));
    bt.append(btn('pl-btn', 'How did the polls do?', () => { const t = document.querySelector('.en-tab[data-tab="night"]'); if (t) t.click(); setTimeout(() => { const s = document.getElementById('en-score'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400); }));
    box.append(bt);
    return box;
  }
  const sameRank = (a, b) => {
    const f = adminRes['Q-senate'] != null && adminRes['Q-senate'] !== '' ? Number(adminRes['Q-senate']) : null;
    const gap = (o) => f == null || o.seats == null ? 99 : Math.abs(o.seats - f);
    return a.s.pts === b.s.pts && gap(a) === gap(b) && a.s.right === b.s.right;
  };
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function shareStandings(out, gname, list) {
    const W = 1080, rowH = 74, rowsN = Math.min(out.length, 12), H = 350 + rowsN * rowH + 110;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#1e3a8a'); g.addColorStop(.5, '#0b1020'); g.addColorStop(1, '#991b1b');
    x.fillStyle = '#0b1020'; x.fillRect(0, 0, W, H); x.fillStyle = g; x.fillRect(0, 0, W, 300);
    x.fillStyle = '#fbbf24'; x.font = '700 30px system-ui, sans-serif'; x.fillText('🏆 SEASON FINALE · ELECTION NIGHT GAME 2026', 60, 80);
    x.fillStyle = '#fff'; x.font = '700 64px system-ui, sans-serif';
    const champ = (out[0].m.name || 'Player') + ' wins!'; x.fillText(champ.length > 26 ? champ.slice(0, 25) + '…' : champ, 60, 170);
    x.font = '500 32px system-ui, sans-serif'; x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText(gname + ' · final standings · ' + list.length + ' races', 60, 230);
    let y = 380;
    out.slice(0, rowsN).forEach((o, i) => {
      if (i % 2 === 0) { x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(40, y - 50, W - 80, rowH); }
      x.fillStyle = i < 3 ? '#fbbf24' : 'rgba(255,255,255,.6)'; x.font = '700 36px system-ui, sans-serif'; x.fillText(String(i + 1), 70, y);
      x.fillStyle = '#fff'; x.font = (o.m.uid === me.uid ? '700' : '500') + ' 36px system-ui, sans-serif'; const n = o.m.name || 'Player'; x.fillText(n.length > 22 ? n.slice(0, 21) + '…' : n, 140, y);
      const t = o.s.pts + ' pts · ' + o.s.right + '–' + o.s.wrong; x.font = '700 34px system-ui, sans-serif'; x.fillText(t, W - 70 - x.measureText(t).width, y);
      y += rowH;
    });
    if (out.length > rowsN) { x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '500 26px system-ui, sans-serif'; x.fillText('+ ' + (out.length - rowsN) + ' more', 140, y - 20); }
    x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '500 24px system-ui, sans-serif'; x.fillText('election-night.netlify.app', 60, H - 40);
    c.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'election-game-final.png', { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Election Night Game — final standings' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'election-game-final.png'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); alertish('Picture saved — send it to your group.');
    }, 'image/png');
  }

  // election night: latest calls with who got them right, and the biggest upset so far
  function liveExtras(out, list, w) {
    const box = el('div', 'pl-live');
    const recent = callOrder(list.filter(r => w[r.key])).slice(0, 3);
    recent.forEach(r => {
      const side = w[r.key], win = side === 'd' ? r.a : r.b;
      const got = out.filter(o => o.p && (o.p.picks || {})[r.key] === side).map(o => (o.m.uid === me.uid ? 'You' : o.m.name || 'Player') + (o.p.lock === r.key ? ' ★' : ''));
      const d = el('div', 'pl-call ' + (side === 'r' ? 'r' : r.ap === 'I' ? 'i' : 'd'));
      d.append(el('b', '', win + ' wins ' + r.long), el('small', '', got.length ? 'Got it (+' + worth(r, side) + '): ' + got.join(', ') : 'Nobody in the group called it'));
      box.append(d);
    });
    let up = null;
    list.forEach(r => { const s = w[r.key]; if (!s || r.kd == null) return; const p = s === 'd' ? Number(r.kd) : 100 - Number(r.kd); if (p < 50 && (!up || p < up.p)) up = { r, p, s }; });
    if (up) { const d = el('div', 'pl-upset'); d.append(el('b', '', '🔥 Biggest upset so far'), el('small', '', (up.s === 'd' ? up.r.a : up.r.b) + ' wins ' + up.r.long + ' — Kalshi had them at ' + up.p + '%')); box.append(d); }
    return box;
  }

  // ---- Admin: call races yourself ----
  function renderAdmin(box) {
    if (window.__simOn) { box.append(card('Practice run in progress', 'Race calling is turned off during a practice run so nothing real changes. End the practice run to call races.')); return; }
    const c = card('Call races', 'Tap the winner when a race is called. Everyone’s scores update right away. Calls Claude adds to the app’s results also count — yours override them.');
    box.append(c);
    const chips = el('div', 'en-chips pl-chips');
    ['Senate', 'Governors', 'House', 'Side'].forEach(g => { const b = btn('en-chip', g === 'Side' ? 'Side questions' : g, () => { pickFilter = g; render(); }); b.setAttribute('aria-pressed', String(pickFilter === g)); chips.append(b); });
    box.append(chips);
    const wrap = el('div', 'pl-list');
    if (pickFilter === 'Side') {
      const ans = answers();
      const row = (label, note, input) => { const d = el('div', 'pl-card pl-side'); d.append(el('b', '', label), el('p', '', note), input); wrap.append(d); };
      const s = el('select'); s.append(new Option('Use the results feed' + (ans.first && !adminRes['Q-first'] ? ' (' + ans.first + ')' : ''), '')); senStates().forEach(([v, t]) => s.append(new Option(t, v)));
      s.value = adminRes['Q-first'] || ''; s.addEventListener('change', () => be.saveAdminResult('Q-first', s.value || null));
      row(SIDE[0].q, 'Filled automatically from the earliest call time; set it here only to override.', s);
      const n = el('input'); n.type = 'number'; n.inputMode = 'numeric'; n.placeholder = 'Final Democratic House seats'; n.value = adminRes['Q-house'] == null ? '' : adminRes['Q-house'];
      n.addEventListener('change', () => { const v = parseInt(n.value, 10); be.saveAdminResult('Q-house', isNaN(v) ? null : v); });
      row(SIDE[1].q, 'Enter once the House count is final.', n);
      const yn = el('div', 'btns pl-yn'); [['y', 'Yes'], ['n', 'No']].forEach(([v, t]) => { const x = btn('en-pb ' + v, t, () => be.saveAdminResult('Q-mid', adminRes['Q-mid'] === v ? null : v)); x.setAttribute('aria-pressed', String(adminRes['Q-mid'] === v)); yn.append(x); });
      row(SIDE[2].q, 'Answer after midnight CT.', yn);
      const sn = el('input'); sn.type = 'number'; sn.inputMode = 'numeric'; sn.placeholder = 'Final D + I Senate seats'; sn.value = adminRes['Q-senate'] == null ? '' : adminRes['Q-senate'];
      sn.addEventListener('change', () => { const v = parseInt(sn.value, 10); be.saveAdminResult('Q-senate', isNaN(v) ? null : v); });
      row('Tiebreaker: final Senate seats for Democrats + independents', 'Used only to break ties on the leaderboard.', sn);
      const fin = el('div', 'btns pl-yn'); const fb = btn('en-pb y', adminRes['Q-final'] === 'y' ? 'Finale is showing — tap to undo' : 'Show the season finale now', () => be.saveAdminResult('Q-final', adminRes['Q-final'] === 'y' ? null : 'y')); fb.setAttribute('aria-pressed', String(adminRes['Q-final'] === 'y')); fin.append(fb);
      row('Season finale', 'Shows automatically once every game race is called. Use this if a race (Alaska or Maine ranked choice, a recount) will take weeks.', fin);
    } else {
      races().filter(r => r.group === pickFilter).forEach(r => {
        const cur = adminRes[r.key] || '';
        wrap.append(pickRow(r, cur, null, false, async (side) => { await be.saveAdminResult(r.key, cur === side ? null : side); }, false));
      });
    }
    box.append(wrap);
  }

  // ---------- "Since you last looked" — new race calls (app only) ----------
  function raceName(key) {
    const id = key.replace(/^(SEN|GOV|HOU|MO)-/, '');
    if (key.startsWith('SEN-')) { const r = rows('senate').find(x => x.id === id); return (r ? r.state : id) + ' Senate'; }
    if (key.startsWith('GOV-')) { const r = rows('governor').find(x => x.id === id); return (r ? r.state : id) + ' governor'; }
    if (key === 'MO-AUD') return 'Missouri State Auditor';
    const lr = rows('local').find(x => x.race === key); if (lr) return lr.title.replace(/\?$/, '');
    if (key.startsWith('MO-')) { const r = rows('missouri').find(x => x.id === id); return 'Missouri ' + (r ? r.title : id); }
    return id + ' (House)';
  }
  function callText(x) {
    const p = x.winner_party, w = String(x.winner);
    if (/^(Passes|Fails)$/.test(w)) return raceName(x.race) + ' ' + w.toLowerCase();
    if (/retain/i.test(w)) return raceName(x.race) + ': ' + w.toLowerCase();
    return w + (p && p.length === 1 && 'DRI'.includes(p) ? ' (' + p + ')' : '') + ' wins ' + raceName(x.race);
  }
  const partyCls = (p) => p === 'R' || p === 'N' ? 'r' : p === 'Y' ? 'y' : p === 'I' ? 'i' : 'd';

  // ---------- Live "race called" pop-ups while the app is open ----------
  let liveSeen = null, liveSim = false;
  function liveCalls() {
    const res = rows('results'); if (!res.length) return;
    const sim = !!window.__simOn;
    const calledNow = res.filter(x => x.winner_party);
    if (liveSeen === null || sim !== liveSim) { liveSeen = new Set(calledNow.map(x => x.race)); liveSim = sim; return; } // baseline: nothing pops on first load
    const fresh = calledNow.filter(x => !liveSeen.has(x.race)).sort((a, b) => String(a.called_at).localeCompare(String(b.called_at)));
    if (!fresh.length) return;
    fresh.forEach(x => liveSeen.add(x.race));
    if (!sim) { // you saw these live, so the "since you last looked" card skips them
      let seen = []; try { seen = JSON.parse(store.get('en-seen-calls') || '[]') || []; } catch (e) {}
      store.set('en-seen-calls', JSON.stringify(Array.from(new Set(seen.concat(fresh.map(x => x.race))))));
      const o = $('#pl-new'); if (o) o.remove();
    }
    let stack = $('#pl-live'); if (!stack) { stack = el('div', 'pl-livestack'); stack.id = 'pl-live'; stack.setAttribute('aria-live', 'polite'); document.body.append(stack); }
    const show = fresh.slice(-3), extra = fresh.length - show.length;
    const w = winners(), list = races();
    show.forEach(x => {
      const t = el('div', 'pl-pop ' + partyCls(x.winner_party));
      t.append(el('span', 'k', 'RACE CALLED'), el('b', '', callText(x)));
      const r = list.find(g => g.key === x.race), mine = myPicks[x.race];
      if (r && mine && w[x.race]) {
        const ok = mine === w[x.race], v = worth(r, mine) * (myLock === r.key ? 2 : 1);
        t.append(el('small', ok ? 'ok' : 'no', ok ? '✓ You got it · +' + v + (myLock === r.key ? ' (lock ★)' : '') : '✗ You picked ' + (mine === 'd' ? r.a : r.b)));
      }
      if (x.d_pct != null && x.r_pct != null && !/^(Passes|Fails|Retained|Not retained)$/.test(String(x.winner))) t.append(el('small', '', (indRace(x.race) ? 'Ind ' : 'Dem ') + fmtPct(x.d_pct) + ' · GOP ' + fmtPct(x.r_pct) + ' · ' + (x.reporting || 0) + '% in'));
      t.addEventListener('click', () => drop(t));
      stack.prepend(t);
      setTimeout(() => drop(t), 9000);
    });
    if (extra > 0) { const t = el('div', 'pl-pop more'); t.append(el('b', '', '+ ' + extra + ' more race' + (extra > 1 ? 's' : '') + ' called'), el('small', '', 'See the Election night tab')); t.addEventListener('click', () => drop(t)); stack.append(t); setTimeout(() => drop(t), 9000); }
    while (stack.children.length > 4) stack.lastElementChild.remove();
    try { if (!sim && navigator.vibrate) navigator.vibrate(30); } catch (e) {}
  }
  const indRace = (key) => { const id = key.replace(/^(SEN|GOV|HOU)-/, ''), src = key.startsWith('SEN-') ? 'senate' : key.startsWith('GOV-') ? 'governor' : key.startsWith('HOU-') ? 'house' : null; const r = src && rows(src).find(z => z.id === id); return !!(r && r.party_d === 'I'); };
  const fmtPct = (v) => { const n = Number(v); return (Number.isInteger(n) ? n : n.toFixed(1)) + '%'; };
  function drop(t) { if (!t.isConnected || t.classList.contains('out')) return; t.classList.add('out'); setTimeout(() => t.remove(), 350); }

  function checkNewCalls() {
    if (window.__simOn) { const o = $('#pl-new'); if (o) o.remove(); return; }
    const res = rows('results'); if (!res.length) return;
    const called = res.filter(x => x.winner_party);
    const raw = store.get('en-seen-calls');
    if (raw == null) { store.set('en-seen-calls', JSON.stringify(called.map(x => x.race))); return; } // first visit: nothing is "new"
    let seen = []; try { seen = JSON.parse(raw) || []; } catch (e) {}
    const fresh = called.filter(x => !seen.includes(x.race)).sort((a, b) => String(b.called_at).localeCompare(String(a.called_at)));
    const old = $('#pl-new'); if (old) old.remove();
    if (!fresh.length) return;
    const b = el('div', 'pl-new'); b.id = 'pl-new'; b.setAttribute('role', 'status');
    const h = el('div', 'h'); h.append(el('b', '', fresh.length === 1 ? '1 new call since you last looked' : fresh.length + ' new calls since you last looked'));
    const ok = btn('pl-btn primary', 'Got it', () => { store.set('en-seen-calls', JSON.stringify(called.map(x => x.race))); b.classList.add('out'); setTimeout(() => b.remove(), 300); });
    h.append(ok); b.append(h);
    const ul = el('ul', '');
    fresh.slice(0, 6).forEach(x => { const li = el('li', partyCls(x.winner_party)); li.textContent = callText(x); ul.append(li); });
    if (fresh.length > 6) ul.append(el('li', 'more', '+ ' + (fresh.length - 6) + ' more — see the Election night tab'));
    b.append(ul);
    document.body.append(b);
  }

  // ---------- Boot ----------
  function boot() {
    const cfg = window.POOL_CONFIG;
    if (window.POOL_MOCK) be = mockBackend();
    else if (cfg && cfg.apiKey && window.firebase) { try { be = firebaseBackend(cfg); } catch (e) { console.error(e); be = null; } }
    render();
    if (window.dash) window.dash.onData(() => { liveCalls(); checkNewCalls(); });
    if (!be) return;
    let unsubRes = null;
    be.onAuth(async (u) => {
      me = u; profile = null; myPicks = {}; mySeats = null; myLock = null; mySide = {}; stopChat();
      if (typeof unsubRes === 'function') unsubRes(); unsubRes = null; adminRes = {};
      if (u) unsubRes = be.watchAdminResults((r) => { adminRes = r || {}; if (me && view !== 'chat' && !document.activeElement?.closest?.('#pool-root')) render(); });
      if (u) {
        profile = await be.getProfile(u.uid).catch(() => null);
        if (!profile && u.name) { profile = { name: u.name, groups: [] }; await be.saveProfile(u.uid, profile).catch(() => {}); }
        const p = await be.getPicks(u.uid).catch(() => null);
        if (p) { myPicks = Object.assign({}, p.picks || {}); mySeats = p.seats == null ? null : p.seats; myLock = p.lock || null; mySide = Object.assign({}, p.side || {}); }
      }
      render();
    });
    if (window.dash) window.dash.onData(() => { if (me && view !== 'chat' && !document.activeElement?.closest?.('#pool-root')) render(); });
    setInterval(() => { const b = $('.pl-lock'); if (b) b.replaceWith(lockBanner()); }, 30000);
  }
  const jump = () => { if (location.hash === '#game') setTimeout(() => { const g = document.getElementById('game'); if (g) g.scrollIntoView({ block: 'start' }); }, 600); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot(); jump(); }); else { boot(); jump(); }
})();
