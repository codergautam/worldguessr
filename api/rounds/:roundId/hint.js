import ratelimit from '../../../components/utils/ratelimitMiddleware.js';
import GameRound from '../../../models/GameRound.js';
import { getRoundSession } from '../../../serverUtils/gameRounds.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Request failed' });
  try {
    const sessionId = getRoundSession(req, res);
    const updated = await GameRound.findOneAndUpdate(
      { roundId: req.params.roundId, sessionId, status: 'open', expiresAt: { $gt: new Date() } },
      { $set: { hintUsed: true } },
      { new: true, projection: { roundId: 1 } },
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Request failed' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ error: 'Request failed' });
  }
}

export default ratelimit(handler, 30, 60000);
