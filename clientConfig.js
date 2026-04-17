
export default function config() {
  const isHttps = window ? (window.location.protocol === "https:") : true;
const prefixHttp = (isHttps ? "https" : "http")+"://";
const prefixWs = (isHttps ? "wss" : "ws")+"://";


  return {
  "apiUrl": prefixHttp+(process.env.NEXT_PUBLIC_API_URL ??  "localhost:3001"),
  "authUrl": prefixHttp+(process.env.NEXT_PUBLIC_AUTH_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "localhost:3004"),
  "websocketUrl": prefixWs+(process.env.NEXT_PUBLIC_WS_HOST ?? process.env.NEXT_PUBLIC_API_URL ?? "localhost:3002")+'/wg',
  }
}