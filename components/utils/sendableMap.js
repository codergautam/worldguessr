export default function sendableMap(map, creator, hearted=false, staff=false, isCreator=false) {
  return {
    created_at: Date.now() - map.created_at.getTime(),
    slug: map.slug,
    name: map.name,
    hearts: map.hearts,
    hearted,
    plays: map.plays,
    description_short: map.description_short,
    description_long: (isCreator || staff)?map.description_long:undefined,
    data: (isCreator || staff)?map.data:undefined,
    created_by_name: map.map_creator_name ?? creator?.username,
    id: map._id,
    in_review: map.in_review,
    official: map.official,
    accepted: map.accepted,
    reject_reason: map.reject_reason,
    resubmittable: map.resubmittable,
    yours: isCreator||staff,
    locations: map.data.length,
  }
}