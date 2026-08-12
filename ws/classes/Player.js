import validateSecret from "../../serverUtils/validateSecret.js";
import make6DigitCode from "../../serverUtils/make6DigitCode.js";
import isValidTimezone from "../../serverUtils/isValidTimezone.js";
import moment from "moment";
import { disconnectedPlayers, games, players } from "../../serverUtils/states.js";
import User from "../../models/User.js";
import { getLeague } from "../../components/utils/leagues.js";
import { setElo } from "../../api/eloRank.js";
import { MIN_ELO, clampRating } from "../../components/utils/eloSystem.js";
import { RATING_V2 } from "../../components/utils/ratingFlags.js";
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
    this.lastTypingPing = 0;
    this.verified = false;
    this.screen = "home";
    this.league = null;

    this.friends = []; // { id (accountId), online, socketId (id), name }
    this.sentReq = [];
    this.receivedReq = [];
    this.allowFriendReq = true;
    this.hideLastSeen = false;
    // Voyager+ ranked preference — see models/User.js. Stored regardless of
    // league; ELIGIBILITY (elo >= voyager floor) is checked where it's used,
    // at queue join, so ranking up/down needs no settings write. True matches
    // the schema default (default-ON, user ruling July 27); guests can never
    // be strict anyway (no elo passes the queue gate).
    this.strictMatchmaking = true;

    this.platform = "empty";
    // Client announced team capability in verify. Pre-rollout web bundles and
    // the mobile app never send the flag, which is what locks them out of
    // team parties / 2v2 duels while those features roll out.
    this.teamSupport = false;

    this.disconnected = false;
    this.disconnectTime =0;

    // Location ids served to this player in recent duels, oldest first (see
    // shared/locations/repeatGuard.js). Capped at SERVER_CAP = 10 matches,
    // measured at ~1.1KB per player, and it dies with the Player. The
    // matchmaker unions both sides' rings so back-to-back duels cannot land on
    // the same spot. In memory only: nothing about it is persisted or sent.
    this.recentLocs = [];

    // Server-driven duel bot (ws stays null). Gates the tickBots lifecycle
    // sweep + guess driver, and exempts them from human-only paths
    // (player counts, restart-recovery reconnect bookkeeping).
    this.isBot = false;

    // ── RATING V2 ──────────────────────────────────────────────────────────
    // Count of RATED games (see models/User.js). Drives the v2 K schedule, and
    // it is read off this object at match creation so the matchmaker never
    // pays a DB round trip per pairing. 0 is the schema default and the
    // correct value for bots and guests.
    this.ratedGames = 0;
    // Tri-state, and the third state is load-bearing: undefined means "the
    // read is still IN FLIGHT". chooseDuelPairs holds undefined out of pairing
    // for a tick rather than treating it as "not pending" — an unplaced rating
    // in the pool is a garbage match. botUtils.refreshBotEligibility stamps a
    // resolved boolean on EVERY outcome (missing doc / DB error → false).
    this.placementPending = undefined;

    // ── COSMETICS ──────────────────────────────────────────────────────────
    // Equipped items, mirrored in memory so the game roster and the emote
    // ownership check never hit the DB on a hot path. Re-stamped on verify, on
    // reconnect, and by the /cosmetics-updated push endpoint in ws.js.
    this.nameGlow = null;
    this.markerSkin = null;
    // Owned skus (cosmetics.owned). The emote handler checks paid emotes
    // against this; an empty array denies every paid emote, which is the right
    // failure direction.
    this.ownedCosmetics = [];

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
      // Same bug class as isBot: a restored player who loses ratedGames drops
      // to 0 and silently gets the K_NEW factor (40) again after every deploy,
      // so a veteran's rating starts swinging like a rookie's. Cosmetics have
      // the milder version of it — a restored player renders with no glow and
      // loses their paid emotes until the next verify.
      ratedGames: this.ratedGames,
      nameGlow: this.nameGlow,
      markerSkin: this.markerSkin,
      ownedCosmetics: this.ownedCosmetics,
      // NOT persisted on purpose: placementPending must re-read from the DB
      // after a restart. undefined ("read in flight") is the safe restored
      // value — chooseDuelPairs holds it out until the next queue join stamps
      // a resolved answer.
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
    // Keep the in-memory rating on the same floor the DB write enforces —
    // 0 is falsy and would void this player's next ranked queue/matchup.
    // v2 floors at RATING_FLOOR (100) via clampRating, matching setElo in
    // api/eloRank.js; v1 keeps MIN_ELO (1) byte-for-byte.
    newElo = RATING_V2 ? clampRating(newElo) : Math.max(MIN_ELO, Math.round(newElo));
    this.elo = newElo;
    this.league = getLeague(newElo).name;

    // MIRROR THE DB $inc, OR THE K SCHEDULE NEVER STEPS.
    //
    // api/eloRank.js setElo() increments `ratedGames` on the document for every
    // rated game. Nothing was incrementing it HERE, and here is what the
    // matchmaker actually reads: ws.js stampRatingV2() takes its K inputs from
    // `p1.ratedGames` / `p2.ratedGames` on these in-memory Player objects,
    // precisely so pairing costs no database round trip.
    //
    // The field was only ever written at verify() and on the reconnect refresh,
    // so it was pinned to its login value for the whole session. A player
    // sitting at 29 rated games who played 100 in one sitting played ALL of
    // them at K_NEW (40) instead of stepping to K_MID at 31 and K_VET at 101 —
    // four times the intended volatility, for as long as the socket stayed up.
    // Migrated veterans backfilled to 70 never reached K_VET without
    // reconnecting.
    //
    // Zero-sum was never at risk (pairK hands both sides the same K), but the
    // taper is the entire point of the schedule.
    //
    // Placements and bot games do NOT come through here — they book counters
    // via Game.applyUnratedCounters() with rated:false — so this matches the
    // `rated` default in api/eloRank.js: rated unless the caller says otherwise.
    if (RATING_V2 && (gameData?.rated ?? true)) {
      this.ratedGames = (Number(this.ratedGames) || 0) + 1;
    }

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

      // They came back inside the grace window, so the dodge latched when their
      // socket closed was a connection blip, not an abandonment. Clear it before
      // anything else can await: the purge charges this latch, and a slow
      // ban-check below must not leave a window where it still looks armed.
      //
      // No exploit here — clearing it requires actually rejoining the game,
      // which is the outcome the dodge penalty exists to encourage.
      dcPlayer.pendingDodge = false;

      // Re-check ban status from database on reconnect
      // This ensures users banned/forced to change name while disconnected are properly blocked
      if (accountId) {
        try {
          // ratedGames / cosmetics / elo are on this select for a reason: a
          // purchase or a rating change that lands MID-SESSION lives only on
          // the Player object, and the reconnect path REPLACES that object's
          // state from this doc. Leaving them off silently reverted a bought
          // glow and reset the K-factor input on the first reconnect.
          const freshUserData = await User.findById(accountId).select('banned banType banExpiresAt pendingNameChange countryCode username ratedGames cosmetics elo');
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
            // Rating + cosmetics re-stamp (same "the DB is the truth on
            // reattach" rule as countryCode/username above). Guarded with ??
            // so a doc predating a field can never wipe a live value.
            dcPlayer.ratedGames = freshUserData.ratedGames ?? dcPlayer.ratedGames ?? 0;
            if (freshUserData.elo !== undefined && freshUserData.elo !== null) {
              dcPlayer.elo = freshUserData.elo;
              dcPlayer.league = getLeague(freshUserData.elo).name;
            }
            if (freshUserData.cosmetics) {
              dcPlayer.nameGlow = freshUserData.cosmetics.equipped?.nameGlow ?? null;
              dcPlayer.markerSkin = freshUserData.cosmetics.equipped?.markerSkin ?? null;
              dcPlayer.ownedCosmetics = freshUserData.cosmetics.owned ?? [];
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
      } else if (dcPlayer.gameId) {
        // The game died while they were away (lobby dissolved into a match,
        // pregame cancel, purge race). This reused Player object is about to
        // become the live session — a dangling id here rides through every
        // future refresh and silently gates all queue/create entries.
        dcPlayer.gameId = null;
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
              // Repeated verifies arrive on the SAME socket (CG auth listener
              // refires, home.js session effect) — matching our own entry here
              // would uac-kick the player's live connection.
              if (p.id === this.id) continue;
              if (p.accountId === valid._id.toString()) {
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
                // handleReconnect adopted the old session onto this socket and
                // deleted `this` from players. Falling through would verify the
                // orphaned object a second time — and with multiple same-account
                // entries, revive each of them onto this one socket: every extra
                // revival stays flagged connected forever and inflates the
                // online count.
                return;
              }
            }
            this.verified = true;
            this.username = valid.username;
            this.accountId = valid._id.toString();
            this.countryCode = valid.countryCode;
            this.elo = valid.elo;
            // serverUtils/validateSecret.js does a bare findOne with NO
            // .select(), so the whole doc is already here — these are free.
            this.ratedGames = valid.ratedGames ?? 0;
            this.nameGlow = valid.cosmetics?.equipped?.nameGlow ?? null;
            this.markerSkin = valid.cosmetics?.equipped?.markerSkin ?? null;
            this.ownedCosmetics = valid.cosmetics?.owned ?? [];

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

          // `nameGlow` on all three lists costs NOTHING here — these loops
          // already fetch the whole user document, so it is a property read on
          // data that has been in memory all along. For the FRIENDS list this is
          // only the seed: sendFriendsData re-resolves it on every push (live
          // Player for online, the lastSeen lookup for offline), so a friend who
          // equips mid-session updates without either of you reconnecting.
          // The two REQUEST lists keep the value latched here, which is right —
          // they change only when a request is sent or answered, and both of
          // those re-hydrate this block.
          const friendsWithNames = [];
          // player.friends = valid.friends;
          for(let id of valid.friends) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              friendsWithNames.push({name: user.username, id, nameGlow: user.cosmetics?.equipped?.nameGlow ?? null});
            }
          }
          this.friends = friendsWithNames;

          const sentReqWithNames = [];
          for(let id of valid.sentReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              sentReqWithNames.push({name: user.username, id, nameGlow: user.cosmetics?.equipped?.nameGlow ?? null});
            }
          }
          this.sentReq = sentReqWithNames;

          const receivedReqWithNames = [];
          for(let id of valid.receivedReq) {
            id = id.toString();
            const user = await User.findById(id);
            if(user && user.username) {
              receivedReqWithNames.push({name: user.username, id, nameGlow: user.cosmetics?.equipped?.nameGlow ?? null});
            }
          }
          this.receivedReq = receivedReqWithNames;

          this.allowFriendReq = valid.allowFriendReq;
          this.hideLastSeen = !!valid.hideLastSeen;
          this.strictMatchmaking = !!valid.strictMatchmaking;

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
      // Live copy beats the verify-time seed: an online friend's Player is
      // what /cosmetics-updated/ writes to, so an equip they make right now
      // shows up on your friends list at the next push.
      f.nameGlow = player.nameGlow ?? null;
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
    // One more projected field on a query this block already makes: an offline
    // friend's equipped glow, refreshed on every push so the list never shows a
    // sku they took off days ago. hideLastSeen deliberately does NOT gate it —
    // that setting hides PRESENCE, and a cosmetic is public on every board and
    // profile in the app.
    const docs = await User.find({ _id: { $in: offlineFriends.map((f) => f.id) } })
      .select('lastSeen hideLastSeen lastLogin cosmetics.equipped.nameGlow')
      .lean();
    const docById = new Map(docs.map((d) => [d._id.toString(), d]));
    for (const f of offlineFriends) {
      const doc = docById.get(f.id);
      f.nameGlow = doc?.cosmetics?.equipped?.nameGlow ?? null;
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
    hideLastSeen: this.hideLastSeen,
    strictMatchmaking: this.strictMatchmaking
  };
  this.send(data);
  } catch (e) {
    console.error('Error sending friend data', this.id, e?.message || e);
  }
}

}
