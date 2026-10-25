// GET → the public key phones need to turn on alerts
import { vapid, json } from '../lib/push.mjs';
export default async () => { try { const k = await vapid(); return json({ publicKey: k.publicKey }); } catch (e) { return json({ error: String(e && e.message || e) }, 500); } };
