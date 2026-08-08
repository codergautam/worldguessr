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
 * CAREER PEAK + OG BADGES
 *
 * These are trophies. They read as a row of chips under the name — icon, big
 * number, short caption — and nothing else. The paragraph that used to sit
 * under each one turned a veteran's career high into release notes.
 *
 * WHAT CANNOT BE CUT IS THE CAPTION, whatever it currently says. `seasonPeakElo`
 * is on the retired 0-20,000 scale, the live rating one tab away is on the
 * 100-1,600 one, and the dead number is the ~12x bigger of the two. A player who
 * reads "20,000" as a current rating concludes the site stole 18,400 points from
 * them. The caption is the only thing that stops that, so it is never shortened
 * to a bare "Peak" and the chip is never rendered without it. The long-form
 * version survives as the `title` tooltip for whoever actually wants it.
 *
 * It used to say "Season 0 peak" and now says "Peak before ranked update": the
 * internal season number meant nothing to a player who never read a changelog,
 * and the ranked update is the event they actually lived through. The locale
 * KEYS still carry the season0 name because that is what the DATA is; only the
 * copy changed.
 *
 * The peak is rendered from `seasonPeakElo` ONLY. It is never derived from the
 * current rating and never falls back to it: a fabricated peak on a profile is
 * worse than no peak at all.
 */
function Season0Badges({ profileData, text }) {
    // `> 0` and not just != null: the migration leaves `seasonPeakElo` null on
    // accounts created after the flip, and those players have no Season 0 to
    // show. A 0 would render a "Season 0 peak: 0" trophy, which is a lie.
    const peakRaw = Number(profileData?.seasonPeakElo);
    const hasPeak = Number.isFinite(peakRaw) && peakRaw > 0;
    // Strict `=== true`. The field is a Boolean on the User doc, and anything
    // looser hands the badge to every account whose payload merely carries the
    // key (or a stray "false" string) — the badge is permanent and unearnable
    // after migration, so a false positive can never be taken back gracefully.
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
    const joinedMonth = formatJoinMonth(profileData?.createdAt);

    if (!hasPeak && !isOg) return null;

    return (
        <div className="s1-badges">
            {hasPeak && (
                <div
                    className="s1-badge"
                    title={withFallback(
                        text,
                        'season0PeakNote',
                        'Career high before the ranked update. Not comparable to the rating you have now.'
                    )}
                >
                    <span className="s1-badge__icon" aria-hidden="true">🏆</span>
                    <span className="s1-badge__body">
                        <span className="s1-badge__value">
                            {Math.round(peakRaw).toLocaleString()}
                            {peakLeague && <span className="s1-badge__league">{peakLeague}</span>}
                        </span>
                        <span className="s1-badge__label">
                            {withFallback(text, 'season0PeakLabel', 'Peak before ranked update')}
                        </span>
                    </span>
                </div>
            )}

            {isOg && (
                /* tabIndex + :focus-within (see the CSS) so the card is not
                   hover-only. No `title` here: a native tooltip would render on
                   top of the card that replaced it. */
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
                        <span className="s1-ogCard__note">
                            {withFallback(text, 'ogBadgeNote', 'Played before ranked history was saved.')}
                        </span>
                    </span>
                </div>
            )}
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
                    {/* In the header, not the ELO tab, and deliberately: these
                        are career marks that belong to the identity. Keeping the
                        dead pre-update number out of the tab that shows the live
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
