# Builds index.html (the phone app) from the dashboard page plus app-only extras.
#   python3 src/build.py        (run from the repo root)
# src/page.html is the same page published as the Claude dashboard artifact; the app adds the
# Prediction Game tab, Firebase, the practice run and alerts, and version-stamps scripts so phones
# always pick up new code.
import os, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf8').read()
page = rd('src/page.html').replace('Stars and picks last while this page is open.', 'Your stars and Path to 51 picks are saved on this device.')
def sub(a, b):
    global page
    assert page.count(a) == 1, a[:60]
    page = page.replace(a, b)
sub('    <section id="news" class="en-panel">',
    '    <section id="game" class="en-panel en-game" hidden>\n      <div class="en-sec-h"><div><h2><svg class="en-ic" aria-hidden="true"><use href="#i-star"/></svg>Election Night Prediction Game</h2><p>Call the 28 toss-up races for Senate, governor and House, compete with friends in groups, and watch the leaderboard on election night</p></div></div>\n      <div id="pool-root"></div>\n    </section>\n\n    <section id="news" class="en-panel">')
sub('<button class="en-tab" role="tab" data-tab="news" aria-selected="true"><svg class="en-ic" aria-hidden="true"><use href="#i-news"/></svg>News</button>',
    '<button class="en-tab" role="tab" data-tab="news" aria-selected="true"><svg class="en-ic" aria-hidden="true"><use href="#i-news"/></svg>News</button>\n      <button class="en-tab en-tab-game" role="tab" data-tab="game" aria-selected="false"><svg class="en-ic" aria-hidden="true"><use href="#i-star"/></svg>Prediction Game</button>')
sub("['senate', 'governors', 'house', 'mood', 'missouri', 'path', 'night', 'news', 'voting', 'watchlist']",
    "['senate', 'governors', 'house', 'mood', 'missouri', 'path', 'night', 'news', 'voting', 'game', 'watchlist']")
head, tail = rd('src/app-head.html'), rd('src/app-tail.html')
if 'pool.css' not in head: head = head.replace('</head>', '<link rel="stylesheet" href="pool.css">\n</head>', 1)
extra = ('<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>\n'
         '<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>\n'
         '<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>\n'
         '<script src="pool-config.js"></script>\n<script src="pool.js"></script>\n<script src="sim.js"></script>\n<script src="push.js"></script>\n')
if 'pool.js' not in tail: tail = tail.replace('</body>', extra + '</body>', 1)
html = head + page + tail
v = str(int(time.time()))
for f in ['dash-lite.js', 'pool.js', 'sim.js', 'pool-config.js', 'pool.css', 'push.js']:
    html = html.replace('"' + f + '"', '"' + f + '?v=' + v + '"')
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf8').write(html)
print('built index.html', len(html), 'bytes, version', v)
