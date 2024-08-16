export default function sendableMap(map, user) {
  return {
    created_at: Date.now() - map.created_at.getTime(),
    slug: map.slug,
    name: map.name,
    hearts: map.hearts,
    plays: map.plays,
    description_short: map.description_short,
    created_by_name: user.username ?? map.created_by,
    id: map._id
  }
}