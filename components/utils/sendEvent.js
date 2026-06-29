import getPlatform from "./getPlatform";

export default function sendEvent(name, params={}) {
  try {
    window.gtag("event", name, { platform: getPlatform(), ...params });
  } catch (e) {
    console.log("error sending gtag event", e);
  }
}
