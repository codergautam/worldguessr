import Map from "../../models/Map.js";

// GET /api/map/count → { count } of accepted community maps. Public and
// identical for everyone; cached an hour at the model and at the HTTP layer.
// Read by scripts/fetchMapCount.mjs at build time (baked into the static
// HTML), by lib/mapCount.js in the browser, and by workers/seo-edge on /about.
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  const count = await Map.countDocuments({ accepted: true }).cache(3600, "mapCount");
  res.set("Cache-Control", "public, max-age=3600");
  return res.json({ count });
}
