const forbiddenIframe = [
  "https://openguessr.io/" // request from openguessr.com owner to prevent embedding on this unauthorized website
];
export function inIframe() {
  try {
      return window.self !== window.top;
  } catch (e) {
      return true;
  }
}