// Live data without redeploys. Data updates are commits to GitHub that Netlify skips building (see netlify.toml),
// so the newest data lives in GitHub at the latest commit. This looks up that commit at most every 15 s (GitHub
// answers "not modified" for free when nothing changed), then builds one bundle of all data files per commit,
// kept in Netlify Blobs, so phones make one small request per update instead of ~20.
import { blobs } from './push.mjs';

export const REPO = 'nightowl1009/election-night-app';
export const FILES = ['senate', 'governor', 'house', 'overview', 'pollclose', 'polls', 'results', 'missouri', 'missouri_polls', 'news', 'house_lean', 'mood', 'approval_polls', 'issues', 'demos', 'issue_trust', 'earlyvote', 'local', 'changes', 'spending', 'meta'];
const raw = (sha, f) => `https://raw.githubusercontent.com/${REPO}/${sha}/data/${f}.json`;
let memSha = null, memBundle = null;

export async function latestSha() {
  const now = Date.now();
  if (memSha && now - memSha.at < 15000) return memSha.sha;
  let st = null; try { st = await blobs.get('latest-sha'); } catch (e) { /* first run */ }
  if (st && now - st.at < 15000) { memSha = st; return st.sha; }
  const headers = { 'User-Agent': 'election-night-app', Accept: 'application/vnd.github+json' };
  if (st && st.etag) headers['If-None-Match'] = st.etag;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers });
    if (r.status === 304 && st) st = { ...st, at: now };
    else if (r.ok) { const j = await r.json(); st = { sha: j.sha, etag: r.headers.get('etag') || '', at: now }; }
    else if (!st) return null;
    try { await blobs.set('latest-sha', st); } catch (e) { /* cache only */ }
    memSha = st; return st.sha;
  } catch (e) { return st ? st.sha : null; }
}

export async function bundle(sha) {
  if (memBundle && memBundle.sha === sha) return memBundle;
  let b = null; try { b = await blobs.get('bundle'); } catch (e) { /* none yet */ }
  if (b && b.sha === sha && b.complete) { memBundle = b; return b; }
  const data = {};
  const one = async (f) => {
    for (let k = 0; k < 3; k++) {
      try { const r = await fetch(raw(sha, f), { headers: { 'User-Agent': 'election-night-app' } }); if (r.ok) { data[f] = await r.json(); return; } } catch (e) { /* retry */ }
      await new Promise((ok) => setTimeout(ok, 300 * (k + 1)));
    }
  };
  for (let i = 0; i < FILES.length; i += 4) await Promise.all(FILES.slice(i, i + 4).map(one)); // small batches: GitHub throttles bursts
  if (!data.results) return null; // GitHub not reachable — caller falls back
  b = { sha, complete: FILES.every((f) => f in data), data };
  if (b.complete) { try { await blobs.set('bundle', b); } catch (e) { /* cache only */ } memBundle = b; }
  return b;
}

export async function dataFile(name) {
  const sha = await latestSha(); if (!sha) return null;
  const b = await bundle(sha); return b && b.data[name] !== undefined ? b.data[name] : null;
}
