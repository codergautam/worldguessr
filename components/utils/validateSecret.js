export default async function validateSecret(secret, User) {
  const user = await User.findOne({
    secret
  });
  if (user) {
    return user
  } else {
    return null
  }
}
