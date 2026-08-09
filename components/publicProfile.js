import { useState } from "react";
import AccountView from "./accountView";
import EloView from "./eloView";
import { useTranslation } from '@/components/useTranslations';
import CountryFlag from './utils/countryFlag';
import { nameGlowProps, GlowName } from './utils/usernameWithFlag';

/**
 * Translate with an English default — see the identical helper in
 * pages/leaderboard/index.js for why. `t()` renders the KEY when a key is
 * missing, and these strings ship ahead of their locale entries.
 */
const withFallback = (text, key, fallback) => {
    const translated = text(key);
    return translated === key ? fallback : translated;
};

/** One label/value line inside the OG badge's card. */
function OgStat({ label, value }) {
    return (
        <span className="s1-ogCard__row">
            <span className="s1-ogCard__rowLabel">{label}</span>
            <span className="s1-ogCard__rowValue">{value}</span>
        </span>
    );
}

/**
 * "Aug 2021" in the viewer's locale, or null for a missing/garbage date.
 *
 * Month + year, never a full timestamp: the join date on an OG profile is a
 * badge of tenure, not a record, and the exact day is nobody's business.
 */
function formatJoinMonth(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/**
 * THE OG BADGE
 *
 * One chip under the name — star, "OG", two-word caption — with the whole
 * Season 0 record on the card underneath it.
 *
 * THERE WAS A SECOND CHIP HERE. It printed the career peak as a big gold
 * number, and the card below it already had a "Peak rating" row saying the same
 * thing three centimetres away. One fact, two places, on the same screen: the
 * chip went. Do not add it back — put anything new in a card row instead.
 *
 * WHAT CANNOT BE CUT IS THE SCALE LABELLING. `seasonPeakElo` is on the retired
 * 0-20,000 scale, the live rating one tab away is on the 100-1,600 one, and the
 * dead number is the ~12x bigger of the two. A player who reads "20,000" as a
 * current rating concludes the site stole 18,400 points from them. Inside the
 * card the row labels plus the closing note carry that; nothing here may render
 * a bare Season 0 number with no words around it.
 *
 * Every number comes from a Season 0 field and NOTHING is derived from the
 * current rating. A fabricated career high on a profile is worse than no career
 * high at all.
 */
function Season0Badges({ profileData, text }) {
    // `> 0` and not just != null: the migration leaves `seasonPeakElo` null on
    // accounts created after the flip, and those players have no Season 0 to
    // show. A 0 would render a "Peak rating: 0" row, which is a lie.
    const peakRaw = Number(profileData?.seasonPeakElo);
    const hasPeak = Number.isFinite(peakRaw) && peakRaw > 0;
    // Strict `=== true`, and the SERVER decides. api/publicProfile.js resolves
    // the predicate (shared/season0/rank.js `hasSeason0`) and publishes one
    // boolean: every account that was here for Season 0 is OG, not just the ones
    // the compensation script stamped. Widening it here instead would mean web
    // and mobile each carrying their own definition of "veteran".
    const isOg = profileData?.ogAccount === true;
    const peakLeague = typeof profileData?.seasonPeakLeague === 'string' && profileData.seasonPeakLeague.trim()
        ? profileData.seasonPeakLeague
        : null;

    // Season 0 CLOSING rating (api/publicProfile.js `season0Elo`), which is a
    // different and usually smaller number than the peak above. Same `> 0` test
    // and the same reason: null on every account the migration never touched,
    // and a "Final rating: 0" line would be a lie rather than an absence.
    const finalRaw = Number(profileData?.season0Elo);
    const hasFinal = Number.isFinite(finalRaw) && finalRaw > 0;
    // Closing place on the Season 0 ladder, from the frozen rank table. Absent
    // until that table has been exported, and absent for anyone the Hall of Fame
    // excludes — in both cases the row simply does not render. It is NEVER
    // approximated from the live rank, which ranks a different ladder.
    const rankRaw = Number(profileData?.season0Rank);
    const hasRank = Number.isFinite(rankRaw) && rankRaw > 0;
    const joinedMonth = formatJoinMonth(profileData?.createdAt);

    if (!isOg) return null;

    return (
        <div className="s1-badges">
            {/* tabIndex + :focus-within (see the CSS) so the card is not
                hover-only. No `title` here: a native tooltip would render on
                top of the card that replaced it. */}
            <div className="s1-badge s1-badge--og" tabIndex={0}>
                <span className="s1-badge__icon" aria-hidden="true">⭐</span>
                <span className="s1-badge__body">
                    <span className="s1-badge__ogTag">OG</span>
                    <span className="s1-badge__label">
                        {withFallback(text, 'ogBadgeLabel', 'WorldGuessr veteran')}
                    </span>
                </span>

                {/* NO TITLE. The card used to open with a gold "SEASON 0"
                    eyebrow; the chip it hangs off already says OG and
                    WorldGuessr veteran, and the closing note says when that
                    was, so the eyebrow was a third way of saying the same
                    thing. The rows start straight in. */}
                <span className="s1-ogCard">
                    {joinedMonth && (
                        <OgStat
                            label={withFallback(text, 'ogCardJoined', 'Joined')}
                            value={joinedMonth}
                        />
                    )}
                    {hasFinal && (
                        <OgStat
                            label={withFallback(text, 'ogCardFinal', 'Final rating')}
                            value={Math.round(finalRaw).toLocaleString()}
                        />
                    )}
                    {/* Where that rating finished on the closing ladder. The "#"
                        is what makes it read as a place rather than yet another
                        rating on a scale nobody remembers. */}
                    {hasRank && (
                        <OgStat
                            label={withFallback(text, 'ogCardRank', 'Final rank')}
                            value={`#${Math.round(rankRaw).toLocaleString()}`}
                        />
                    )}
                    {hasPeak && (
                        <OgStat
                            label={withFallback(text, 'ogCardPeak', 'Peak rating')}
                            value={Math.round(peakRaw).toLocaleString()}
                        />
                    )}
                    {peakLeague && (
                        <OgStat
                            label={withFallback(text, 'ogCardPeakLeague', 'Peak league')}
                            value={peakLeague}
                        />
                    )}
                    {/* WHAT THE BADGE MEANS, in one line: the account predates
                        the ranked update. NOT "played before ranked history was
                        saved", which is what this used to say and which stopped
                        being true the day the badge widened — most OG accounts
                        never played a ranked game, and a badge that describes
                        something the holder never did reads as broken. Tenure is
                        the claim, and the Joined row above is the evidence. */}
                    <span className="s1-ogCard__note">
                        {withFallback(text, 'ogBadgeNote', 'This account was created before the ranked update.')}
                    </span>
                </span>
            </div>
        </div>
    );
}

export default function PublicProfile({ profileData, eloData }) {
    const { t: text } = useTranslation("common");
    const [activePage, setActivePage] = useState("profile");

    const navigationItems = [
        { key: "profile", label: text("profile"), icon: "👤" },
        { key: "elo", label: text("ELO"), icon: "🏆" },
    ];

    const renderContent = () => {
        switch (activePage) {
            case "profile":
                return (
                    <div className="profile-content">
                        <AccountView
                            accountData={profileData}
                            eloData={eloData}
                            session={null}
                            isPublic={true}
                            username={profileData?.username}
                            viewingPublicProfile={true}
                        />
                    </div>
                );
            case "elo":
                return (
                    <div className="elo-content">
                        <EloView
                            eloData={eloData}
                            session={null}
                            isPublic={true}
                            username={profileData?.username}
                            viewingPublicProfile={true}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    // Dark profile chrome → the dark variant. api/publicProfile.js returns only
    // the equipped nameGlow under `cosmetics`; nothing else about a stranger's
    // inventory is public and nothing else is read here.
    const headerGlow = nameGlowProps(profileData?.cosmetics?.equipped?.nameGlow);

    return (
        <div className="public-profile-container">
            <div className="public-profile-content">
                {/* Header */}
                <div className="public-profile-header">
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* ANIMATED HERE. This is one name on a page nobody
                            scrolls a hundred of — the exact opposite of the
                            leaderboard, and the surface a player links people to
                            when they want the thing they bought to be seen. */}
                        <GlowName glow={headerGlow}>{profileData?.username}</GlowName>
                        {profileData?.countryCode && <CountryFlag countryCode={profileData.countryCode} style={{ fontSize: '0.9em' }} />}
                    </h1>
                    {/* In the header, not the ELO tab, and deliberately: this is
                        a career mark that belongs to the identity. Keeping the
                        dead pre-update numbers out of the tab that shows the live
                        rating is also the cheapest way to stop the two being
                        read as one ladder. */}
                    <Season0Badges profileData={profileData} text={text} />
                </div>

                {/* Navigation */}
                <nav className="public-profile-nav">
                    {navigationItems.map(item => (
                        <button
                            key={item.key}
                            className={`public-profile-nav-item ${activePage === item.key ? 'active' : ''}`}
                            onClick={() => setActivePage(item.key)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <div className="public-profile-body">
                    {renderContent()}
                </div>
            </div>

            <style jsx>{`
                .public-profile-container {
                    width: 100%;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: "Lexend", "Lexend Fallback", sans-serif;
                }

                .public-profile-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                    font-family: "Lexend", "Lexend Fallback", sans-serif;
                }

                .public-profile-header {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 30px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .public-profile-header h1 {
                    margin: 0;
                    font-size: clamp(28px, 5vw, 48px);
                    font-weight: bold;
                    color: white;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: "Lexend", "Lexend Fallback", sans-serif;
                }

                .public-profile-nav {
                    display: flex;
                    gap: 10px;
                    padding: 20px;
                    background: rgba(0, 0, 0, 0.1);
                    overflow-x: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
                }

                .public-profile-nav::-webkit-scrollbar {
                    height: 6px;
                }

                .public-profile-nav::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                }

                .public-profile-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    color: white;
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    white-space: nowrap;
                    font-family: "Lexend", "Lexend Fallback", sans-serif;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                }

                .public-profile-nav-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                    transform: translateY(-2px);
                    border-color: rgba(255, 255, 255, 0.3);
                }

                .public-profile-nav-item.active {
                    background: var(--gradGreenBtn);
                    border-color: rgba(255, 255, 255, 0.3);
                    filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3));
                }

                .nav-icon {
                    font-size: 20px;
                }

                .nav-label {
                    font-size: 14px;
                }

                .public-profile-body {
                    padding: 30px;
                    max-height: calc(100vh - 300px);
                    overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
                    font-family: "Lexend", "Lexend Fallback", sans-serif;
                }

                .public-profile-body::-webkit-scrollbar {
                    width: 8px;
                }

                .public-profile-body::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 4px;
                }

                .profile-content,
                .elo-content {
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .public-profile-container {
                        padding: 10px;
                    }

                    .public-profile-header {
                        padding: 20px;
                    }

                    .public-profile-nav {
                        padding: 15px;
                    }

                    .public-profile-body {
                        padding: 20px;
                        max-height: calc(100vh - 250px);
                    }

                    .nav-label {
                        display: none;
                    }

                    .public-profile-nav-item {
                        padding: 12px;
                    }

                    .nav-icon {
                        font-size: 24px;
                    }
                }

                @media (max-width: 480px) {
                    .public-profile-body {
                        padding: 15px;
                    }
                }
            `}</style>
        </div>
    );
}
