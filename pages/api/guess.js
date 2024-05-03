import calcPoints from '@/components/calcPoints';
import { createUUID } from '@/components/createUUID';
import client from '@/components/multiplayerServer/redisClient';
import storeGame from '@/components/storeGame';
import moment from 'moment';
const matchesBuffer = 5000;
// multiplayer after guess
export default async function guess(req, res) {
  const { lat, long, gameCode, playerSecret, roundNo, usedHint, secret, roundTime } = req.body;

  // Validate the input
  if (typeof lat !== 'number' || typeof long !== 'number' ||
      typeof gameCode !== 'string' || typeof playerSecret !== 'string' || typeof roundNo !== 'number') {
    return res.status(400).json({ error: 'Invalid input types' });
  }

  // Retrieve the game state
  const gameData = await client.get(gameCode);
  if (!gameData) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const game = JSON.parse(gameData);
  // Authenticate the player
  const player = game.p.find(p => p.s === playerSecret);
  if (!player) {
    return res.status(403).json({ error: 'Invalid player secret' });
  }

  // Calculate the actual distance between the player's guess and the target point
  const points = calcPoints({ guessLat: lat, guessLon: long, lat: game.po[roundNo-1].lat, lon: game.po[roundNo-1].long, usedHint });
  player.po += points;
  // add to player.g
  player.g.push({ lat, long, po: points, r: roundNo });

  // Save the updated game state

  // if everyone has guessed, start the next round
  if (game.p.every(p => p.g.find(g => g.r === roundNo))) {
    /*   const currentTime = moment().utc().valueOf();
  // gameData.po[0].t = currentTime+matchesBuffer;
  for(let i = 0; i < game.po.length; i++) {
    game.po[i].t = currentTime + (i * game.rt * 1000) + ((i+1) * matchesBuffer);
  }
  game.endTime = currentTime + (game.po.length * game.rt * 1000) + ((game.po.length+1) * matchesBuffer);
  */
//  console.log('everyone has guessed');
//     const currentTime = moment().utc().valueOf();
//     for (let i = roundNo; i < game.po.length; i++) {
//       game.po[i].t = currentTime + (i * game.rt * 1000) + ((i + 1) * matchesBuffer);
//     }
//     game.endTime = currentTime + (game.po.length * game.rt * 1000) + ((game.po.length + 1) * matchesBuffer);

  }
  await client.set(gameCode, JSON.stringify(game));

  // if(secret) {
  //   try {
  //     await storeGame(secret, Math.round(points/100), roundTime, [lat, long]);
  //   } catch (error) {
  //     return res.status(500).json({ error: 'An error occurred', message: error.message });
  //   }
  // }
  res.status(200).json({ success: true, pointsAwarded: points });
}
