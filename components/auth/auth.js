import { useGoogleLogin } from "@react-oauth/google";
import { inIframe } from "../utils/inIframe";
import { toast } from "react-toastify";

// secret: userDb.secret, username: userDb.username, email: userDb.email, staff: userDb.staff, canMakeClues: userDb.canMakeClues, supporter: userDb.supporter
let session = false;
// null = not logged in
// false = session loading/fetching

export function signOut() {
  window.localStorage.removeItem("wg_secret");
  session = null;
  window.location.reload();
}

export function signIn() {
  console.log("Signing in");


  if(inIframe()) {
    console.log("In iframe");
    // open site in new window
    const url = window.location.href;
    window.open(url, '_blank');
  }

  if(!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    toast.error("Google client ID not set");
    return;
  }
  
    window.login();

}

export function useSession() {
  if(typeof window === "undefined") {
    return {
      data: false
    }
  }

  if(session === false && !window.fetchingSession) {
    let secret = null;
    try {

      secret = window.localStorage.getItem("wg_secret");

    } catch (e) {
      console.error(e);
    }
    if(secret) {

    window.fetchingSession = true;

    fetch(window.cConfig?.apiUrl+"/api/googleAuth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secret }),
    })
      .then((res) => res.json())
      .then((data) => {
        window.fetchingSession = false;
        if (data.error) {
          console.error(data.error);
          return;
        }

        if (data.secret) {
          window.localStorage.setItem("wg_secret", data.secret);
          session = {token: data};
        } else {
          session = null;
        }
      })
      .catch((e) => {
        window.fetchingSession = false;
        console.error(e);
      });
    } else {
      session = null;
    }
  }


  return {
    data: session
  }
}