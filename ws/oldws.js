/*

import { writeHeapSnapshot } from 'v8';

const maintenanceSecret = process.env.MAINTENANCE_SECRET;
if (maintenanceSecret && maintenanceSecret.length > 0) {
  app.get(`/setmaintenance/${maintenanceSecret}/true`, (req, res) => {
    restartQueued = true;
    // notify all players
    for (const player of players.values()) {
      player.send({
        type: 'restartQueued',
        value: true
      });
    }
    res.send('ok');
  });

  app.get(`/setmaintenance/${maintenanceSecret}/false`, (req, res) => {
    restartQueued = false;
    // notify all players
    for (const player of players.values()) {
      player.send({
        type: 'restartQueued',
        value: false
      });
    }
    res.send('ok');
  });

  const players = new Map();
const games = new Map();
const playersInQueue = new Set();

function joinGameByCode(code, onFull, onInvalid, onSuccess) {
  for(const game of games.values()) {
    if(game.code == code && !game.public) {
      if(Object.keys(game.players).length >= game.maxPlayers) {
        onFull();
        return;
      }

      onSuccess(game);
      return;
    }
  }
  onInvalid();
}
}

  // Create a WebSocket server
  // const wss = new WebSocket.Server({ noServer: true });
  const wss = new WebSocketServer({ noServer: true });

    server.on('listening', () => {
      console.log('[INFO] WebSocket server listening');
    });


  // Handle WebSocket connections
  server.on('upgrade', (request, socket, head) => {

    if(!multiplayerEnabled) {
      // close the connection
      socket.destroy();
      return;
    }

    const { pathname } = parse(request.url, true);
    if(pathname === '/wg') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // Set up a connection listener
  wss.on('connection', (ws) => {
    // Send a message to the client
    const id = makeId();
    const player = new Player(ws, id);
    player.send({
      type: 't',
      t: Date.now()
    })
    players.set(id, player);

    if(restartQueued) {
      player.send({
        type: 'restartQueued',
        value: true
      });
    } else {
      player.send({
        type: 'restartQueued',
        value: false
      });
    }

    // Set up a message listener on the client
    ws.on('message', async (message) => {
      const json = JSON.parse(message);
      if (!player.verified && json.type !== 'verify') {
        return;
      }
      if (json.type === "pong") {
        player.lastPong = Date.now();
      }
      if (json.type === 'verify') {
        // account verification
        if((!json.secret) ||(json.secret === 'not_logged_in')) {
          if(!player.verified) {

          // guest mode
          player.username = 'Guest #' + make6DigitCode().toString().substring(0, 4);
          player.verified = true;

          player.send({
            type: 'verify',
            guestName: player.username
          });
          player.send({
            type: 'cnt',
            c: players.size
          })
          console.log('Guest joined', id, player.username);
        }

        } else {

        let valid;
        console.log('Verifying user', id, json);
        if(json.secret) {
        valid =  await validateSecret(json.secret, User);
        }
        if (valid) {
          // make sure the user is not already logged in (only on prod)
            for (const p of players.values()) {
              if (p.accountId === valid._id.toString()) {
                player.send({
                  type: 'error',
                  message: 'uac'
                });
                player.ws.close();
                console.log('User already connected', id, valid.username);
                return;
              }
            }
          player.verified = true;
          player.supporter = valid.supporter;
          player.username = valid.username;
          player.accountId = valid._id.toString();
          player.send({
            type: 'verify'
          });
          player.send({
            type: 'cnt',
            c: players.size
          })

          if (json.tz && isValidTimezone(json.tz)) {
            const existingTimeZone = valid.timeZone;
            let streak = valid.streak;

            const lastLoginUTC = valid.lastLogin;
            const userTimezoneDay = moment().tz(json.tz).startOf('day');
            const lastLoginUserTimezone = moment.tz(lastLoginUTC, existingTimeZone).startOf('day');

            if (userTimezoneDay.diff(lastLoginUserTimezone, 'days') === 1) {
              console.log(`User ${player.accountId} has logged in after a day.`);
              streak++;
              player.send({
                type: 'streak',
                streak
              })
            } else if(userTimezoneDay.diff(lastLoginUserTimezone, 'days') > 1) {
              console.log(`User ${player.accountId} lost their streak`);
              streak = 0;
              player.send({
                type: 'streak',
                streak
              })
            }
            if(!valid.firstLoginComplete) {
              streak = 1;
              player.send({
                type: 'streak',
                streak
              })
            }

            await User.updateOne({_id: player.accountId}, {timeZone: json.tz, lastLogin: Date.now(), streak, firstLoginComplete: true})
          }

          player.friends = valid.friends.map((id)=>({id}));
          player.sentReq = valid.sentReq.map((id)=>({id}));
          player.receivedReq = valid.receivedReq.map((id)=>({id}));

          console.time("friendsNames")
          const friendsWithNames = [];
          // player.friends = valid.friends;
          for(let id of valid.friends) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              friendsWithNames.push({name: user.username, id, supporter: user.supporter});
            }
          }
          player.friends = friendsWithNames;

          const sentReqWithNames = [];
          for(let id of valid.sentReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              sentReqWithNames.push({name: user.username, id, supporter: user.supporter});
            }
          }
          player.sentReq = sentReqWithNames;

          const receivedReqWithNames = [];
          for(let id of valid.receivedReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              receivedReqWithNames.push({name: user.username, id, supporter: user.supporter});
            }
          }
          player.receivedReq = receivedReqWithNames;
          console.timeEnd("friendsNames")

          player.allowFriendReq = valid.allowFriendReq;

          console.log('User verified', id, valid.username, player.sentReq, json?.tz);
        } else {
          player.send({
            type: 'error',
            message: 'Failed to login',
            failedToLogin: true
          });
          console.log('Failed to verify user', id);
          player.ws.close();
        }
      }
      }

      if(json.type === 'screen' && json.screen && typeof json.screen === 'string') {
        player.setScreen(json.screen);
      }

      if (json.type === 'publicDuel' && !player.gameId) {
        console.log('Public duel requested', id, player.username);
                // send toast if maintenance
                if(restartQueued) {
                  player.send({
                    type: 'toast',
                    key: 'maintenanceModeStarted',
                    toastType: 'error'
                  });
                  return;
                }

        player.inQueue = true;
        playersInQueue.add(player.id);
      }

      if(json.type === 'leaveQueue' && player.inQueue) {
        player.inQueue = false;
        playersInQueue.delete(player.id);
      }

      if(json.type === 'place' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        const latLong = json.latLong;
        const final = json.final;

        // make sure latLong is an array of floats with 2 elements
        if (!Array.isArray(latLong) || latLong.length !== 2) {
          return;
        }

        // make sure final is a boolean
        if (typeof final !== 'boolean') {
          return;
        }

        game.setGuess(player.id, latLong, final);
      }

      if(json.type === 'chat' && player.gameId && games.has(player.gameId)) {
        let message = json.message;
        const lastMessage = player.lastMessage || 0;
        if (typeof message !== 'string' || message.length < 1 || message.length > 200 || Date.now() - lastMessage < 500) {
          return;
        }
        const game = games.get(player.gameId);
        message = filter.clean(message);
        player.lastMessage = Date.now();
        game.sendAllPlayers({
          type: 'chat',
          id: player.id,
          name: player.username,
          message
        });
      }

      if(json.type=== 'leaveGame' && player.gameId && games.has(player.gameId)) {
        console.log('Player left game', player.id, player.gameId, player.username);
        const game = games.get(player.gameId);
        game.removePlayer(player);
      }

      if(json.type === "inviteFriend" && player.accountId && json.friendId && player.gameId) {
        // here friendId is the socket id
        const friend = players.get(json.friendId);
        if(!friend) {
          return;
        }

        const game = games.get(player.gameId);
        if(!game || game.public) {
          return;
        }

        // make sure the friend is not already in this game
        if(friend.gameId === player.gameId) {
          player.send({
            type: 'toast',
            key: 'alreadyInYourGame',
            toastType: 'error'
          });
          return;
        }

        // make sure the friend is friends with the player
        if(!player.friends.find((f)=>f.id === friend.accountId)) {
          return;
        }

        if(Date.now() - friend.lastInvite < 5000) {
          player.send({
            type: 'toast',
            key: "inviteCooldown",
            t: ((5000 - (Date.now() - friend.lastInvite))/1000).toFixed(1)
          });
          return;
        }

        friend.lastInvite = Date.now();

        friend.send({
          type: 'invite',
          code: game.code,
          invitedByName: player.username,
          invitedById: player.id // socket id
        });

        player.send({
          type: 'toast',
          key: "inviteSent",
          name: friend.username,
          toastType: 'success'
        });
      }

      if(json.type === 'acceptInvite' && json.code && player.accountId) {
        joinGameByCode(json.code, () => {
          player.send({
            type: 'toast',
            key: 'gameIsFull',
            toastType: 'error'
          });
        }, () => {
          player.send({
            type: 'toast',
            key: 'invalidGameCode',
            toastType: 'error'
          });
        }, (game) => {
        // leave queue if in
        if(player.inQueue) {
          player.inQueue = false;
          playersInQueue.delete(player.id);
        }

        // leave current game if in
        if(player.gameId) {
          const curGame = games.get(player.gameId);
          curGame.removePlayer(player);
        }

        // add player to game
        game.addPlayer(player);

        // send success
        player.send({
          type: 'toast',
          key: 'inviteAccepted',
          toastType: 'success'
        });

        const friendPlayer = players.get(json.invitedById);
        // make sure you are his friend
        if(friendPlayer && player.friends.find((f)=>f.id === friendPlayer.accountId)) {
          friendPlayer.send({
            type: 'toast',
            key: 'inviteAcceptedBy',
            name: player.username,
            toastType: 'success'
          });
        }
      })
      }

      if(json.type === "setAllowFriendReq" && typeof json.allow === 'boolean' && player.accountId) {

        if(Date.now() - player.lastAllowFriendReqChange < 5000) {
          player.send({
            type: 'toast',
            key: 'pleaseWaitSeconds',
            seconds: Math.round(5 - (Date.now() - player.lastAllowFriendReqChange)/1000),
            toastType: 'error'
          });
          return;
        }
        player.lastAllowFriendReqChange = Date.now();
        player.allowFriendReq = json.allow;
        await User.updateOne({_id: player.accountId}, {allowFriendReq: json.allow});
        player.send({
          type: 'toast',
          key: 'preferenceUpdated'
        });
        player.sendFriendData();
      }


      if(json.type === 'createPrivateGame' && !player.gameId) {
        console.log('Private game requested', id, player.username);

        // send toast if maintenance
        if(restartQueued) {
          player.send({
            type: 'toast',
            key: 'maintenanceModeStarted',
            toastType: 'error'
          });
          return;
        }

        const gameId = makeId();
        // options
        let {rounds, timePerRound, locations, maxDist, location} = json;
        rounds = Number(rounds);
        // maxDist no longer required-> can be pulled from community map
        if(!location) return;
        if(!rounds || !timePerRound) {
          return;
        }
        // if(!locations || !Array.isArray(locations) || locations.length < 1 || locations.length > 20) return;
        if(rounds < 1 || rounds > 20 || timePerRound < 10 || timePerRound > 300) {
          return;
        }
        // if(locations.length !== rounds) {
        //   return;
        // }
        // if(typeof maxDist !== 'number' || maxDist > 20000 || maxDist < 10) {
        //   return;
        // }

        // validate location (can be all or a 2 letter country code) NOT VALID ANYMORE-> COMMUNITY MAP SLUG
        // if(!((location === 'all') || (countries.findIndex((c) => c === location) > -1))) {
        //   return;
        // }


        // validate round format
        // for(const loc of locations) {
        //   // ex: {lat: number, long: number, country: 2 letter code}
        //   // make sure proper object
        //   if(typeof loc !== 'object') {
        //     return;
        //   }
        //   if(Object.keys(loc).length !== 3) {
        //     return;
        //   }

        //   if(!loc.lat || !loc.long || !loc.country) {
        //     return;
        //   }

        //   if(typeof loc.lat !== 'number' || typeof loc.long !== 'number' || typeof loc.country !== 'string') {
        //     return;
        //   }

        //   if(loc.country.length !== 2) {
        //     return;
        //   }
        // }

        const game = new Game(gameId, false, location, rounds);
        game.timePerRound = timePerRound * 1000;
        // game.locations = locations;
        // game.location = location;
        if(maxDist) game.maxDist = maxDist;

        games.set(gameId, game);

        game.addPlayer(player, true);
        console.log('Private game created', gameId, player.username);
      }

      if(json.type === 'joinPrivateGame' && !player.gameId) {
        console.log('Join private game requested', id, player.username);
        let code = json.gameCode;

        // find game by code
        joinGameByCode(code, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Game is full'
          });
          console.log('Game is full', code);
        }, () => {
          player.send({
            type: 'gameJoinError',
            error: 'Invalid game code'
          });
          console.log('Invalid game code', code);
        }, (game) => {
          game.addPlayer(player);
          console.log('Player added to private game', game.id, player.username);
        });
      }

      if(json.type === 'startGameHost' && player.gameId && games.has(player.gameId)) {
        const game = games.get(player.gameId);
        if(game.players[player.id].host) {

          console.log('Host started game', game.id);

          game.start();
        }
      }


    if(json.type === 'getFriends') {
      player.sendFriendData();
    }

    if(json.type === 'sendFriendRequest') {
      console.log('Friend request', player.accountId, player.username, json.name);
      if(!player.accountId) {
        player.send({type:'friendReqState',state: 0})
        return;
      }
      if(!json.name || typeof json.name !== "string" || json.name.length < 3 || json.name.length > 30 || !/^[a-zA-Z0-9_]+$/.test(json.name)) {
        player.send({type:'friendReqState',state: 0})
        return;
      }
      // cannot have more than 100 friends
      if(player.friends.length > 100) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      // cannot have more than 100 sent reqs
      if(player.sentReq.length > 100) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      const friend = await User.findOne({username: { $regex: new RegExp('^'+ json.name + '$', "i") }});
      if(!friend) {
        player.send({type:'friendReqState',state: 3})
        return;
      }
      if(!friend.allowFriendReq) {
        player.send({type:'friendReqState',state: 2})
        return;
      }
      // cannot have more than 100 received requests
      if(friend.receivedReq.length > 100) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      if(friend._id.toString() === player.accountId) {
        player.send({type:'friendReqState',state: 7})
        return;
      }
      if(player.friends.findIndex((f) => f.id === friend._id.toString()) > -1) {
        player.send({type:'friendReqState',state: 6})
        return;
      }
      if(player.sentReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
        player.send({type:'friendReqState',state: 4})
        return;
      }
      // cannot have a friedn request received from this user
      if(player.receivedReq.findIndex((f) => f.id === friend._id.toString()) > -1) {
        player.send({type:'friendReqState',state: 5})
        return;
      }

      // update mongodb
      await User.updateOne({_id: player.accountId}, {$push: {sentReq: friend._id.toString()}});
      await User.updateOne({_id: friend._id}, {$push: {receivedReq: player.accountId}});

      // update player
      player.sentReq.push({id: friend._id.toString(), name: friend.username, supporter: friend.supporter});
      player.sendFriendData();
      player.send({type:'friendReqState',state: 1})

      // is user online
      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === friend._id.toString());
      if(friendPlayer) {
        friendPlayer.send({type:'friendReq',id: player.accountId, name: player.username});

        friendPlayer.receivedReq.push({id: player.accountId, name: player.username, supporter: player.supporter});
        friendPlayer.sendFriendData();
      }


    }

    if(json.type === 'cancelRequest' && player.accountId && json.id) {
      if(typeof json.id !== "string") {
        return;
      }

      // check if the request exists (player side)
      const exists = player.sentReq.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      player.sentReq.splice(exists, 1);

            const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.receivedReq.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.receivedReq.splice(exists, 1);
          friendPlayer.sendFriendData();
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {sentReq: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {receivedReq: player.accountId}});

      player.sendFriendData();
    }

    if(json.type === 'acceptFriend' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.receivedReq.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      const friend = player.receivedReq.splice(exists, 1)[0];
      player.friends.push(friend);

      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.sentReq.splice(exists, 1);
          friendPlayer.friends.push({id: player.accountId, name: player.username.toString(), supporter: player.supporter});
          friendPlayer.sendFriendData();
          // friendPlayer.send({type:'newFriend', id: player.accountId, name: player.username});
          friendPlayer.send({type:'toast', key: 'newFriend', name: player.username, toastType: 'success'});
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {receivedReq: json.id}, $push: {friends: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {sentReq: player.accountId}, $push: {friends: player.accountId}});

      player.sendFriendData();
      // player.send({type:'newFriend', id: json.id, name: friend.name});
      player.send({type:'toast', key: 'newFriend', name: friend.name, toastType: 'success'});
    }

    if(json.type === 'declineFriend' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.receivedReq.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      player.receivedReq.splice(exists, 1);

      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.sentReq.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.sentReq.splice(exists, 1);
          friendPlayer.sendFriendData();
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {receivedReq: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {sentReq: player.accountId}});

      player.sendFriendData();
    }

    if(json.type === 'removeFriend' && player.accountId && json.id) {
      // check if the request exists (player side)
      const exists = player.friends.findIndex((f) => f.id === json.id);
      if(exists === -1) {
        return;
      }
      // remove from player
      player.friends.splice(exists, 1);

      const friendPlayer = Array.from(players.values()).find((p) => p.accountId === json.id);
      if(friendPlayer) {
        const exists = friendPlayer.friends.findIndex((f) => f.id === player.accountId);
        if(exists > -1) {
          friendPlayer.friends.splice(exists, 1);
          friendPlayer.sendFriendData();
        }
      }
      // remove from mongodb
      await User.updateOne({_id: player.accountId}, {$pull: {friends: json.id}});
      await User.updateOne({_id: json.id}, {$pull: {friends: player.accountId}});

      player.sendFriendData();
    }
    });

    // Set up a close listener on the client
    ws.on('close', () => {
      console.log('Client disconnected', id);

      if (player.gameId) {
        const game = games.get(player.gameId);
        if (game) {
          game.removePlayer(player);
        }
      }

      if (player.inQueue) {
        playersInQueue.delete(id);
      }

      players.delete(id);
    });
  });

  // update player count
setInterval(() => {

  for (const player of players.values()) {
    if (player.verified && !player.gameId) {
      player.send({
        type: 'cnt',
        c: players.size
      });
    }
    player.send({
      type: 't',
      t: Date.now()
    });
  }

  if(restartQueued) {
    // log count of players in active games
    let playerCnt = 0;
    let unstartedGames = 0;
    for(const game of games.values()) {
      if(game.state === 'waiting') {
        unstartedGames++;
      } else {
        playerCnt += Object.keys(game.players).length;
      }
    }
    console.log('Players in active games', playerCnt);
    console.log('Unstarted games', unstartedGames);

  }
}, 5000);

// queue handler
setInterval(() => {


  const minRoundsRemaining = 3;
  for (const game of games.values()) {

    const playerCnt = Object.keys(game.players).length;
    // start games that have at least 2 players
    if (game.state === 'waiting' && playerCnt > 1 && game.public && game.rounds === game.locations.length) {
      game.start();
      console.log('public Game started', game.id);
    } else if (game.state === 'getready' && Date.now() > game.nextEvtTime) {
      if(game.curRound > game.rounds) {
        game.end();
        console.log('Game ended', game.id);
        // game over

      } else {
      game.state = 'guess';
      console.log('State changed to guess', game.id);
      game.nextEvtTime = Date.now() + game.timePerRound;
      game.clearGuesses();

      game.sendStateUpdate();
      }

    } else if (game.state === 'guess' && Date.now() > game.nextEvtTime) {
      console.log('Round', game.curRound, 'ended for game', game.id);
      game.givePoints();
      if(game.curRound <= game.rounds) {
        game.curRound++;
        game.state = 'getready';
        game.nextEvtTime = Date.now() + game.waitBetweenRounds - (game.curRound > game.rounds ? 5000: 0);
        game.sendStateUpdate();


      } else {
        console.log('Game ended', game.id);
        // game over
        game.end()
      }
    }

    if(game.state === 'end' && Date.now() > game.nextEvtTime) {
      console.log('Game shutdown', game.id);
      // remove game
      game.shutdown()
    }


    // find games that can be joined
    if (playersInQueue.size < 1) {
      continue;
    }
    if (!game.public) {
      continue;
    }
    if (game.rounds - game.curRound < minRoundsRemaining) {
      continue;
    }
    if (playerCnt >= game.maxPlayers) {
      continue;
    }


    const multiplayerMax = Math.min(10, game.maxPlayers)
    let playersCanJoin = multiplayerMax - playerCnt;
    console.log('Players can join', playersCanJoin, 'for game', game.id);
    console.log(playersInQueue, playersInQueue.size);
    for (const playerId of playersInQueue) {
      const player = players.get(playerId);
      if(!player) {
        console.log('Player not found', playerId, 'in queue');
        playersInQueue.delete(playerId);
        continue;
      }
      if (player.gameId) {
        continue;
      }
      if (playersCanJoin < 1) {
        break;
      }
      console.log('Player added to game', player.id, 'gameid', game.id);
      game.addPlayer(player);
      playersInQueue.delete(playerId);
      playersCanJoin--;
    }

  }

  if (playersInQueue.size > 1) {
    // create a new public game
    console.log('Creating new public game');
    const gameId = makeId();
    const game = new Game(gameId, true);
    games.set(gameId, game);

    let playersCanJoin = game.maxPlayers;
    for (const playerId of playersInQueue) {
      const player = players.get(playerId);
      if (player.gameId) {
        continue;
      }
      if (playersCanJoin < 1) {
        break;
      }
      game.addPlayer(player);
      console.log('Player added to new public game', player.id);
      playersInQueue.delete(playerId);
      playersCanJoin--;
    }
  }
}, 500);




if(!dev && dbEnabled && multiplayerEnabled) {
  setInterval(() => {
    const memUsage = process.memoryUsage().heapUsed;
    const gameCnt = games.size;
    const playerCnt = players.size;

    // store in mongodb
    // memsave
    const mem = new Memsave({
      players: playerCnt,
      memusage: memUsage,
      games: gameCnt
    });
    mem.save().then(() => [
    ])
  }, 10000);
}

// Check for pong messages and disconnect inactive clients
setInterval(() => {
  const currentTime = Date.now();
  players.forEach((player) => {
    if (currentTime - player.lastPong > 60000) { // 60 seconds timeout
      console.log(`Disconnecting inactive player ${player.id}`);
      player.ws.close(); // Disconnect the player
    }
  });
}, 10000); // Check every 10 seconds

*/