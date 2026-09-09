# Daily challenge meta days

The committed `data/daily-metas.json` schedules "meta" days for the daily
challenge by default; no environment variable is required. On a scheduled
date its three locations are the day.
Every other date uses the seeded draw in `serverUtils/dailyChallenge.js`.

`DAILY_META_SCHEDULE_PATH` optionally overrides the default with an absolute
file path inside or outside the checkout. The API and
`scripts/importDailyMetaPack.mjs` share the same default and override. Local
Node processes read `.env`; when using an override in production, set it on
every process that serves or rescores daily challenges.
For example, a private persistent mount could use
`DAILY_META_SCHEDULE_PATH=/var/lib/worldguessr/daily/daily-metas.json`.
That is an example mount location, not an automatically provisioned service.

Keep raw packs in private storage; `/Week_*.json` remains ignored. The default
schedule is versioned in Git and read by the server from disk.

When the variable is unset or empty, the committed schedule is used. If the
selected file is missing or invalid, a worker retains its last valid schedule. A
new worker without a valid schedule returns an error instead of generating a
different puzzle. Deploy the file before starting that worker.

After a player guesses, the reveal shows a card (bottom-left on desktop, above
the end banner on phones) with a Street View zoomed on the meta, a title, and
one short explanation. A location can carry more than one meta; the player
taps the card to cycle. On desktop the card expands on hover (bigger pano,
full explanation).

## File shape

```json
{
  "2026-09-07": [
    {
      "lat": 46.94809, "lng": 7.44744, "heading": 120, "country": "CH",
      "title": "Swiss Bollard",
      "metas": [
        {
          "title": "Switzerland bollard",
          "category": "Bollard",
          "explanation": "Swiss bollards are white with a black band and a rectangular red reflector.",
          "view": { "heading": 135, "pitch": -12, "zoom": 3 },
          "hint": "Two circles on the back = Switzerland",
          "image": "https://example.com/ch-bollard.jpg"
        }
      ]
    },
    { "...": "location 2" },
    { "...": "location 3" }
  ]
}
```

- Keys are real `YYYY-MM-DD` UTC calendar dates. Exactly three locations per
  date, finite coordinates within geographic bounds, uppercase ISO-2
  countries, and valid nonempty meta descriptions are required. A malformed
  entry rejects the entire update; it never substitutes a drawn day. The
  only other key allowed is `_publishedAt`, the ISO timestamp the importer
  writes when it publishes (see rule 5 under Publication and rollout).
- `country` is ISO-2. The reveal's "It was {country}" line and the results
  screen read it.
- `title` on a location is for people reading this file. The server does not
  send it.
- `heading` is the spawn heading. The spawn uses the same embed as every
  other daily round (heading only, fov 100).
- `view.zoom` follows Street View: fov = 180 / 2^zoom, clamped to 10..100 by
  the Maps Embed API. `view.lat`/`view.lng` are only for a meta that lives in
  a different pano than the spawn.
- `explanation` is one paragraph. The importer flattens the pack's paragraph
  breaks into spaces. Keep a tip to one or two sentences,
  under about 130 characters: the whole tip is always shown (no clamp, no
  extra text on hover), so a long tip makes a tall card. The importer warns
  over 150 characters. When neither the meta
  title nor the explanation names the location's country, the importer adds
  "Common in {Country}." to the end of the last sentence so the player knows
  what the tip is for. A title like "Swiss Bollard" or a mention like "in
  Brazil" counts as naming it.
- `hint` (the pack's first mnemonic) and `image` (the pack's example photo)
  are stored but not shown yet.

## Rules

1. Publish at least THREE UTC calendar days ahead. The locations API already
   exposes UTC today + 2, even before clients reach that local date. For
   example, a September 9 puzzle must reach all workers before September 7
   00:00 UTC. Publishing on September 7 is too late. The importer rejects
   additions or changes before UTC today + 3, including with `--force`.
2. Do not edit a date that is already accessible, whether or not a score has
   been submitted. The same protection covers metadata, deletions, and past
   entries. There is no `--allow-live` override.
3. Never delete a past date. `claimGuestProgress` and the history writer
   recompute old runs from `getDailyLocations(date)`; a deleted date would
   fall back to the seeded draw and record the wrong locations. A date that was only
   scheduled locally and never deployed was never played; drop it before the
   first deploy so old runs are not recomputed against it.
4. Import packs with `node scripts/importDailyMetaPack.mjs <pack.json> --start YYYY-MM-DD`
   (`--dry-run` to preview, `--force` to overwrite dates, `--country n=XX`
   to set a country the pack left out). The script takes the pack's
   locations in file order, three per date, Day 1 = `--start`. It refuses
   dates closer than three UTC calendar days out, fills missing countries from
   `public/genBorders.json`, and tolerates stray text pasted before the JSON.
5. The card shows category, title, explanation, and a "Powered by geocoach.me"
   link to https://geocoach.me (the packs' author). On desktop the card is one
   scalable unit: its type, spacing and pano are sized from the card width
   (container query units), so the hover growth is a pure zoom with the same
   line breaks. On phones (web at or below 1100px, and the app) the tip is a
   sheet that floats in front of the score banner on the reveal; the banner
   keeps rendering behind and around it, and "Got it" slides the sheet away
   (web: the same DailyMetaCard with the sheet rules in daily.scss; app:
   `mobile/src/components/daily/DailyMetaSheet.tsx`). Size is deliberate:
   80% of the screen width (420px max), pinned to the left edge like the
   desktop card so it does not read as a centred ad, a 16:10 pano no taller
   than 25% of the screen, about 41% of a phone screen in total, so the
   answer pins and the banner's right side stay in view. Landscape phones drop the pano and keep text and button.

## Publication and rollout

1. Start from the complete last deployed schedule, including historical
   entries. Keep a private backup and its SHA-256 hash. A new worker must
   receive that history too; a blank file is not a replacement for it.
2. Use the committed `data/daily-metas.json` on the publisher and every relevant
   worker. If using `DAILY_META_SCHEDULE_PATH` instead, configure it everywhere
   and ensure the selected file is available to every worker.
   An existing production `DAILY_SECRET` must remain unchanged and consistent
   across workers: changing it changes drawn puzzles and session tokens.
3. Use one publisher at a time. Run the importer with `--dry-run`, then publish without it. The importer
   validates the existing schedule and complete merged result, preserves
   historical entries, rechecks the UTC cutoff immediately before publishing,
   and writes a sibling temporary file followed by an atomic rename. A broken
   existing file is an error, never permission to start a new empty schedule.
4. Supply the exact same approved file to every worker before any changed date
   enters the API lookahead. Deploy the same schedule revision to every worker.
   For an override, prefer a shared private mount; with separate volumes,
   stage the complete file beside the destination and replace it
   atomically; never stream or truncate the live file. Compare SHA-256 hashes
   on every worker. Staging and replacement must finish while all changed
   dates are still at least three UTC calendar days away.
5. The importer stamps its publication time inside the file as the one
   non-date key, `_publishedAt` (an ISO timestamp). Workers judge which
   dates were legal to add from that stamp, so copying the file to a host on
   a later UTC day cannot make a warm worker reject dates a restarted worker
   accepts. A file without the stamp (hand-built or pre-stamp) falls back to
   its modification time, so for such a file use the actual publication time
   as the mtime and do not reset it during deployment. Workers compare
   against the earlier of the publication time and their last observation
   of the accepted baseline, so an idle worker can adopt several valid
   publications it missed across midnight. The importer enforces the
   full immutable-date rule at every publication; the runtime guard protects
   dates already immutable when its baseline was observed. Do not hand-edit
   the live file or use the runtime guard as a substitute for publication
   validation: it cannot infer the history of changes it never observed.
   The first file on a cold worker is a trusted deployed baseline; runtime
   validation cannot reconstruct history that was never supplied to it.
6. Check a warm worker and a newly started worker against the same file hash:
   they must return identical locations, headings, countries, and metas for
   each scheduled date and unchanged draws for other dates. Exercise submit
   and guest-claim paths using those same locations. The schedule is checked
   before location-cache hits; accepted changed dates evict their cached picks.
7. On an unreadable or malformed refresh, fix the selected file; warm workers
   keep the last valid version. Do not roll back by removing already accessible
   dates or unsetting the path. Preserve their exact published entries and
   change only dates still outside the lookahead.
