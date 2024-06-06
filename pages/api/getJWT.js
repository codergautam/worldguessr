import { getServerSession } from "next-auth"
import { authOptions } from "./auth/[...nextauth]"
import { encrypt } from "@/components/utils/encryptDecrypt";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (session) {
    // Signed in
    const email = session.user.email;
    const expiry = Date.now() + 60 * 60 * 1 * 1000; // 1 hour
    const jwt = encrypt(email+" "+expiry, process.env.NEXTAUTH_SECRET)
    res.status(200).json({ jwt })

  } else {
    // Not Signed in
    res.status(401)
  }
  res.end()
}