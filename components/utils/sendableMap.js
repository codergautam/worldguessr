/**
 * The ONE shape a community map takes on the wire — maps grid, maps modal,
 * search results, mobile alike.
 *
 * `creator` is a NORMALISED `{ username, nameGlow }`, not a User document.
 * Every caller here resolves the creator differently — the owner of `myMaps`
 * is the requesting user, `likedMaps` and the discovery sections read a
 * denormalised `map_creator_name` off the Map doc and never load the account at
 * all — so a helper that reached into `creator.cosmetics.equipped.nameGlow`
 * would silently emit nothing for two of the three. Callers hand over the two
 * fields; missing means missing.
 *
 * `created_by_glow` is the equipped name-glow sku, and it exists because the
 * maps grid renders a username on every tile and rendered every one of them
 * plain. It is the sku, never a colour: the client owns sku -> paint
 * (components/utils/usernameWithFlag.js on web, PlayerName on mobile) so a
 * re-skin lands in one file.
 */
export default function sendableMap(map, creator, hearted=false, staff=false, isCreator=false, locations) {
  return {
    created_at: Date.now() - map.created_at.getTime(),
    slug: map.slug,
    name: map.name,
    hearts: map.hearts,
    hearted,
    plays: map.plays,
    description_short: map.description_short,
    description_long: (isCreator || staff)?map.description_long:undefined,
    // data: (isCreator || staff)?map.data:undefined,
    created_by_name: map.map_creator_name ?? creator?.username,
    created_by_glow: creator?.nameGlow ?? null,
    id: map._id,
    in_review: map.in_review,
    official: map.official,
    accepted: map.accepted,
    reject_reason: map.reject_reason,
    resubmittable: map.resubmittable,
    yours: isCreator||staff,
    locations: map?.locationsCnt
  }
}
