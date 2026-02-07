import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useSession } from '@/components/auth/auth';
import { useTranslation } from '@/components/useTranslations'
import config from '@/clientConfig';
import styles from '@/styles/Leaderboard.module.css';
import CountryFlag from '@/components/utils/countryFlag';

const Leaderboard = ({ }) => {
  const { t: text } = useTranslation("common");

  const [leaderboardData, setLeaderboardData] = useState([]);
  const [pastDay, setPastDay] = useState(false);
  const [inCrazyGames, setInCrazyGames] = useState(false);
  const [useElo, setUseElo] = useState(true);
  const { data: session, status } = useSession();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

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
    const fetchData = async () => {
      setLoading(true);
      try {
      const params = {
        username: session ? session.token.username : undefined,
        pastDay: pastDay ? true : undefined,
        mode: useElo ? "elo" : "xp"
      };
      const queryParams = new URLSearchParams(params).toString();
      const response = await fetch(configData.apiUrl+`/api/leaderboard${queryParams ? `?${queryParams}` : ''}`);
      const data = await response.json();
      setLoading(false);
      setLeaderboardData(data);
      } catch (error) {
        setLoading(false);
        setError(true);
      console.error('Error fetching leaderboard data:', error);
      }
    };

    fetchData();
  }, [session, pastDay, useElo]);

  return (
    <div className={styles.container}>
      <Head>
        <title>{text("leaderboard")}</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script src="https://unpkg.com/@phosphor/icons"></script>
        <style>
          {`
          body {
          overflow-y: auto !important;
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
                className={`${styles.controlButton} ${!pastDay ? styles.active : ''}`}
                onClick={() => setPastDay(false)}
              >
                {text("allTime")}
              </button>
              <button
                className={`${styles.controlButton} ${pastDay ? styles.active : ''}`}
                onClick={() => setPastDay(true)}
              >
                {text("pastDay")}
              </button>
            </div>

            <div className={styles.modeControls}>
              <button
                className={`${styles.controlButton} ${useElo ? styles.active : ''}`}
                onClick={() => setUseElo(true)}
              >
                {text("elo")}
              </button>
              <button
                className={`${styles.controlButton} ${!useElo ? styles.active : ''}`}
                onClick={() => setUseElo(false)}
              >
                {text("xp")}
              </button>
            </div>

            <button
                className={styles.exitButton}
                onClick={() => window.location.replace('/' + (inCrazyGames ? '?crazygames=true' : ''))}
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
            {session && leaderboardData.myRank && (
              <div className={styles.myRankCard}>
                <div className={styles.rankBadge}>#{leaderboardData.myRank}</div>
                <div className={styles.playerInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px'}}>
                    <span className={styles.playerName}>{session.token.username}</span>
                    {leaderboardData.myCountryCode && <CountryFlag countryCode={leaderboardData.myCountryCode} style={{ fontSize: '0.9em' }} />}
                  </div>
                  <span className={styles.playerScore}>
                    {formatScore(useElo ? leaderboardData?.myElo : leaderboardData?.myXp, pastDay)}
                    <span className={styles.scoreType}>{useElo ? 'Elo' : 'XP'}</span>
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
                      href={`/user?u=${encodeURIComponent(user.username)}`}
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
                      {formatScore(useElo ? user?.elo : user?.totalXp, pastDay)}
                    </span>
                    <span className={styles.scoreLabel}>{useElo ? 'Elo' : 'XP'}</span>
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