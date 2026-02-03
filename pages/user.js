import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Navbar from '@/components/ui/navbar';
import PublicProfile from '@/components/publicProfile';
import config from '@/clientConfig';
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
  const fetchPublicProfile = useCallback(async (extractedUsername) => {
    setLoading(true);
    setError(null);

    const { apiUrl } = config();

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
          fetchWithTimeout(`${apiUrl}/api/publicProfile?username=${encodeURIComponent(extractedUsername)}`),
          fetchWithTimeout(`${apiUrl}/api/eloRank?username=${encodeURIComponent(extractedUsername)}`)
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

      setProfileData(profile);
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
    // Extract username from URL
    // Supports /user?u=username format
    const { apiUrl } = config();

    // Get username from query parameter
    let extractedUsername = router.query.u;

    // Also check URL search params directly (for client-side navigation)
    if (!extractedUsername && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      extractedUsername = urlParams.get('u');
    }

    if (!extractedUsername) {
      setLoading(false);
      setError('No username provided. Use format: /user?u=username');
      return;
    }

    setUsername(extractedUsername);
    fetchPublicProfile(extractedUsername);
  }, [router.query.u, fetchPublicProfile]);

  return (
    <>
      <Head>
        <title>{username ? `${username}'s Profile - WorldGuessr` : 'User Profile - WorldGuessr'}</title>
        <meta name="description" content={username ? `View ${username}'s WorldGuessr profile stats, ELO rating, and achievements.` : 'View user profile on WorldGuessr'} />
      </Head>

      <Navbar />

      <div className="user-profile-page">
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
        .user-profile-page {
          min-height: 100vh;
          width: 100%;
          max-width: 100vw;
          background: linear-gradient(
            135deg,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(20, 26, 57, 0.8) 50%,
            rgba(0, 0, 0, 0.9) 100%
          ),
          url("/street2.webp");
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow-x: hidden;
          overflow-y: auto !important;
          padding: 20px;
          box-sizing: border-box;
          font-family: "Lexend", sans-serif;
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
          font-family: "Lexend", sans-serif;
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
          font-family: "Lexend", sans-serif;
        }

        .error-card p {
          margin: 0 0 25px 0;
          font-size: 16px;
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          font-family: "Lexend", sans-serif;
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
          font-family: "Lexend", sans-serif;
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
