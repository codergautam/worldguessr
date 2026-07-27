// Shim for @googlemaps/js-api-loader inside the Street View WebView bundle.
//
// customStreetView.js's resolvePanoId is UNREACHABLE in the mobile embed: the
// RN host resolves lat/lng → pano id natively (keyless GeoPhotoService lookup,
// no CORS in native fetch) and only hands the page coords TOGETHER WITH the
// resolved panoId — so the `panoId || await resolvePanoId(...)` branch never
// takes the right-hand side. This stub keeps the whole Maps JS API (~300KB and
// a network round trip on a surface that must paint immediately) out of the
// bundle. It rejects rather than resolving so a future code path that DOES
// reach it fails loudly into startLoad's catch (which fires onLoad and
// unblocks the round) instead of hanging behind the 8s failsafe.
export class Loader {
  constructor() {}
  importLibrary() {
    return Promise.reject(
      new Error('[svEmbed] Maps JS API is not bundled; the host must supply panoId'),
    );
  }
  load() {
    return this.importLibrary();
  }
}
export default { Loader };
