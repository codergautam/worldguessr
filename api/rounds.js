import ratelimit from '../components/utils/ratelimitMiddleware.js';
import GameRound from '../models/GameRound.js';
import { createGameRound, getRoundSession } from '../serverUtils/gameRounds.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Request failed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await createGameRound(req, res);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[rounds] create failed:', error?.message || error);
    return res.status(503).json({ error: 'Round unavailable' });
  }
}

export async function replaceHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Request failed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const sessionId = getRoundSession(req, res);
    const oldRoundId = req.body?.roundId;
    if (typeof oldRoundId !== 'string') return res.status(404).json({ error: 'Request failed' });
    const replaced = await GameRound.findOneAndUpdate(
      { roundId: oldRoundId, sessionId, status: 'open', expiresAt: { $gt: new Date() } },
      { $set: { status: 'replaced' } },
      { new: true }
    ).lean();
    if (!replaced) return res.status(404).json({ error: 'Request failed' });
    const result = await createGameRound(req, res);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[rounds] replacement failed:', error?.message || error);
    return res.status(503).json({ error: 'Round unavailable' });
  }
}

export default ratelimit(handler, 20, 60000);
