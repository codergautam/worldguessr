import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FaXmark } from 'react-icons/fa6';
import {
  FaUser, FaListUl, FaTrophy, FaUserGroup, FaShield,
  FaPencil, FaFlag, FaArrowUpRightFromSquare, FaArrowRightFromBracket,
  FaPaperPlane, FaCheck, FaClock, FaGamepad, FaUsers, FaLink,
  FaUserCheck, FaUserXmark, FaStar,
} from 'react-icons/fa6';
import { signOut } from '@/components/auth/auth';
import { useTranslation } from '@/components/useTranslations';
import CountryFlag from '@/components/utils/countryFlag';
import LeagueIcon from '@/components/utils/leagueIcon';
import { getLeague, leagues, subranks } from '@/components/utils/leagues';
import msToTime from '@/components/msToTime';
import formatTime from '@/utils/formatTime';
import { navigate } from '@/lib/basePath';
import XPGraph from '@/components/XPGraph';
import CountrySelectorModal from '@/components/countrySelectorModal';

const ModerationView = dynamic(() => import('@/components/moderationView'), { ssr: false });
const HistoricalGameView = dynamic(() => import('@/components/historicalGameView'), { ssr: false });

const tabs = [
  { key: 'profile', label: 'Profile', icon: <FaUser />, mod: 'profile' },
  { key: 'history', label: 'History', icon: <FaListUl />, mod: 'history' },
  { key: 'elo', label: 'ELO', icon: <FaTrophy />, mod: 'elo' },
  { key: 'list', label: 'Friends', icon: <FaUserGroup />, mod: 'friends' },
  { key: 'moderation', label: 'Moderation', icon: <FaShield />, mod: 'mod' },
];

export default function AccountPanel({
  session, setSession, shown, setAccountModalOpen, eloData,
  inCrazyGames, accountModalPage, setAccountModalPage,
  ws, sendInvite, canSendInvite, options,
}) {
  const { t: text } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [accountData, setAccountData] = useState({});
  const [selectedGame, setSelectedGame] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (shown) {
      setMounted(true);
      const t = setTimeout(() => setVisible(true), 40);
      return () => clearTimeout(t);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e) => { if (e.key === 'Escape') setAccountModalOpen?.(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, setAccountModalOpen]);

  useEffect(() => {
    if (!shown || !session?.token) return;
    setAccountData({
      username: session.token.username,
      totalXp: session.token.totalXp || 0,
      createdAt: session.token.createdAt,
      gamesLen: session.token.gamesLen || 0,
      lastLogin: session.token.lastLogin,
      canChangeUsername: session.token.canChangeUsername,
      daysUntilNameChange: session.token.daysUntilNameChange || 0,
      recentChange: session.token.recentChange || false,
      countryCode: session.token.countryCode || null,
      supporter: session.token.supporter || false,
    });
    if (typeof window === 'undefined' || !window.cConfig?.apiUrl) return;
    fetch(window.cConfig.apiUrl + '/api/publicAccount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.token.accountId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setAccountData((p) => ({ ...p, ...d })); })
      .catch(() => {});
  }, [shown, session?.token?.accountId]);

  useEffect(() => {
    if (accountModalPage !== 'history') setSelectedGame(null);
  }, [accountModalPage]);
  useEffect(() => {
    if (!shown) setSelectedGame(null);
  }, [shown]);

  if (!mounted || !eloData) return null;

  const onTab = (key) => setAccountModalPage?.(key);

  const copyProfileLink = () => {
    if (!accountData?.username) return;
    const profileUrl = `${window.location.origin}${navigate('/')}?profile=${encodeURIComponent(accountData.username)}`;
    navigator.clipboard.writeText(profileUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <>
      {accountModalPage === 'history' && selectedGame && (
        <HistoricalGameView
          game={selectedGame}
          session={session}
          options={options}
          onBack={() => setSelectedGame(null)}
        />
      )}

      <aside
        className={`wg-acct ${visible ? 'wg-acct--shown' : ''}`}
        role="dialog"
        aria-label="Account"
      >

        <div className="wg-acct__topbar">
          <h1 className="wg-acct__title wg-gmarket-bold">
            {accountData.countryCode && (
              <CountryFlag countryCode={accountData.countryCode} size={1} marginRight="0" />
            )}
            <span className="wg-acct__titleName">{accountData.username || text('account') || 'Account'}</span>
            {accountData.supporter && (
              <span className="wg-acct__supporter">{text('supporter') || 'Supporter'}</span>
            )}
            {accountData.username && (
              <button
                type="button"
                className={`wg-acct__copyBtn ${linkCopied ? 'wg-acct__copyBtn--ok' : ''}`}
                onClick={copyProfileLink}
                aria-label="Copy profile link"
                title={linkCopied ? (text('copied') || 'Copied!') : (text('copyProfileLink') || 'Copy profile link')}
              >
                {linkCopied ? <FaCheck /> : <FaLink />}
              </button>
            )}
          </h1>
          <div className="wg-acct__topSpacer" />
          <button
            type="button"
            className="wg-acct__close"
            onClick={() => setAccountModalOpen?.(false)}
            aria-label="Close"
          >
            <FaXmark />
            <span>{text('close') || 'Close'}</span>
          </button>
        </div>

        <nav className="wg-acct__tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`wg-acct__tab wg-acct__tab--${t.mod} ${accountModalPage === t.key ? 'wg-acct__tab--on' : ''}`}
              onClick={() => onTab(t.key)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="wg-acct__body">
          {accountModalPage === 'profile' && (
            <ProfileTab
              accountData={accountData}
              setAccountData={setAccountData}
              session={session}
              setSession={setSession}
              ws={ws}
              inCrazyGames={inCrazyGames}
              text={text}
            />
          )}
          {accountModalPage === 'history' && (
            <HistoryTab session={session} onGameClick={(g) => setSelectedGame(g)} text={text} />
          )}
          {accountModalPage === 'elo' && (
            <EloTab eloData={eloData} session={session} text={text} />
          )}
          {accountModalPage === 'list' && (
            <FriendsTab ws={ws} text={text} />
          )}
          {accountModalPage === 'moderation' && (
            <div className="wg-acct__mod">
              <ModerationView session={session} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function ProfileTab({ accountData, setAccountData, session, setSession, ws, inCrazyGames, text }) {

  const [showCountrySelector, setShowCountrySelector] = useState(false);

  const [showNameModal, setShowNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const joinedTime = useMemo(() => {
    if (!accountData?.createdAt) return null;
    const ms = Date.now() - new Date(accountData.createdAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return msToTime(ms);
  }, [accountData?.createdAt]);

  const onViewProfile = () => {
    if (!accountData?.username) return;
    const url = `${window.location.origin}${navigate('/')}?profile=${encodeURIComponent(accountData.username)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openChangeName = async () => {
    if (window.settingName) return;
    setNameError('');
    setNewName(accountData?.username || '');
    const secret = session?.token?.secret;
    if (!secret) {
      setNameError('Logged out — try refreshing.');
      setShowNameModal(true);
      return;
    }

    try {
      const r1 = await fetch(window.cConfig.apiUrl + '/api/checkIfNameChangeProgress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: secret }),
      });
      const d1 = await r1.json();
      if (d1?.name) {
        setNameError(text('nameChangeInProgress', { name: d1.name }) || `A name change to ${d1.name} is already in progress.`);
      }
    } catch {  }
    setShowNameModal(true);
  };

  const submitChangeName = async () => {
    const username = newName.trim();
    if (!username) { setNameError('Enter a name'); return; }
    if (window.settingName) return;
    const secret = session?.token?.secret;
    if (!secret) { setNameError('Logged out — refresh and try again.'); return; }
    setNameSaving(true);
    setNameError('');
    window.settingName = true;
    try {
      const res = await fetch(window.cConfig.apiUrl + '/api/setName', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, token: secret }),
      });
      if (res.ok) {
        setShowNameModal(false);
        setTimeout(() => window.location.reload(), 200);
      } else {
        const e = await res.json().catch(() => null);
        setNameError(e?.message || 'An error occurred');
      }
    } catch {
      setNameError('Network error');
    } finally {
      window.settingName = false;
      setNameSaving(false);
    }
  };

  return (
    <>
      <div className="wg-acct__profileHero">
        <div className="wg-acct__stats">
          <div className="wg-acct__statRow">
            <FaClock className="wg-acct__statIcon" aria-hidden="true" />
            <span className="wg-acct__statText">
              {joinedTime
                ? (text('joined', { t: joinedTime }) || `Joined ${joinedTime} ago`)
                : (text('joinedRecently') || 'Joined recently')}
            </span>
          </div>
          <div className="wg-acct__statRow">
            <FaStar className="wg-acct__statIcon wg-acct__statIcon--xp" aria-hidden="true" />
            <span className="wg-acct__statText">
              {(accountData?.totalXp || 0).toLocaleString()} XP
            </span>
          </div>
          <div className="wg-acct__statRow">
            <FaGamepad className="wg-acct__statIcon wg-acct__statIcon--games" aria-hidden="true" />
            <span className="wg-acct__statText">
              {text('gamesPlayed', { games: (accountData?.gamesLen || accountData?.gamesPlayed || 0).toLocaleString() })
                || `${(accountData?.gamesLen || accountData?.gamesPlayed || 0).toLocaleString()} games played`}
            </span>
          </div>
        </div>

        <div className="wg-acct__heroActions">
          {accountData?.canChangeUsername && (
            <button type="button" className="wg-acct__actionBtn wg-acct__actionBtn--primary" onClick={openChangeName}>
              <FaPencil />
              <span>{text('changeName') || 'Change name'}</span>
            </button>
          )}
          <button
            type="button"
            className="wg-acct__actionBtn wg-acct__actionBtn--accent"
            onClick={() => setShowCountrySelector(true)}
          >
            <FaFlag />
            <span>{text('changeFlag') || 'Change flag'}</span>
          </button>
          {accountData?.username && (
            <button type="button" className="wg-acct__actionBtn wg-acct__actionBtn--ghost" onClick={onViewProfile}>
              <FaArrowUpRightFromSquare />
              <span>{text('viewProfile') || 'View profile'}</span>
            </button>
          )}
          {!inCrazyGames && (
            <button type="button" className="wg-acct__actionBtn wg-acct__actionBtn--danger" onClick={() => signOut()}>
              <FaArrowRightFromBracket />
              <span>{text('logOut') || 'Log out'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="wg-acct__graphCard">
        <XPGraph session={session} />
      </div>

      {showCountrySelector && (
        <CountrySelectorModal
          shown={showCountrySelector}
          onClose={() => setShowCountrySelector(false)}
          currentCountry={accountData?.countryCode || null}
          onSelect={(newCountry) => {
            setAccountData((prev) => ({ ...prev, countryCode: newCountry }));
            setSession?.((prev) => ({ ...prev, token: { ...prev?.token, countryCode: newCountry } }));
          }}
          session={session}
          ws={ws}
        />
      )}

      {showNameModal && (
        <div
          className="wg-acct__confirm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !nameSaving) setShowNameModal(false); }}
        >
          <div className="wg-acct__confirmCard">
            <h3>{text('changeName') || 'Change name'}</h3>
            <p>{text('enterNewName') || 'Enter a new username.'}</p>
            <input
              type="text"
              className="wg-acct__friendsInput"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitChangeName(); }}
              placeholder="Username"
              maxLength={30}
              autoFocus
              disabled={nameSaving}
              style={{ width: '100%' }}
            />
            {nameError && (
              <p style={{ color: '#fecaca', fontSize: 13, margin: 0 }}>{nameError}</p>
            )}
            <div className="wg-acct__confirmBtns">
              <button
                type="button"
                className="wg-acct__confirmCancel"
                onClick={() => setShowNameModal(false)}
                disabled={nameSaving}
              >
                {text('cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                className="wg-acct__confirmConfirm"
                style={{ background: '#2c63d8' }}
                onClick={submitChangeName}
                disabled={nameSaving || !newName.trim()}
              >
                {nameSaving ? '…' : (text('save') || 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HistoryTab({ session, onGameClick, text }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined' || !session?.token?.secret || !window.cConfig?.apiUrl) return;
    setLoading(true);
    fetch(window.cConfig.apiUrl + '/api/gameHistory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: session.token.secret, page: 1, limit: 50 }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) { setGames(d?.games || []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.token?.secret]);

  const typeMeta = (gameType) => {
    const types = {
      singleplayer: { label: text('singleplayer') || 'Singleplayer', color: '#4ade80' },
      ranked_duel: { label: text('rankedDuel') || 'Ranked duel', color: '#f87171' },
      unranked_multiplayer: { label: text('multiplayer') || 'Multiplayer', color: '#60a5fa' },
      private_multiplayer: { label: text('privateGame') || 'Party', color: '#c084fc' },
      daily_challenge: { label: text('dailyChallenge') || 'Daily challenge', color: '#fde047' },
    };
    return types[gameType] || { label: gameType || 'Game', color: '#94a3b8' };
  };

  const niceDate = (ds) => {
    const d = new Date(ds);
    const ms = Date.now() - d.getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return text('justNow') || 'just now';
    if (m < 60) return text('minutesAgo', { minutes: m }) || `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return text('hoursAgo', { hours: h }) || `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return text('daysAgo', { days }) || `${days}d ago`;
    return d.toLocaleDateString();
  };

  const asStr = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v) : null;
  const locationLabel = (g) => {
    if (g.settings?.countryGuesser) {
      return g.settings.countryGuessrSubMode === 'continent'
        ? (text('continentGuesser') || 'Continent guesser')
        : (text('countryGuesser') || 'Country guesser');
    }
    const loc = asStr(g.settings?.location) || asStr(g.location) || asStr(g.map);
    if (!loc || loc === 'all') return text('worldwide') || 'Worldwide';
    if (loc.length === 2 && loc === loc.toUpperCase()) return loc;
    return loc;
  };

  const duelOutcome = (g) => {
    if (g.gameType !== 'ranked_duel') return null;
    const finalRank = g.userStats?.finalRank ?? g.userPlayer?.finalRank;
    if (g.result?.isDraw) return 'draw';
    if (finalRank === 1) return 'win';
    if (finalRank != null) return 'loss';
    return null;
  };

  if (loading) {
    return <div className="wg-acct__friendsEmpty">{text('loading') || 'Loading'}…</div>;
  }
  if (!games.length) {
    return <div className="wg-acct__friendsEmpty">No games yet. Play one!</div>;
  }

  return (
    <div className="wg-acct__history">
      {games.map((g) => {
        const t = typeMeta(g.gameType);
        const isDuel = g.gameType === 'ranked_duel';
        const points = typeof g.userStats?.totalPoints === 'number' ? g.userStats.totalPoints : null;
        const maxPoints = typeof g.result?.maxPossiblePoints === 'number' ? g.result.maxPossiblePoints : null;
        const xp = typeof g.userStats?.totalXp === 'number' ? g.userStats.totalXp : null;
        const duration = typeof g.totalDuration === 'number' ? g.totalDuration : null;
        const rounds = typeof g.roundsPlayed === 'number' ? g.roundsPlayed : null;
        const players = typeof g.multiplayer?.playerCount === 'number' ? g.multiplayer.playerCount : null;
        const eloChange = isDuel
          ? (typeof g.userStats?.elo?.change === 'number' ? g.userStats.elo.change
              : typeof g.userPlayer?.elo?.change === 'number' ? g.userPlayer.elo.change : null)
          : null;
        const outcome = duelOutcome(g);
        const opponent = asStr(g.opponent?.username);
        return (
          <div
            key={g._id || g.id || g.endedAt}
            className="wg-acct__gameCard"
            style={{ '--game-accent': t.color }}
            onClick={() => onGameClick?.(g)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onGameClick?.(g); }}
          >
            <div className="wg-acct__gameTop">
              <span className="wg-acct__gameType">
                <FaGamepad style={{ color: t.color }} aria-hidden="true" />
                {t.label}
              </span>
              {g.endedAt && <span className="wg-acct__gameDate">{niceDate(g.endedAt)}</span>}
            </div>
            <div className="wg-acct__gameGrid">
              {isDuel && outcome && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">Result</span>
                  <span
                    className="wg-acct__gameStatVal"
                    style={{
                      color: outcome === 'win' ? '#4ade80'
                        : outcome === 'loss' ? '#f87171'
                        : '#fde047',
                    }}
                  >
                    {outcome === 'win' ? 'Victory' : outcome === 'loss' ? 'Defeat' : 'Draw'}
                  </span>
                </div>
              )}
              {isDuel && eloChange != null && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">Elo</span>
                  <span
                    className="wg-acct__gameStatVal"
                    style={{ color: eloChange > 0 ? '#4ade80' : eloChange < 0 ? '#f87171' : 'white' }}
                  >
                    {eloChange > 0 ? '+' : ''}{eloChange}
                  </span>
                </div>
              )}
              {!isDuel && points != null && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">Points</span>
                  <span className="wg-acct__gameStatVal">
                    {Math.round(points).toLocaleString()}
                    {maxPoints != null && (
                      <span className="wg-acct__gameStatSub"> / {maxPoints.toLocaleString()}</span>
                    )}
                  </span>
                </div>
              )}
              {xp != null && xp > 0 && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">XP</span>
                  <span className="wg-acct__gameStatVal">{xp}</span>
                </div>
              )}
              {duration != null && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">Duration</span>
                  <span className="wg-acct__gameStatVal">{formatTime(duration)}</span>
                </div>
              )}
              <div className="wg-acct__gameStatBox wg-acct__gameStatBox--wide" title={locationLabel(g)}>
                <span className="wg-acct__gameStatLbl">Map</span>
                <span className="wg-acct__gameStatVal wg-acct__gameStatVal--text">{locationLabel(g)}</span>
              </div>
              {rounds != null && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">Rounds</span>
                  <span className="wg-acct__gameStatVal">{rounds}</span>
                </div>
              )}
              {players != null && players > 1 && (
                <div className="wg-acct__gameStatBox">
                  <span className="wg-acct__gameStatLbl">Players</span>
                  <span className="wg-acct__gameStatVal">{players}</span>
                </div>
              )}
              {isDuel && opponent && (
                <div className="wg-acct__gameStatBox wg-acct__gameStatBox--wide" title={opponent}>
                  <span className="wg-acct__gameStatLbl">Opponent</span>
                  <span className="wg-acct__gameStatVal wg-acct__gameStatVal--text">{opponent}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EloTab({ eloData, session, text }) {
  const league = getLeague(eloData.elo);
  const eloVal = Number(eloData.elo) || 0;
  const w = eloData.duels_wins || 0;
  const l = eloData.duels_losses || 0;
  const tied = eloData.duels_tied || 0;
  const winrate = (w + l) > 0 ? Math.round((w / (w + l)) * 1000) / 10 : null;

  const labelStyle = league?.gradient
    ? { background: league.gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }
    : { color: league?.color || 'white' };

  return (
    <div className="wg-acct__elo">

      <div className="wg-acct__statsGrid">
        <div className="wg-acct__statCell wg-acct__statCell--hero">
          <div className="wg-acct__heroIcon">
            <LeagueIcon league={league} size={48} />
          </div>
          <div className="wg-acct__heroBody">
            <span className="wg-acct__heroLabel" style={labelStyle}>{league?.label || 'Unranked'}</span>
            <span className="wg-acct__heroValue">{eloVal.toLocaleString()} <span className="wg-acct__heroUnit">Elo</span></span>
          </div>
        </div>
        <div className="wg-acct__statCell">
          <span className="wg-acct__statLbl">Global rank</span>
          <span className="wg-acct__statVal" style={{ color: '#e879f9' }}>#{eloData.rank ?? '—'}</span>
        </div>
        <div className="wg-acct__statCell">
          <span className="wg-acct__statLbl">Wins</span>
          <span className="wg-acct__statVal" style={{ color: '#4ade80' }}>{w}</span>
        </div>
        <div className="wg-acct__statCell">
          <span className="wg-acct__statLbl">Losses</span>
          <span className="wg-acct__statVal" style={{ color: '#f87171' }}>{l}</span>
        </div>
        {tied > 0 && (
          <div className="wg-acct__statCell">
            <span className="wg-acct__statLbl">Draws</span>
            <span className="wg-acct__statVal" style={{ color: '#fde047' }}>{tied}</span>
          </div>
        )}
        {winrate != null && (
          <div className="wg-acct__statCell">
            <span className="wg-acct__statLbl">Winrate</span>
            <span className="wg-acct__statVal" style={{ color: '#60a5fa' }}>{winrate.toFixed(1)}%</span>
          </div>
        )}
      </div>

      <RankRoad eloVal={eloVal} text={text} />

      <LeagueShowcase activeBaseId={league?.id} text={text} />

      <div className="wg-acct__graphCard">
        <XPGraph session={session} mode="elo" />
      </div>
    </div>
  );
}

function LeagueShowcase({ activeBaseId, text }) {
  return (
    <div className="wg-acct__leagues">
      <div className="wg-acct__leaguesHead">
        <FaTrophy aria-hidden="true" />
        <span>{text('leagues') || 'All leagues'}</span>
      </div>
      <div className="wg-acct__leaguesGrid">
        {Object.values(leagues).map((base) => {
          const isActive = base.id === activeBaseId;

          const tiers = base.tiers || [];
          const midColor = tiers[Math.floor(tiers.length / 2)]?.color || base.color || '#60a5fa';
          return (
            <div
              key={base.id}
              className={`wg-acct__leagueCard ${isActive ? 'wg-acct__leagueCard--on' : ''}`}
              style={{ '--lg-color': midColor }}
            >
              <div className="wg-acct__leagueCardTop">
                <LeagueIcon league={{ ...base, color: midColor }} size={40} />
                <div className="wg-acct__leagueCardMeta">
                  <span className="wg-acct__leagueCardName" style={{ color: midColor }}>{base.name}</span>
                  <span className="wg-acct__leagueCardRange">
                    {base.min.toLocaleString()}+ ELO
                  </span>
                </div>
              </div>
              {tiers.length > 1 && (
                <div className="wg-acct__leagueCardTiers">
                  {tiers.map((sub) => (
                    <span
                      key={sub.tier}
                      className="wg-acct__leagueCardTier"
                      style={{ color: sub.color }}
                      title={`${base.name} ${sub.roman} — ${sub.min}+`}
                    >
                      {sub.roman || ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankRoad({ eloVal, text }) {
  const scrollerRef = useRef(null);

  const minElo = 1000;
  const maxElo = 20000;
  const pixelsPerElo = 0.45;
  const eloToLeft = (elo) => (Math.max(minElo, Math.min(maxElo, elo)) - minElo) * pixelsPerElo;
  const trackWidth = (maxElo - minElo) * pixelsPerElo + 80;
  const userLeft = eloToLeft(eloVal);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const target = Math.max(0, userLeft - node.clientWidth / 2);
    node.scrollTo({ left: target, behavior: 'smooth' });
  }, [userLeft]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;
    const onWheel = (e) => {

      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      node.scrollLeft += e.deltaY;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const tinyTicks = [];
  for (let e = minElo; e <= maxElo; e += 100) {
    tinyTicks.push(e);
  }

  return (
    <div className="wg-acct__road">
      <div className="wg-acct__roadHead">
        <span>Rank road</span>
      </div>
      <div className="wg-acct__roadScroller" ref={scrollerRef}>
        <div className="wg-acct__roadTrack" style={{ width: `${trackWidth}px` }}>
          <div className="wg-acct__roadBaseline" />

          {tinyTicks.map((e) => {
            const left = eloToLeft(e);
            const isThousand = e % 1000 === 0;
            return (
              <div
                key={`tick-${e}`}
                className={`wg-acct__roadTinyTick ${isThousand ? 'wg-acct__roadTinyTick--lg' : ''}`}
                style={{ left: `${left}px` }}
                aria-hidden="true"
              />
            );
          })}

          {subranks.map((sub) => {
            const base = leagues[sub.baseId];
            if (sub.min === base.min) return null;
            if (sub.min > maxElo) return null;
            const left = eloToLeft(sub.min);
            return (
              <div
                key={`sub-${sub.baseId}-${sub.tier}`}
                className="wg-acct__roadSub"
                style={{ left: `${left}px`, '--sub-color': sub.color }}
                title={`${base.name} ${sub.roman} — ${sub.min}`}
              >
                <div className="wg-acct__roadSubIcon">
                  <LeagueIcon league={{ ...base, color: sub.color }} size={20} />
                </div>
                <div className="wg-acct__roadSubTick" />
                <div className="wg-acct__roadSubLabel">{sub.roman}</div>
              </div>
            );
          })}

          {Object.values(leagues).map((base) => {
            const left = eloToLeft(base.min);
            const userSub = subranks.find((s) => eloVal >= s.min && eloVal <= s.max) || {};
            const isCurrent = base.id === userSub.baseId;
            return (
              <div
                key={`base-${base.id}`}
                className={`wg-acct__roadBase ${isCurrent ? 'wg-acct__roadBase--on' : ''}`}
                style={{ left: `${left}px` }}
              >
                <div className="wg-acct__roadBaseIcon">
                  <LeagueIcon league={{ ...base, color: base.color || '#60a5fa' }} size={42} />
                </div>
                <div className="wg-acct__roadBaseTick" />
                <div className="wg-acct__roadBaseLabel">
                  <span>{base.name}</span>
                  <span className="wg-acct__roadBaseElo">{base.min.toLocaleString()}</span>
                </div>
              </div>
            );
          })}

          <div
            className="wg-acct__roadEnd"
            style={{ left: `${eloToLeft(maxElo)}px` }}
          >
            <div className="wg-acct__roadEndTick" />
            <div className="wg-acct__roadEndLabel">
              <span>Max Elo</span>
              <span className="wg-acct__roadBaseElo">{maxElo.toLocaleString()}</span>
            </div>
          </div>

          <div
            className="wg-acct__roadUser"
            style={{ left: `${userLeft}px` }}
            title={`You — ${eloVal.toLocaleString()} Elo`}
          >
            <div className="wg-acct__roadUserDot" />
            <div className="wg-acct__roadUserLabel">
              You · {eloVal.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FriendsTab({ ws, text }) {
  const [friends, setFriends] = useState([]);
  const [sent, setSent] = useState([]);
  const [received, setReceived] = useState([]);
  const [allowReqs, setAllowReqs] = useState(false);
  const [newFriend, setNewFriend] = useState('');
  const [reqProgress, setReqProgress] = useState(false);
  const [reqState, setReqState] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const reqStateTimer = useRef(null);

  useEffect(() => {
    if (!ws) return undefined;
    const onMsg = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'friends') {
          setFriends(data.friends || []);
          setSent(data.sentRequests || []);
          setReceived(data.receivedRequests || []);
          setAllowReqs(!!data.allowFriendReq);
        } else if (data.type === 'friendReqState') {
          setReqState(data.state);
          setReqProgress(false);
          setNewFriend('');
        }
      } catch {  }
    };
    ws.addEventListener('message', onMsg);
    return () => ws.removeEventListener('message', onMsg);
  }, [ws]);

  useEffect(() => {
    if (!ws) return undefined;
    ws.send(JSON.stringify({ type: 'getFriends' }));
    const id = setInterval(() => ws.send(JSON.stringify({ type: 'getFriends' })), 5000);
    return () => clearInterval(id);
  }, [ws]);

  useEffect(() => {
    if (reqState <= 0) return undefined;
    if (reqStateTimer.current) clearTimeout(reqStateTimer.current);
    reqStateTimer.current = setTimeout(() => setReqState(0), 5000);
    return () => clearTimeout(reqStateTimer.current);
  }, [reqState]);

  const send = (msg) => { if (ws) ws.send(JSON.stringify(msg)); };

  const onSend = () => {
    if (!newFriend.trim()) return;
    setReqProgress(true);
    send({ type: 'sendFriendRequest', name: newFriend.trim() });
  };
  const onToggleAllow = () => {
    const next = !allowReqs;
    setAllowReqs(next);
    send({ type: 'setAllowFriendReq', allow: next });
  };
  const doConfirm = () => {
    if (!confirm) return;

    if (confirm.kind === 'remove') {
      send({ type: 'removeFriend', id: confirm.id });
      setFriends((prev) => prev.filter((x) => x.id !== confirm.id));
    } else if (confirm.kind === 'decline') {
      send({ type: 'declineFriend', id: confirm.id });
      setReceived((prev) => prev.filter((x) => x.id !== confirm.id));
    }
    setConfirm(null);
  };

  const cancelSent = (id) => {
    send({ type: 'cancelRequest', id });
    setSent((prev) => prev.filter((x) => x.id !== id));
  };
  const acceptReceived = (id) => {
    send({ type: 'acceptFriend', id });
    setReceived((prev) => prev.filter((x) => x.id !== id));
  };

  const reqStateMsg = [
    null,
    text('friendReqSent') || 'Friend request sent',
    text('friendReqNotAccepting') || "User isn't accepting requests",
    text('friendReqNotFound') || 'User not found',
    text('friendReqAlreadySent') || 'Request already sent',
    text('friendReqAlreadyReceived') || 'They already sent you a request',
    text('alreadyFriends') || "You're already friends",
  ];

  const nameOf = (f) => f?.name || f?.username || 'unknown';

  return (
    <div className="wg-acct__friends">
      <div className="wg-acct__friendsTop">
        <div className="wg-acct__friendsAdd">
          <input
            type="text"
            className="wg-acct__friendsInput"
            placeholder={text('addFriendPlaceholder') || 'Username'}
            value={newFriend}
            onChange={(e) => setNewFriend(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
            disabled={reqProgress}
          />
          <button
            type="button"
            className="wg-acct__friendsSend"
            onClick={onSend}
            disabled={reqProgress || !newFriend.trim()}
          >
            <FaPaperPlane />
            <span>{reqProgress ? '…' : (text('sendRequest') || 'Send')}</span>
          </button>
        </div>
        <div className="wg-acct__friendsToggleRow">
          <span className="wg-acct__friendsToggleLbl">Allow friend requests</span>
          <button
            type="button"
            className={`wg-acct__toggle ${allowReqs ? 'wg-acct__toggle--on' : ''}`}
            onClick={onToggleAllow}
            aria-pressed={allowReqs}
          >
            <span className="wg-acct__toggleThumb" />
          </button>
        </div>
      </div>
      {!!reqStateMsg[reqState] && (
        <div className="wg-acct__friendsEmpty" style={{ color: reqState === 1 ? '#4ade80' : '#f87171' }}>
          {reqStateMsg[reqState]}
        </div>
      )}

      {received.length > 0 && (
        <div className="wg-acct__friendsCol">
          <div className="wg-acct__friendsColHead">
            <FaUsers aria-hidden="true" />
            <span>Pending requests</span>
            <span className="wg-acct__friendsColCount">{received.length}</span>
          </div>
          <div className="wg-acct__friendsList">
            {received.map((r) => (
              <div key={r.id} className="wg-acct__friendRow">
                <span className="wg-acct__friendName" title={nameOf(r)}>{nameOf(r)}</span>
                <button
                  type="button"
                  className="wg-acct__friendAction wg-acct__friendAction--accept"
                  onClick={() => acceptReceived(r.id)}
                  title="Accept"
                >
                  <FaUserCheck />
                </button>
                <button
                  type="button"
                  className="wg-acct__friendAction"
                  onClick={() => setConfirm({ kind: 'decline', id: r.id, name: nameOf(r) })}
                  title="Decline"
                >
                  <FaUserXmark />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="wg-acct__friendsCols">
        <div className="wg-acct__friendsCol">
          <div className="wg-acct__friendsColHead">
            <FaUsers aria-hidden="true" />
            <span>Friends</span>
            <span className="wg-acct__friendsColCount">{friends.length}</span>
          </div>
          <div className="wg-acct__friendsList">
            {friends.length === 0 ? (
              <div className="wg-acct__friendsEmpty">No friends yet.</div>
            ) : friends.map((f) => (
              <div key={f.id} className="wg-acct__friendRow">
                <span className="wg-acct__friendName" title={nameOf(f)}>{nameOf(f)}</span>
                <span className={`wg-acct__friendStatus ${f.online ? 'wg-acct__friendStatus--online' : ''}`}>
                  <span className="wg-acct__friendDot" />
                  <span>{f.online ? 'Online' : 'Offline'}</span>
                </span>
                <button
                  type="button"
                  className="wg-acct__friendAction"
                  onClick={() => setConfirm({ kind: 'remove', id: f.id, name: nameOf(f) })}
                  title="Remove friend"
                >
                  <FaUserXmark />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="wg-acct__friendsCol">
          <div className="wg-acct__friendsColHead">
            <FaPaperPlane aria-hidden="true" />
            <span>Sent</span>
            <span className="wg-acct__friendsColCount">{sent.length}</span>
          </div>
          <div className="wg-acct__friendsList">
            {sent.length === 0 ? (
              <div className="wg-acct__friendsEmpty">No pending requests.</div>
            ) : sent.map((s) => (
              <div key={s.id} className="wg-acct__friendRow">
                <span className="wg-acct__friendName" title={nameOf(s)}>{nameOf(s)}</span>

                <button
                  type="button"
                  className="wg-acct__friendAction"
                  onClick={() => cancelSent(s.id)}
                  title="Cancel request"
                >
                  <FaUserXmark />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirm && (
        <div
          className="wg-acct__confirm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}
        >
          <div className="wg-acct__confirmCard">
            <h3>{confirm.kind === 'remove' ? 'Remove friend?' : 'Decline request?'}</h3>
            <p>
              {confirm.kind === 'remove'
                ? `${confirm.name} will be removed from your friends list.`
                : `${confirm.name}'s friend request will be declined.`}
            </p>
            <div className="wg-acct__confirmBtns">
              <button type="button" className="wg-acct__confirmCancel" onClick={() => setConfirm(null)}>
                Keep
              </button>
              <button type="button" className="wg-acct__confirmConfirm" onClick={doConfirm}>
                {confirm.kind === 'remove' ? 'Remove' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
