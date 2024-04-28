import client from '@/components/multiplayerServer/redisClient';
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body; // Get the game ID from the URL
  if(!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Game ID is required' });
  }
  try {
    const gameData = await client.get(id.toString());

    if (!gameData) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const parsedData = JSON.parse(gameData);
    res.status(200).json({
      id: parsedData.id,
      createdAt: parsedData.c,
      points: parsedData.po,
      players: parsedData.p.map(p => {
        delete p.s;
        return p;
      }),
      state: parsedData.s,
      timePerRound: parsedData.rt,
      endTime: parsedData.endTime,
    });
  } catch (error) {
    console.error('Failed to fetch game state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
