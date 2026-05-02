import { inIframe } from "../utils/inIframe";
import { toast } from "react-toastify";
import { fetchWithFallback } from "../utils/retryFetch";
import { useState, useEffect } from "react";
import { claimGuestProgressIfAny, resetClaimGuestProgressState } from "../../utils/claimGuestProgress";

// secret: userDb.secret, username: userDb.username, email: userDb.email, staff: userDb.staff, canMakeClues: userDb.canMakeClues, supporter: userDb.supporter
let session = false;
// null = not logged in
// false = session loading/fetching

// Listeners for session changes
const sessionListeners = new Set();
function notifySessionChange() {
  sessionListeners.forEach(listener => listener(session));
}

export function signOut() {
  window.localStorage.removeItem("wg_secret");
  // Guest id is cleared alongside the secret so a different account signing
  // in on the same device can't auto-absorb the previous user's orphaned
  // guest progress.
  window.localStorage.removeItem("wg_guest_id");
  // Drop any lingering claim result from this session — otherwise the next
  // sign-in would consume a stale cached result instead of firing a fresh
  // claim for the new guestId.
  resetClaimGuestProgressState();
  session = null;
  notifySessionChange();
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


  if(inIframe() && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION) {
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
  // sessionState is only used to trigger re-renders when session changes
  const [, setSessionState] = useState(session);

  // Subscribe to session changes
  useEffect(() => {
    const listener = (newSession) => {
      setSessionState(newSession);
    };
    sessionListeners.add(listener);
    return () => sessionListeners.delete(listener);
  }, []);

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

  if(session === false && !window.fetchingSession && (window.cConfig?.authUrl || window.cConfig?.apiUrl)) {
    let secret = null;
    try {

      secret = window.localStorage.getItem("wg_secret");

    } catch (e) {
      console.error(e);
    }
    if(secret) {

    window.fetchingSession = true;

    const authStartTime = performance.now();
    console.log(`[Auth] Starting authentication with retry mechanism (5s timeout, unlimited retries)`);

    fetchWithFallback(
      (window.cConfig?.authUrl || window.cConfig?.apiUrl) + "/api/googleAuth",
      window.cConfig?.apiUrl + "/api/googleAuth",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret }),
      },
      'googleAuth',
      {
        timeout: 5000,        // 5 second timeout
        maxRetries: Infinity, // Keep retrying until success
        baseDelay: 1000,      // Start with 1 second delay
        maxDelay: 10000       // Cap delay at 10 seconds
      }
    )
      .then((res) => res.json())
      .then((data) => {
        window.fetchingSession = false;
        const authDuration = (performance.now() - authStartTime).toFixed(0);
        console.log(`[Auth] Authentication successful (took ${authDuration}ms)`);

        if (data.error) {
          console.error(`[Auth] Server error:`, data.error);
          session = null;
          notifySessionChange();
          return;
        }

        if (data.secret) {
          window.localStorage.setItem("wg_secret", data.secret);
          session = {token: data};
          console.log(`[Auth] Session established for user:`, data.username);
          notifySessionChange();
          // Merge any pre-signin guest daily progress into this account
          // regardless of which page the user signed in from. The hook on the
          // Daily screen will see the cached result via the shared helper and
          // surface a toast. Fire-and-forget — failure shouldn't block auth.
          claimGuestProgressIfAny(data.secret).catch(() => {});
        } else {
          console.log(`[Auth] No session data received, user not logged in`);
          session = null;
          notifySessionChange();
        }
      })
      .catch((e) => {
        window.fetchingSession = false;
        const authDuration = (performance.now() - authStartTime).toFixed(0);
        console.error(`[Auth] Authentication failed (took ${authDuration}ms):`, e.message);

        // Clear potentially corrupted session data
        try {
          window.localStorage.removeItem("wg_secret");
        } catch (err) {
          console.warn(`[Auth] Could not clear localStorage:`, err);
        }

        session = null;
        notifySessionChange();
      });
    } else {
      session = null;
      notifySessionChange();
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