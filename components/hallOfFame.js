import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clientConfig from "@/clientConfig";
import { useSession } from "@/components/auth/auth";
import { useTranslation } from "@/components/useTranslations";
import { asset } from "@/lib/basePath";
import { nameGlowProps, GlowName } from "@/components/utils/usernameWithFlag";
import { NO_PROFILE_LINKS } from "@/components/utils/externalLinks";

/**
 * SEASON 0 HALL OF FAME
 *
 * The permanent record of the final Season 0 ladder, read from a static JSON
 * file in public/ that scripts/exportSeason0HallOfFame.js writes once on
 * migration day. No API, no database read, ever: the board describes a moment
 * that has already happened, so it cannot change and does not need a server.
 *
 * WHY THE COPY MATTERS AS MUCH AS THE CODE
 * ----------------------------------------
 * At migration everyone's rating is rescaled and a 20,000 becomes ~1,600. This
 * page is the counterweight: the old ladder kept intact so the people who built
 * those numbers still have the receipt. Two things must be unmissable on it or
 * it does the opposite of its job:
 *
 *   1. These are CLOSING standings, not career peaks. `seasonPeakElo` is a
 *      different (higher) number and it is shown on profiles and in the Season 1
 *      notice modal at the same time as this page exists. Someone who peaked at
 *      15,000 and finished on 12,000 will read this as a broken peak board
 *      unless we say, in words, that it is not one.
 *   2. Season 1 ratings are on a different scale. A 1,600 today is not worse
 *      than a 12,000 here; it is a different unit.
 *
 * PERFORMANCE: 1000 ROWS, AND THE FAILURE MODE WE ARE AVOIDING
 * ------------------------------------------------------------
 * The maps grid melted low-end devices by re-rendering its full grid on every
 * interaction. The same trap is wide open here, so:
 *
 *   - PAGINATED at PAGE_SIZE rows. At most ~50 rows are ever in the DOM,
 *     regardless of board size.
 *   - Rows are memo'd and take ONLY primitive props, so React.memo actually
 *     bites. No object or callback props, no per-row effects, no per-row
 *     translation lookups.
 *   - The search input owns its own text. `SearchBox` holds the raw value in
 *     its own state and pushes it up only after SEARCH_DEBOUNCE_MS, so a
 *     keystroke re-renders one <input> and nothing else. The board does not
 *     re-render at all until the debounce fires.
 *   - Every derived list is useMemo'd off `players` (a stable array identity
 *     from state) and the debounced query.
 */

/** Static artefact written by scripts/exportSeason0HallOfFame.js --apply. */
export const HALL_OF_FAME_PATH = "/season0-hall-of-fame.json";

/**
 * Payload shape this component understands. A file stamped with anything else
 * is treated as absent rather than rendered half-parsed: the JSON is a static
 * asset that can sit in a CDN cache far longer than a deploy, so "newer file,
 * older page" is a real state and it must fail closed.
 */
export const SUPPORTED_SCHEMA_VERSION = 1;

const PAGE_SIZE = 50;
const PODIUM_SIZE = 3;
const SEARCH_DEBOUNCE_MS = 200;

const EMPTY_LIST = [];

/**
 * Season 0 tier cosmetics, hardcoded rather than imported from
 * components/utils/leagues.js. That module resolves through getActiveLeagues(),
 * which returns the V2 table once the rating v2 flag is on, and every name here
 * is a V1 tier. A permanent Season 0 board must not change appearance because a
 * live flag flipped.
 */
const LEAGUE_SLUGS = {
  Nomad: "nomad",
  Voyager: "voyager",
  Explorer: "explorer",
  Trekker: "trekker",
};

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

/**
 * Parse and validate the payload.
 *
 * Deliberately takes TEXT and parses it here rather than using res.json(). A
 * missing static asset does not always arrive as a clean 404 body: SPA-style
 * hosting can answer with an HTML shell, and some CDNs serve their own error
 * page. Parsing ourselves means every one of those cases lands in the same
 * place as a genuine 404 (return null, render "not open yet") instead of
 * throwing somewhere less convenient.
 */
export function parseHallOfFame(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return null;
  if (!Array.isArray(data.players) || data.players.length === 0) return null;
  return data;
}

function formatNumber(value, lang) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  try {
    return num.toLocaleString(lang || "en");
  } catch (e) {
    return num.toLocaleString();
  }
}

function formatWinRate(winRate) {
  // null means zero career games. Rendering "0%" there would read as a player
  // who lost everything rather than one who never queued.
  if (typeof winRate !== "number" || !Number.isFinite(winRate)) return "-";
  return `${Math.round(winRate * 100)}%`;
}

/* ------------------------------------------------------------------ *
 * Row
 * ------------------------------------------------------------------ */

/**
 * ONE ROW. Primitive props only — that is what makes the memo real. Adding an
 * object or an inline callback here silently turns every prop comparison false
 * and re-renders the whole page of rows on any parent update.
 *
 * Five columns, matching the header row exactly. Win rate is deliberately NOT
 * one of them: it is in the export and on the podium cards, but a sixth column
 * is what breaks the mobile collapse, and rank / name / league / games / rating
 * is what this board is actually for.
 *
 * `gamesLabel` rides along as a primitive so the collapsed mobile layout can
 * read "Nomad · 1,234 games" without the column header that labels it on
 * desktop. CSS shows and hides that one span; nothing here branches on width.
 */
const HallOfFameRow = memo(function HallOfFameRow({
  rank,
  username,
  elo,
  games,
  league,
  lang,
  gamesLabel,
  isMe,
  glow = null,
}) {
  const slug = LEAGUE_SLUGS[league] || "trekker";
  return (
    <div className={`hof-row${isMe ? " hof-row--me" : ""}`}>
      <div className="hof-row__rank">{rank <= 3 ? MEDALS[rank - 1] : `#${rank}`}</div>
      <div className="hof-row__name">
        <PlayerName username={username} glow={glow} />
      </div>
      <div className={`hof-row__league hof-league--${slug}`}>{league}</div>
      <div className="hof-row__games">
        {formatNumber(games, lang)}
        <span className="hof-row__unit"> {gamesLabel}</span>
      </div>
      <div className="hof-row__rating">{formatNumber(elo, lang)}</div>
    </div>
  );
});

/**
 * Profile link, or plain text on the builds that cannot carry one: Poki deploys
 * to a nested per-version CDN path with no /user route, and GameDistribution
 * forbids opening tabs outright. Same rule as the daily leaderboard modal.
 */
function PlayerName({ username, glow = null }) {
  const label = <GlowName glow={glow}>{username}</GlowName>;
  if (NO_PROFILE_LINKS) return <span className="hof-name">{label}</span>;
  return (
    <Link
      href={`/user?u=${encodeURIComponent(username)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hof-name hof-name--link"
    >
      {label}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Podium
 * ------------------------------------------------------------------ */

/**
 * SLOT, NOT RANK. The card's gold/silver/bronze treatment is keyed on POSITION
 * in the top three, never on `rank` — under competition ranking a rank repeats
 * and then skips, so a two-way tie for second yields ranks 1, 2, 2 and there is
 * no rank-3 card at all. Keying the class on rank left that third card with no
 * metal, no height offset and no order, which drops it to the front of the row.
 * The displayed rank stays the true (possibly shared) one.
 */
const PODIUM_SLOTS = ["gold", "silver", "bronze"];

const Podium = memo(function Podium({ entries, lang, myKey, gamesLabel, myGlow = null }) {
  if (!entries.length) return null;
  return (
    <div className="hof-podium">
      {entries.map((entry, index) => {
        const slug = LEAGUE_SLUGS[entry.league] || "trekker";
        const isMe = myKey !== null && entry.username.toLowerCase() === myKey;
        const slot = PODIUM_SLOTS[index] || "bronze";
        return (
          <div
            key={entry.username}
            className={`hof-podium__card hof-podium__card--${slot}${isMe ? " hof-podium__card--me" : ""}`}
          >
            {/* The MEDAL follows the rank, not the slot: two players tied for
                second both get silver and nobody gets bronze, which is what a
                shared rank means. Competition ranking guarantees the entry at
                index i has rank <= i+1, so this index is always 0..2. */}
            <div className="hof-podium__medal">{MEDALS[entry.rank - 1] || MEDALS[index]}</div>
            <div className="hof-podium__rank">#{entry.rank}</div>
            <div className="hof-podium__name">
              <PlayerName username={entry.username} glow={isMe ? myGlow : null} />
            </div>
            <div className="hof-podium__rating">{formatNumber(entry.elo_s0, lang)}</div>
            <div className={`hof-podium__league hof-league--${slug}`}>{entry.league}</div>
            <div className="hof-podium__meta">
              {formatNumber(entry.games, lang)} {gamesLabel} · {formatWinRate(entry.winRate)}
            </div>
          </div>
        );
      })}
    </div>
  );
});

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/**
 * The search field owns its own text and only publishes a DEBOUNCED value.
 *
 * This is the whole reason typing here is cheap: the parent never sees the
 * intermediate keystrokes, so it does not re-render, so the row list does not
 * re-render. `onQueryChange` must therefore be a STABLE callback (a bare state
 * setter or a useCallback with no deps) or this component remounts and loses
 * both its text and its pending timer.
 */
const SearchBox = memo(function SearchBox({ placeholder, onQueryChange }) {
  const [raw, setRaw] = useState("");
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = (e) => {
    const value = e.target.value;
    setRaw(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onQueryChange(value), SEARCH_DEBOUNCE_MS);
  };

  return (
    <input
      className="hof-search"
      type="search"
      inputMode="search"
      autoComplete="off"
      spellCheck={false}
      value={raw}
      onChange={handleChange}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  );
});

/* ------------------------------------------------------------------ *
 * Empty state
 * ------------------------------------------------------------------ */

/**
 * Rendered whenever the JSON is missing, unparseable or of an unknown schema
 * version — which is the NORMAL state right up until migration day, when the
 * file does not exist at all. It must never be a crash and never a blank page.
 */
export function HallOfFameUnavailable({ title, body, retryLabel, onRetry }) {
  return (
    <div className="hof-empty">
      <div className="hof-empty__mark">{"\u{1F3C6}"}</div>
      <h2 className="hof-empty__title">{title}</h2>
      <p className="hof-empty__body">{body}</p>
      {onRetry && (
        <button type="button" className="hof-btn" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Board
 * ------------------------------------------------------------------ */

/**
 * @param {object|null} initialData Already-parsed payload. When supplied the
 *   board renders it immediately and NO fetch is made. Nothing in the app
 *   passes it today (the JSON is written on migration day, after this build
 *   ships, so it cannot be baked in at build time under output:'export') — it
 *   exists so a caller that already holds the payload, or a render harness, can
 *   mount the finished board without a network round trip.
 */
export default function HallOfFame({ initialData = null }) {
  const { t: text, lang } = useTranslation();
  const { data: session } = useSession();

  const [status, setStatus] = useState(initialData ? "ready" : "loading"); // loading | ready | unavailable
  const [data, setData] = useState(initialData);
  const [attempt, setAttempt] = useState(0);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [searchToken, setSearchToken] = useState(0);
  const [scrollTick, setScrollTick] = useState(0);

  // useSession only starts its auth fetch once window.cConfig exists, and
  // cConfig is installed by home.js — which never runs if someone opens
  // /hall-of-fame directly or lands on it from a shared link. Without this the
  // "highlight my own row" feature would work only for players who arrived via
  // the home menu. Same install pages/mod.js does.
  //
  // The state bump is the point: cConfig is read during useSession's RENDER, so
  // setting it in an effect only takes effect on the next render, and something
  // has to cause one. Signed-out visitors never make a request (useSession
  // short-circuits when there is no stored secret), so this costs them nothing.
  const [, setAuthReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.cConfig) window.cConfig = clientConfig();
    setAuthReady(true);
  }, []);

  useEffect(() => {
    // Preloaded by the caller: there is nothing to go and get.
    if (initialData) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    setStatus("loading");

    fetch(asset(HALL_OF_FAME_PATH), { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : null))
      .then((raw) => {
        if (cancelled) return;
        const parsed = raw === null ? null : parseHallOfFame(raw);
        if (parsed) {
          setData(parsed);
          setStatus("ready");
        } else {
          setData(null);
          setStatus("unavailable");
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setData(null);
        setStatus("unavailable");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, initialData]);

  const players = data?.players || EMPTY_LIST;

  const myUsername = session?.token?.username || null;
  const myKey = myUsername ? myUsername.toLowerCase() : null;
  // THE VIEWER'S OWN ROW, AND ONLY THE VIEWER'S OWN ROW.
  //
  // This board is a FROZEN Season 0 snapshot served as a static file
  // (public/season0-hall-of-fame.json, written by a script), so it carries no
  // cosmetics and there is nowhere to add them without a new public endpoint
  // that resolves a page of usernames to skus. Deliberately not built: this is
  // an archive of a closed season, the rows are a historical record, and the one
  // person whose purchase being invisible here is a bug is the person looking at
  // their own name. Theirs comes off the session and costs nothing.
  //
  // Animated: it is one row per page, not a hundred.
  const myGlow = nameGlowProps(session?.token?.cosmetics?.equipped?.nameGlow);

  const myEntry = useMemo(() => {
    if (!myKey) return null;
    return players.find((p) => p.username && p.username.toLowerCase() === myKey) || null;
  }, [players, myKey]);

  const podium = useMemo(() => players.slice(0, PODIUM_SIZE), [players]);

  const normalizedQuery = query.trim().toLowerCase();

  // Unfiltered, the list carries ranks 4+ because 1-3 are already the podium.
  // Filtered, it searches the WHOLE board so that typing a top-three name still
  // finds them rather than looking broken.
  const rows = useMemo(() => {
    if (!normalizedQuery) return players.slice(PODIUM_SIZE);
    return players.filter((p) => p.username && p.username.toLowerCase().includes(normalizedQuery));
  }, [players, normalizedQuery]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Clamped rather than stored: the row set can shrink under a page index (new
  // search, retry after a reload) and a page pointing past the end would render
  // an empty list that looks like a bug.
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [rows, safePage]
  );

  // Stable identity: SearchBox is memo'd on it, and an unstable callback would
  // remount the input on every parent render and eat the user's text.
  const handleQueryChange = useCallback((value) => {
    setQuery(value);
    setPage(0);
  }, []);

  const jumpToMe = useCallback(() => {
    if (!myEntry) return;
    // Clear any active filter first, so the index we compute is an index into
    // the full board. Remounting SearchBox via its key is what empties the
    // input it owns.
    setQuery("");
    setSearchToken((t) => t + 1);
    const index = players.findIndex((p) => p.username === myEntry.username);
    const listIndex = index - PODIUM_SIZE;
    setPage(listIndex < 0 ? 0 : Math.floor(listIndex / PAGE_SIZE));
    setScrollTick((t) => t + 1);
  }, [myEntry, players]);

  // ONE effect for the jump, on the container. Not one per row: a scroll hook
  // attached to a thousand rows is exactly the pattern this page exists to
  // avoid.
  useEffect(() => {
    if (!scrollTick || typeof document === "undefined") return;
    const el = document.querySelector(".hof-row--me, .hof-podium__card--me");
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [scrollTick]);

  const frozenDate = useMemo(() => {
    if (!data?.generated_at) return null;
    const d = new Date(data.generated_at);
    if (Number.isNaN(d.getTime())) return null;
    try {
      return d.toLocaleDateString(lang || "en", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }, [data, lang]);

  const gamesLabel = text("hallOfFameColGames").toLowerCase();

  return (
    <div className="hof">
      <header className="hof-header">
        <h1 className="hof-title">{text("hallOfFameTitle")}</h1>
        <p className="hof-subtitle">{text("hallOfFameSubtitle")}</p>

        <div className="hof-notes">
          {frozenDate && <p className="hof-note">{text("hallOfFameFrozenOn", { date: frozenDate })}</p>}
          <p className="hof-note">{text("hallOfFameClosingNote")}</p>
          <p className="hof-note">{text("hallOfFameScaleNote")}</p>
        </div>

        <div className="hof-header__actions">
          <Link className="hof-btn hof-btn--ghost" href="/leaderboard">
            {text("hallOfFameSeason1Link")}
          </Link>
          <Link className="hof-btn hof-btn--ghost" href="/">
            {text("backToGame")}
          </Link>
        </div>
      </header>

      {status === "loading" && (
        <div className="hof-loading">
          <div className="hof-spinner" />
          <p>{text("hallOfFameLoading")}</p>
        </div>
      )}

      {status === "unavailable" && (
        <HallOfFameUnavailable
          title={text("hallOfFameUnavailableTitle")}
          body={text("hallOfFameUnavailableBody")}
          retryLabel={text("shopRetry")}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}

      {status === "ready" && (
        <>
          <Podium entries={podium} lang={lang} myKey={myKey} gamesLabel={gamesLabel} myGlow={myGlow} />

          {myEntry && (
            <div className="hof-you">
              <span className="hof-you__label">{text("hallOfFameYouLabel")}</span>
              <span className="hof-you__rank">#{formatNumber(myEntry.rank, lang)}</span>
              <span className="hof-you__name">
                <GlowName glow={myGlow}>{myEntry.username}</GlowName>
              </span>
              <span className="hof-you__meta">
                {myEntry.league} · {formatNumber(myEntry.games, lang)} {gamesLabel} · {formatWinRate(myEntry.winRate)}
              </span>
              <span className="hof-you__rating">{formatNumber(myEntry.elo_s0, lang)}</span>
              <button type="button" className="hof-btn hof-btn--small" onClick={jumpToMe}>
                {text("hallOfFameJumpToMe")}
              </button>
            </div>
          )}

          {myUsername && !myEntry && (
            <p className="hof-notonboard">
              {text("hallOfFameNotOnBoard", { count: formatNumber(players.length, lang) })}
            </p>
          )}

          <div className="hof-toolbar">
            <SearchBox
              key={searchToken}
              placeholder={text("hallOfFameSearchPlaceholder")}
              onQueryChange={handleQueryChange}
            />
            <span className="hof-count">
              {text("hallOfFameShowing", {
                shown: formatNumber(pageRows.length, lang),
                total: formatNumber(rows.length, lang),
              })}
            </span>
          </div>

          <div className="hof-list">
            <div className="hof-row hof-row--head">
              <div className="hof-row__rank">{text("rank")}</div>
              <div className="hof-row__name">{text("hallOfFameColPlayer")}</div>
              <div className="hof-row__league">{text("hallOfFameColLeague")}</div>
              <div className="hof-row__games">{text("hallOfFameColGames")}</div>
              <div className="hof-row__rating">{text("hallOfFameColRating")}</div>
            </div>

            {pageRows.length === 0 && (
              <div className="hof-noresults">
                <p>{text("hallOfFameNoResults")}</p>
                <p className="hof-note">{text("tryAdjustingSearchTerms")}</p>
              </div>
            )}

            {pageRows.map((entry) => (
              <HallOfFameRow
                key={`${entry.rank}-${entry.username}`}
                rank={entry.rank}
                username={entry.username}
                elo={entry.elo_s0}
                games={entry.games}
                league={entry.league}
                lang={lang}
                gamesLabel={gamesLabel}
                isMe={myKey !== null && entry.username.toLowerCase() === myKey}
                glow={myKey !== null && entry.username.toLowerCase() === myKey ? myGlow : null}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="hof-pager">
              <button
                type="button"
                className="hof-btn hof-btn--small"
                disabled={safePage === 0}
                onClick={() => setPage(Math.max(0, safePage - 1))}
              >
                {text("hallOfFamePrev")}
              </button>
              <span className="hof-pager__label">
                {text("hallOfFamePageOf", {
                  page: formatNumber(safePage + 1, lang),
                  pages: formatNumber(pageCount, lang),
                })}
              </span>
              <button
                type="button"
                className="hof-btn hof-btn--small"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              >
                {text("hallOfFameNext")}
              </button>
            </div>
          )}

          <p className="hof-footnote">{text("hallOfFameFootnote")}</p>
        </>
      )}
    </div>
  );
}
