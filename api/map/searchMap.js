
import sendableMap from "../../components/utils/sendableMap.js";
import Map from "../../models/Map.js";
import User from "../../models/User.js";

export default async function searchMaps(req, res) {
  // only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { query, secret } = req.body;
  console.log("searchMaps", query, secret);

  // return res.status(429).json({ message: 'Temporarily not available' });

  // secret must be string
  if (secret && typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }
  let user;

  if(secret) {
    user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
  }

  let hearted_maps = user ? user.hearted_maps : null;

  // Validate the search query
  if (!query || query.length < 3) {
    return res.status(400).json({ message: 'Search query must be at least 3 characters long' });
  }

  // sanitize query: keep alphanumerics + whitespace only. Strips regex
  // metachars so the value is safe to interpolate into a RegExp.
  query = query.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  // Escape defensively in case the allowlist above ever expands.
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Tokenise on whitespace
  // token must appear (in any order) in name/description/creator.
  const tokens = query.split(/\s+/).filter(Boolean);
  const tokenClauses = tokens.map((t) => {
    const re = new RegExp(escape(t), 'i');
    return { $or: [{ name: re }, { description_short: re }, { map_creator_name: re }] };
  });

  try {
    let maps = await Map.find({
      accepted: true,
      ...(tokenClauses.length > 1 ? { $and: tokenClauses } : tokenClauses[0]),
    })
      .select('-data')
      .lean()
      .sort({ hearts: -1 })
      .limit(50)
      .cache(10000);

    // Re-rank results to prioritize exact and substring matches
    const queryLower = query.toLowerCase();
    maps.sort((a, b) => {
      // 0. Severely penalize maps with fewer than 20 locations — push to bottom.
      const aSparse = (a.locationsCnt ?? 0) < 20;
      const bSparse = (b.locationsCnt ?? 0) < 20;
      if (aSparse && !bSparse) return 1;
      if (!aSparse && bSparse) return -1;

      const aNameLower = a.name.toLowerCase();
      const bNameLower = b.name.toLowerCase();

      // 1. Exact match (highest priority)
      const aExact = aNameLower === queryLower;
      const bExact = bNameLower === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // 2. Starts with query
      const aStartsWith = aNameLower.startsWith(queryLower);
      const bStartsWith = bNameLower.startsWith(queryLower);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;

      // 3. Contains query as substring
      const aContains = aNameLower.includes(queryLower);
      const bContains = bNameLower.includes(queryLower);
      if (aContains && !bContains) return -1;
      if (!aContains && bContains) return 1;

      // 4. For equal relevance, sort by hearts (popularity)
      return b.hearts - a.hearts;
    });

    // Convert maps to sendable format. Docs are .lean() plain objects now, so
    // map.save() doesn't exist — skip the legacy backfill (map_creator_name is
    // a required field, so this only mattered for very old orphan docs).
    // Normalise created_at back to a Date: recachegoose caches via
    // JSON.stringify → JSON.parse, which turns Dates into ISO strings. With
    // .lean() there's no schema to re-hydrate them, so sendableMap's
    // .getTime() call would throw on cache hits.
    const sendableMaps = maps.map((raw) => {
      const map = {
        ...raw,
        created_at: raw.created_at instanceof Date
          ? raw.created_at
          : new Date(raw.created_at),
      };
      const owner = { username: map.map_creator_name || 'Unknown' };
      return sendableMap(
        map,
        owner,
        hearted_maps ? hearted_maps.has(map._id.toString()) : false,
        user?.staff,
        map.created_by === user?._id.toString()
      );
    });

    res.status(200).json(sendableMaps);
  } catch (error) {
    console.error('Error searching maps:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
