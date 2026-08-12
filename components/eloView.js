import { useTranslation } from '@/components/useTranslations'
import { getLeague, getActiveLeagues, resolveLeague } from "./utils/leagues";
import { useState } from "react";
import XPGraph from "./XPGraph";

export { resolveLeague };

/** Legend is the only tier dark enough to need light text on its own colour. */
const LEGEND_NAME = 'Legend';

const statItemStyle = {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 'clamp(8px, 2vw, 15px)',
    padding: 'clamp(12px, 3vw, 20px)',
    textAlign: 'center',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    transition: 'all 0.3s ease'
};

const statLabelStyle = {
    fontSize: 'clamp(12px, 2.5vw, 16px)',
    color: '#b0b0b0',
    marginBottom: 'clamp(4px, 1.5vw, 8px)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '500'
};

const statValueStyle = {
    fontSize: 'clamp(18px, 4vw, 28px)',
    color: '#ffd700',
    fontWeight: 'bold',
    textShadow: '0 0 10px rgba(255, 215, 0, 0.3)'
};

// One stat tile — single source for the hover lift so every tile behaves the
// same (the old copy-pasted divs had drifted: the 2v2 tiles lost their hover).
function StatTile({ label, value }) {
    return (
        <div style={statItemStyle}
             onMouseEnter={(e) => {
                 e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                 e.currentTarget.style.transform = 'translateY(-5px)';
             }}
             onMouseLeave={(e) => {
                 e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                 e.currentTarget.style.transform = 'translateY(0)';
             }}>
            <div style={statLabelStyle}>{label}</div>
            {/* s1-stat-value: tabular figures + min-width:0 so a 4-digit rating
                sits in the tile instead of widening the auto-fit grid column.
                See styles/season1Badges.css. */}
            <div className="s1-stat-value" style={statValueStyle}>{value}</div>
        </div>
    );
}

export default function EloView({ eloData, session, isPublic = false, username = null, viewingPublicProfile = false }) {
    const { t: text } = useTranslation("common");
    // Server-provided league wins over the local cutoff table. api/eloRank.js
    // returns the whole resolved object as `league`; older payloads have none
    // and fall through to the bundled table. See resolveLeague above.
    const userLeague = resolveLeague(eloData.elo, eloData.league);
    const [hoveredLeague, setHoveredLeague] = useState(null);

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(15px, 4vw, 30px)',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
    };

    const cardStyle = {
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 'clamp(10px, 3vw, 20px)',
        padding: 'clamp(15px, 4vw, 30px)',
        // No backdropFilter: inside the scrollable account-modal body, blur causes
        // white flicker artifacts during scroll. The dark backdrop makes it a no-op.
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    };

    const titleStyle = {
        fontSize: 'clamp(24px, 6vw, 48px)',
        fontWeight: 600,
        marginBottom: 'clamp(10px, 3vw, 20px)',
        color: 'white',
        textAlign: 'center',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
    };

    const descriptionStyle = {
        fontSize: 'clamp(14px, 3vw, 18px)',
        color: '#b0b0b0',
        marginBottom: '10px',
        textAlign: 'center',
        lineHeight: '1.5'
    };

    const statsGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 'clamp(10px, 3vw, 20px)',
        marginTop: 'clamp(10px, 3vw, 20px)'
    };

    const leagueContainerStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(8px, 2vw, 15px)',
        flexWrap: 'wrap',
        marginTop: 'clamp(15px, 4vw, 30px)',
        padding: 'clamp(10px, 3vw, 20px)',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 'clamp(10px, 3vw, 20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    };

    return (
        <div style={containerStyle}>
            {/* ELO rebuild notice */}
            <a
                href="https://worldguessr.forum/t/ranked-elo-is-being-rebuilt/1237"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'block',
                    background: 'rgba(74, 222, 128, 0.08)',
                    border: '1px solid rgba(74, 222, 128, 0.35)',
                    borderRadius: 'clamp(8px, 2vw, 15px)',
                    padding: 'clamp(10px, 2.5vw, 14px) clamp(12px, 3vw, 20px)',
                    color: '#4ade80',
                    fontSize: 'clamp(13px, 2.8vw, 16px)',
                    textAlign: 'center',
                    textDecoration: 'none',
                    lineHeight: 1.4
                }}
            >
                {text("eloRebuildNotice")}{' '}
                <span style={{ textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                    {text("eloRebuildLink")} →
                </span>
            </a>

            {/* ELO Header */}
            {/* <div style={cardStyle}>
                <h1 style={titleStyle}>{text("ELO")}</h1>

                <p style={descriptionStyle}>
                    {text("leagueModalDesc")}
                </p>

                 <p style={descriptionStyle}>
                    {text("leagueModalDesc2")}
                </p>
            </div> */}

            {/* League System */}
            <div style={cardStyle}>
                <h2 style={{
                    fontSize: 'clamp(20px, 4vw, 32px)',
                    fontWeight: 600,
                    marginBottom: 'clamp(10px, 3vw, 20px)',
                    color: 'white',
                    textAlign: 'center'
                }}>
                    {text("leagues")}
                </h2>

                <div style={leagueContainerStyle}>
                    {/* getActiveLeagues(), never a hardcoded table: it returns the
                        RatingConfig override when one is installed, else the v2
                        table. Reading `leagues` directly here rendered the dead
                        v1 tiers (0-1999 / 2000-4999 / …) against v2 ratings, so
                        every player looked like a bottom-tier Trekker. */}
                    {Object.values(getActiveLeagues()).map((league) => {
                        const isCurrentLeague = userLeague.name === league.name;
                        const eloNeeded = league.min;
                        const isLegend = league.name === LEGEND_NAME;

                        return (
                            <div
                                key={league.name}
                                style={{
                                    position: 'relative',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'transform 0.3s ease',
                                    transform: isCurrentLeague ? 'scale(1.15)' : 'scale(1)',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.2)';
                                    setHoveredLeague(league.name)
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = isCurrentLeague ? 'scale(1.15)' : 'scale(1)';
                                    setHoveredLeague(null)
                                }}
                            >
                                {/* League Square with Shine Effect. Geometry and
                                    the current/Legend treatments live in
                                    styles/season1Badges.css; only the tier's own
                                    colour stays inline, because it is data. */}
                                <div
                                    className={`s1-league-tile${isCurrentLeague ? ' s1-league-tile--current' : ''}${isLegend ? ' s1-league-tile--legend' : ''}`}
                                    style={{ backgroundColor: league.color }}
                                >
                                    {league.emoji}
                                    {/* Shiny Effect */}
                                    {isCurrentLeague && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '-100%',
                                            left: '-100%',
                                            width: '200%',
                                            height: '200%',
                                            background: 'linear-gradient(45deg, rgba(255,255,255,0.6), rgba(255,255,255,0))',
                                            transform: 'rotate(30deg)',
                                            animation: 'shine 2s infinite linear'
                                        }} />
                                    )}
                                </div>

                                {/* League Name. Legend keeps its own crimson
                                    accent when held — framing the top tier in
                                    Voyager gold read as "you are a Voyager". */}
                                <p style={{
                                    fontSize: 'clamp(12px, 3vw, 16px)',
                                    marginTop: 'clamp(6px, 1.5vw, 8px)',
                                    color: isCurrentLeague ? (isLegend ? '#ff5670' : '#ffd700') : '#e0e0e0',
                                    fontWeight: isCurrentLeague ? 'bold' : '600',
                                    textShadow: isCurrentLeague ? `0px 0px 8px ${isLegend ? '#dc143c' : '#ffd700'}` : 'none'
                                }}>
                                    {league.name}
                                </p>

                                {/* Threshold chip. Absolutely positioned and
                                    pointer-events:none (see the CSS): at four
                                    digits it is wider than the square it labels,
                                    so it must never join the flex row. */}
                                {eloNeeded > 0 && (
                                    <div
                                        className={`elo-badge s1-league-threshold${hoveredLeague === league.name ? ' s1-league-threshold--shown' : ''}${isLegend ? ' s1-league-threshold--legend' : ''}`}
                                        style={{ backgroundColor: league.color }}
                                    >
                                        {eloNeeded} ELO
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Stats Section */}
            <div style={cardStyle}>
                <h2 style={{
                    fontSize: 'clamp(20px, 4vw, 32px)',
                    fontWeight: 600,
                    marginBottom: 'clamp(10px, 3vw, 20px)',
                    color: 'white',
                    textAlign: 'center'
                }}>
                    {text("statistics")}
                </h2>

                <div style={statsGridStyle}>
                    <StatTile label={viewingPublicProfile ? text("elo") : text("yourElo")} value={eloData.elo} />
                    <StatTile label={viewingPublicProfile ? text("globalRank") : text("yourGlobalRank")} value={`#${eloData.rank}`} />
                    <StatTile label={text("duels_won")} value={eloData.duels_wins} />
                    <StatTile label={text("duels_lost")} value={eloData.duels_losses} />
                    {eloData.duels_tied > 0 && (
                        <StatTile label={text("duels_tied")} value={eloData.duels_tied} />
                    )}
                    {typeof eloData.win_rate === 'number' && (
                        <StatTile label={text("win_rate")} value={`${(eloData.win_rate * 100).toFixed(2)}%`} />
                    )}

                    {/* 2v2 team stats (unranked) — only shown once the user has played 2v2 */}
                    {((eloData.team2v2_wins || 0) + (eloData.team2v2_losses || 0) + (eloData.team2v2_tied || 0)) > 0 && (
                        <>
                            <StatTile label={text("twovtwoWon")} value={eloData.team2v2_wins || 0} />
                            <StatTile label={text("twovtwoLost")} value={eloData.team2v2_losses || 0} />
                            {(eloData.team2v2_tied || 0) > 0 && (
                                <StatTile label={text("twovtwoTied")} value={eloData.team2v2_tied} />
                            )}
                            {/* typeof: a genuine 0% win rate must still render
                                (falsy-zero hid the tile for 0-win records). */}
                            {typeof eloData.team2v2_win_rate === 'number' && (
                                <StatTile label={text("twovtwoWinRate")} value={`${(eloData.team2v2_win_rate * 100).toFixed(2)}%`} />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ELO Graph */}
            <XPGraph session={session} mode="elo" isPublic={isPublic} username={username} />
        </div>
    );
}
