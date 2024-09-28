export default function sendEvent(name, params={}) {
  const windowAny = window;
  try {
    // gtag events
    windowAny.gtag("event",name,params)
  } catch (e) {
    console.log("error sending gtag event",e)
  }
}