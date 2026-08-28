import {
  APP_STORE_URL,
  FEATURED_MAPS,
  GITHUB_URL,
  PLAY_STORE_RATING,
  PLAY_STORE_URL,
} from "@/lib/aboutContent";
import AboutSections from "@/components/aboutSections";
import { useMapCount, formatMapCount } from "@/lib/mapCount";
import { useTranslation } from "@/components/useTranslations";

// A page's prose. Always mounted (see styles/about.css for why), opened from
// the settings footer on the home page and from the daily landing on /daily,
// or by the #about URL hash. Lives OUTSIDE <main data-nosnippet>, so this is
// the text search engines may quote, and it carries the page's keyword <h1>.
// (The navbar brand marks stay <h1> too: demoting them to <div> was reported
// to change the back button's height, and several H1s cost nothing with
// Google.) `content` is one of the ABOUT_* definitions in lib/aboutContent.js.
//
// On the English homepage the panel also carries the full long-form sections
// (components/aboutSections.js, the same ones /about shows) between the
// intro and the FAQ. Other languages keep the short, translated panel: the
// sections are English only and a mixed-language page is worse than a
// short one.
const LOCALE_TAGS = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", ru: "ru-RU" };

export default function AboutPanel({ content, open, onClose, text }) {
  const { lang } = useTranslation("common");
  const mapCount = useMapCount();
  const maps = formatMapCount(mapCount, LOCALE_TAGS[lang] || "en-US", text("aboutMapsThousands"));
  const showSections = !!content.showSections && lang === "en";

  return (
    <section
      id="about"
      className={`aboutPanel ${open ? "open" : ""}`}
      aria-hidden={!open}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="aboutPanel__card" role="dialog" aria-labelledby="about-title">
        {/* g2_red_button for the site's red, NOT gameBtn: that class is a
            full-width, viewport-scaled menu button and turned this into a
            bar across the card. data-nosnippet: chrome, not prose. */}
        <button className="g2_red_button aboutPanel__close" onClick={onClose} data-nosnippet="">{text("close")}</button>
        <h1 id="about-title">{text(content.h1)}</h1>
        {content.paragraphs.map((key) => <p key={key}>{text(key, { maps })}</p>)}
        {content.showRating && (
          <p>{text("aboutRating", { rating: PLAY_STORE_RATING.value, count: PLAY_STORE_RATING.count })}</p>
        )}

        {showSections && <AboutSections mapCount={mapCount} />}

        <h2>{text("aboutFaqTitle")}</h2>
        {content.faq.map(({ q, a }) => (
          <div key={q}>
            <h3>{text(q)}</h3>
            <p>{text(a)}</p>
          </div>
        ))}

        {/* Internal links, in the HTML: the only static path from this page
            to the rest of the site. Plain hrefs on purpose (a crawler follows
            them; the app's own navigation is JavaScript). */}
        <p className="aboutPanel__links">
          <a href="/about">{text("aboutLink")}</a>
          <a href="/maps">{text("communityMaps")}</a>
          <a href="/daily">{text("dailyChallenge")}</a>
          <a href="/leaderboard">{text("leaderboard")}</a>
        </p>
        {content.showFeaturedMaps && !showSections && (
          <>
            <h2>{text("aboutPopularMaps")}</h2>
            <p className="aboutPanel__links">
              {FEATURED_MAPS.map((m) => <a key={m.slug} href={`/map/${m.slug}`}>{m.name}</a>)}
            </p>
          </>
        )}
        {content.showLinks && (
          <p className="aboutPanel__links">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Google Play</a>
            <a href={APP_STORE_URL} target="_blank" rel="noreferrer">App Store</a>
          </p>
        )}
      </div>
    </section>
  );
}
