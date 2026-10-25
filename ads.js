/* Ad Wars: a muted, looping reel of this season's most talked-about attack ads (YouTube embeds).
   The list lives in data/ads.json. The player loads only while the Ads tab is open; a video that
   can't play inside the app is skipped. */
(function () {
  'use strict';
  const root = () => document.getElementById('ads-root');
  let ads = [], i = 0, player = null, apiP = null, muted = true, started = false;
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const PARTY = { R: 'Republican side', D: 'Democratic side' };

  function api() {
    if (apiP) return apiP;
    apiP = new Promise((res, rej) => {
      if (window.YT && window.YT.Player) return res(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(window.YT); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
      s.onerror = () => { apiP = null; rej(new Error('yt')); };
      document.head.append(s);
    });
    return apiP;
  }

  function build() {
    const r = root(); if (!r || r.dataset.built) return; r.dataset.built = '1';
    const stage = h('div', 'ad-stage'); const frame = h('div', 'ad-frame'); const slot = h('div'); slot.id = 'ad-player';
    frame.append(slot); stage.append(frame);
    const bar = h('div', 'ad-bar');
    const prev = h('button', 'ad-btn', '‹ Prev'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous ad');
    const snd = h('button', 'ad-btn ad-snd', '🔇 Tap for sound'); snd.type = 'button';
    const next = h('button', 'ad-btn', 'Next ›'); next.type = 'button'; next.setAttribute('aria-label', 'Next ad');
    prev.onclick = () => go(i - 1); next.onclick = () => go(i + 1);
    snd.onclick = () => { if (!player || !player.isMuted) return; muted = !muted; if (muted) player.mute(); else { player.unMute(); player.setVolume(80); } paintSnd(); };
    bar.append(prev, snd, next);
    const cap = h('div', 'ad-cap'); cap.id = 'ad-cap'; cap.setAttribute('aria-live', 'polite');
    const list = h('ol', 'ad-list'); list.id = 'ad-list';
    ads.forEach((a, k) => {
      const li = h('li'); const b = h('button', 'ad-item'); b.type = 'button';
      b.append(h('span', 'ad-dot ad-' + a.party), h('span', 'ad-it', a.title), h('span', 'ad-iw', a.sponsor + ' → ' + a.target));
      b.onclick = () => go(k); li.append(b); list.append(li);
    });
    const note = h('p', 'ad-note', 'An even split of attack ads from both sides, rotating on a loop. These are the sponsors’ claims, not checked by this app. Videos play from YouTube.');
    r.append(stage, bar, cap, list, note);
  }
  function paintSnd() { const b = document.querySelector('.ad-snd'); if (b) b.textContent = muted ? '🔇 Tap for sound' : '🔊 Sound on'; }
  function paintCap() {
    const a = ads[i], c = document.getElementById('ad-cap'); if (!a || !c) return;
    c.replaceChildren();
    const top = h('div', 'ad-ctop'); top.append(h('span', 'ad-chip ad-' + a.party, PARTY[a.party] || ''), h('span', 'ad-count', (i + 1) + ' of ' + ads.length));
    c.append(top, h('h3', 'ad-title', a.title), h('div', 'ad-meta', 'Paid for by ' + a.sponsor + ' · ' + a.race + ' · Target: ' + a.target), h('p', 'ad-what', a.what));
    document.querySelectorAll('#ad-list .ad-item').forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
  }
  let skips = 0;
  function go(k) {
    if (!ads.length) return;
    i = (k + ads.length) % ads.length; paintCap();
    if (player && player.loadVideoById) player.loadVideoById(ads[i].id);
  }
  function start() {
    if (started) { if (player && player.playVideo) player.playVideo(); return; }
    started = true;
    api().then((YT) => {
      player = new YT.Player('ad-player', {
        host: 'https://www.youtube-nocookie.com', videoId: ads[i].id,
        playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => { e.target.mute(); e.target.playVideo(); },
          onStateChange: (e) => { if (e.data === 1) skips = 0; if (e.data === 0) go(i + 1); },
          onError: () => { if (++skips < ads.length) go(i + 1); else fail(); }
        }
      });
    }).catch(fail);
  }
  function fail() {
    const f = document.querySelector('.ad-frame'); if (!f) return;
    f.replaceChildren(h('div', 'ad-fail', 'Videos can’t load right now. Check your connection and reopen the Ads tab.'));
    started = false; player = null;
  }
  function stop() { if (player && player.pauseVideo) player.pauseVideo(); }

  function visible() { const s = document.getElementById('ads'); return !!s && !s.hidden; }
  function check() { if (!ads.length) return; if (visible()) { build(); paintCap(); start(); } else stop(); }
  function init() {
    const s = document.getElementById('ads'); if (!s) return;
    fetch('data/ads.json', { cache: 'no-cache' }).then((r) => r.json()).then((list) => {
      ads = (Array.isArray(list) ? list : []).filter((a) => a && /^[\w-]{11}$/.test(a.id));
      if (!ads.length) { const r = root(); if (r) r.textContent = 'No ads loaded yet.'; return; }
      new MutationObserver(check).observe(s, { attributes: true, attributeFilter: ['hidden'] });
      document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else check(); });
      check();
    }).catch(() => { const r = root(); if (r) r.textContent = 'Couldn’t load the ad list.'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
