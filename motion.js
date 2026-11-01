/* Tab entrances (app only): each tab gets its own short animation when you open it. They only touch transform, opacity,
   clip-path and filter, run once per visit, leave nothing behind, and are skipped on phones set to "reduce motion".
   The Economy tab has its own animations (economy.js). */
(function () {
  'use strict';
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vis = (e) => e.getClientRects().length > 0;
  const EASE = 'cubic-bezier(.22,1,.36,1)', SPRING = 'cubic-bezier(.2,1.4,.4,1)';
  // run keyframes on every visible match, staggered (total stagger capped at `cap` ms)
  function go(root, sel, frames, o) {
    o = o || {}; const els = [...root.querySelectorAll(sel)].filter(vis); if (!els.length) return 0;
    const step = Math.min(o.step == null ? 40 : o.step, (o.cap || 650) / els.length);
    els.forEach((e, i) => {
      if (e instanceof SVGElement && e.tagName !== 'svg') { e.style.transformBox = 'fill-box'; e.style.transformOrigin = 'center'; }
      const d = (o.delay || 0) + (o.order ? o.order(e, i, els) : i) * step;
      e.animate(typeof frames === 'function' ? frames(e, i) : frames, { duration: o.dur || 520, delay: d, easing: o.ease || EASE, fill: 'backwards' });
    });
    return els.length;
  }
  const rnd = (i) => ((i * 9301 + 49297) % 233280) / 233280;          // steady pseudo-random per index
  const xOf = (e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; };
  // count whole numbers up from 0 (path tool, etc.)
  function countUp(el) {
    const t = el.textContent, m = t.match(/^(\D*)(\d+)(\D*)$/); if (!m) return;
    const end = +m[2], t0 = performance.now();
    const step = (n) => { const k = Math.min(1, (n - t0) / 900); el.textContent = m[1] + Math.round(end * (1 - Math.pow(1 - k, 3))) + m[3]; if (k < 1) requestAnimationFrame(step); else el.textContent = t; };
    requestAnimationFrame(step);
  }
  const up = (y) => [{ opacity: 0, transform: 'translateY(' + (y || 22) + 'px)' }, { opacity: 1, transform: 'none' }];
  const head = (p, c) => go(p, '.en-sec-h', [{ opacity: 0, transform: 'translateY(-10px)', filter: 'drop-shadow(0 0 12px ' + c + ')' }, { opacity: 1, transform: 'none', filter: 'none' }], { dur: 500 });

  const SCENES = {
    // Election Night: a broadcast desk — panels wipe in from the left, the poll-close board flips like a departure sign
    night(p) {
      head(p, '#ef4444');
      go(p, '.en-score, .en-rundown, .en-odds, .en-recap, .en-tv-open', [{ opacity: 0, transform: 'translateX(-40px)', clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }], { step: 90, dur: 600 });
      go(p, '#en-times > *', [{ opacity: 0, transform: 'perspective(400px) rotateX(-80deg)' }, { opacity: 1, transform: 'none' }], { step: 70, delay: 200, dur: 500 });
    },
    // Senate: the chamber fills seat by seat, left to right; the map lights up state by state
    senate(p) {
      head(p, '#60a5fa');
      go(p, '#senate-chamber circle, #senate-chamber rect, #senate-chamber path', [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'none' }], { step: 5, cap: 700, dur: 420, ease: SPRING, order: (e, i, a) => [...a].indexOf(e) });
      go(p, '#sen-map path', [{ opacity: .15, filter: 'brightness(2.2)' }, { opacity: 1, filter: 'none' }], { step: 14, cap: 700, dur: 500, delay: 150, order: (e, i) => Math.floor(rnd(i) * 50) });
      go(p, '#sen-grid > *', up(24), { step: 70, delay: 250 });
    },
    // House: 435 seats sweep in as a wave across the chamber
    house(p) {
      head(p, '#60a5fa');
      go(p, '#house-chamber circle, #house-chamber rect, #house-chamber path', [{ opacity: 0, transform: 'scale(.1)' }, { opacity: 1, transform: 'none' }], { step: 1, cap: 800, dur: 380, ease: SPRING, order: (e) => xOf(e) / 4 });
      go(p, '#hou-map path', [{ opacity: .15, filter: 'brightness(2.2)' }, { opacity: 1, filter: 'none' }], { step: 14, cap: 700, dur: 500, delay: 150, order: (e, i) => Math.floor(rnd(i) * 50) });
      go(p, '#house-chips .en-chip', up(12), { step: 50, delay: 100 });
      go(p, '#house-grid > *', up(24), { step: 70, delay: 250 });
    },
    // Governors: each state is stamped onto the map; cards swing in on a hinge
    governors(p) {
      head(p, '#f59e0b');
      go(p, '#gov-map path', [{ opacity: 0, transform: 'scale(1.7)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { step: 14, cap: 700, dur: 460, ease: SPRING, order: (e, i) => Math.floor(rnd(i + 7) * 50) });
      go(p, '#gov-grid > *', [{ opacity: 0, transform: 'perspective(600px) rotateY(-70deg)', transformOrigin: 'left center' }, { opacity: 1, transform: 'none', transformOrigin: 'left center' }], { step: 80, delay: 250, dur: 600 });
    },
    // Path To Control: the meters charge up, the seat counts climb
    path(p) {
      head(p, '#a78bfa');
      go(p, '.en-meter > *', [{ transform: 'scaleX(0)', transformOrigin: 'left center' }, { transform: 'scaleX(1)', transformOrigin: 'left center' }], { step: 150, dur: 900 });
      p.querySelectorAll('.en-path-nums .big').forEach(countUp);
      go(p, '.en-path-top, .en-verdict', up(16), { step: 90 });
      go(p, '#pick-list > *', [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }], { step: 35, delay: 250, dur: 420 });
    },
    // Missouri: the state hero drops in with a bounce; local items alternate in from each side
    missouri(p) {
      head(p, '#34d399');
      go(p, '.en-mo-hero', [{ opacity: 0, transform: 'translateY(-60px) scale(.9)' }, { opacity: 1, transform: 'none' }], { dur: 750, ease: SPRING });
      go(p, '#mo-grid > *, .en-local-grid > *', (e, i) => [{ opacity: 0, transform: 'translateX(' + (i % 2 ? 36 : -36) + 'px)' }, { opacity: 1, transform: 'none' }], { step: 60, delay: 250 });
    },
    // National Mood: gauges sweep up like dials, bars fill from the left
    mood(p) {
      head(p, '#38bdf8');
      go(p, '#nm-gauges > *', [{ opacity: 0, transform: 'scale(.6) rotate(-12deg)' }, { opacity: 1, transform: 'none' }], { step: 90, dur: 650, ease: SPRING });
      go(p, '.bar', [{ transform: 'scaleX(0)', transformOrigin: 'left center' }, { transform: 'scaleX(1)', transformOrigin: 'left center' }], { step: 25, cap: 700, dur: 700, delay: 250 });
      go(p, '.en-nm-box', up(22), { step: 110, delay: 150 });
    },
    // Money: items drop in like coins and settle
    money(p) {
      head(p, '#fbbf24');
      go(p, '#mn-wrap > *', (e, i) => [{ opacity: 0, transform: 'translateY(-46px) rotate(' + (i % 2 ? 4 : -4) + 'deg)' }, { opacity: 1, transform: 'none' }], { step: 70, dur: 650, ease: SPRING });
    },
    // Voting: ballot cards slide down into the slot, with a reveal wipe
    voting(p) {
      head(p, '#60a5fa');
      go(p, '#ev-box > *, .en-vcard', [{ opacity: 0, transform: 'translateY(-24px)', clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }], { step: 110, dur: 650 });
      go(p, '.en-vlinks > *', up(12), { step: 50, delay: 350 });
    },
    // News: headlines slide in from the right like a wire ticker
    news(p) {
      head(p, '#f87171');
      go(p, '#news-chips .en-chip', up(10), { step: 40 });
      go(p, '#news-list article, #news-list li, #news-list a.en-nc, #news-list .en-nc', [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }], { step: 55, delay: 120, dur: 520 })
        || go(p, '#news-list > *', [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }], { step: 80, delay: 120 });
    },
    // Prediction Game: gold shimmer and a springy pop
    game(p) {
      head(p, '#fbbf24');
      go(p, '#pool-root > *', [{ opacity: 0, transform: 'scale(.92) translateY(18px)', filter: 'brightness(1.6) saturate(1.4)' }, { opacity: 1, transform: 'none', filter: 'none' }], { step: 90, dur: 700, ease: SPRING });
    },
    // Trivia: a flash and a zoom burst
    trivia(p) {
      go(p, '#trivia-root > *', [{ opacity: 0, transform: 'scale(.7)', filter: 'brightness(2) hue-rotate(40deg)' }, { opacity: 1, transform: 'none', filter: 'none' }], { dur: 700, ease: SPRING });
    },
    // Ad Wars: curtains open on the screen, controls rise from below
    ads(p) {
      head(p, '#f87171');
      go(p, '.ad-stage', [{ opacity: .2, transform: 'scale(.94)', clipPath: 'inset(0 50% 0 50%)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }], { dur: 800 });
      go(p, '.ad-bar, #ads-root > *:not(.ad-stage)', up(20), { step: 80, delay: 350 });
    }
  };

  function boot() {
    const panels = document.querySelectorAll('.en-panel'); if (!panels.length || !('animate' in Element.prototype)) return;
    const mo = new MutationObserver((ms) => {
      if (calm()) return;
      ms.forEach((m) => {
        const p = m.target; if (m.attributeName !== 'hidden' || p.hidden || !SCENES[p.id]) return;
        requestAnimationFrame(() => { try { SCENES[p.id](p); } catch (e) { console.error(e); } });
      });
    });
    panels.forEach((p) => mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
