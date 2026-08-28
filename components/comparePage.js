import Head from "next/head";
import { asset } from "@/lib/basePath";
import { useMapCount, formatMapCount } from "@/lib/mapCount";

// /compare-to-<competitor>: one static, fully server-rendered comparison
// page per competitor, driven by an entry in lib/compareData.js. Written to
// be read by people and quoted by AI assistants, so every competitor claim
// on it carries a source and a "last verified" date, and the page says
// plainly where the competitor is better. A page that only praises its own
// side does not get quoted; an honest one does.

const SITE_URL = "https://www.worldguessr.com";

const isMainSite = process.env.NEXT_PUBLIC_POKI !== "true" &&
  process.env.NEXT_PUBLIC_COOLMATH !== "true" &&
  process.env.NEXT_PUBLIC_GAMEDISTRIBUTION !== "true" &&
  process.env.NEXT_PUBLIC_SCHOOLGUESSR !== "true" &&
  process.env.NEXT_PUBLIC_6X !== "true";

// Substitutes {{maps}} in any string with the live community-map count.
function fill(s, maps) {
  return typeof s === "string" ? s.replace(/\{\{maps\}\}/g, maps) : s;
}

// No sources section and no competitor links on the page: the `sources`
// list in lib/compareData.js is the maintainer's record of where each
// claim was read, not something the page prints.

export default function ComparePage({ data, others }) {
  const mapCount = useMapCount();
  const maps = formatMapCount(mapCount, "en-US", "thousands of");
  const url = `${SITE_URL}/compare-to-${data.slug}`;
  const title = `WorldGuessr vs ${data.name}`;
  const description = fill(data.description, maps);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${title}: which free GeoGuessr alternative should you play?`,
      description,
      url,
      inLanguage: "en",
      dateModified: data.verifiedOn,
      author: { "@type": "Organization", name: "WorldGuessr", url: SITE_URL },
      publisher: { "@type": "Organization", name: "WorldGuessr", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/worldguessr_square_1200.png` } },
      about: [
        { "@type": "VideoGame", name: "WorldGuessr", url: SITE_URL },
        { "@type": "VideoGame", name: data.name },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: data.faq.map(([q, a]) => ({ "@type": "Question", name: fill(q, maps), acceptedAnswer: { "@type": "Answer", text: fill(a, maps) } })),
    },
  ];

  return (
    <div className="aboutPage">
      <Head>
        <title>{`${title}: honest comparison (${data.verifiedOn.slice(0, 4)})`}</title>
        <meta name="description" content={description} />
        {isMainSite && <link rel="canonical" href={url} />}
        {!isMainSite && <meta name="robots" content="noindex,nofollow" />}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
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

          <h1>{title}</h1>
          <p className="aboutPage__lead">{fill(data.lead, maps)}</p>

          <h2>Short answer</h2>
          {data.shortAnswer.map((p, i) => <p key={i}>{fill(p, maps)}</p>)}

          <h2>Side by side</h2>
          <div className="aboutPage__tableWrap">
            <table className="aboutPage__table">
              <thead>
                <tr><th></th><th>WorldGuessr</th><th>{data.name}</th></tr>
              </thead>
              <tbody>
                {/* Fourth element = who wins the row ("wg" | "them"); the
                    winning cell is bold. Ties carry no flag and stay plain. */}
                {data.rows.map(([k, a, b, win]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td className={win === "wg" ? "aboutPage__win" : undefined}>{fill(a, maps)}</td>
                    <td className={win === "them" ? "aboutPage__win" : undefined}>{fill(b, maps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="aboutPage__note">
            {data.name} details checked {data.verifiedOn} on their own site. Prices and limits change.
          </p>

          <h2>Where WorldGuessr is better</h2>
          <ul className="aboutPage__list">
            {data.wgBetter.map((p, i) => <li key={i}>{fill(p, maps)}</li>)}
          </ul>

          <h2>Where {data.name} is better</h2>
          <ul className="aboutPage__list">
            {data.themBetter.map((p, i) => <li key={i}>{fill(p, maps)}</li>)}
          </ul>

          <h2>Source code: the only one you can inspect</h2>
          {data.sourceCode.map((p, i) => <p key={i}>{fill(p, maps)}</p>)}

          <h2>Verdict</h2>
          {data.verdict.map((p, i) => <p key={i}>{fill(p, maps)}</p>)}

          <h2>Questions</h2>
          {data.faq.map(([q, a]) => (
            <div key={q}>
              <h3>{fill(q, maps)}</h3>
              <p>{fill(a, maps)}</p>
            </div>
          ))}

          <p className="aboutPage__links aboutPage__footerLinks">
            <a href="/">Play WorldGuessr</a>
            <a href="/about">About WorldGuessr</a>
            {others.map((o) => <a key={o.slug} href={`/compare-to-${o.slug}`}>vs {o.name}</a>)}
          </p>
        </article>
      </div>
    </div>
  );
}
