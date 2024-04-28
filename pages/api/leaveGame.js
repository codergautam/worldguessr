import client from '@/components/multiplayerServer/redisClient';

// This function is used to remove a player from the game state
async function removePlayerFromGame(gameId, playerId, playerSecret) {
  const gameData = await client.get(gameId);
  if (!gameData) {
    return {success: false, reason: "Game not found"}; // Game not found
  }

  const game = JSON.parse(gameData);

  // Check if player exists and verify secret
  const playerIndex = game.p.findIndex(p => p.id === playerId && p.s === playerSecret);
  if (playerIndex === -1) {
    return {success: false, reason: "Player not found or secret mismatch"}; // Player not found or secret mismatch
  }

  // Remove player from game
  game.p.splice(playerIndex, 1);

  // Save updated game back to Redis
  await client.set(gameId, JSON.stringify(game));
  return {success: true};
}

export default async function leaveGame(req, res) {
  const { id, playerId, playerSecret } = req.body;

  if (!id || typeof id !== 'string' || !playerId || typeof playerId !== 'string' ||
      !playerSecret || typeof playerSecret !== 'string') {
    return res.status(400).json({ error: 'Invalid request, missing or incorrect parameters' });
  }

  const d = await removePlayerFromGame(id, playerId, playerSecret);
  if (!d.success) {
    return res.status(404).json({ error: d.reason });
  }

  res.status(200).json({ message: 'Player removed successfully' });
}
