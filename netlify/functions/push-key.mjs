// GET → the public key phones need to turn on alerts
import { vapid, json } from '../lib/push.mjs';
export default async () => { const k = await vapid(); return json({ publicKey: k.publicKey }); };
