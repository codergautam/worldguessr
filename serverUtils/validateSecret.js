export default async function validateSecret(secret, User) {
  // Prevent NoSQL injection - secret must be a string
  if (typeof secret !== 'string') {
    return null;
  }

  const user = await User.findOne({
    secret
  });
  if (user) {
    return user
  } else {
    return null
  }
}
