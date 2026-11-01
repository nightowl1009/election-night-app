/* Swipe left/right to move between tabs (app only). A quick, mostly-horizontal swipe changes tab; it stays out of the
   way of anything that scrolls sideways (carousels, charts, the tab bar), of open race cards and TV mode, and of the
   screen edges (where the phone's own back gesture lives). No wrap-around: the first and last tabs just stop. */
(function () {
  'use strict';
  const MIN_X = 60, EDGE = 24, MAX_MS = 700, RATIO = 1.8;
  let s = null;
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollsSideways = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || (el.dataset && el.dataset.noswipe != null)) return true;
      if (el.scrollWidth > el.clientWidth + 2) { const o = getComputedStyle(el).overflowX; if (o === 'auto' || o === 'scroll') return true; }
    }
    return false;
  };
  const blocked = () => document.documentElement.classList.contains('en-pop-open') || (window.enTvIsOpen && window.enTvIsOpen()) || document.querySelector('.cb-celebrate, .tv-on');
  document.addEventListener('touchstart', (e) => {
    s = null; if (e.touches.length !== 1 || blocked()) return;
    const t = e.touches[0]; if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    if (scrollsSideways(e.target)) return;
    s = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const st = s; s = null; if (!st || !e.changedTouches.length) return;
    const t = e.changedTouches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * RATIO || Date.now() - st.t > MAX_MS) return;
    const sel = window.getSelection && String(window.getSelection()); if (sel) return;
    const tabs = [...document.querySelectorAll('.en-tab')].filter((b) => getComputedStyle(b).display !== 'none');
    const i = tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true'), j = i + (dx < 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= tabs.length) return;
    tabs[j].click();
    try { tabs[j].scrollIntoView({ inline: 'center', block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }); } catch (err) {}
    const p = document.querySelector('.en-panel:not([hidden])');
    if (p && p.animate && !calm()) p.animate([{ transform: 'translateX(' + (dx < 0 ? 36 : -36) + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' });
  }, { passive: true });
})();
