export function getServerSecret(req) {

  // its in headers Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    return token;
  }


  return null;
}