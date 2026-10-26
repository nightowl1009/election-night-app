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
sub('    <section id="news" class="en-panel" hidden>',
    '    <section id="game" class="en-panel en-game" hidden>\n      <div class="en-sec-h"><div><h2><svg class="en-ic" aria-hidden="true"><use href="#i-star"/></svg>Election Night Prediction Game</h2><p>Call the 28 toss-up races for Senate, governor and House, compete with friends in groups, and watch the leaderboard on election night</p></div></div>\n      <div id="pool-root"></div>\n    </section>\n\n    <section id="trivia" class="en-panel en-trivia" hidden>\n      <div id="trivia-root"></div>\n    </section>\n\n    <section id="ads" class="en-panel en-ads" hidden>\n      <div class="en-sec-h"><div><h2><svg class="en-ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM10 9.2v5.6l4.6-2.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Ad Wars</h2><p>This season\u2019s most talked-about attack ads, from both sides, on a loop</p></div></div>\n      <div id="ads-root"></div>\n    </section>\n\n    <section id="news" class="en-panel" hidden>')
sub('<button class="en-tab" role="tab" data-tab="news" aria-selected="false"><svg class="en-ic" aria-hidden="true"><use href="#i-news"/></svg>News</button>',
    '<button class="en-tab" role="tab" data-tab="news" aria-selected="false"><svg class="en-ic" aria-hidden="true"><use href="#i-news"/></svg>News</button>\n      <button class="en-tab en-tab-game" role="tab" data-tab="game" aria-selected="false"><svg class="en-ic" aria-hidden="true"><use href="#i-star"/></svg>Prediction Game</button>\n      <button class="en-tab en-tab-trivia" role="tab" data-tab="trivia" aria-selected="false"><svg class=\"en-ic\" aria-hidden=\"true\" viewBox=\"0 0 24 24\"><path d=\"M12 3.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 3.5zM9.5 20h5M10.3 9.2a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.9.8-.9 1.4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>Trivia</button>\n      <button class="en-tab" role="tab" data-tab="ads" aria-selected="false"><svg class="en-ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM10 9.2v5.6l4.6-2.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Ad Wars</button>')
sub("['senate', 'governors', 'house', 'mood', 'money', 'missouri', 'path', 'night', 'news', 'voting', 'watchlist']",
    "['senate', 'governors', 'house', 'mood', 'money', 'missouri', 'path', 'night', 'news', 'voting', 'game', 'trivia', 'ads', 'watchlist']")
head, tail = rd('src/app-head.html'), rd('src/app-tail.html')
# pool.css loads without holding up the first paint (the splash covers the page while it arrives), so the
# splash shows sooner at launch — on iPhone any wait before the first paint shows as a white flash.
if 'pool.css' not in head: head = head.replace('</head>', '<link rel="stylesheet" href="pool.css" media="print" onload="this.media=\'all\'">\n<noscript><link rel="stylesheet" href="pool.css"></noscript>\n</head>', 1)
extra = ('<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>\n'
         '<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>\n'
         '<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>\n'
         '<script src="pool-config.js"></script>\n<script src="pool.js"></script>\n<script src="sim.js"></script>\n<script src="push.js"></script>\n<script src="ads.js"></script>\n<script src="welcome.js"></script>\n<script src="party.js"></script>\n<script src="trivia.js"></script>\n')
if 'pool.js' not in tail: tail = tail.replace('</body>', extra + '</body>', 1)
def theme_scope(css):
    import re
    out, i = [], 0
    pat = re.compile(r'@media \(prefers-color-scheme: (dark|light)\)\s*\{')
    while True:
        m = pat.search(css, i)
        if not m: out.append(css[i:]); break
        out.append(css[i:m.start()])
        mode, j, depth = m.group(1), m.end(), 1
        while depth:
            c = css[j]
            if c == '{': depth += 1
            elif c == '}': depth -= 1
            j += 1
        inner = css[m.end():j - 1]
        scope = 'html[data-theme="%s"]' % mode
        def fix(rule_m):
            sels = [x.strip() for x in rule_m.group(1).split(',')]
            sels = [scope + x[5:] if x.startswith(':root') else scope + ' ' + x for x in sels]
            return ', '.join(sels) + ' {' + rule_m.group(2) + '}'
        out.append(re.sub(r'([^{}]+)\{([^{}]*)\}', fix, inner))
        i = j
    return ''.join(out)

html = head + page + tail
# Light or dark is the viewer's choice in the app (☀️/🌙 button; light by default), not the phone's setting:
# every "if the phone is in dark/light mode" block becomes "if the app is in dark/light mode".
html = theme_scope(html)
v = str(int(time.time()))
for f in ['dash-lite.js', 'pool.js', 'sim.js', 'pool-config.js', 'pool.css', 'push.js', 'ads.js', 'welcome.js', 'party.js', 'trivia.js']:
    html = html.replace('"' + f + '"', '"' + f + '?v=' + v + '"')
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf8').write(html)
print('built index.html', len(html), 'bytes, version', v)
