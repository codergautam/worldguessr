import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { asset } from '@/lib/basePath';
import { useTranslation } from '@/components/useTranslations';
import {
  FaDiscord,
  FaYoutube,
} from 'react-icons/fa';
import {
  FaUserGroup,
  FaUsers,
  FaArrowRightToBracket,
  FaGear,
  FaRankingStar,
  FaComments,
  FaAngleRight,
  FaMap,
  FaExpand,
} from 'react-icons/fa6';
import { FaRegCalendar } from 'react-icons/fa';
import { LuSwords } from 'react-icons/lu';
import {
  pickNextVariant,
  pickRandomLocation,
  pickDefaultLocation,
  preloadCandidates,
  preloadDynamicBackgrounds,
} from './locations';
import LocationCard from './LocationCard';
import LocationPanel from './LocationPanel';
import OnlineCounter from './OnlineCounter';
import OnlineStatsPanel from './OnlineStatsPanel';
import HomeAccountBtn from './HomeAccountBtn';
import HomeSettingsPanel from './HomeSettingsPanel';
import ExternalLinkConfirm, { shouldSkipConfirm } from './ExternalLinkConfirm';
import playSound from '@/components/utils/playSound';

const externalLinks = {
  discord: {
    key: 'discord',
    title: 'Join the Discord?',
    url: 'https://discord.gg/ADw47GAyS5',
    tint: 'discord',
    icon: <FaDiscord />,
  },
  youtube: {
    key: 'youtube',
    title: 'Check out the YouTube?',
    url: 'https://www.youtube.com/@worldguessr?sub_confirmation=1',
    tint: 'youtube',
    icon: <FaYoutube />,
  },
  forum: {
    key: 'forum',
    title: 'Visit the Forum?',
    url: 'https://forum.worldguessr.com/',
    tint: 'forum',
    icon: <FaComments />,
  },
};

export default function HomeScreen({
  session,
  eloData,
  animatedEloDisplay,
  loading,
  maintenance,
  multiplayerState,
  inCrazyGames,
  inGameDistribution,
  inCoolMath,
  loginQueued,
  setLoginQueued,
  options,
  setOptions,

  bgLocation,
  setBgLocation,
  cardLocation,
  setCardLocation,

  onPlaySingleplayer,
  onRankedDuel,
  onCasualMatch,
  onCreateParty,
  onJoinParty,
  onDailyChallenge,
  onCommunityMaps,
  onOpenAccountModal,
  onConnectionError,
  onOpenProfilePanel,
  leaderboardOpen,
  setLeaderboardOpen,
}) {
  const { t: text } = useTranslation('common');

  const [locPanelOpen, setLocPanelOpen] = useState(false);
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [extLink, setExtLink] = useState(null);

  useEffect(() => {
    if (bgLocation) return;
    const start = pickDefaultLocation();
    setBgLocation(start);
    setCardLocation(start);

    preloadDynamicBackgrounds(preloadCandidates(start, 3));

  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('wg-home-active');
    return () => document.body.classList.remove('wg-home-active');
  }, []);

  useEffect(() => {
    if (!bgLocation || loading) return;
    const id = setInterval(() => {
      const swapVariant = Math.random() < 0.25;
      const next = swapVariant && bgLocation.images.length > 1
        ? pickNextVariant(bgLocation)
        : pickRandomLocation();
      setBgLocation(next);

      setTimeout(() => setCardLocation(next), 800);

      preloadDynamicBackgrounds(preloadCandidates(next, 3));
    }, 14000);
    return () => clearInterval(id);
  }, [bgLocation, loading, setBgLocation, setCardLocation]);

  const wsConnected = !!multiplayerState?.connected;

  const guard = (fn, { needsWs = false } = {}) => () => {
    if (loading || exiting) return;
    if (typeof fn !== 'function') return;
    if (needsWs && !wsConnected) {
      onConnectionError?.();
      return;
    }
    playSound('interfaceClick');
    setExiting(true);
    setTimeout(() => {
      fn();
      setTimeout(() => setExiting(false), 50);
    }, 180);
  };

  const openExternal = (key) => (e) => {
    e?.preventDefault?.();
    const link = externalLinks[key];
    if (!link) return;
    if (shouldSkipConfirm(key)) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setExtLink(link);
  };

  const playerCount = multiplayerState?.playerCount;
  const breakdown = useMemo(() => {
    const b = multiplayerState?.playerBreakdown;
    if (!b) return null;
    return {
      singleplayer: b.singleplayer,
      multiplayer: b.multiplayer,
      ranked: b.ranked,
      casual: b.casual,
      parties: b.parties,
      menu: b.menu,
    };
  }, [multiplayerState?.playerBreakdown]);

  return (
    <div className={`wg-home ${exiting ? 'wg-home--exiting' : ''}`}>

      <div className="wg-home__sideFade" aria-hidden="true" />

      <img
        src={asset('/assets/logos/title.png')}
        alt="WorldGuessr"
        className="wg-home__titleFixed"
        draggable={false}
        aria-hidden="true"
      />

      {typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator?.maxTouchPoints > 0)) && (
        <button
          type="button"
          className="wg-home__fsBtn"
          aria-label="Toggle fullscreen"
          onClick={() => window.wgFullscreen && window.wgFullscreen()}
        >
          <FaExpand />
        </button>
      )}

      <div className="wg-home__topRight">
        <HomeAccountBtn
          session={session}
          openAccountModal={onOpenAccountModal}
          loginQueued={loginQueued}
          setLoginQueued={setLoginQueued}
          inCrazyGames={inCrazyGames}
          inGameDistribution={inGameDistribution}
          eloData={eloData}
          animatedEloDisplay={animatedEloDisplay}
        />
      </div>

      <div className="wg-home__menu">
        <img
          src={asset('/assets/logos/title.png')}
          alt="WorldGuessr"
          className="wg-home__title"
          draggable={false}
        />

        <button
          className="wg-home__cta"
          onClick={guard(onPlaySingleplayer)}
          onMouseEnter={() => { if (!loading) playSound('interfaceClickHover'); }}
          disabled={loading}
        >
          <img
            src={asset('/assets/logos/globe.png')}
            alt=""
            className="wg-home__ctaGlobe"
            draggable={false}
          />
          <span className="wg-home__ctaText">
            <span className="wg-home__ctaTitle">{text('playSingleplayer') || 'Play Singleplayer'}</span>
            <span className="wg-home__ctaSub">

              Jump into a random location<br />
              and guess where you are.
            </span>
          </span>
        </button>

        <Section title={text('multiplayer') || 'Multiplayer'}>
          <MenuItem
            icon={<LuSwords />}
            label={text('rankedDuel') || 'Ranked Duel'}
            onClick={guard(onRankedDuel, { needsWs: true })}
            disabled={maintenance || loading}
          />
          <MenuItem
            icon={<FaUserGroup />}
            label={text('casualMatch') || text('unrankedDuel') || 'Casual Match'}
            onClick={guard(onCasualMatch, { needsWs: true })}
            disabled={maintenance || loading}
          />
        </Section>

        <Section title={text('social') || 'Social'}>
          <MenuItem
            icon={<FaUsers />}
            label={text('createParty') || text('createGame') || 'Create Party'}
            onClick={guard(onCreateParty, { needsWs: true })}
            disabled={maintenance || loading}
          />
          <MenuItem
            icon={<FaArrowRightToBracket />}
            label={text('joinParty') || text('joinGame') || 'Join Party'}
            onClick={guard(onJoinParty, { needsWs: true })}
            disabled={maintenance || loading}
          />
        </Section>

        <Section title={text('extra') || 'Extra'}>
          <MenuItem
            icon={<FaRegCalendar />}
            label={text('dailyChallenge') || 'Daily Challenge'}
            onClick={guard(onDailyChallenge)}
            disabled={loading}
          />
          <MenuItem
            icon={<FaMap />}
            label={text('communityMaps') || 'Community Maps'}
            onClick={guard(onCommunityMaps)}
            disabled={loading}
          />
        </Section>
      </div>

      <div className="wg-home__footer">
        {!inCoolMath && !inGameDistribution && (
          <a href={externalLinks.discord.url} aria-label="Discord" onClick={openExternal('discord')}>
            <FooterBtn tint="discord"><FaDiscord /></FooterBtn>
          </a>
        )}
        {!inCoolMath && !inCrazyGames && !inGameDistribution && (
          <a href={externalLinks.youtube.url} aria-label="YouTube" onClick={openExternal('youtube')}>
            <FooterBtn tint="youtube"><FaYoutube /></FooterBtn>
          </a>
        )}
        {!inCoolMath && !inGameDistribution && (
          <a href={externalLinks.forum.url} aria-label="Forum" onClick={openExternal('forum')}>
            <FooterBtn tint="forum"><FaComments /></FooterBtn>
          </a>
        )}
        <button
          type="button"
          className="wg-home__footerBtn wg-home__footerBtn--leaderboard"
          onClick={() => setLeaderboardOpen(true)}
          aria-label="Leaderboard"
        >
          <FaRankingStar />
        </button>
        <button
          type="button"
          className="wg-home__footerBtn wg-home__footerBtn--settings"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          <FaGear />
        </button>
      </div>

      <div className="wg-home__bottomRight">
        <LocationCard
          location={cardLocation}
          onSearchClick={() => setLocPanelOpen(true)}
        />
        <OnlineCounter
          count={playerCount}
          active={onlinePanelOpen}
          onClick={() => setOnlinePanelOpen((v) => !v)}
        />
      </div>

      <LocationPanel
        open={locPanelOpen}
        location={cardLocation}
        onClose={() => setLocPanelOpen(false)}
      />
      <OnlineStatsPanel
        open={onlinePanelOpen}
        onClose={() => setOnlinePanelOpen(false)}
        total={playerCount}
        breakdown={breakdown}
      />

      <HomeSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        options={options}
        setOptions={setOptions}
        inCrazyGames={inCrazyGames}
        inGameDistribution={inGameDistribution}
      />

      <ExternalLinkConfirm
        open={!!extLink}
        link={extLink}
        onCancel={() => setExtLink(null)}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="wg-home__section">
      <div className="wg-home__sectionHead">
        <span className="wg-home__sectionTitle">{title}</span>
        <span className="wg-home__sectionLine" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      className="wg-home__menuItem"
      onClick={onClick}
      onMouseEnter={() => { if (!disabled) playSound('interfaceClickHover'); }}
      disabled={disabled}
    >
      <span className="wg-home__menuItemIcon">{icon}</span>
      <span className="wg-home__menuItemLabel">{label}</span>
      <FaAngleRight className="wg-home__menuItemArrow" />
    </button>
  );
}

function FooterBtn({ tint, children }) {
  return (
    <span className={`wg-home__footerBtn wg-home__footerBtn--${tint}`}>
      {children}
    </span>
  );
}
