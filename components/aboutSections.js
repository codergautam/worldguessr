import { asset } from "@/lib/basePath";
import {
  APP_STORE_URL,
  DISCORD_URL,
  FEATURED_MAPS,
  GITHUB_URL,
  PLAY_STORE_RATING,
  PLAY_STORE_URL,
  YOUTUBE_URL,
} from "@/lib/aboutContent";
import { formatMapCount } from "@/lib/mapCount";

// The long-form About content: how a round works, every mode, the honest
// GeoGuessr comparison, apps, source, community. Rendered by /about
// (pages/about.js) and inside the homepage About panel on the English home
// (components/aboutPanel.js). English only. `mapCount` is the accepted
// community-map count (0 = unknown); the number is wrapped in
// [data-map-count] so the edge Worker can rewrite it live on /about.

export const FORUM_URL = "https://worldguessr.forum";
export const SCHOOL_URL = "https://schoolguessr.com";

const MODES = (mapCount) => [
  ["Singleplayer", "Unlimited rounds on the world map or any community map. Pick a time limit or play without one. No account needed."],
  ["Ranked Duels (1v1)", "Head-to-head against another player. Both of you see the same location; the closer guess wins the round and takes health from the other side. Wins raise your ELO rating and move you up the leagues."],
  ["2v2 Team Duels", "The same duel format with a partner. Queue together from a party, or get matched with a teammate."],
  ["Unranked Match", "A quick duel against a random player with no rating at stake."],
  ["Party", "A private lobby for friends. Share a link, choose the map and rules, and play the same rounds together. Parties have chat and emotes, and can run team duels inside the group."],
  ["Daily Challenge", "One shared set of 3 locations for everyone, every day. 60 seconds per round, one attempt, then a score distribution and a top-100 board. Keep a streak going with an account."],
  ["Country Guesser and Continent Guesser", "Instead of placing a pin, name the country or the continent you are in. Fast rounds, good for learning the clues of the road."],
  ["Community Maps", <>
    <MapCount count={mapCount} /> maps made by players: single countries, cities, stadiums, capitals, landmarks, and stranger
    themes. That is the largest map library of any free GeoGuessr alternative, and it grows every day. Anyone can build a map
    with the in-game map maker;
  </>],
  ["Leaderboard and ELO", "A global leaderboard for ranked play, a Hall of Fame for past seasons, and a public profile with stats, rating and achievements for every account."],
  ["Customize", "Pins, site backgrounds, name glows and stamps you can equip on your profile."],
];

// Fourth element = who wins the row ("wg" | "them"); that cell is bold.
const COMPARE = (mapCount) => [
  ["Price", "Free", "Free tier with limits; a paid subscription for unlimited play", "wg"],
  ["Round limit", "None", "Limited without a subscription", "wg"],
  ["Account needed to play", "No", "Yes", "wg"],
  ["Multiplayer", "Ranked 1v1, 2v2, unranked, private parties", "Yes, mostly in the paid tier", "wg"],
  ["Community maps", <><MapCount count={mapCount} capitalize />, free to play and free to create</>, "Yes", "wg"],
  ["Daily challenge", "Yes, no account needed", "Yes, account needed", "wg"],
  ["Native apps", "Android and iOS", "Android and iOS"],
  ["Source code", "Public on GitHub", "Private", "wg"],
  ["Made by", "One independent developer and contributors", "A company"],
];

// "12,345" or "Thousands of" / "thousands of" while unknown.
function MapCount({ count, capitalize = false }) {
  const word = capitalize ? "Thousands of" : "thousands of";
  return <span data-map-count="">{formatMapCount(count, "en-US", word)}</span>;
}

export default function AboutSections({ mapCount = 0 }) {
  return (
    <>
      <h2>How a round works</h2>
      <div className="aboutPage__figures">
        <figure>
          <img src={asset("/tutorial1.png")} alt="A WorldGuessr round: Street View of the Statue of Liberty, waiting for a guess" width="405" height="298" loading="lazy" />
          <figcaption>1. You land somewhere in Street View. Move, turn and zoom to find clues: language, road signs, plates, plants, the side of the road cars drive on.</figcaption>
        </figure>
        <figure>
          <img src={asset("/tutorial2.png")} alt="The result map after a guess: the guessed pin near Washington and the real location in New York, joined by a line" width="405" height="298" loading="lazy" />
          <figcaption>2. Drop a pin on the map and guess. The result shows your pin, the real spot, the distance between them and your score for the round.</figcaption>
        </figure>
      </div>
      <p>
        A round is worth up to 5,000 points. In singleplayer you play as many rounds as you like. In duels, a closer guess
        takes health from the opponent until one side is out. In the daily challenge everyone gets the same 3 rounds and
        compares scores.
      </p>

      <h2>Game modes</h2>
      <dl className="aboutPage__modes">
        {MODES(mapCount).map(([name, desc]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{desc}</dd>
          </div>
        ))}
      </dl>

      <h2>WorldGuessr and GeoGuessr</h2>
      <p>
        GeoGuessr is the game that started the genre. WorldGuessr is a free alternative to it: a separate game, made
        by an independent developer, not affiliated with GeoGuessr. The differences that matter to most players are
        below. GeoGuessr details are as of 2026 and may change; check their site for current terms.
      </p>
      <div className="aboutPage__tableWrap">
        <table className="aboutPage__table">
          <thead>
            <tr><th></th><th>WorldGuessr</th><th>GeoGuessr</th></tr>
          </thead>
          <tbody>
            {COMPARE(mapCount).map(([k, a, b, win]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className={win === "wg" ? "aboutPage__win" : undefined}>{a}</td>
                <td className={win === "them" ? "aboutPage__win" : undefined}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Full, sourced comparisons: <a href="/compare-to-geoguessr">WorldGuessr vs GeoGuessr</a>,{" "}
        <a href="/compare-to-openguessr">WorldGuessr vs OpenGuessr</a>,{" "}
        <a href="/compare-to-geotastic">WorldGuessr vs Geotastic</a>.
      </p>

      <h2>Apps</h2>
      <p>
        WorldGuessr has native apps for <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Android on Google Play</a> and
        for <a href={APP_STORE_URL} target="_blank" rel="noreferrer">iPhone and iPad on the App Store</a>. They use the same
        account as the website, so your rating, streaks and maps carry over. The Android app is rated {PLAY_STORE_RATING.value} out
        of 5 from {PLAY_STORE_RATING.count.toLocaleString("en-US")} ratings.
      </p>

      <h2>Source code and license</h2>
      <p>
        The full source code is public at <a href={GITHUB_URL} target="_blank" rel="noreferrer">github.com/codergautam/worldguessr</a>,
        under the PolyForm Noncommercial license. You can read how the game works, report bugs, send fixes, or run
        your own copy for noncommercial use. The location data, the map maker, the multiplayer server and the mobile
        apps are all in the same repository.
      </p>

      <h2>Languages</h2>
      <p>
        The game is available in English, Spanish, French, German, Russian and Simplified Chinese. Community map names and descriptions are
        in whatever language their creator wrote them in.
      </p>

      <h2>Community</h2>
      <p>
        Players talk on <a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>, share guides and meta on
        the <a href={FORUM_URL} target="_blank" rel="noreferrer">forum</a>, and post videos on
        the <a href={YOUTUBE_URL} target="_blank" rel="noreferrer">YouTube channel</a>. Map makers, moderators and translators
        are all volunteers from the community.
      </p>

      <h2>For schools</h2>
      <p>
        <a href={SCHOOL_URL} target="_blank" rel="noreferrer">SchoolGuessr</a> is the same game with chat and user-made content
        switched off, for classrooms that want the geography without the social features. It is free too.
      </p>

      <h2>Popular maps</h2>
      <p className="aboutPage__links">
        {FEATURED_MAPS.map((m) => <a key={m.slug} href={`/map/${m.slug}`}>{m.name}</a>)}
        <a href="/maps">All community maps</a>
      </p>
    </>
  );
}
