export default function sendableMap(map, user, hearted=false) {
  return {
    created_at: Date.now() - map.created_at.getTime(),
    slug: map.slug,
    name: map.name,
    hearts: map.hearts,
    hearted,
    plays: map.plays,
    description_short: map.description_short,
    description_long: (map.created_by== user._id || user.staff)?map.description_long:undefined,
    data: map.data,
    created_by_name: user.username ?? map.created_by,
    id: map._id,
    in_review: map.in_review,
    official: map.official,
    accepted: map.accepted,
    reject_reason: map.reject_reason,
    resubmittable: map.resubmittable,
    yours: map.created_by == user._id,
  }
}