const players = new Map();
const games = new Map();
const disconnectedPlayers=  new Map();
// Matchmaking queue (unranked / ranked 1v1 / 2v2). Lives here rather than in
// ws.js so Game methods (e.g. the team-duel pre-game cancel requeue) can reach
// it without callback plumbing.
const playersInQueue = new Map();

export { games, players, disconnectedPlayers, playersInQueue };
