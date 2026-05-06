import { useEffect, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { useTranslation } from '@/components/useTranslations';
import clientConfig from '@/clientConfig';
import CountryFlag from '@/components/utils/countryFlag';
import { navigate } from '@/lib/basePath';

export default function HomeLeaderboardPanel({ open, onClose, session }) {
  const { t: text } = useTranslation('common');
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [pastDay, setPastDay] = useState(false);
  const [useElo, setUseElo] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (session?.token?.username) params.set('username', session.token.username);
    if (pastDay) params.set('pastDay', 'true');
    params.set('mode', useElo ? 'elo' : 'xp');
    fetch(`${clientConfig().apiUrl}/api/leaderboard?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, pastDay, useElo, session?.token?.username]);

  if (!mounted) return null;

  const list = (data?.leaderboard || []).slice(0, 100);
  const myRank = data?.myRank;
  const myScore = useElo ? data?.myElo : data?.myXp;
  const formatScore = (v) => {
    if (v == null) return '—';
    const n = Number(v);
    if (pastDay && n > 0) return `+${n.toFixed(0)}`;
    return n.toFixed(0);
  };

  return (
    <>
      <div
        className={`wg-settings__scrim ${shown ? 'wg-settings__scrim--shown' : ''}`}
        onClick={onClose}
      />
      <aside
        className={`wg-settings ${shown ? 'wg-settings--shown' : ''}`}
        role="dialog"
        aria-label="Leaderboard"
      >
        <div className="wg-settings__topbar">
          <h2 className="wg-settings__title wg-gmarket-bold">
            {text('leaderboard') || 'Leaderboard'}
          </h2>
          <button
            type="button"
            className="wg-locPanel__close wg-settings__close"
            onClick={onClose}
            aria-label="Close"
          >
            <FaXmark />
          </button>
        </div>

        <div className="wg-lb__filters">
          <div className="wg-lb__seg wg-lb__seg--blue">
            <button
              type="button"
              className={`wg-lb__segBtn ${!pastDay ? 'wg-lb__segBtn--on' : ''}`}
              onClick={() => setPastDay(false)}
            >{text('allTime') || 'All time'}</button>
            <button
              type="button"
              className={`wg-lb__segBtn ${pastDay ? 'wg-lb__segBtn--on' : ''}`}
              onClick={() => setPastDay(true)}
            >{text('pastDay') || 'Past day'}</button>
          </div>
          <div className="wg-lb__seg wg-lb__seg--green">
            <button
              type="button"
              className={`wg-lb__segBtn ${useElo ? 'wg-lb__segBtn--on' : ''}`}
              onClick={() => setUseElo(true)}
            >{text('elo') || 'ELO'}</button>
            <button
              type="button"
              className={`wg-lb__segBtn ${!useElo ? 'wg-lb__segBtn--on' : ''}`}
              onClick={() => setUseElo(false)}
            >{text('xp') || 'XP'}</button>
          </div>
        </div>

        {session?.token?.username && myRank && (
          <div className="wg-lb__me">
            <div className="wg-lb__meRank">#{myRank}</div>
            <div className="wg-lb__meText">
              <div className="wg-lb__meName">
                {session.token.username}
                {data?.myCountryCode && (
                  <CountryFlag countryCode={data.myCountryCode} size={0.95} marginRight="0" />
                )}
              </div>
              <div className="wg-lb__meLabel">{text('yourRank') || 'Your rank'}</div>
            </div>
            <div className="wg-lb__meScore">
              {formatScore(myScore)}
              <span className="wg-lb__meScoreLbl">{useElo ? 'ELO' : 'XP'}</span>
            </div>
          </div>
        )}

        <div className="wg-lb__body">
          {loading && (
            <div className="wg-lb__msg">
              <span className="wg-lb__spinner" />
              <span>{text('loading') || 'Loading'}…</span>
            </div>
          )}
          {error && !loading && (
            <div className="wg-lb__msg">
              <span>{text('error') || 'Failed to load leaderboard.'}</span>
            </div>
          )}
          {!loading && !error && list.length === 0 && (
            <div className="wg-lb__msg">
              <span>No players yet.</span>
            </div>
          )}
          {!loading && !error && list.length > 0 && (
            <ol className="wg-lb__list">
              {list.map((u, i) => {
                const rank = u.rank ?? i + 1;
                const score = useElo ? u.elo : u.totalXp;
                const medalClass = i === 0 ? 'gold'
                  : i === 1 ? 'silver'
                  : i === 2 ? 'bronze'
                  : '';
                return (
                  <li key={`${u.username}-${i}`} className={`wg-lb__item ${medalClass ? `wg-lb__item--${medalClass}` : ''}`}>
                    <span className="wg-lb__rank">
                      {i < 3 ? (
                        <span className={`wg-lb__medal wg-lb__medal--${medalClass}`}>{rank}</span>
                      ) : (
                        <>#{rank}</>
                      )}
                    </span>
                    <a
                      href={`${navigate('/user')}?u=${encodeURIComponent(u.username)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wg-lb__name"
                    >
                      <span className="wg-lb__nameText">{u.username}</span>
                      {u.countryCode && <CountryFlag countryCode={u.countryCode} size={0.9} marginRight="0" />}
                    </a>
                    <span className="wg-lb__score">
                      {formatScore(score)}
                      <span className="wg-lb__scoreLbl">{useElo ? 'ELO' : 'XP'}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
