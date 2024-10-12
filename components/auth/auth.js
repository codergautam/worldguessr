import { inIframe } from "../utils/inIframe";

// secret: userDb.secret, username: userDb.username, email: userDb.email, staff: userDb.staff, canMakeClues: userDb.canMakeClues, supporter: userDb.supporter
const session = null;
// null = not logged in
// false = session loading/fetching

export function signOut() {
  console.log("Signing out");
}

export function signIn() {
  console.log("Signing in");

  if(inIframe()) {
    console.log("In iframe");
    // open site in new window
    const url = window.location.href;
    window.open(url, '_blank');
  }
}

export function useSession() {
  console.log("Using session");

  return {
    data: session
  }
}

export function getServerSession(req, res, authOptions) {
  console.log("Getting server session", req, res, authOptions);

  return null;
}