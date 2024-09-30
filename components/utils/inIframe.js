const forbiddenIframe = [
  "openguessr.io", // request from openguessr.com owner to prevent embedding on this unauthorized website
  "geoguessrfree.com",
  "itch.zone"
];
export function inIframe() {
  try {
      return window.self !== window.top;
  } catch (e) {
      return true;
  }
}
export function isForbiddenIframe() {
  try {
    return inIframe() && forbiddenIframe.some((url) => (window?.location?.ancestorOrigins[0] ?? document.referrer).includes(url));
  } catch (e) {
    console.error("Piracy detection error", e);
    return false;
  }
}