export default function sendEvent(name, params={}) {
  try {
    window.gtag("event", name, params);
  } catch (e) {
    console.log("error sending gtag event", e);
  }
}