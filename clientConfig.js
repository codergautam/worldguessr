
export default function config() {
  const isHttps = window ? (window.location.protocol === "https:") : true;
const prefixHttp = (isHttps ? "https" : "http")+"://";
const prefixWs = (isHttps ? "wss" : "ws")+"://";


  // Staging via the cloudflared named tunnel `wg-staging`: the page is a
  // dev build (NEXT_PUBLIC_* unset → localhost fallbacks), but external
  // visitors can't reach localhost — route the backends through their own
  // staging hostnames, which the same tunnel maps to local ports 3001/3002/
  // 3004. Localhost dev is untouched by this branch.
  // (trycloudflare quick-tunnel hosts get the same treatment — the staging-*
  // backends are publicly reachable no matter which frontend host served
  // the page, so any ad-hoc tunnel link handed out stays fully functional.)
  if (typeof window !== "undefined" && (window.location.hostname === "staging.worldguessr.com" || window.location.hostname.endsWith(".trycloudflare.com"))) {
    return {
      "apiUrl": prefixHttp + "staging-api.worldguessr.com",
      "authUrl": prefixHttp + "staging-auth.worldguessr.com",
      "websocketUrl": prefixWs + "staging-ws.worldguessr.com/wg",
    }
  }

  return {
  "apiUrl": prefixHttp+(process.env.NEXT_PUBLIC_API_URL ??  "localhost:3001"),
  "authUrl": prefixHttp+(process.env.NEXT_PUBLIC_AUTH_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "localhost:3004"),
  "websocketUrl": prefixWs+(process.env.NEXT_PUBLIC_WS_HOST ?? process.env.NEXT_PUBLIC_API_URL ?? "localhost:3002")+'/wg',
  }
}