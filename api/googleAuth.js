import { createUUID } from "../components/createUUID.js";
import User from "../models/User.js";
import { Webhook } from "discord-webhook-node";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  // only accept post
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { token } = req.body;
  console.log(token);
  if (!token) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // verify the Google token
  let decodedToken;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    decodedToken = payload;
  } catch (error) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  console.log(decodedToken);


}
