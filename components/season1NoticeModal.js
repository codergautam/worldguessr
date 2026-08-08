import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useTranslation } from "@/components/useTranslations";
import clientConfig from "@/clientConfig";

/**
 * SEASON 1 FIRST-LOGIN NOTICE
 *
 * The one screen where a veteran finds out their 20,000 rating is now 1,600.
 * It is shown ONCE per account, ever, and the whole design is built around that:
 * the numbers are the content, they arrive in beats so the story lands in order,
 * and there is exactly one way out.
 *
 * WHAT IT IS NOT: it does not grant anything. Every Stamp it shows was already
 * applied by the migration script. This component reads server-computed numbers
 * and stamps a date.
 *
 * THE MIGRATION GRANTS NO XP. It used to pay up to 2.35M per account, and this
 * modal had a second gift tile for it. That was cut because it redefined what
 * XP means and put a vertical cliff through every veteran's XP graph. If the
 * tile is ever wanted back, the grant has to come back first.
 *
 * ONCE-PER-ACCOUNT, THREE LATCHES, IN ORDER OF AUTHORITY:
 *   1. SERVER      api/googleAuth omits `eloNotice` entirely once
 *                  eloNoticeSeenAt is set. This is the real guarantee and it is
 *                  account-wide, so a second device never re-shows it.
 *   2. AUTH CACHE  api/eloNoticeAck flushes `userAuth_<secret>`, or the 120s
 *                  server-side cache would keep replaying the pre-ack document.
 *   3. LOCAL CACHE useSession() optimistically hydrates from the
 *                  `wg_session_cache` localStorage snapshot BEFORE the network
 *                  verify returns. That snapshot is the whole auth response, so
 *                  it still carries eloNotice after a successful ack and would
 *                  flash the modal on the next reload. We strip the key from it
 *                  ourselves on ack success. (On ack FAILURE we deliberately
 *                  leave it, so the next login retries instead of losing it.)
 *
 * DISMISSAL: one affordance only. No title prop (so ui/Modal renders no header
 * and no X), disableBackdropClose, and a single Continue button.
 *
 * FIRST PAINT: mounted behind next/dynamic({ ssr:false }) at the call site and
 * self-delayed by ENTER_DELAY_MS after mount, so it never competes with the
 * app-open choreography or the home screen's first frame.
 */

/** Post-mount grace before the card appears. Lets home paint and settle first. */
const ENTER_DELAY_MS = 1100;

/**
 * The rating rebuild write-up. Same URL as the notice banner in eloView.js —
 * keep the two in sync. This modal deliberately does NOT explain the new
 * formula: it shows what happened to YOUR numbers and links out for the rest.
 */
const ELO_FORUM_POST_URL = "https://worldguessr.forum/t/ranked-elo-is-being-rebuilt/1237";

// Beat schedule, measured from the card appearing. Each entry is when that beat
// becomes visible; the count-ups start with their beat.
const BEAT_PEAK_MS = 350;
const BEAT_RATING_MS = 1500;
const BEAT_GIFTS_MS = 3300;
const BEAT_TAIL_MS = 4200;

const PEAK_COUNT_MS = 1000;
const RATING_COUNT_MS = 1600;
const GIFT_COUNT_MS = 900;

/** Ease-out cubic, the same curve roundOverScreen.js counts points with. */
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

const prefersReducedMotion = () => {
  try {
    return typeof window !== "undefined"
      && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
};

/**
 * House count-up: a 33ms interval (30Hz), not per-frame rAF. Copied in spirit
 * from roundOverScreen.js — nobody can read digits changing faster than this and
 * every tick re-renders the whole card. Snaps instantly under reduced motion.
 */
function useCountUp(from, to, durationMs, active) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    if (from === to || prefersReducedMotion()) {
      setValue(to);
      return;
    }

    const startTime = Date.now();
    const id = setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / durationMs, 1);
      setValue(Math.round(from + (to - from) * easeOutCubic(progress)));
      if (progress >= 1) {
        clearInterval(id);
        setValue(to);
      }
    }, 33);

    return () => clearInterval(id);
  }, [from, to, durationMs, active]);

  return value;
}

/**
 * Accounts dismissed in THIS page session (latch 4, the in-page one).
 *
 * The mount in home.js is gated on `screen === "home"`, so leaving for a game
 * and coming back UNMOUNTS and REMOUNTS this component with fresh state — and a
 * fresh state would replay the whole reveal, because `session.token.eloNotice`
 * is still sitting in the in-memory session object until the next verify. This
 * set is what makes a dismissal stick for the rest of the page's life.
 *
 * Deliberately module scope and NOT persisted: a reload SHOULD re-show it if the
 * ack never landed, which is the retry path.
 */
const dismissedThisPage = new Set();

/** Drop eloNotice from the optimistic-hydration snapshot. See latch 3 above. */
function stripNoticeFromSessionCache() {
  try {
    const raw = window.localStorage.getItem("wg_session_cache");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.eloNotice) return;
    delete parsed.eloNotice;
    window.localStorage.setItem("wg_session_cache", JSON.stringify(parsed));
  } catch (e) {
    // A quota/parse failure here only costs one extra modal impression, which
    // the server latch then corrects. Never let it break the dismiss.
  }
}

export default function Season1NoticeModal({ session, eloNotice, onDismissed }) {
  const { t: text, lang } = useTranslation("common");

  const [open, setOpen] = useState(false);
  const [beat, setBeat] = useState(0);
  const dismissedRef = useRef(false);

  const latchKey = session?.token?.accountId || session?.token?.secret || "";
  // Read the in-page latch ONCE, at mount, and never again.
  //
  // This used to be evaluated on every render, which silently killed the close
  // animation: handleDismiss calls setOpen(false) (starting ui/Modal's 200ms
  // slideOut) and then adds this account to dismissedThisPage. The setOpen
  // re-render immediately re-read the Set, found the key, computed notice=null
  // and hit `if (!notice) return null` below — so the entire Modal was
  // unmounted in the very commit that was meant to begin its exit, and the card
  // just vanished instead of sliding out.
  //
  // The Set's job is to stop a REMOUNT from replaying the reveal (leaving home
  // for a game and coming back), so mount time is the only moment it needs to
  // be read. After dismissal this instance keeps rendering, ui/Modal runs its
  // exit and then unmounts itself via its own isVisible flag.
  const [dismissedBeforeMount] = useState(() => !!(latchKey && dismissedThisPage.has(latchKey)));
  const notice = (eloNotice && !dismissedBeforeMount) ? eloNotice : null;
  // Primitive dep for the schedule effect below. Depending on `notice` itself
  // would restart every timer if the session object were ever re-created, and a
  // restarted schedule replays the whole reveal mid-read.
  const hasNotice = !!notice;
  const oldElo = Number(notice?.oldElo ?? 0);
  const peakElo = Number(notice?.peakElo ?? 0);
  const newElo = Number(notice?.newElo ?? 0);
  const stampsGranted = Number(notice?.stampsGranted ?? 0);

  // Delayed entrance + beat schedule. One effect owns every timer so the cleanup
  // cannot leave a stray beat firing into an unmounted tree.
  useEffect(() => {
    if (!hasNotice) return;

    const timers = [];
    const reduced = prefersReducedMotion();

    timers.push(setTimeout(() => {
      setOpen(true);
      if (reduced) {
        // No staging under reduced motion: everything is present immediately.
        setBeat(5);
        return;
      }
      setBeat(1);
      timers.push(setTimeout(() => setBeat(2), BEAT_PEAK_MS));
      timers.push(setTimeout(() => setBeat(3), BEAT_RATING_MS));
      timers.push(setTimeout(() => setBeat(4), BEAT_GIFTS_MS));
      timers.push(setTimeout(() => setBeat(5), BEAT_TAIL_MS));
    }, ENTER_DELAY_MS));

    return () => timers.forEach(clearTimeout);
  }, [hasNotice]);

  // The peak counts UP from zero: it is a trophy, so it should be earned on
  // screen. The Season 1 rating counts DOWN from the closing Season 0 number,
  // because that transition IS the message. Showing 1,600 on its own would read
  // as a bug; showing 20,000 becoming 1,600 reads as a conversion.
  const peakDisplay = useCountUp(0, peakElo, PEAK_COUNT_MS, beat >= 2);
  const ratingDisplay = useCountUp(oldElo, newElo, RATING_COUNT_MS, beat >= 3);
  const stampsDisplay = useCountUp(0, stampsGranted, GIFT_COUNT_MS, beat >= 4);

  const fmt = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "0";
    try {
      return num.toLocaleString(lang || "en");
    } catch (e) {
      return num.toLocaleString();
    }
  };

  const handleDismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    // Close FIRST, always. The ack is bookkeeping; the user is never held on
    // this screen waiting for a network round trip, and a failed request must
    // not trap them here.
    setOpen(false);
    if (latchKey) dismissedThisPage.add(latchKey);
    if (onDismissed) onDismissed();

    const secret = session?.token?.secret;
    if (!secret) return;

    fetch(clientConfig().apiUrl + "/api/eloNoticeAck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: secret }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("ack failed: " + res.status);
        // Only now is it safe to forget locally. On any failure we leave the
        // cached snapshot alone so the next login shows the notice again and
        // retries the ack, rather than silently losing it.
        stripNoticeFromSessionCache();
      })
      .catch(() => {});
  };

  if (!notice) return null;

  const actions = (
    <button onClick={handleDismiss}>
      {text("season1NoticeContinue")}
    </button>
  );

  return (
    <Modal
      isOpen={open}
      onClose={handleDismiss}
      actions={actions}
      variant="default"
      disableBackdropClose
    >
      <div className="s1">
        <div className={`s1__block s1__intro ${beat >= 1 ? "in" : ""}`}>
          <h2 className="s1__title">{text("season1NoticeTitle")}</h2>
          <p className="s1__body">{text("season1NoticeIntro")}</p>
        </div>

        <div className={`s1__stat s1__stat--peak ${beat >= 2 ? "in" : ""}`}>
          <div className="s1__label">{text("season1NoticePeakLabel")}</div>
          <div className="s1__number s1__number--peak">{fmt(peakDisplay)}</div>
          <p className="s1__note">{text("season1NoticePeakNote")}</p>
        </div>

        <div className={`s1__stat ${beat >= 3 ? "in" : ""}`}>
          <div className="s1__label">{text("season1NoticeNewLabel")}</div>
          <div className="s1__numberRow">
            <span className="s1__number">{fmt(ratingDisplay)}</span>
            {notice.league && (
              <span className={`s1__league ${beat >= 4 ? "in" : ""}`}>{notice.league}</span>
            )}
          </div>
          <p className="s1__note">{text("season1NoticeNewNote")}</p>
        </div>

        {/* Labelled so the tile reads as a GIFT rather than as one more
            statistic. Without it it sits in the same visual register as the
            peak and rating cards above, and nothing on screen says the Stamps
            are being given rather than merely reported.
            (The migration grants no XP, so Stamps are the only gift.) */}
        {stampsGranted > 0 && (
          <div className={`s1__giftsBlock ${beat >= 4 ? "in" : ""}`}>
            <div className="s1__label s1__giftsLabel">{text("season1NoticeGiftsLabel")}</div>
            <div className="s1__gifts">
              {/* Stamps are brand new, so this note says what they ARE rather
                  than what they were for. */}
              <div className="s1__gift">
                <div className="s1__giftValue">
                  +{fmt(stampsDisplay)} <span className="s1__giftUnit">{text("season1NoticeStampsUnit")}</span>
                </div>
                <p className="s1__note">{text("season1NoticeStampsNote")}</p>
              </div>
            </div>
          </div>
        )}

        {notice.ogBadge && (
          <div className={`s1__og ${beat >= 5 ? "in" : ""}`}>
            <span className="s1__ogTag">OG</span>
            <span className="s1__ogText">{text("season1NoticeOg")}</span>
          </div>
        )}

        {/* The full write-up, for anyone who wants the reasoning behind the
            new formula rather than just what happened to their own numbers. */}
        <a
          className={`s1__link ${beat >= 5 ? "in" : ""}`}
          href={ELO_FORUM_POST_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {text("season1NoticeForumLink")}
        </a>
      </div>

      <style jsx>{`
        /* Chrome, spacing and colour all come from the same tokens the .timer
           pill and the g2 containers use (--primary / --primaryTransparent /
           --gradLight). No new gradient card vocabulary is invented here: the
           card itself is ui/Modal's, and these are its inserts. */
        .s1 {
          font-family: "Lexend", "Lexend Fallback", sans-serif;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Beat reveal. Same 0.3s ease-out shape as the shared hudEnter
           keyframe, entering from below because these stack downward. */
        .s1__block,
        .s1__stat,
        .s1__giftsBlock,
        .s1__og,
        .s1__rewardNote,
        .s1__link {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.3s ease-out, transform 0.3s ease-out;
        }

        .s1__block.in,
        .s1__stat.in,
        .s1__giftsBlock.in,
        .s1__og.in,
        .s1__rewardNote.in,
        .s1__link.in {
          opacity: 1;
          transform: translateY(0);
        }

        .s1__rewardNote {
          margin: -6px 0 0 0;
          text-align: center;
        }

        /* The write-up link. Gold, matching the same notice link in
           eloView.js so the two read as the same announcement. */
        .s1__link {
          display: block;
          text-align: center;
          padding: 10px 14px;
          border: 1px solid rgba(255, 215, 0, 0.35);
          background: rgba(255, 215, 0, 0.08);
          border-radius: 12px;
          color: #ffd700;
          font-size: 0.9rem;
          font-weight: 500;
          text-decoration: none;
        }

        .s1__link:hover {
          background: rgba(255, 215, 0, 0.14);
        }

        .s1__title {
          margin: 0 0 10px 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: white;
          letter-spacing: 0.01em;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .s1__body {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.82);
        }

        .s1__stat {
          background: var(--gradLight), linear-gradient(rgba(6, 16, 10, 0.55), rgba(6, 16, 10, 0.55));
          background-color: var(--primaryTransparent);
          border: 2px solid var(--primary);
          border-radius: 16px;
          padding: 14px 18px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.35),
            0 4px 12px rgba(36, 87, 52, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        .s1__label {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255, 255, 255, 0.62);
          margin-bottom: 2px;
        }

        .s1__numberRow {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
        }

        .s1__number {
          font-size: 2.4rem;
          font-weight: 600;
          line-height: 1.1;
          color: #fff;
          /* tabular-nums so a counting number cannot make the card breathe,
             exactly as the duel timer does with its countdown. */
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.025em;
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
        }

        .s1__number--peak {
          color: #ffd700;
          text-shadow: 0 0 18px rgba(255, 215, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.45);
        }

        .s1__league {
          font-size: 0.9rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(0, 0, 0, 0.25);
          border-radius: 999px;
          padding: 3px 12px;
          opacity: 0;
          transform: scale(0.9);
          transition: opacity 0.25s ease-out, transform 0.25s ease-out;
        }

        .s1__league.in {
          opacity: 1;
          transform: scale(1);
        }

        .s1__note {
          margin: 6px 0 0 0;
          font-size: 0.85rem;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.7);
        }

        .s1__giftsLabel {
          margin-bottom: 8px;
        }

        .s1__gifts {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .s1__gift {
          flex: 1 1 180px;
          min-width: 0;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 12px 14px;
        }

        .s1__giftValue {
          font-size: 1.4rem;
          font-weight: 600;
          color: #4ade80;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
        }

        .s1__giftUnit {
          font-size: 0.8em;
          color: rgba(255, 255, 255, 0.75);
          font-weight: 500;
        }

        .s1__og {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255, 215, 0, 0.35);
          background: rgba(255, 215, 0, 0.08);
          border-radius: 12px;
          padding: 10px 14px;
        }

        .s1__ogTag {
          flex-shrink: 0;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: #ffd700;
          border: 1px solid rgba(255, 215, 0, 0.5);
          border-radius: 6px;
          padding: 2px 8px;
        }

        .s1__ogText {
          font-size: 0.85rem;
          line-height: 1.4;
          color: rgba(255, 255, 255, 0.85);
        }

        @media (max-width: 768px) {
          .s1 {
            gap: 14px;
          }
          .s1__title {
            font-size: 1.25rem;
          }
          .s1__number {
            font-size: 2rem;
          }
        }

        /* Narrow phones. The two reward tiles are flex 1 1 180px, so on a
           320-360px screen they can neither fit side by side nor wrap cleanly:
           180 + 180 + gap overflows the card and the whole modal gains a
           horizontal scrollbar. Force one per row and let the chrome shrink
           with it. (No backticks in here. This block lives inside a styled-jsx
           template literal, so a backtick ends the string and the CSS below it
           is parsed as JavaScript.) */
        @media (max-width: 420px) {
          .s1 {
            gap: 12px;
          }
          .s1__title {
            font-size: 1.1rem;
            line-height: 1.4;
          }
          .s1__number {
            font-size: 1.75rem;
          }
          .s1__stat {
            padding: 12px 14px;
          }
          .s1__gifts {
            flex-direction: column;
            gap: 10px;
          }
          .s1__gift {
            flex: 1 1 auto;
            width: 100%;
          }
          .s1__giftValue {
            font-size: 1.25rem;
          }
          /* The rating and its league chip stop sharing a line: at this width
             "1,247" + "Voyager" pushes the chip off the card edge. */
          .s1__numberRow {
            flex-wrap: wrap;
            row-gap: 6px;
          }
          .s1__note,
          .s1__link {
            font-size: 0.82rem;
          }
          .s1__og {
            padding: 8px 12px;
          }
          .s1__ogText {
            font-size: 0.82rem;
          }
        }
      `}</style>
    </Modal>
  );
}
