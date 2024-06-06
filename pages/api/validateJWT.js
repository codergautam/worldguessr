import { getServerSession } from "next-auth"
import { authOptions } from "./auth/[...nextauth]"
import { decrypt, encrypt } from "@/components/utils/encryptDecrypt";
import User from "@/models/User";

export async function validateJWT(jwt) {
  let decrypted = null;
  try {
  decrypted = decrypt(jwt, process.env.NEXTAUTH_SECRET)
  } catch (e) {
    return null
  }
  const parts = decrypted.split(" ")
  const email = parts[0]
  const expiry = parts[1]
  if (expiry < Date.now()) {
    return null
  }
  // check if email is valid
  const user = await User.findOne({
    email,
  });
  if (user) {
    return true
  } else {
    return null
  }
}

export default async function handler(req, res) {
  const jwt = req.query.jwt;
  const user = await validateJWT(jwt)
  if (user) {
    res.status(200).json({ valid: true })
  } else {
    res.json({valid: false})
  }
}