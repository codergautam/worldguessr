import validateSecret from "../../serverUtils/validateSecret.js";
import make6DigitCode from "../../serverUtils/make6DigitCode.js";
import isValidTimezone from "../../serverUtils/isValidTimezone.js";
import moment from "moment";
import { players } from "../../serverUtils/states.js";
import User from "../../models/User.js";
export default class Player {
  constructor(ws, id) {
    this.id = id;
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

    this.friends = []; // { id (accountId), online, socketId (id), name }
    this.sentReq = [];
    this.receivedReq = [];
    this.allowFriendReq = true;
  }
  async verify(json) {
        // account verification
        if((!json.secret) ||(json.secret === 'not_logged_in')) {
          if(!this.verified) {

          // guest mode
          this.username = 'Guest #' + make6DigitCode().toString().substring(0, 4);
          this.verified = true;

          this.send({
            type: 'verify',
            guestName: this.username
          });
          this.send({
            type: 'cnt',
            c: players.size
          })
          console.log('Guest joined', this.id, this.username);
        }

        } else {

        let valid;
        console.log('Verifying user', this.id, json);
        if(json.secret) {
        valid =  await validateSecret(json.secret, User);
        }
        if (valid) {
          // make sure the user is not already logged in (only on prod)
            for (const p of players.values()) {
              if (p.accountId === valid._id.toString()) {
                this.send({
                  type: 'error',
                  message: 'uac'
                });
                this.ws.close();
                console.log('User already connected', this.id, valid.username);
                return;
              }
            }
            this.verified = true;
            this.supporter = valid.supporter;
            this.username = valid.username;
            this.accountId = valid._id.toString();
            this.send({
            type: 'verify'
          });
          this.send({
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
              console.log(`User ${this.accountId} has logged in after a day.`);
              streak++;
              this.send({
                type: 'streak',
                streak
              })
            } else if(userTimezoneDay.diff(lastLoginUserTimezone, 'days') > 1) {
              console.log(`User ${this.accountId} lost their streak`);
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

            await User.updateOne({_id: this.accountId}, {timeZone: json.tz, lastLogin: Date.now(), streak, firstLoginComplete: true})
          }

          this.friends = valid.friends.map((id)=>({id}));
          this.sentReq = valid.sentReq.map((id)=>({id}));
          this.receivedReq = valid.receivedReq.map((id)=>({id}));

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
          console.timeEnd("friendsNames")

          this.allowFriendReq = valid.allowFriendReq;

          console.log('User verified', this.id, valid.username, this.sentReq, json?.tz);
        } else {
          this.send({
            type: 'error',
            message: 'Failed to login',
            failedToLogin: true
          });
          console.log('Failed to verify user', this.id);
          this.ws.close();
        }
      }
  }
  send(json) {
    if(!this.ws) return;
    // this.ws.send(JSON.stringify(json));
    // uws send

    // convert json to string
    const str = JSON.stringify(json);
    // convert string to array buffer
    const buffer = new TextEncoder().encode(str);
    // send array buffer
    this.ws.send(buffer);
  }
  setScreen(screen) {
    console.log('Setting screen', screen, this.username, this.id);
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