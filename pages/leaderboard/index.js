import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useSession } from '@/components/auth/auth';
import { useTranslation } from '@/components/useTranslations'
import config from '@/clientConfig';
import styles from '@/styles/Leaderboard.module.css';
import { navigate } from '@/lib/basePath';
import CountryFlag from '@/components/utils/countryFlag';

const Leaderboard = ({ }) => {
  const { t: text } = useTranslation("common");

  // Which tabs are SELECTED (drives the buttons + what to fetch).
  const [view, setView] = useState({ pastDay: false, useElo: true });
  // What is SHOWN. The response is stamped with the view it was fetched for
  // (forPastDay/forElo) and the list renders from the stamp, never from the
  // live toggles — so data can never paint under another tab's labels or
  // +/- formatting, no matter how requests race on slow connections.
  const [result, setResult] = useState({ status: 'loading', data: null, forPastDay: false, forElo: true });
  const [inCrazyGames, setInCrazyGames] = useState(false);
  const { data: session, status } = useSession();

  // Flip the view and the spinner IN THE SAME COMMIT. The old flow set
  // loading from the fetch effect (after paint), which let one frame of the
  // previous tab's data render under the new tab's formatting — the
  // "flash of + before loading" bug.
  const switchView = (patch) => {
    const next = { ...view, ...patch };
    if (next.pastDay === view.pastDay && next.useElo === view.useElo) return;
    setView(next);
    setResult(r => ({ ...r, status: 'loading' }));
  };

  // Format score with +/- prefix for daily leaderboards
  const formatScore = (value, isDailyLeaderboard) => {
    if (!isDailyLeaderboard) {
      return value?.toFixed(0);
    }
    const numValue = Number(value);
    if (numValue > 0) {
      return `+${numValue.toFixed(0)}`;
    }
    return numValue.toFixed(0); // Negative numbers already have - sign
  };

  useEffect(() => {
    const inCrazyGames = window.location.search.includes("crazygames");
    setInCrazyGames(inCrazyGames);
  }, []);

  useEffect(() => {
    const configData = config();
    // Abort the in-flight request whenever the tabs change (or on unmount):
    // cleanup runs before the next effect, so at most one request can ever
    // write to state.
    const controller = new AbortController();
    const fetchData = async () => {
      setResult(r => ({ ...r, status: 'loading' }));
      try {
        const params = {
          username: session ? session.token.username : undefined,
          pastDay: view.pastDay ? true : undefined,
          mode: view.useElo ? "elo" : "xp"
        };
        const queryParams = new URLSearchParams(params).toString();
        const response = await fetch(configData.apiUrl + `/api/leaderboard${queryParams ? `?${queryParams}` : ''}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`leaderboard HTTP ${response.status}`);
        const data = await response.json();
        // Stamp the payload with the view it answers — the render reads these,
        // not the live toggles.
        setResult({ status: 'ready', data, forPastDay: view.pastDay, forElo: view.useElo });
      } catch (error) {
        // Superseded request: the newer effect owns the UI — touch nothing.
        if (error.name === 'AbortError') return;
        setResult(r => ({ ...r, status: 'error' }));
        console.error('Error fetching leaderboard data:', error);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [session, view.pastDay, view.useElo]);

  const loading = result.status === 'loading';
  const error = result.status === 'error';
  const leaderboardData = result.data;

  return (
    <div className={styles.container}>
      <Head>
        <title>{text("leaderboard")}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Removed <script src="https://unpkg.com/@phosphor/icons"> — a
            render-blocking third-party request for an icon font this page
            never used (it renders emoji medals and CountryFlag instead). */}
        <style>
          {`
          body {
          overflow-y: auto !important;
          }
          /* Reserve the scrollbar's lane permanently. Without this, the
             loading spinner (short page) drops the scrollbar, the viewport
             widens ~17px, and the fixed cover background re-centers — a
             visible flicker on every tab switch on classic-scrollbar
             platforms (Windows). Overlay-scrollbar platforms are unaffected
             either way. */
          html {
          scrollbar-gutter: stable;
          }
          `}
        </style>
      </Head>

      <main className={styles.main}>
        <div className={styles.branding}>
          <h1>{text("leaderboard")}</h1>

          <div className={styles.controls}>
            <div className={styles.timeControls}>
              <button
                className={`${styles.controlButton} ${!view.pastDay ? styles.active : ''}`}
                onClick={() => switchView({ pastDay: false })}
              >
                {text("allTime")}
              </button>
              <button
                className={`${styles.controlButton} ${view.pastDay ? styles.active : ''}`}
                onClick={() => switchView({ pastDay: true })}
              >
                {text("pastDay")}
              </button>
            </div>

            <div className={styles.modeControls}>
              <button
                className={`${styles.controlButton} ${view.useElo ? styles.active : ''}`}
                onClick={() => switchView({ useElo: true })}
              >
                {text("elo")}
              </button>
              <button
                className={`${styles.controlButton} ${!view.useElo ? styles.active : ''}`}
                onClick={() => switchView({ useElo: false })}
              >
                {text("xp")}
              </button>
            </div>

            <button
                className={styles.exitButton}
                onClick={() => window.location.replace(navigate('/') + (inCrazyGames ? '?crazygames=true' : ''))}
              >
                {text("backToGame")}
              </button>
          </div>
        </div>

        {error && (
          <div className={styles.statusMessage}>
            <p>{text("error")}</p>
          </div>
        )}

        {loading && (
          <div className={styles.loadingMessage}>
            <div className={styles.spinner}></div>
            <p>{text("loading")}...</p>
          </div>
        )}


        {!loading && !error && (
          <div className={styles.leaderboardContainer}>
            {session && leaderboardData?.myRank && (
              <div className={styles.myRankCard}>
                <div className={styles.rankBadge}>#{leaderboardData.myRank}</div>
                <div className={styles.playerInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px'}}>
                    <span className={styles.playerName}>{session.token.username}</span>
                    {leaderboardData.myCountryCode && <CountryFlag countryCode={leaderboardData.myCountryCode} style={{ fontSize: '0.9em' }} />}
                  </div>
                  <span className={styles.playerScore}>
                    {formatScore(result.forElo ? leaderboardData?.myElo : leaderboardData?.myXp, result.forPastDay)}
                    <span className={styles.scoreType}>{result.forElo ? 'Elo' : 'XP'}</span>
                  </span>
                </div>
                <div className={styles.myRankLabel}>Your Rank</div>
              </div>
            )}

            <div className={styles.leaderboardList}>
              {leaderboardData && leaderboardData.leaderboard && leaderboardData.leaderboard.map((user, index) => (
                <div key={index} className={`${styles.leaderboardItem} ${index < 3 ? styles.topThree : ''}`}>
                  <div className={`${styles.rankNumber} ${index === 0 ? styles.first : index === 1 ? styles.second : index === 2 ? styles.third : ''}`}>
                    {index < 3 ? (
                      <div className={styles.medal}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </div>
                    ) : (
                      `#${index + 1}`
                    )}
                  </div>

                  <div className={styles.playerDetails}>
                    <a
                      href={`${navigate('/user')}?u=${encodeURIComponent(user.username)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.username}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user.username}
                      {user.countryCode && <CountryFlag countryCode={user.countryCode} style={{ fontSize: '0.9em' }} />}
                    </a>
                  </div>

                  <div className={styles.scoreContainer}>
                    <span className={styles.score}>
                      {formatScore(result.forElo ? user?.elo : user?.totalXp, result.forPastDay)}
                    </span>
                    <span className={styles.scoreLabel}>{result.forElo ? 'Elo' : 'XP'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Leaderboard;
