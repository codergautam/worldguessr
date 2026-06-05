import { useEffect, useState, useMemo } from 'react';
import { FaXmark, FaLink, FaShareNodes } from 'react-icons/fa6';
import { FaUsers, FaGamepad, FaStar, FaRegClock } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import config from '@/clientConfig';
import CountryFlag from '@/components/utils/countryFlag';
import { getLeague } from '@/components/utils/leagues';
import LeagueIcon from '@/components/utils/leagueIcon';
import ProfileGraph from './ProfileGraph';

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

const profileCache = new Map();
const inFlight = new Map();
const profileTtl = 2 * 60 * 1000;

function getCachedProfile(username) {
  const c = profileCache.get(username);
  if (!c) return null;
  if (Date.now() - c.at > profileTtl) {
    profileCache.delete(username);
    return null;
  }
  return c.data;
}

function fetchProfile(username) {
  const cached = getCachedProfile(username);
  if (cached) return Promise.resolve(cached);
  if (inFlight.has(username)) return inFlight.get(username);
  const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
  const p = fetch(`${apiUrl}/api/publicProfile?username=${encodeURIComponent(username)}`)
    .then(async (r) => {
      if (r.status === 404) { const e = new Error('not-found'); e.code = 404; throw e; }
      if (r.status === 429) { const e = new Error('rate-limited'); e.code = 429; throw e; }
      if (!r.ok) { const e = new Error(`status-${r.status}`); e.code = r.status; throw e; }
      const data = await r.json();
      profileCache.set(username, { at: Date.now(), data });
      return data;
    })
    .finally(() => { inFlight.delete(username); });
  inFlight.set(username, p);
  return p;
}

export default function ProfilePanel({ open, onClose, username, session, onOpenAccount }) {
  const { t: text } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && username) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [open, username]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !username) return;
    let cancelled = false;

    const cached = getCachedProfile(username);
    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetchProfile(username)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => {
        if (cancelled) return;
        setError(e.code === 404 ? 'not-found' : e.code === 429 ? 'rate-limited' : 'load-failed');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, username]);

  const league = useMemo(() => (data?.elo != null ? getLeague(data.elo) : data?.league || null), [data]);

  const isOwnProfile = !!(session?.token?.username && username && session.token.username === username);

  const subrankProgress = useMemo(() => {
    if (!league?.next || data?.elo == null) return null;
    const span = league.next.min - league.min;
    if (span <= 0) return null;
    const pct = Math.max(0, Math.min(100, ((data.elo - league.min) / span) * 100));
    return { pct, remaining: Math.max(0, league.next.min - data.elo), nextLabel: league.next.label };
  }, [league, data]);

  const labelStyle = league?.gradient
    ? { background: league.gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }
    : { color: league?.color || 'white' };

  const winrate = useMemo(() => {
    const w = data?.duelStats?.wins || 0;
    const l = data?.duelStats?.losses || 0;
    const total = w + l;
    if (total === 0) return null;
    return (w / total) * 100;
  }, [data]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !username) return '';
    const u = new URL(window.location.origin + window.location.pathname);
    u.searchParams.set('profile', username);
    return u.toString();
  }, [username]);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
      document.body.removeChild(ta);
    }
  };

  const share = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${username} on WorldGuessr`, url: shareUrl });
        return;
      } catch (e) {}
    }
    copyLink();
  };

  if (!mounted) return null;

  const joinDays = daysAgo(data?.createdAt || data?.memberSince);

  return (
    <aside
      className={`wg-profile ${shown ? 'wg-profile--shown' : ''}`}
      role="dialog"
      aria-label="Player profile"
    >
      <div className="wg-profile__topbar">
        <button
          type="button"
          className="wg-profile__close"
          onClick={onClose}
          aria-label="Close"
        >
          <FaXmark />
        </button>
        <div className="wg-profile__topbarMain">
          {data?.countryCode && (
            <CountryFlag countryCode={data.countryCode} size={1.8} marginRight="0" />
          )}
          <h2 className="wg-profile__title wg-gmarket-bold">
            {username || '…'}
          </h2>
        </div>
        <div className="wg-profile__topbarActions">
          <button
            type="button"
            className={`wg-profile__iconBtn ${copied ? 'wg-profile__iconBtn--ok' : ''}`}
            onClick={copyLink}
            aria-label="Copy link"
            title={copied ? text('copied') : text('copyLink')}
          >
            <FaLink />
          </button>
          <button
            type="button"
            className="wg-profile__iconBtn"
            onClick={share}
            aria-label="Share"
            title={text('share')}
          >
            <FaShareNodes />
          </button>
        </div>
      </div>

      <div className="wg-profile__body">
        {loading && (
          <div className="wg-profile__msg">
            <span className="wg-profile__spinner" />
            <span>{text('loading')}…</span>
          </div>
        )}

        {error === 'not-found' && (
          <div className="wg-profile__msg">
            <span>{text('userNotFound')}</span>
          </div>
        )}

        {error === 'rate-limited' && (
          <div className="wg-profile__msg">
            <span>{text('tooManyRequests')}</span>
          </div>
        )}

        {error && error !== 'not-found' && error !== 'rate-limited' && (
          <div className="wg-profile__msg">
            <span>{text('error')}</span>
          </div>
        )}

        {!loading && !error && data && (
          <>

            <div className="wg-profile__topRow">
              <div className="wg-profile__card wg-profile__card--info">
                <div className="wg-profile__infoRow">
                  <FaRegClock className="wg-profile__infoIcon" />
                  <span>
                    {joinDays != null
                      ? text('joined', { t: `${joinDays}d` })
                      : text('joinedRecently')}
                  </span>
                </div>
                <div className="wg-profile__infoRow">
                  <FaStar className="wg-profile__infoIcon" />
                  <span>
                    {(data.totalXp ?? 0).toLocaleString()} {text('xp')}
                  </span>
                </div>
                <div className="wg-profile__infoRow">
                  <FaGamepad className="wg-profile__infoIcon" />
                  <span>
                    {text('gamesPlayed', { games: data.gamesPlayed ?? 0 })}
                  </span>
                </div>
                <div className="wg-profile__infoRow">
                  <FaUsers className="wg-profile__infoIcon" />
                  <span>
                    {text('profileViews')}: {data.profileViews ?? 0}
                  </span>
                </div>
              </div>

              <div className="wg-profile__card wg-profile__card--elo">
                <div className="wg-profile__eloGrid">
                  <div>
                    <div className="wg-profile__statLbl">{text('elo')}</div>
                    <div className="wg-profile__statVal wg-profile__statVal--elo">
                      {league && <LeagueIcon league={league} size={30} />}
                      <span style={labelStyle}>
                        {(data.elo ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {league && (
                      <div className="wg-profile__rankLabel" style={labelStyle}>
                        {league.label}
                      </div>
                    )}
                    {!isOwnProfile && subrankProgress && (
                      <div className="wg-profile__rankProgress">
                        <div className="wg-profile__rankProgressBar">
                          <div
                            className="wg-profile__rankProgressFill"
                            style={{ width: `${subrankProgress.pct}%`, background: league.gradient || league.color }}
                          />
                        </div>
                        <div className="wg-profile__rankProgressText">
                          {subrankProgress.remaining.toLocaleString()} {text('elo')} → {subrankProgress.nextLabel}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="wg-profile__statLbl">{text('globalRank')}</div>
                    <div className="wg-profile__statVal wg-profile__statVal--rank">
                      #{data.rank ?? '—'}
                    </div>
                  </div>
                </div>

                <div className="wg-profile__duelsGrid">
                  <div className="wg-profile__duelCol">
                    <div className="wg-profile__statLbl">{text('duelsWon')}</div>
                    <div className="wg-profile__statVal wg-profile__statVal--wins">
                      {data.duelStats?.wins ?? 0}
                    </div>
                  </div>
                  <div className="wg-profile__duelCol wg-profile__duelCol--center">
                    {winrate != null && (
                      <>
                        <div className="wg-profile__winrateVal">{winrate.toFixed(1)}%</div>
                        <div className="wg-profile__winrateLbl">{text('winrate')}</div>
                      </>
                    )}
                  </div>
                  <div className="wg-profile__duelCol wg-profile__duelCol--right">
                    <div className="wg-profile__statLbl">{text('duelsLost')}</div>
                    <div className="wg-profile__statVal wg-profile__statVal--losses">
                      {data.duelStats?.losses ?? 0}
                    </div>
                  </div>
                </div>

                {winrate != null && (
                  <div className="wg-profile__winrateBar">
                    <div
                      className="wg-profile__winrateBarFill"
                      style={{ width: `${winrate}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="wg-profile__graphRow">
              <ProfileGraph username={username} mode="xp" />
              <ProfileGraph username={username} mode="elo" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
