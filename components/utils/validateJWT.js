// import User from "@/models/User";
// import User from "../../models/User";
// import { decrypt } from "./encryptDecrypt";

export default async function validateJWT(jwt, User, decrypt) {
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
