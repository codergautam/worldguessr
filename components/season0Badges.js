import { FaStar } from 'react-icons/fa6';

/** Translate with an English default when a locale has not shipped the key. */
const withFallback = (text, key, fallback) => {
    const translated = text(key);
    return translated === key ? fallback : translated;
};

function OgStat({ label, value }) {
    return (
        <span className="s1-ogCard__row">
            <span className="s1-ogCard__rowLabel">{label}</span>
            <span className="s1-ogCard__rowValue">{value}</span>
        </span>
    );
}

function formatJoinMonth(raw) {
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/**
 * Shared web presentation for the server-owned Season 0 eligibility and stats.
 */
export default function Season0Badges({ profileData, text, variant = 'default' }) {
    if (profileData?.ogAccount !== true) return null;

    const peakRaw = Number(profileData.seasonPeakElo);
    const finalRaw = Number(profileData.season0Elo);
    const rankRaw = Number(profileData.season0Rank);
    const hasPeak = Number.isFinite(peakRaw) && peakRaw > 0;
    const hasFinal = Number.isFinite(finalRaw) && finalRaw > 0;
    const hasRank = Number.isFinite(rankRaw) && rankRaw > 0;
    const peakLeague = typeof profileData.seasonPeakLeague === 'string' && profileData.seasonPeakLeague.trim()
        ? profileData.seasonPeakLeague
        : null;
    const joinedMonth = formatJoinMonth(profileData.createdAt);
    const badgeLabel = withFallback(text, 'ogBadgeLabel', 'WorldGuessr veteran');
    const compact = variant === 'compact';

    return (
        <span className={`s1-badges${compact ? ' s1-badges--compact' : ''}`}>
            <button
                type="button"
                className="s1-badge s1-badge--og"
                aria-label={`OG — ${badgeLabel}`}
            >
                <span className="s1-badge__icon" aria-hidden="true"><FaStar /></span>
                {compact ? (
                    <span className="s1-badge__ogTag">OG</span>
                ) : (
                    <span className="s1-badge__body">
                        <span className="s1-badge__ogTag">OG</span>
                        <span className="s1-badge__label">{badgeLabel}</span>
                    </span>
                )}

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
                    <span className="s1-ogCard__note">
                        {withFallback(text, 'ogBadgeNote', 'WorldGuessr v2.5')}
                    </span>
                </span>
            </button>
        </span>
    );
}
