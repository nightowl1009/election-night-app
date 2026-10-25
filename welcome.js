/* First-visit welcome: three quick tips, shown once per device after the splash. */
(function () {
  'use strict';
  const KEY = 'en-welcome-v1';
  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return '1'; } };
  const set = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} };
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const tab = (id) => { const t = document.querySelector('.en-tab[data-tab="' + id + '"]'); if (t) { t.click(); t.scrollIntoView({ block: 'nearest', inline: 'center' }); } };

  function show() {
    if (get() || document.querySelector('.en-tv') || window.__simOn || document.getElementById('en-welcome')) return;
    const back = h('div', 'wl-back'); back.id = 'en-welcome';
    const card = h('div', 'wl-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'wl-h');
    const hd = h('h2', 'wl-h', 'Welcome to Election Night 2026'); hd.id = 'wl-h';
    card.append(hd, h('p', 'wl-sub', 'Three things worth knowing:'));
    const tips = [
      ['☆', 'Star the races you care about', 'Tap the star on any race and it gets pinned at the top of the page.', null],
      ['🏆', 'Join the Prediction Game', 'Call the toss-up races, start a group with friends and climb the leaderboard on election night.', () => tab('game')]
    ];
    const pushOk = window.enPush && window.enPush.ready && window.enPush.ready();
    if (pushOk) tips.push(['🔔', 'Turn on race alerts', 'Get a buzz the moment a race gets called, even with the app closed.', () => { tab('night'); setTimeout(() => { const b = document.getElementById('alert-btn'); if (b) { b.scrollIntoView({ block: 'center' }); b.click(); } }, 300); }]);
    else tips.push(['▶', 'Try the practice run', 'Watch a made-up election night play out in 3 minutes, so you know what to expect.', () => { const b = document.getElementById('sim-go'); if (b) { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); b.focus({ preventScroll: true }); } }]);
    const list = h('ol', 'wl-list');
    tips.forEach(([ic, t, d, act]) => {
      const li = h('li'); const inner = act ? h('button', 'wl-tip') : h('div', 'wl-tip');
      if (act) { inner.type = 'button'; inner.addEventListener('click', () => { close(); setTimeout(act, 50); }); }
      const tx = h('span', 'wl-tx'); tx.append(h('b', '', t), h('small', '', d));
      inner.append(h('span', 'wl-ic', ic), tx); if (act) inner.append(h('span', 'wl-go', '›'));
      li.append(inner); list.append(li);
    });
    const ok = h('button', 'wl-ok', 'Got it'); ok.type = 'button'; ok.addEventListener('click', () => close());
    card.append(list, ok); back.append(card);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    function close() { set(); document.removeEventListener('keydown', onKey); back.classList.add('out'); setTimeout(() => back.remove(), 250); if (prev && prev.focus) try { prev.focus(); } catch (e) {} }
    document.body.append(back); ok.focus({ preventScroll: true });
  }
  function init() { if (get()) return; setTimeout(show, 3200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
