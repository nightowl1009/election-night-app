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
  dash-lite.js          loads the newest data (live bundle, else data/), refreshes every 2 min (30 s on election night), freshness badge
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
  netlify/functions/latest.mjs + netlify/lib/latest.mjs
                        live data: data-only commits skip Netlify deploys (netlify.toml ignore rule);
                        phones read the newest data/ files from GitHub through this function
  party.js              sound effects + Sound on/off, full-screen celebrations (your lock, starred races,
                        a chamber clinched), floating emoji, and the betting-odds chart (Election night tab + TV)
  netlify/functions/odds.mjs + netlify/lib/odds.mjs
                        Kalshi odds that Democrats win each chamber (public market data): last 14 days hourly,
                        then minute by minute from 4 PM CT Nov 3; one shared copy a minute via the CDN
  Watch party           TV mode (Election night tab) shows your group's leaderboard, a join QR until picks lock,
                        a slide for every race call naming who in the group called it, betting odds, and the
                        group chat along the bottom. Poll closings get a banner (and an alert, unless turned off).
  Game night extras     win chances (simulated with the betting odds), badges, "How your group picked" with ⚔️
                        challenges, and ⚡ lightning rounds. Challenges and lightning rounds travel as group-chat
                        messages ending in {bet:…}, {ql:…} or {qa:…}, so no Firestore rule changes were needed.
                        The TV reads calls aloud (🗣️ Voice on/off). Path tab: "What if the polls are off?" slider.
                        Election night tab: "Tonight's rundown" (opens itself at 4 PM CT Nov 3).
  tests/                automated checks — run before shipping code changes (see TESTS below)

UPDATES
  Scheduled Claude tasks update the dashboard artifact and push data/*.json here:
  daily 8:44 AM CT Oct 25–Nov 2 · election night every ~7–15 min · twice daily Nov 5–30 · GA runoff Dec 1.

INSTALL ON A PHONE
  iPhone (Safari): Share → Add to Home Screen, then open it from the icon (needed for alerts).
  Android (Chrome): Install button, or menu (⋮) → Install app.

TESTS
  node tests/run.cjs      (Node 18+ and Playwright: npm i -g playwright && npx playwright install chromium)
  Runs about 20 checks in a few minutes, with Firebase/YouTube/Netlify stubbed so nothing real is touched:
  data files are valid and sourced · the live-data function (caching, partial bundles, alert sender) ·
  every tab opens with no errors in light and dark · tab order by date · scoreboard matches the seat charts ·
  phones pick up new data versions and fall back when the server is down · share pictures · welcome card ·
  watchlist · Money tab · Ad Wars loop/skip · text contrast on the top of the page.
  Exit code 0 = all passed. News outlets over the 4-story limit show as warnings, not failures.
