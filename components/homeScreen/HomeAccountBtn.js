import { FaGoogle, FaChevronDown } from 'react-icons/fa';
import { signIn } from '@/components/auth/auth';
import { useTranslation } from '@/components/useTranslations';
import sendEvent from '@/components/utils/sendEvent';
import CountryFlag from '@/components/utils/countryFlag';
import { getLeague } from '@/components/utils/leagues';
import LeagueIcon from '@/components/utils/leagueIcon';

export default function HomeAccountBtn({
  session,
  openAccountModal,
  loginQueued,
  setLoginQueued,
  inCrazyGames,
  inGameDistribution,
  eloData,
  animatedEloDisplay,
}) {
  const { t: text } = useTranslation('common');
  const hasGoogleClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if ((inCrazyGames || inGameDistribution) && (!session || !session?.token?.secret)) {
    return null;
  }

  const loggedIn = !!session?.token?.secret;
  const countryCode = session?.token?.countryCode || null;

  if (!loggedIn) {
    return (
      <div className="wg-homeAcc wg-homeAcc--login">
        <button
          className="wg-homeAcc__loginBtn"
          disabled={inCrazyGames || loginQueued}
          onClick={() => {
            if (session === null && !loginQueued) {
              if (hasGoogleClientId) setLoginQueued?.(true);
              sendEvent('login_attempt');
              signIn('google');
            }
          }}
        >
          {loginQueued ? (
            <>
              <span>{text('login')}</span>
              <span className="wg-homeAcc__spinner" />
            </>
          ) : !session?.token?.secret && session !== null ? (
            <span>...</span>
          ) : (
            <>
              <FaGoogle />
              <span>{text('login')}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const username = session.token.username;
  const elo = eloData?.elo ?? session.token.elo;
  const league = elo != null ? getLeague(elo) : eloData?.league || null;

  return (
    <button
      type="button"
      className={`wg-homeAcc__card ${session?.token?.supporter ? 'wg-homeAcc__card--supporter' : ''}`}
      onClick={openAccountModal}
      aria-label="Open profile"
    >
      <div className="wg-homeAcc__main">
        {countryCode && (
          <CountryFlag
            countryCode={countryCode}
            size={1.6}
            marginRight="0"
            style={{ borderRadius: '3px' }}
          />
        )}
        <div className="wg-homeAcc__text">
          <span className="wg-homeAcc__name">{username}</span>
          {elo != null && (
            <span className="wg-homeAcc__bottom">
              {league && (
                <span className="wg-homeAcc__rankIcon">
                  <LeagueIcon league={league} size={15} showSubrank={false} />
                </span>
              )}
              <span className="wg-homeAcc__elo">
                {animatedEloDisplay != null && Number.isFinite(animatedEloDisplay)
                  ? animatedEloDisplay
                  : elo}{' '}
                ELO
              </span>
            </span>
          )}
        </div>
      </div>
      <FaChevronDown className="wg-homeAcc__chev" aria-hidden="true" />
    </button>
  );
}
