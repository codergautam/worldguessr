import Head from "next/head";
import { asset } from "@/lib/basePath";
import { APP_STORE_URL, DISCORD_URL, GITHUB_URL, PLAY_STORE_URL, YOUTUBE_URL } from "@/lib/aboutContent";
import AboutSections, { FORUM_URL } from "@/components/aboutSections";
import { useMapCount, formatMapCount } from "@/lib/mapCount";

// /about: the long-form page about the game. Fully static HTML (prose,
// images, tables, FAQ) so every crawler, including the ones behind AI
// answers that never run JavaScript, reads the whole thing. English only.
// The sections themselves live in components/aboutSections.js and are also
// shown inside the homepage About panel; this page adds its own H1, lead
// and FAQ. The edge Worker (workers/seo-edge) rewrites [data-map-count]
// here with the live community-map count.

const SITE_URL = "https://www.worldguessr.com";

// Platform builds export this page on other origins; keep www tags off them.
const isMainSite = process.env.NEXT_PUBLIC_POKI !== "true" &&
  process.env.NEXT_PUBLIC_COOLMATH !== "true" &&
  process.env.NEXT_PUBLIC_GAMEDISTRIBUTION !== "true" &&
  process.env.NEXT_PUBLIC_SCHOOLGUESSR !== "true" &&
  process.env.NEXT_PUBLIC_6X !== "true";

const TITLE = "About WorldGuessr";
const DESCRIPTION = "What WorldGuessr is, how to play, every game mode, how it compares with GeoGuessr, the apps, the source code, and answers to common questions.";

const FAQ = (mapCountText) => [
  ["Who makes WorldGuessr?", "An independent developer (codergautam), with help from open-source contributors and a community of moderators and map makers. It launched in 2024 and is updated often."],
  ["How many community maps are there?", `${mapCountText} and counting. That is the largest map library of any free GeoGuessr alternative. Players add new maps every day, and each one gets its own page once it is approved.`],
  ["Is WorldGuessr open source?", "The source code is public on GitHub under the PolyForm Noncommercial license. You can read it, run it and modify it for noncommercial use. That is source-available rather than open source in the strict sense, so we say source-available."],
  ["Does it use real Street View?", "Yes. Every round is real Google Street View imagery. The locations are curated per country so rounds land on real roads and not in the middle of the ocean."],
  ["How does ranked play work?", "Ranked duels use an ELO-style rating. You gain rating when you beat a stronger opponent and lose less when you fall to one. Ratings map to leagues, and the leaderboard ranks everyone by rating."],
  ["Can I play on my phone?", "Yes. The site works in any mobile browser, and there are native apps for Android and iOS with the same account and progress."],
  ["Is there a version for schools?", "Yes. SchoolGuessr is the same game with chat and user content turned off, made for classrooms."],
  ["How do I report a player or a map?", "Every multiplayer game and every map has a report button. Reports go to the moderation team who handle them quickly. You can also reach the team on Discord."],
];

export default function AboutPage() {
  const mapCount = useMapCount();
  const mapCountText = formatMapCount(mapCount, "en-US", "Thousands");

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: TITLE,
      description: DESCRIPTION,
      url: `${SITE_URL}/about`,
      inLanguage: "en",
      isPartOf: { "@type": "WebSite", name: "WorldGuessr", url: SITE_URL },
      about: { "@type": "VideoGame", name: "WorldGuessr", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "WorldGuessr",
      url: SITE_URL,
      logo: `${SITE_URL}/worldguessr_square_1200.png`,
      sameAs: [GITHUB_URL, PLAY_STORE_URL, APP_STORE_URL, DISCORD_URL, YOUTUBE_URL, FORUM_URL],
    },
  ];

  return (
    <div className="aboutPage">
      <Head>
        <title>{`${TITLE} - Free GeoGuessr alternative`}</title>
        <meta name="description" content={DESCRIPTION} />
        {isMainSite && <link rel="canonical" href={`${SITE_URL}/about`} />}
        {!isMainSite && <meta name="robots" content="noindex,nofollow" />}
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE_URL}/about`} />
        <meta property="og:image" content={`${SITE_URL}/worldguessr-1200x630.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" type="image/x-icon" href={asset("/icon.ico")} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {isMainSite && jsonLd.map((node, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }} />
        ))}
      </Head>

      <div className="aboutPage__scroll">
        <article className="aboutPage__article">
          <p className="aboutPage__back"><a href="/">← Back to the game</a></p>

          <h1>About WorldGuessr</h1>
          <p className="aboutPage__lead">
            WorldGuessr is a free GeoGuessr alternative. You are dropped somewhere in the world in Google Street View, you look
            around for clues, and you place a pin on a map where you think you are. The closer your pin, the more points
            you score. It has unlimited rounds, ranked and private multiplayer, a daily challenge, the largest community map
            library of any free GeoGuessr alternative, and native apps. It is made by an independent developer and its
            source code is public.
          </p>

          <AboutSections mapCount={mapCount} />

          <h2>Questions</h2>
          {FAQ(mapCountText).map(([q, a]) => (
            <div key={q}>
              <h3>{q}</h3>
              <p>{a}</p>
            </div>
          ))}

          <h2>Compared with other games</h2>
          <p className="aboutPage__links">
            <a href="/compare-to-geoguessr">WorldGuessr vs GeoGuessr</a>
            <a href="/compare-to-openguessr">WorldGuessr vs OpenGuessr</a>
            <a href="/compare-to-geotastic">WorldGuessr vs Geotastic</a>
          </p>

          <p className="aboutPage__links aboutPage__footerLinks">
            <a href="/">Play WorldGuessr</a>
            <a href="/daily">Daily challenge</a>
            <a href="/maps">Community maps</a>
            <a href="/leaderboard">Leaderboard</a>
            <a href="/privacy">Terms and privacy</a>
          </p>
        </article>
      </div>
    </div>
  );
}
