import client from '@/components/multiplayerServer/redisClient';
import moment from 'moment';
const matchesBuffer = 5000;
// This function is used to start a game
async function startGame(gameId, modifySecret) {
  const gameData = await client.get(gameId);
  if (!gameData) {
    return { success: false, reason: "Game not found" }; // Game not found
  }

  const game = JSON.parse(gameData);
  // Check modify secret to ensure only the creator can start the game
  if (game.ms !== modifySecret) {
    return { success: false, reason: "Unauthorized to start game" }; // Unauthorized action
  }

  if(game.s !== 1) {
    return { success: false, reason: "Game in invalid state" }; // Game in invalid state
  }

  // Check if there are enough players to start the game
  if (game.p.length < 2) {
    return { success: false, reason: "Not enough players" }; // Not enough players
  }

  // Update game state to 'started'
  game.s = 2;

  const currentTime = moment().utc().valueOf();
  // gameData.po[0].t = currentTime+matchesBuffer;
  for(let i = 0; i < game.po.length; i++) {
    game.po[i].t = currentTime + (i * game.rt * 1000) + ((i+1) * matchesBuffer);
  }
  game.endTime = currentTime + (game.po.length * game.rt * 1000) + ((game.po.length+1) * matchesBuffer);
  // Save updated game back to Redis
  await client.set(gameId, JSON.stringify(game));
  return { success: true };
}

export default async function startGameHandler(req, res) {
  const { id, modifySecret } = req.body;

  if (!id || typeof id !== 'string' || !modifySecret || typeof modifySecret !== 'string') {
    return res.status(400).json({ error: 'Invalid request, missing or incorrect id or modify secret' });
  }

  const d = await startGame(id, modifySecret);
  if (!d.success) {
    return res.status(404).json({ error: d.reason });
  }

  res.status(200).json({ message: 'Game started successfully' });
}
