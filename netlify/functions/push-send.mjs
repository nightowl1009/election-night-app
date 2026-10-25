// Runs every minute. Compares the published results with what it saw last time and sends alerts for new
// race calls (personalized with the player's picks), plus a one-time "picks lock in 1 hour" reminder.
// Quiet outside Nov 3 – Dec 3, 2026.
import { vapid, blobs, send } from '../lib/push.mjs';

const LOCK = Date.UTC(2026, 10, 3, 23, 0, 0);
const START = Date.UTC(2026, 10, 3, 21, 0, 0), END = Date.UTC(2026, 11, 3, 6, 0, 0);
const base = () => process.env.URL || 'https://election-night.netlify.app';
const get = async (f) => { try { const r = await fetch(base() + '/data/' + f + '.json?t=' + Date.now()); return r.ok ? await r.json() : []; } catch (e) { return []; } };

function labeler(sen, gov, mo, local) {
  return (key) => {
    const id = key.replace(/^(SEN|GOV|HOU|MO)-/, '');
    if (key.startsWith('SEN-')) { const r = sen.find(x => x.id === id); return (r ? r.state : id) + ' Senate'; }
    if (key.startsWith('GOV-')) { const r = gov.find(x => x.id === id); return (r ? r.state : id) + ' governor'; }
    if (key.startsWith('HOU-')) return id;
    const l = local.find(x => x.race === key); if (l) return l.title.replace(/\?$/, '');
    if (key === 'MO-AUD') return 'Missouri State Auditor';
    const m = mo.find(x => 'MO-' + x.id === key); return 'Missouri ' + (m ? m.title : id);
  };
}
const line = (x, label) => {
  const w = String(x.winner), p = x.winner_party;
  if (/^(Passes|Fails)$/.test(w)) return label(x.race) + ' ' + w.toLowerCase();
  if (/retain/i.test(w)) return label(x.race) + ': ' + w.toLowerCase();
  return w + (p && 'DRI'.includes(p) ? ' (' + p + ')' : '') + ' wins ' + label(x.race);
};
const sideOf = (x) => /^(R|N)$/.test(x.winner_party) ? 'r' : 'd';

export default async () => {
  const now = Date.now();
  if (now < START - 2 * 3600e3 || now > END) return;
  const state = await blobs.get('state');
  const lockSoon = now >= LOCK - 3600e3 && now < LOCK && !(state && state.lockSoon);
  const rows = now >= START ? await get('results') : [];
  const called = rows.filter(x => x.winner_party);
  if (!state) { await blobs.set('state', { called: called.map(x => x.race), lockSoon: false }); if (!lockSoon) return; }
  const seen = new Set(state ? state.called : called.map(x => x.race));
  const fresh = called.filter(x => !seen.has(x.race)).sort((a, b) => String(a.called_at).localeCompare(String(b.called_at)));
  if (!fresh.length && !lockSoon) return;
  // save first so an overlapping run doesn't double-send
  await blobs.set('state', { called: Array.from(new Set([...seen, ...called.map(x => x.race)])), lockSoon: (state && state.lockSoon) || lockSoon });
  const k = await vapid();
  const [sen, gov, mo, local] = fresh.length ? await Promise.all([get('senate'), get('governor'), get('missouri'), get('local')]) : [[], [], [], []];
  const label = labeler(sen, gov, mo, local);
  const keys = await blobs.keys('sub-');
  const jobs = [];
  for (const key of keys) {
    const rec = await blobs.get(key); if (!rec || !rec.sub) continue;
    const msgs = [];
    if (lockSoon) msgs.push({ title: '⏰ Picks lock in 1 hour', body: 'Prediction Game picks and your lock of the night lock at 5:00 PM CT.', tag: 'lock', url: '/#game' });
    if (fresh.length) {
      const mine = fresh.filter(x => rec.picks && rec.picks[x.race]);
      const right = mine.filter(x => rec.picks[x.race] === sideOf(x));
      const lockHit = rec.lock && fresh.find(x => x.race === rec.lock);
      const extra = mine.length ? (' · Your picks: ' + right.length + ' of ' + mine.length + ' right' + (lockHit ? (rec.picks[rec.lock] === sideOf(lockHit) ? ' · ★ your lock hit!' : ' · your lock missed') : '')) : '';
      if (fresh.length <= 2) fresh.forEach((x, i) => {
        const p = rec.picks && rec.picks[x.race];
        const you = p ? (p === sideOf(x) ? ' ✓ You called it' + (rec.lock === x.race ? ' — lock of the night ★' : '') : ' ✗ Your pick missed') : '';
        msgs.push({ title: 'Race called', body: line(x, label) + (you ? ' ·' + you : ''), tag: 'call-' + x.race, url: '/#night' });
        void i;
      });
      else msgs.push({ title: fresh.length + ' races called', body: fresh.slice(0, 3).map(x => line(x, label)).join(' · ') + (fresh.length > 3 ? ' · +' + (fresh.length - 3) + ' more' : '') + extra, tag: 'calls-' + now, url: '/#night' });
    }
    jobs.push((async () => { for (const m of msgs) { const r = await send(rec.sub, m, k); if (r === 'gone') { await blobs.del(key).catch(() => {}); break; } } })());
    if (jobs.length >= 40) { await Promise.allSettled(jobs.splice(0)); }
  }
  await Promise.allSettled(jobs);
};

export const config = { schedule: '* * * * *' };
