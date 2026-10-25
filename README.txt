ELECTION NIGHT 2026 — phone app
================================
Live at https://election-night.netlify.app  ·  GitHub → Netlify publishes every push to main.

WHAT'S HERE
  index.html            the app (BUILT — edit src/, then run: python3 src/build.py)
  src/page.html         the dashboard page (same page as the Claude dashboard artifact)
  src/app-head.html     app-only <head>, splash animation
  src/app-tail.html     app-only footer, install banner, service-worker registration
  src/build.py          assembles index.html and version-stamps scripts
  data/*.json           polls, odds, results — the only files the scheduled updates change
  dash-lite.js          loads data/, refreshes every 2 min (1 min on election night), freshness badge
  pool.js / pool.css    Election Night Prediction Game: picks, groups, chat, moderation, finale
  pool-config.js        Firebase web config (the apiKey is public by design; Firestore rules protect data)
  firestore.rules       security rules — paste into Firebase console → Firestore → Rules → Publish
  sim.js                3-minute practice run with a practice group
  push.js               race-call alerts (phone side)
  netlify/functions/    alert server: push-key, push-subscribe, push-test, push-send (every minute)
  netlify/lib/push.mjs  Web Push (RFC 8291/8292) + Netlify Blobs, no outside libraries
  netlify.toml          marks the public Firebase key as a known non-secret for Netlify's scanner
  sw.js                 offline support + alert display (bump CACHE when code changes)
  qrcode.js             QR codes for group invites (MIT, Kazuhiko Arase)

UPDATES
  Scheduled Claude tasks update the dashboard artifact and push data/*.json here:
  daily 8:44 AM CT Oct 25–Nov 2 · election night every ~7–15 min · twice daily Nov 5–30 · GA runoff Dec 1.

INSTALL ON A PHONE
  iPhone (Safari): Share → Add to Home Screen, then open it from the icon (needed for alerts).
  Android (Chrome): Install button, or menu (⋮) → Install app.
