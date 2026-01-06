import validateSecret from "../../serverUtils/validateSecret.js";
import make6DigitCode from "../../serverUtils/make6DigitCode.js";
import isValidTimezone from "../../serverUtils/isValidTimezone.js";
import moment from "moment";
import { disconnectedPlayers, games, players } from "../../serverUtils/states.js";
import User from "../../models/User.js";
import { getLeague } from "../../components/utils/leagues.js";
import { setElo } from "../../api/eloRank.js";
import { createUUID } from "../../components/createUUID.js";
export default class Player {
  constructor(ws, id, ip, username=null, accountId=null, gameId=null) {
    this.id = id;
    this.ip = ip;
    this.ws = ws;
    this.username = null;
    this.accountId = null;
    this.gameId = null;
    this.inQueue = false;
    this.lastMessage = 0;
    this.lastPong = Date.now(); // Track the last pong received time
    this.verified = false;
    this.supporter = false;
    this.screen = "home";
    this.league = null;

    this.friends = []; // { id (accountId), online, socketId (id), name }
    this.sentReq = [];
    this.receivedReq = [];
    this.allowFriendReq = true;

    this.disconnected = false;
    this.disconnectTime =0;

    this.rejoinCode = createUUID();
  }

  toJSON() {
    return {
      id: this.id,
      ip: this.ip,
      ws: null,
      username: this.username,
      accountId: this.accountId,
      countryCode: this.countryCode,
      gameId: this.gameId,
      inQueue: false,
      lastMessage: this.lastMessage,
      verified: this.verified,
      lastPong: this.lastPong,
      supporter: this.supporter,
      screen: this.screen,
      friends: this.friends,
      sentReq: this.sentReq,
      receivedReq: this.receivedReq,
      allowFriendReq: this.allowFriendReq,
      disconnected: this.disconnected,
      disconnectTime: this.disconnectTime,
      rejoinCode: this.rejoinCode,
      elo: this.elo,
      league: this.league,
      banned: this.banned,
    }
  }

  static fromJSON(json) {
    const pObj = new Player(null, json.id, json.ip);
    Object.assign(pObj, json);
    return pObj;
  }

  setElo(newElo, gameData) {
    if(!this.accountId) return;
    if(newElo === undefined || newElo === null || isNaN(newElo)) {
      console.error('Invalid ELO value passed to setElo:', newElo, 'for account:', this.accountId);
      return;
    }
    this.elo = newElo;
    this.league = getLeague(newElo).name;
    setElo(this.accountId, newElo, gameData);

    this.send({
      type: 'elo',
      elo: newElo,
      league: getLeague(newElo)
        });
  }
  async verify(json) {

    const handleReconnect = async (dcPlayerId, rejoinCode, accountId = null) => {
      const dcPlayer = players.get(dcPlayerId);
      if(dcPlayer && this.ws) {

      // Re-check ban status from database on reconnect
      // This ensures users banned/forced to change name while disconnected are properly blocked
      if (accountId) {
        try {
          const freshUserData = await User.findById(accountId).select('banned banType banExpiresAt pendingNameChange countryCode');
          if (freshUserData) {
            let isBanned = freshUserData.banned;

            // Handle temp ban expiration
            if (freshUserData.banned && freshUserData.banType === 'temporary' && freshUserData.banExpiresAt) {
              if (new Date() >= new Date(freshUserData.banExpiresAt)) {
                isBanned = false;
                User.findByIdAndUpdate(accountId, {
                  banned: false,
                  banType: 'none',
                  banExpiresAt: null
                }).catch(err => console.error('Error auto-unbanning on reconnect:', err));
              }
            }

            dcPlayer.banned = isBanned;
            dcPlayer.pendingNameChange = freshUserData.pendingNameChange;
            dcPlayer.countryCode = freshUserData.countryCode;
            // Also set banned if pending name change
            if (dcPlayer.pendingNameChange) {
              dcPlayer.banned = true;
            }
          }
        } catch (err) {
          console.error('Error re-checking ban status on reconnect:', err);
        }
      }

      // remove from disconnected players
      disconnectedPlayers.delete(rejoinCode);
      // set the player's ws to this ws
      this.ws.id = dcPlayerId;
      dcPlayer.ws = this.ws;
      dcPlayer.disconnected = false;
      dcPlayer.disconnectTime = 0;
      dcPlayer.ip = this.ip;


      dcPlayer.send({
        type: 'verify',
      });


      if(dcPlayer.gameId && games.has(dcPlayer.gameId)) {
        // reconnect to game
        const game = games.get(dcPlayer.gameId);
        game.rejoinGame(dcPlayer);
        dcPlayer.send({
          type: 'toast',
          toastType: 'success',
          key: 'reconnected',

        });
      }

      // destroy this player
    players.delete(this.id);
      return;
      } else {
        disconnectedPlayers.delete(rejoinCode);
      }
    }

        // account verification
        if((!json.secret) ||(json.secret === 'not_logged_in')) {
          if(!this.verified) {
            if(json.rejoinCode) {
              const dcPlayerId = disconnectedPlayers.get(json.rejoinCode);
              if(dcPlayerId) {
                handleReconnect(dcPlayerId, json.rejoinCode);
                return;
              }
            }

          // guest mode
          this.username = 'Guest #' + make6DigitCode().toString().substring(0, 4);
          this.verified = true;

          this.send({
            type: 'verify',
            guestName: this.username,
            rejoinCode: this.rejoinCode
          });
          this.send({
            type: 'cnt',
            c: players.size-disconnectedPlayers.size
          })
        }

        } else {

        let valid;
        if(json.secret) {
        valid =  await validateSecret(json.secret, User);
        }
        if (valid) {

          // check if the user can be reconnected to previous session
          const dcPlayerId = disconnectedPlayers.get(valid._id.toString());
          if(dcPlayerId) {
            await handleReconnect(dcPlayerId, valid._id.toString(), valid._id.toString());
            return;
          }

          // make sure the user is not already logged in (only on prod)
            for (const p of players.values()) {
              if (p.accountId === valid._id.toString()) {
                // this.send({
                //   type: 'error',
                //   message: 'uac'
                // });
                // this.ws.close();
                // console.log('User already connected:', valid.username);
                // return;

                // disconnect the other player
                p.send({
                  type: 'error',
                  message: 'uac'
                });

                try {
                p.ws.close();
                } catch(e) {}
                console.log('User already connected:', valid.username
                );

                await handleReconnect(p.id, p.accountId, p.accountId);
              }
            }
            this.verified = true;
            this.supporter = valid.supporter;
            this.username = valid.username;
            this.accountId = valid._id.toString();
            this.countryCode = valid.countryCode;
            this.elo = valid.elo;

            // Check ban status - handle temp bans that may have expired
            let isBanned = valid.banned;
            if (valid.banned) {
              // Handle temp ban expiration
              if (valid.banType === 'temporary' && valid.banExpiresAt) {
                if (new Date() >= new Date(valid.banExpiresAt)) {
                  // Temp ban has expired - clear it (async, don't wait)
                  isBanned = false;
                  User.findByIdAndUpdate(valid._id, {
                    banned: false,
                    banType: 'none',
                    banExpiresAt: null
                  }).catch(err => console.error('Error auto-unbanning user:', err));
                }
              }
              // Handle legacy bans (banned: true but no banType) - migrate to permanent
              else if (!valid.banType || valid.banType === 'none') {
                User.findByIdAndUpdate(valid._id, {
                  banType: 'permanent'
                }).catch(err => console.error('Error migrating legacy ban:', err));
              }
            }
            this.banned = isBanned;

            // Also block users who need to change their name
            this.pendingNameChange = valid.pendingNameChange;
            if (this.pendingNameChange) {
              this.banned = true; // Treat as banned for gameplay purposes
            }

            this.league = getLeague(this.elo).name;
            this.send({
            type: 'verify'
          });
          this.send({
            type: 'cnt',
            c: players.size-disconnectedPlayers.size
          })

          // Always update lastLogin on verify
          const updateFields = { lastLogin: Date.now() };
          
          if (json.tz && isValidTimezone(json.tz)) {
            const existingTimeZone = valid.timeZone;
            let streak = valid.streak;

            const lastLoginUTC = valid.lastLogin;
            const userTimezoneDay = moment().tz(json.tz).startOf('day');
            const lastLoginUserTimezone = moment.tz(lastLoginUTC, existingTimeZone).startOf('day');

            if (userTimezoneDay.diff(lastLoginUserTimezone, 'days') === 1) {
              streak++;
              this.send({
                type: 'streak',
                streak
              })
            } else if(userTimezoneDay.diff(lastLoginUserTimezone, 'days') > 1) {
              streak = 0;
              this.send({
                type: 'streak',
                streak
              })
            }
            if(!valid.firstLoginComplete) {
              streak = 1;
              this.send({
                type: 'streak',
                streak
              })
            }

            updateFields.timeZone = json.tz;
            updateFields.streak = streak;
            updateFields.firstLoginComplete = true;
          }
          
          await User.updateOne({_id: this.accountId}, updateFields);

          this.friends = valid.friends.map((id)=>({id}));
          this.sentReq = valid.sentReq.map((id)=>({id}));
          this.receivedReq = valid.receivedReq.map((id)=>({id}));

          const friendsWithNames = [];
          // player.friends = valid.friends;
          for(let id of valid.friends) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              friendsWithNames.push({name: user.username, id, supporter: user.supporter});
            }
          }
          this.friends = friendsWithNames;

          const sentReqWithNames = [];
          for(let id of valid.sentReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              sentReqWithNames.push({name: user.username, id, supporter: user.supporter});
            }
          }
          this.sentReq = sentReqWithNames;

          const receivedReqWithNames = [];
          for(let id of valid.receivedReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              receivedReqWithNames.push({name: user.username, id, supporter: user.supporter});
            }
          }
          this.receivedReq = receivedReqWithNames;

          this.allowFriendReq = valid.allowFriendReq;

        } else {
          this.send({
            type: 'error',
            message: 'Failed to login',
            failedToLogin: true
          });
          this.ws.close();
          console.log('Failed to login:', this.ip);
        }
      }
  }
  send(json) {
    if(!this.ws) return;
    if(this.disconnected) return;
    // this.ws.send(JSON.stringify(json));
    // uws send

    try {
    // convert json to string
    const str = JSON.stringify(json);
    // convert string to array buffer
    const buffer = new TextEncoder().encode(str);
    // send array buffer
    this.ws.send(buffer);
    } catch(e) {
      console.log('Error sending message to player', this.id, e.message, json);

      // if the error is invalid access error, close the connection
      if(e.message.includes('Invalid access of closed')) {
        console.log('Closing ws due to invalid access error');
        this.disconnected = true;
        this.disconnectTime = Date.now();
        disconnectedPlayers.set(this.accountId||this.rejoinCode, this.id);

      }
    }
  }
  setScreen(screen) {
    const validScreens = ["home", "singleplayer", "multiplayer"];
    if(validScreens.includes(screen)) {
      this.screen = screen;
    }
  }
  sendFriendData() {
  if(!this.accountId) {
    return;
  }

  let friends = this.friends;

  // check if online
  for(const f of friends) {
    const player = Array.from(players.values()).find((p) => p.accountId === f.id);
    if(player) {
      f.online = true;
      f.socketId = player.id;
    } else {
      f.online = false;
    }
  }

  const data = {
    type: 'friends',
    friends,
    sentRequests: this.sentReq,
    receivedRequests: this.receivedReq,
    allowFriendReq: this.allowFriendReq
  };
  this.send(data);
}

}