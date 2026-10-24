ELECTION NIGHT 2026 — install guide
====================================

What's in this folder
  index.html            the app
  data/*.json           polls, ratings and results (the only files that change)
  icons/, manifest.webmanifest, sw.js, dash-lite.js, d3.min.js
                        app icon, home-screen install, offline support

PUT IT ONLINE (free, about 2 minutes, needs a computer)
  1. Unzip this folder.
  2. Go to https://app.netlify.com/drop
  3. Drag the whole "election-night-app" folder onto the page.
  4. Sign up for a free Netlify account when asked, so the site stays up.
  5. Netlify gives you a link like https://something-random.netlify.app
     Optional: Site settings > Change site name, e.g. election-night-brad

INSTALL IT ON YOUR PHONE
  iPhone (Safari): open your link > Share button > "Add to Home Screen"
  Android (Chrome): open your link > tap the "Install" button on the page,
                    or menu (⋮) > "Install app"
  It opens full screen with its own icon, and works offline with the last data.

SHARE IT
  Send anyone the link. No account needed to view or install it.
  Each person's stars and Path to 51 picks are saved on their own phone.

UPDATING THE NUMBERS
  The app re-checks for new data every 2 minutes while it's open.
  To push new polls or results: replace the files in data/ and drag the
  folder onto your site again (Netlify: Deploys tab > drag and drop).
  Ask Claude for a fresh data/ folder any time.

FONTS
  Instrument Sans and Instrument Serif, licensed under the SIL Open Font License 1.1 (fonts/OFL.txt).
