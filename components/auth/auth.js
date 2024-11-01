import { inIframe } from "../utils/inIframe";
import { toast } from "react-toastify";

// secret: userDb.secret, username: userDb.username, email: userDb.email, staff: userDb.staff, canMakeClues: userDb.canMakeClues, supporter: userDb.supporter
let session = false;
// null = not logged in
// false = session loading/fetching

export function signOut() {
  window.localStorage.removeItem("wg_secret");
  session = null;
  if(window.dontReconnect) {
    return;
  }

  // remove all cookies
  console.log("Removing cookies");
  (function () {
    var cookies = document.cookie.split("; ");
    for (var c = 0; c < cookies.length; c++) {
        var d = window.location.hostname.split(".");
        while (d.length > 0) {
            var cookieBase = encodeURIComponent(cookies[c].split(";")[0].split("=")[0]) + '=; expires=Thu, 01-Jan-1970 00:00:01 GMT; domain=' + d.join('.') + ' ;path=';
            var p = location.pathname.split('/');
            document.cookie = cookieBase + '/';
            while (p.length > 0) {
                document.cookie = cookieBase + p.join('/');
                console.log(cookieBase + p.join('/'));
                p.pop();
            };
            d.shift();
        }
    }
})();

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

  // check if crazygames
  if(window.location.hostname.includes("crazygames")) {

    if(window.verifyPayload && JSON.parse(window.verifyPayload).secret === "not_logged_in") {
      // not loading
      return {
        data: null
      }
    }
  }

  if(session === false && !window.fetchingSession && window.cConfig?.apiUrl) {
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

export function getHeaders() {
  let secret = null;
  if(session && session?.token?.secret) {
    secret = session.secret;
  } else {
    try {
      secret = window.localStorage.getItem("wg_secret");
    } catch (e) {
      console.error(e);
    }
  }
  if(!secret) {
    return {};
  }
  return {
    Authorization: "Bearer "+secret
  }
}