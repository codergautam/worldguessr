import Head from "next/head";
import HallOfFame from "@/components/hallOfFame";
import { useTranslation } from "@/components/useTranslations";

/**
 * /hall-of-fame — the frozen Season 0 ladder.
 *
 * A thin shell on purpose. Everything that matters lives in
 * components/hallOfFame.js; this file owns the document head and the page
 * chrome only.
 *
 * NO getStaticProps, and the board is deliberately NOT baked into the bundle.
 * next.config.js runs output:'export', so anything read at build time is frozen
 * at build time — and public/season0-hall-of-fame.json is written by
 * scripts/exportSeason0HallOfFame.js on MIGRATION DAY, after this build ships.
 * Reading it at runtime means the page goes live the moment the file is
 * uploaded, with no rebuild, and it means the build cannot fail because the
 * file does not exist yet. Until it does exist the component renders its
 * "not open yet" state.
 */
export default function HallOfFamePage() {
  const { t: text } = useTranslation();

  return (
    <div className="hof-page">
      <Head>
        <title>{`${text("hallOfFameTitle")} - WorldGuessr`}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={text("hallOfFameSubtitle")} />
        <meta name="theme-color" content="#000000" />
        <meta name="robots" content="index, follow" />
        <style>
          {`
          /* The game pins the body; this is a document-scrolling page. Same
             pair of rules /leaderboard uses: scrollbar-gutter keeps a stable
             lane so switching between the short empty state and the tall board
             cannot re-centre the fixed background image. */
          body {
          overflow-y: auto !important;
          }
          html {
          scrollbar-gutter: stable;
          }
          `}
        </style>
      </Head>

      <main className="hof-main">
        <HallOfFame />
      </main>
    </div>
  );
}
