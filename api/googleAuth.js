import { createUUID } from "../components/createUUID.js";
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'postmessage');

/**
 * Check and handle temp ban expiration
 * Also handles migration of legacy banned users (banned: true but no banType)
 * Returns the user with updated ban status if expired
 */
async function checkTempBanExpiration(user) {
  const userObj = user.toObject ? user.toObject() : user;
  
  // Handle legacy banned users - if banned is true but banType is missing/none,
  // treat as permanent ban (migration from old system)
  if (userObj.banned && (!userObj.banType || userObj.banType === 'none')) {
    // Migrate to new system - mark as permanent ban
    await User.findByIdAndUpdate(user._id, {
      banType: 'permanent'
    });
    return {
      ...userObj,
      banType: 'permanent'
    };
  }
  
  // Check if temp ban has expired
  if (userObj.banned && userObj.banType === 'temporary' && userObj.banExpiresAt) {
    const now = new Date();
    if (now >= new Date(userObj.banExpiresAt)) {
      // Temp ban has expired - auto unban
      await User.findByIdAndUpdate(user._id, {
        banned: false,
        banType: 'none',
        banExpiresAt: null
      });
      // Return updated status
      return {
        ...userObj,
        banned: false,
        banType: 'none',
        banExpiresAt: null
      };
    }
  }
  
  return userObj;
}

export default async function handler(req, res) {
  let output = {};
  // only accept post
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code, secret } = req.body;
  if (!code) {
    if(!secret) {
      return res.status(400).json({ error: 'Invalid' });
    }

    const userDb = await User.findOne({
      secret,
    }).select("_id secret username email staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote").cache(120, `userAuth_${secret}`);
    
    if (userDb) {
      // Check if temp ban has expired
      const checkedUser = await checkTempBanExpiration(userDb);
      
      output = { 
        secret: checkedUser.secret, 
        username: checkedUser.username, 
        email: checkedUser.email, 
        staff: checkedUser.staff, 
        canMakeClues: checkedUser.canMakeClues, 
        supporter: checkedUser.supporter, 
        accountId: checkedUser._id,
        // Ban info (public note only - internal reason never exposed)
        banned: checkedUser.banned,
        banType: checkedUser.banType || 'none',
        banExpiresAt: checkedUser.banExpiresAt,
        banPublicNote: checkedUser.banPublicNote || null,
        // Pending name change (public note only - internal reason never exposed)
        pendingNameChange: checkedUser.pendingNameChange,
        pendingNameChangePublicNote: checkedUser.pendingNameChangePublicNote || null
      };
      
      if(!checkedUser.username || checkedUser.username.length < 1) {
        // try again without cache, to prevent new users getting stuck with no username
        const userDb2 = await User.findOne({
          secret,
        }).select("_id secret username email staff canMakeClues supporter banned banType banExpiresAt banPublicNote pendingNameChange pendingNameChangePublicNote");
        
        if(userDb2) {
          const checkedUser2 = await checkTempBanExpiration(userDb2);
          output = { 
            secret: checkedUser2.secret, 
            username: checkedUser2.username, 
            email: checkedUser2.email, 
            staff: checkedUser2.staff, 
            canMakeClues: checkedUser2.canMakeClues, 
            supporter: checkedUser2.supporter, 
            accountId: checkedUser2._id,
            banned: checkedUser2.banned,
            banType: checkedUser2.banType || 'none',
            banExpiresAt: checkedUser2.banExpiresAt,
            banPublicNote: checkedUser2.banPublicNote || null,
            pendingNameChange: checkedUser2.pendingNameChange,
            pendingNameChangePublicNote: checkedUser2.pendingNameChangePublicNote || null
          };
        }
      }

      return res.status(200).json(output);
    } else {
      return res.status(400).json({ error: 'Invalid' });
    }

  } else {
    // first login
    try {
      // verify the access token
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });

      if(!ticket) {
        return res.status(400).json({ error: 'Invalid token verification' });
      }

      const email = ticket.getPayload()?.email;

      if (!email) {
        return res.status(400).json({ error: 'No email in token' });
      }

      const existingUser = await User.findOne({ email });
      let secret = null;
      if (!existingUser) {
        secret = createUUID();
        const newUser = new User({ email, secret });
        await newUser.save();

        output = { 
          secret: secret, 
          username: undefined, 
          email: email, 
          staff: false, 
          canMakeClues: false, 
          supporter: false, 
          accountId: newUser._id,
          banned: false,
          banType: 'none',
          banExpiresAt: null,
          banPublicNote: null,
          pendingNameChange: false,
          pendingNameChangePublicNote: null
        };
      } else {
        // Check if temp ban has expired for existing user
        const checkedUser = await checkTempBanExpiration(existingUser);
        
        output = { 
          secret: checkedUser.secret, 
          username: checkedUser.username, 
          email: checkedUser.email, 
          staff: checkedUser.staff, 
          canMakeClues: checkedUser.canMakeClues, 
          supporter: checkedUser.supporter, 
          accountId: checkedUser._id,
          banned: checkedUser.banned,
          banType: checkedUser.banType || 'none',
          banExpiresAt: checkedUser.banExpiresAt,
          banPublicNote: checkedUser.banPublicNote || null,
          pendingNameChange: checkedUser.pendingNameChange,
          pendingNameChangePublicNote: checkedUser.pendingNameChangePublicNote || null
        };
      }

      return res.status(200).json(output);
    } catch (error) {
      console.error('Google OAuth error:', error.message);
      return res.status(400).json({ error: 'Authentication failed' });
    }
  }

}
