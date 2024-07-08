export default function sendEvent(name, params={}) {
  const windowAny = window;
  try {
    // gtag events
    console.log("sending gtag event",name,params)
    windowAny.gtag("event",name,params)
  } catch (e) {
    console.log("error sending gtag event",e)
  }
}