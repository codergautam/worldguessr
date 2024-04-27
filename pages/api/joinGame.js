import { createUUID } from '@/components/createUUID';
import client from '@/components/multiplayerServer/redisClient';
import moment from 'moment';

// This function is used to update the game state by adding a new player
async function addPlayerToGame(gameId, playerName, playerId, playerSecret) {
  const gameData = await client.get(gameId);
  if (!gameData) {
    return {success: false, reason: "Game not found"}; // Game not found
  }

  const game = JSON.parse(gameData);
  if(game.s != 1) {
    return {success: false, reason: "Game not accepting players"}; // Game not accepting players
  }

  // Check if player already exists
  if (game.p.find(p => p.name === playerName)) {
    return {success: false, reason: "Name already taken"}; // Player already joined
  }

  // Add new player to the game
  game.p.push({
    n: playerName, // name
    id: playerId, // player ID
    s: playerSecret, // player secret
    g: [], // player guesses
    po: 0 // player points
  });

  // Save updated game back to Redis
  await client.set(gameId, JSON.stringify(game));
  return {success: true};
}

export default async function joingame(req, res) {
  const { id, name } = req.body;

  if (!id || typeof id !== 'string' || !name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Invalid request, missing or incorrect id or name' });
  }
  // make sure name is less than 20 characters and alphanumeric (spaces allowed)
  if (name.length > 20) {
    return res.status(400).json({ error: 'Name too long' });
  }
  if (!/^[a-z0-9 ]+$/i.test(name)) {
    return res.status(400).json({ error: 'Name must be alphanumeric' });
  }

  const playerId = createUUID();
  const playerSecret = createUUID();
  const d = await addPlayerToGame(id, name, playerId, playerSecret);
  if (!d.success) {
    return res.status(404).json({ error: d.reason });
  }

  res.status(200).json({ message: 'Player added successfully', id, playerId, playerSecret });
}
