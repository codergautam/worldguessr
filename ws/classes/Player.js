import validateSecret from "../../serverUtils/validateSecret.js";
import make6DigitCode from "../../serverUtils/make6DigitCode.js";
import isValidTimezone from "../../serverUtils/isValidTimezone.js";
import moment from "moment";
import { disconnectedPlayers, games, players } from "../../serverUtils/states.js";
import User from "../../models/User.js";
import { getLeague } from "../../components/utils/leagues.js";
import { setElo } from "../../api/eloRank.js";
import { createUUID } from "../../components/createUUID.js";
import { getActivePlayerCount } from "../../serverUtils/playerCounts.js";
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
    this.verified = false;
    this.supporter = false;
    this.screen = "home";
    this.league = null;

    this.friends = []; // { id (accountId), online, socketId (id), name }
    this.sentReq = [];
    this.receivedReq = [];
    this.allowFriendReq = true;
    this.hideLastSeen = false;

    this.platform = "empty";
    // Client announced team capability in verify. Pre-rollout web bundles and
    // the mobile app never send the flag, which is what locks them out of
    // team parties / 2v2 duels while those features roll out.
    this.teamSupport = false;

    this.disconnected = false;
    this.disconnectTime =0;

    // Server-driven duel bot (ws stays null). Gates the tickBots lifecycle
    // sweep + guess driver, and exempts them from human-only paths
    // (player counts, restart-recovery reconnect bookkeeping).
    this.isBot = false;

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
      platform: this.platform,
      teamSupport: this.teamSupport,
      // Must survive gamestate restarts: a restored bot that loses this flag
      // becomes a permanent zombie (never guesses, never reaped).
      isBot: this.isBot,
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
    // Track client platform (max 20 chars, default "empty")
    if (typeof json.platform === 'string' && json.platform.length <= 20) {
      this.platform = json.platform;
    }

    // Monotonic within a session: home.js fires a second verify (session
    // effect) without the flag — that must not demote a client that already
    // announced support. Cross-client demotion happens via the reconnect
    // re-stamp below instead.
    if (json.teamSupport === true) {
      this.teamSupport = true;
    }

    const handleReconnect = async (dcPlayerId, rejoinCode, accountId = null) => {
      const dcPlayer = players.get(dcPlayerId);
      if(dcPlayer && this.ws) {

      // Re-check ban status from database on reconnect
      // This ensures users banned/forced to change name while disconnected are properly blocked
      if (accountId) {
        try {
          const freshUserData = await User.findById(accountId).select('banned banType banExpiresAt pendingNameChange countryCode username');
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
            // Re-stamp the username: setName happens over HTTP mid-session
            // (the first-run username modal reloads the page right after), so
            // a Player that verified BEFORE the name was chosen reattaches
            // here still unnamed — and blockUnnamed would keep it out of
            // every game (breaking the parked ?party= auto-join). Guarded so
            // a doc without a name never wipes an existing one.
            if (freshUserData.username) {
              dcPlayer.username = freshUserData.username;
            }
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
      dcPlayer.platform = this.platform;
      // Re-stamp capability from the CURRENT socket's verify: the same rejoin
      // code can come back from a different bundle (e.g. a stale cached tab
      // reopening after a deploy), and the reused Player must describe the
      // client that is actually attached now.
      dcPlayer.teamSupport = this.teamSupport;


      dcPlayer.send({
        type: 'verify',
      });
      dcPlayer.send({
        type: 'cnt',
        c: getActivePlayerCount()
      });


      if(dcPlayer.gameId && games.has(dcPlayer.gameId)) {
        const game = games.get(dcPlayer.gameId);
        if (json.skipRejoin) {
          // Leave old game instead of rejoining (e.g. joining via party link)
          game.removePlayer(dcPlayer, true);
        } else if ((game.teamGame || game.is2v2Lobby || game.teamDuel) && !this.teamSupport) {
          // A pre-team client reconnecting into a team surface it can't render
          // (stale cached bundle after the rollout deploy, or a pre-unification
          // 2v2 tab surviving a server restart): eject instead of rejoin.
          // removePlayer's gameShutdown tears down any still-mounted game UI;
          // the sentence-as-key toast reads verbatim on clients whose locale
          // tables predate the rollout (their t() falls back to the key).
          game.removePlayer(dcPlayer);
          dcPlayer.send({ type: 'toast', key: 'Play team games on worldguessr.com for now', toastType: 'error' });
        } else {
          // reconnect to game
          game.rejoinGame(dcPlayer);
          dcPlayer.send({
            type: 'toast',
            toastType: 'success',
            key: 'reconnected',
          });
        }
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
            if(typeof json.rejoinCode === 'string' && json.rejoinCode.includes('-')) {
              // Only accept UUID format rejoinCodes (contain dashes), reject MongoDB ObjectIds
              const dcPlayerId = disconnectedPlayers.get(json.rejoinCode);
              if(dcPlayerId) {
                await handleReconnect(dcPlayerId, json.rejoinCode);
                return;
              }
              // Race fallback (mirrors the logged-in "uac" path for guests): on a
              // fast refresh the new socket's verify can arrive BEFORE the old
              // socket's close fires, so the old session is still live in `players`
              // and not yet in disconnectedPlayers. Find it by rejoinCode, kick the
              // stale socket, and reconnect to it — otherwise we'd mint a brand-new
              // guest and strand them (e.g. dumped out of a 2v2 lobby to home).
              for (const p of players.values()) {
                if (p.id !== this.id && p.rejoinCode === json.rejoinCode) {
                  try { p.send({ type: 'error', message: 'uac' }); } catch(e){}
                  try { p.ws?.close(); } catch(e){}
                  await handleReconnect(p.id, json.rejoinCode);
                  return;
                }
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
            c: getActivePlayerCount()
          })
        }

        } else {

        let valid;
        if(json.secret) {
          console.log('validating secret', json.secret);
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
            c: getActivePlayerCount()
          })

          // Always update lastLogin on verify (lastSeen too — the disconnect
          // handler keeps it fresh afterwards, this covers crash-without-close)
          const updateFields = { lastLogin: Date.now(), lastSeen: Date.now() };
          
          if (json.tz && isValidTimezone(json.tz)) {
            const existingTimeZone = valid.timeZone;
            let streak = valid.streak;

            const lastLoginUTC = valid.lastLogin;
            const userTimezoneDay = moment().tz(json.tz).startOf('day');
            const lastLoginUserTimezone = moment.tz(lastLoginUTC, existingTimeZone).startOf('day');

            if (userTimezoneDay.diff(lastLoginUserTimezone, 'days') === 1) {
              streak++;
              // Only CONTINUATIONS (2+) get a toast: a 0→1 bump is a fresh
              // start, and the "streak started" toast is gone (removed
              // server-side like streakLost, so old bundles stop showing it
              // too — pure noise on login).
              if (streak > 1) {
                this.send({
                  type: 'streak',
                  streak
                })
              }
            } else if(userTimezoneDay.diff(lastLoginUserTimezone, 'days') > 1) {
              // Streak still resets, but SILENTLY — no message means no
              // client renders the streakLost toast (removed server-side so
              // old bundles stop showing it too). Greeting a returning
              // player with "you lost your streak" was a kick in the teeth.
              streak = 0;
            }
            if(!valid.firstLoginComplete) {
              // Starts the streak silently — see the no-toast-on-start rule.
              streak = 1;
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
          this.hideLastSeen = !!valid.hideLastSeen;

        } else {
          console.log('failed to login', json.secret);
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
  // async (DB reads for last-seen), but every call site is fire-and-forget —
  // the whole body is try/caught so a DB blip can never become an
  // unhandledRejection.
  async sendFriendData() {
  if(!this.accountId) {
    return;
  }

  try {
  let friends = this.friends;

  // check if online — only a LIVE socket counts. Disconnected players linger
  // in `players` for the ~30s rejoin grace window with disconnected=true and
  // must not read as online (they can't receive invites either way).
  for(const f of friends) {
    const player = Array.from(players.values()).find((p) => p.accountId === f.id && !p.disconnected);
    if(player) {
      f.online = true;
      f.socketId = player.id;
    } else {
      f.online = false;
      f.socketId = null;
    }
  }

  // "Offline · last seen X ago": read offline friends' lastSeen fresh from the
  // DB — it's written on every disconnect (ws.js close) and verify, so it stays
  // accurate no matter how long ago they left (the in-memory friend objects
  // hydrated at OUR verify would go stale). Friends who opted out
  // (hideLastSeen, profile setting) just read as plain offline — enforced here
  // so their timestamp never leaves the server.
  const offlineFriends = friends.filter((f) => !f.online);
  if (offlineFriends.length > 0) {
    // .lean() is load-bearing: hydration applies schema defaults, so a dormant
    // user with no stored lastLogin would read as Date.now() and show
    // "last seen just now". Lean returns only what's actually stored.
    const docs = await User.find({ _id: { $in: offlineFriends.map((f) => f.id) } })
      .select('lastSeen hideLastSeen lastLogin')
      .lean();
    const docById = new Map(docs.map((d) => [d._id.toString(), d]));
    for (const f of offlineFriends) {
      const doc = docById.get(f.id);
      // Real presence stamps only: disconnect stamp → last session start.
      // A user with neither just shows plain "Offline" — created_at is NOT a
      // fallback (account age masquerading as presence would be a lie).
      const seen = doc && !doc.hideLastSeen ? (doc.lastSeen || doc.lastLogin) : null;
      f.lastSeen = seen ? new Date(seen).getTime() : null;
    }
  }
  // online friends have nothing to show — never leave a stale value behind
  for (const f of friends) {
    if (f.online) f.lastSeen = null;
  }

  const data = {
    type: 'friends',
    friends,
    sentRequests: this.sentReq,
    receivedRequests: this.receivedReq,
    // Own account-settings values: the authoritative echo the settings UIs
    // reconcile against (in-memory copies only change AFTER a DB write sticks,
    // and every set* attempt — accepted or rejected — triggers this push).
    allowFriendReq: this.allowFriendReq,
    hideLastSeen: this.hideLastSeen
  };
  this.send(data);
  } catch (e) {
    console.error('Error sending friend data', this.id, e?.message || e);
  }
}

}
