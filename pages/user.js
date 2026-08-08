import { useEffect, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Navbar from '@/components/ui/navbar';
import PublicProfile from '@/components/publicProfile';
import config from '@/clientConfig';
import { backgroundUrlForSku } from '@/lib/siteBackground';
import { useTranslation } from '@/components/useTranslations';

export default function UserProfilePage() {
  const router = useRouter();
  const { t: text } = useTranslation('common');
  const [username, setUsername] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [eloData, setEloData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Extract fetch function to be reusable
  const fetchPublicProfile = useCallback(async (lookup) => {
    setLoading(true);
    setError(null);

    const { apiUrl } = config();
    // id is the stable key (usernames change); username kept for old links
    const lookupQuery = lookup.id
      ? `id=${encodeURIComponent(lookup.id)}`
      : `username=${encodeURIComponent(lookup.username)}`;

    try {
      // Create fetch requests with timeout
      const fetchWithTimeout = (url, timeout = 10000) => {
        return Promise.race([
          fetch(url),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          )
        ]);
      };

      // Fetch profile and ELO data in parallel
      let profileResponse, eloResponse;
      try {
        [profileResponse, eloResponse] = await Promise.all([
          fetchWithTimeout(`${apiUrl}/api/publicProfile?${lookupQuery}`),
          fetchWithTimeout(`${apiUrl}/api/eloRank?${lookupQuery}`)
        ]);
      } catch (fetchError) {
        // Handle network errors, timeouts, or fetch failures
        if (fetchError.message === 'Request timeout') {
          setError('Request timed out. Please check your connection and try again.');
        } else if (fetchError.name === 'TypeError' && fetchError.message.includes('fetch')) {
          setError('Network error. Please check your internet connection.');
        } else {
          setError('Failed to connect to server. Please try again later.');
        }
        setLoading(false);
        return;
      }

      // Handle profile response
      if (!profileResponse.ok) {
        let errorMessage = 'Failed to load profile';
        
        try {
          if (profileResponse.status === 404) {
            errorMessage = 'User not found';
          } else if (profileResponse.status === 429) {
            const retryAfter = profileResponse.headers.get('Retry-After');
            errorMessage = retryAfter 
              ? `Too many requests. Please try again in ${retryAfter} seconds.`
              : 'Too many requests. Please try again later.';
          } else if (profileResponse.status === 400) {
            const data = await profileResponse.json().catch(() => ({}));
            errorMessage = data.message || 'Invalid username format';
          } else if (profileResponse.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          } else if (profileResponse.status >= 500) {
            errorMessage = 'Server error. Please try again later.';
          } else {
            errorMessage = `Failed to load profile (${profileResponse.status})`;
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          errorMessage = `Failed to load profile (${profileResponse.status})`;
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Parse profile JSON with error handling
      let profile;
      try {
        profile = await profileResponse.json();
      } catch (parseError) {
        console.error('Error parsing profile response:', parseError);
        setError('Invalid response from server. Please try again.');
        setLoading(false);
        return;
      }

      // Validate profile data structure
      if (!profile || typeof profile !== 'object') {
        setError('Invalid profile data received. Please try again.');
        setLoading(false);
        return;
      }

      // id-based visits don't know the username until the profile arrives
      if (lookup.id && profile.username) {
        setUsername(profile.username);
      }

      // Handle ELO response
      let eloDataToSet;
      if (!eloResponse.ok) {
        // ELO data is optional, continue without it
        console.warn('Failed to fetch ELO data:', eloResponse.status);
        eloDataToSet = {
          elo: profile.elo || 1000,
          rank: profile.rank || 0,
          duels_wins: profile.duelStats?.wins || 0,
          duels_losses: profile.duelStats?.losses || 0,
          duels_tied: profile.duelStats?.ties || 0,
          win_rate: profile.duelStats?.winRate || 0
        };
      } else {
        try {
          const elo = await eloResponse.json();
          eloDataToSet = elo;
        } catch (parseError) {
          console.warn('Error parsing ELO response, using fallback:', parseError);
          eloDataToSet = {
            elo: profile.elo || 1000,
            rank: profile.rank || 0,
            duels_wins: profile.duelStats?.wins || 0,
            duels_losses: profile.duelStats?.losses || 0,
            duels_tied: profile.duelStats?.ties || 0,
            win_rate: profile.duelStats?.winRate || 0
          };
        }
      }

      // ── Season 0 / OG normalisation.
      //
      // `seasonPeakElo`, `seasonPeakLeague` and `ogAccount` live on the User doc,
      // but this page assembles its view from TWO endpoints (publicProfile and
      // eloRank) and they have historically disagreed about who owns which
      // field. Pinning the badges to one endpoint means the day the other one
      // starts carrying them the badges silently stay dark. So: take the first
      // payload that actually has each field, once, here at the fetch boundary,
      // and hand components/publicProfile.js one settled shape.
      //
      // NOTHING IS INVENTED. A missing peak stays undefined and the badge does
      // not render — it is never back-filled from the current rating, which is
      // on a different scale entirely and would print a fictional career high.
      const firstNumber = (...vals) => {
        for (const v of vals) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) return n;
        }
        return undefined;
      };
      const firstString = (...vals) => {
        for (const v of vals) {
          if (typeof v === 'string' && v.trim() !== '') return v;
        }
        return undefined;
      };

      setProfileData({
        ...profile,
        seasonPeakElo: firstNumber(profile.seasonPeakElo, profile.season0?.peakElo, eloDataToSet?.seasonPeakElo),
        seasonPeakLeague: firstString(profile.seasonPeakLeague, profile.season0?.peakLeague, eloDataToSet?.seasonPeakLeague),
        // `=== true` on every source: the badge is permanent, so nothing but a
        // real boolean true may grant it.
        ogAccount: profile.ogAccount === true || eloDataToSet?.ogAccount === true,
      });
      setEloData(eloDataToSet);
      setLoading(false);
    } catch (err) {
      console.error('Unexpected error fetching public profile:', err);
      // Provide more specific error messages based on error type
      if (err.name === 'TypeError') {
        setError('Network error. Please check your connection.');
      } else if (err.message && err.message.includes('timeout')) {
        setError('Request timed out. Please try again.');
      } else {
        setError('An unexpected error occurred. Please try again later.');
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Extract the lookup key from the URL
    // Supports /user?id=<account id> (stable) and /user?u=username (legacy)
    const { apiUrl } = config();

    // Get lookup from query parameters
    let extractedUsername = router.query.u;
    let extractedId = router.query.id;

    // Also check URL search params directly (for client-side navigation)
    if (!extractedUsername && !extractedId && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      extractedUsername = urlParams.get('u');
      extractedId = urlParams.get('id');
    }

    if (!extractedUsername && !extractedId) {
      setLoading(false);
      setError('No username provided. Use format: /user?u=username');
      return;
    }

    if (extractedUsername) {
      setUsername(extractedUsername);
    }
    fetchPublicProfile({ username: extractedUsername, id: extractedId });
  }, [router.query.u, router.query.id, fetchPublicProfile]);

  // THE BACKGROUND OF THIS PAGE BELONGS TO ITS SUBJECT, NOT ITS READER.
  //
  // `--site-bg` is a per-VISITOR value: pages/_app.js writes it from the signed
  // in user's own equipped sku, so a page about somebody else was painted in
  // whatever city the reader happened to have bought. On the one screen that
  // exists to show off a player, that is backwards.
  //
  // Scoped to this page's shell and nowhere else — one custom property on the
  // element, which its ::before inherits — so it cannot leak into the menus or
  // survive a route change the way writing `--site-bg` on <html> would. The
  // reader's own background stays exactly as it was everywhere else on the site.
  //
  // Null (unknown sku, nothing equipped, still loading, portal build) leaves the
  // property unset and the CSS falls through to `var(--site-bg)`, which is the
  // behaviour this page has always had.
  const profileBackground = useMemo(
    () => backgroundUrlForSku(profileData?.cosmetics?.equipped?.background),
    [profileData]
  );

  return (
    <>
      <Head>
        <title>{username ? `${username}'s Profile - WorldGuessr` : 'User Profile - WorldGuessr'}</title>
        <meta name="description" content={username ? `View ${username}'s WorldGuessr profile stats, ELO rating, and achievements.` : 'View user profile on WorldGuessr'} />
      </Head>

      <Navbar />

      <div
        className="user-profile-page"
        style={profileBackground ? { '--profile-bg': `url("${profileBackground}")` } : undefined}
      >
        {loading && (
          <div className="loading-container">
            <div className="loading-card">
              <div className="loading-spinner"></div>
              <p>Loading profile...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-container">
            <div className="error-card">
              <h2>⚠️ {error}</h2>
              <p>The user profile could not be loaded.</p>
              <div className="error-actions">
                <button 
                  className="retry-button"
                  onClick={() => {
                    const extractedUsername = router.query.u || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('u') : null);
                    if (extractedUsername) {
                      fetchPublicProfile(extractedUsername);
                    } else {
                      setError('No username provided');
                    }
                  }}
                >
                  Retry
                </button>
                <button 
                  className="home-button"
                  onClick={() => router.push('/')}
                >
                  Go Home
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && profileData && eloData && (
          <PublicProfile
            profileData={profileData}
            eloData={eloData}
          />
        )}
      </div>

      <style jsx>{`
        /* Page shell.
           Was \`background-attachment: fixed\` on this element, which is also the
           scroll container. Firefox cannot composite a fixed-attachment
           background, so it re-rasterised the full-viewport site background
           image plus the gradient on every scroll frame. The artwork now lives in a
           \`position: fixed\` ::before layer: identical visual, rasterised once.
           Same fix as Leaderboard.module.css and accountModal.css. */
        .user-profile-page {
          min-height: 100vh;
          width: 100%;
          max-width: 100vw;
          background-color: #000000;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          position: relative;
          /* z-index: 0 (not auto) so this element is a stacking context.
             Without it the z-index:-1 ::before below escapes to the root
             stacking context and paints *under* this element's black
             background — a solid black page. It also keeps the shell painting
             above the global body::before street layer, which is where the old
             element-background sat. */
          z-index: 0;
          overflow-x: hidden;
          overflow-y: auto !important;
          padding: 20px;
          box-sizing: border-box;
          font-family: "Lexend", "Lexend Fallback", sans-serif;
        }

        .user-profile-page::before {
          content: '';
          position: fixed;
          inset: 0;
          /* --profile-bg is the PROFILE OWNER's equipped background, set inline
             on .user-profile-page above; --site-bg is the visitor's own and is
             only the fallback while the profile loads (or when its owner has
             nothing equipped). This layer is position:fixed inset:0, so it also
             sits behind the transparent navbar — the whole viewport reads as
             one background rather than splitting at the bar. */
          background: linear-gradient(
            135deg,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(20, 26, 57, 0.8) 50%,
            rgba(0, 0, 0, 0.9) 100%
          ),
          var(--profile-bg, var(--site-bg));
          background-size: cover;
          background-position: center;
          pointer-events: none;
          z-index: -1;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 120px);
          padding: 20px;
        }

        .loading-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 60px 40px;
          text-align: center;
          color: white;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          max-width: 400px;
        }

        .loading-spinner {
          border: 4px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          border-top: 4px solid rgba(255, 255, 255, 0.9);
          width: 60px;
          height: 60px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .loading-card p {
          font-size: 18px;
          font-weight: 500;
          margin: 0;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          font-family: "Lexend", "Lexend Fallback", sans-serif;
        }

        .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 120px);
          padding: 20px;
        }

        .error-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 40px;
          max-width: 500px;
          text-align: center;
          color: white;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          width: 100%;
        }

        .error-card h2 {
          margin: 0 0 15px 0;
          font-size: clamp(24px, 5vw, 32px);
          color: #ffc107;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          font-family: "Lexend", "Lexend Fallback", sans-serif;
        }

        .error-card p {
          margin: 0 0 25px 0;
          font-size: 16px;
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          font-family: "Lexend", "Lexend Fallback", sans-serif;
        }

        .error-actions {
          display: flex;
          gap: 15px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .error-card button {
          padding: 12px 24px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 25px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          font-family: "Lexend", "Lexend Fallback", sans-serif;
        }

        .error-card button.retry-button {
          background: rgba(0, 123, 255, 0.2);
          border-color: rgba(0, 123, 255, 0.3);
          color: #4dabf7;
        }

        .error-card button.retry-button:hover {
          background: rgba(0, 123, 255, 0.3);
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
          border-color: rgba(0, 123, 255, 0.4);
        }

        .error-card button.home-button {
          background: rgba(76, 175, 80, 0.2);
          border-color: rgba(76, 175, 80, 0.3);
          color: #4CAF50;
        }

        .error-card button.home-button:hover {
          background: rgba(76, 175, 80, 0.3);
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
          border-color: rgba(76, 175, 80, 0.4);
        }

        .error-card button:active {
          transform: translateY(0);
        }

        @media (max-width: 768px) {
          .user-profile-page {
            padding: 15px;
          }

          .back-button-container {
            padding: 0;
            margin-bottom: 15px;
          }

          .back-to-wg-button {
            width: 100%;
            padding: 10px 20px;
            font-size: 14px;
          }

          .error-card {
            padding: 30px 20px;
          }

          .error-card button {
            padding: 10px 20px;
            font-size: 14px;
          }

          .loading-card {
            padding: 40px 30px;
          }
        }
      `}</style>
    </>
  );
}
