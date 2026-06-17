// postMessage protocol between the mobile WebView host and the chrome-less
// /embed/* web pages that render the real Leaflet maps (components/Map.js for
// the live map, components/ResultsMap.js for the all-rounds results map).
// Shared by web (@/shared/embed/protocol) and mobile (@shared/embed/protocol).

// Inbound: host (mobile / iframe parent) → embed page.
export const INBOUND = {
  INIT: "init", // { type, props } — full initial props
  UPDATE_PROPS: "updateProps", // { type, props } — partial props, merged
};

// Outbound: embed page → host.
export const OUTBOUND = {
  READY: "ready", // { type } — Leaflet mounted; host may now send props
  GUESS: "guess", // { type, lat, lng } — user placed/moved the pin
  KM: "km", // { type, km } — distance string at reveal
  OPEN_MAPS: "openMaps", // { type, lat, lng, panoId? } — open external maps link
  // { type } — on answer reveal, the map has finished resizing to its new
  // (full) size and is fitted/about to fly. The host uses this exact signal to
  // unclip the map to full-screen with no resize flicker (no guessed delay).
  REVEAL_READY: "revealReady",
};

// The embed page exposes window[APPLY_FN](messageObject) so the RN host can
// deliver inbound messages via WebView.injectJavaScript (more reliable than
// postMessage from RN → WebView content). The page ALSO listens for window
// 'message' events so it still works as an iframe.
export const APPLY_FN = "__embedApply";
