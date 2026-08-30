import Head from "next/head";
import { asset } from "@/lib/basePath";
import { useMapCount, formatMapCount } from "@/lib/mapCount";

// /compare-to-<competitor>: one static, fully server-rendered comparison
// article per competitor, driven by an entry in lib/compareData.js.
//
// The article is prose with screenshots, in this order: lead, one hero
// figure, an "at a glance" table, topic sections (each a list of blocks:
// paragraph strings, { figures } grids, { list } bullets), a verdict, and
// the questions people search for. Every competitor claim was read on the
// competitor's own site on `verifiedOn`; the `sources` list in compareData
// is the maintainer's record of where and is never rendered. No links to
// competitors on the page.

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

function Figure({ f, maps, eager }) {
  return (
    <figure>
      <img
        src={asset(f.src)}
        alt={fill(f.alt, maps)}
        width={f.width || 1280}
        height={f.height || 800}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
      {f.caption && <figcaption>{fill(f.caption, maps)}</figcaption>}
    </figure>
  );
}

// One figure fills the column; two sit side by side (about.css
// .aboutPage__figures is an auto-fit grid, so nothing here decides that).
// Main site only: portal builds are noindex here and their exports leave
// public/compare/ out (scripts/packageEmbed.mjs, the CoolMath and GD
// workflows), so they must not reference the files either.
function Figures({ list, maps, eager }) {
  if (!isMainSite || !list || list.length === 0) return null;
  return (
    <div className="aboutPage__figures">
      {list.map((f, i) => <Figure key={f.src} f={f} maps={maps} eager={eager && i === 0} />)}
    </div>
  );
}

function Blocks({ blocks, maps }) {
  return blocks.map((b, i) => {
    if (typeof b === "string") return <p key={i}>{fill(b, maps)}</p>;
    if (b.figures) return <Figures key={i} list={b.figures} maps={maps} />;
    if (b.list) return (
      <ul key={i} className="aboutPage__list">
        {b.list.map((li, j) => <li key={j}>{fill(li, maps)}</li>)}
      </ul>
    );
    return null;
  });
}

export default function ComparePage({ data, others }) {
  const mapCount = useMapCount();
  const maps = formatMapCount(mapCount, "en-US", "tens of thousands of");
  const url = `${SITE_URL}/compare-to-${data.slug}`;
  const title = `WorldGuessr vs ${data.name}`;
  const description = fill(data.description, maps);
  const year = data.verifiedOn.slice(0, 4);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${title}: which one should you play in ${year}?`,
      description,
      url,
      inLanguage: "en",
      dateModified: data.verifiedOn,
      image: data.hero ? [].concat(data.hero).map((f) => `${SITE_URL}${f.src}`) : undefined,
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
        <title>{`${title}: which should you play in ${year}?`}</title>
        <meta name="description" content={description} />
        {isMainSite && <link rel="canonical" href={url} />}
        {!isMainSite && <meta name="robots" content="noindex,nofollow" />}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={data.hero ? `${SITE_URL}${[].concat(data.hero)[0].src}` : `${SITE_URL}/worldguessr-1200x630.png`} />
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
          {data.lead.map((p, i) => <p key={i} className={i === 0 ? "aboutPage__lead" : undefined}>{fill(p, maps)}</p>)}

          {data.hero && <Figures list={[].concat(data.hero)} maps={maps} eager />}

          <h2>At a glance</h2>
          <div className="aboutPage__tableWrap">
            <table className="aboutPage__table">
              <thead>
                <tr><th></th><th>WorldGuessr</th><th>{data.name}</th></tr>
              </thead>
              <tbody>
                {/* Fourth element = who wins the row ("wg" | "them"); the
                    winning cell is bold. Rows where it depends on the player
                    carry no flag and stay plain. */}
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
          {data.sections.map((s) => (
            <section key={s.heading}>
              <h2>{fill(s.heading, maps)}</h2>
              <Blocks blocks={s.body} maps={maps} />
            </section>
          ))}

          <h2>Verdict</h2>
          {data.verdict.map((p, i) => <p key={i}>{fill(p, maps)}</p>)}

          <h2>Questions people ask</h2>
          {data.faq.map(([q, a]) => (
            <div key={q}>
              <h3>{fill(q, maps)}</h3>
              <p>{fill(a, maps)}</p>
            </div>
          ))}

          {/* Author note sits at the end, after the reader has seen the
              evidence, not as a warning label at the top. */}
          <p className="aboutPage__note">
            This comparison was written by the WorldGuessr team as an unbiased review. Every fact about {data.name} was checked on {data.name}'s own site on {data.verifiedOn}, as a visitor with no account, and the screenshots are from that visit. Prices and limits change; if something here is out of date, tell us on Discord.
          </p>

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
