// Builds a keyless Google Street View embed URL that resolves a panorama
// directly from lat/lng (Google snaps to the nearest pano). No API key and no
// panoid required — unlike the keyed Maps Embed API v1 Street View endpoint,
// which needs an API key and consumes quota.
//
// GOTCHA: the 6m7 / 1m6 counts below are specific to this exact 5-field,
// no-panoid layout (1d/2d/3f/4f/5f). If you add or remove any "!"-delimited
// field, you MUST update those counts or the embed silently fails to render.
// Do not reorder the fields.
//
// fov note: v1's `fov` was degrees (10-100, default 90). The pb `5f` field is a
// zoom factor (~0.78 = wide), a different unit, so the old fov is intentionally
// NOT passed through. TODO: derive an exact fov->5f conversion if precise field
// of view ever matters.
//
// Placement note: Google snaps to the nearest pano, so the rendered spot may
// differ slightly from the input lat/lng. Exact placement would require a
// separate metadata lookup — out of scope here.
export function buildStreetViewEmbed({ lat, lng, heading = 0, pitch = 0, fov = 0.78, version = Date.now() }) {
  const pb =
    `!4v${version}` +
    `!6m7!1m6!2m2` +
    `!1d${lat}` +
    `!2d${lng}` +
    `!3f${heading}` +
    `!4f${pitch}` +
    `!5f${fov}`;
  return `https://www.google.com/maps/embed?pb=${pb}`;
}
