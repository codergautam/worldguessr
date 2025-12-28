import { useEffect, useState } from 'react';
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

    // Fetch public profile data
    const fetchPublicProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch profile and ELO data in parallel
        const [profileResponse, eloResponse] = await Promise.all([
          fetch(`${apiUrl}/api/publicProfile?username=${encodeURIComponent(extractedUsername)}`),
          fetch(`${apiUrl}/api/eloRank?username=${encodeURIComponent(extractedUsername)}`)
        ]);

        // Handle profile response
        if (!profileResponse.ok) {
          if (profileResponse.status === 404) {
            setError('User not found');
          } else if (profileResponse.status === 429) {
            setError('Too many requests. Please try again later.');
          } else if (profileResponse.status === 400) {
            const data = await profileResponse.json();
            setError(data.message || 'Invalid username format');
          } else {
            setError('Failed to load profile');
          }
          setLoading(false);
          return;
        }

        const profile = await profileResponse.json();

        // Handle ELO response
        if (!eloResponse.ok) {
          // ELO data is optional, continue without it
          console.warn('Failed to fetch ELO data:', eloResponse.status);
          setProfileData(profile);
          setEloData({
            elo: profile.elo || 1000,
            rank: profile.rank || 0,
            duels_wins: profile.duelStats?.wins || 0,
            duels_losses: profile.duelStats?.losses || 0,
            duels_tied: profile.duelStats?.ties || 0,
            win_rate: profile.duelStats?.winRate || 0
          });
        } else {
          const elo = await eloResponse.json();
          setProfileData(profile);
          setEloData(elo);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching public profile:', err);
        setError('An error occurred while loading the profile');
        setLoading(false);
      }
    };

    fetchPublicProfile();
  }, [router.query.u]);

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
            <div className="loading-spinner"></div>
            <p>Loading profile...</p>
          </div>
        )}

        {error && (
          <div className="error-container">
            <div className="error-card">
              <h2>⚠️ {error}</h2>
              <p>The user profile could not be loaded.</p>
              <button onClick={() => router.push('/')}>
                Go Home
              </button>
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          background-attachment: fixed;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 80px);
          color: white;
          padding: 20px;
        }

        .loading-spinner {
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top: 4px solid white;
          width: 60px;
          height: 60px;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .loading-container p {
          font-size: 18px;
          font-weight: 500;
        }

        .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 80px);
          padding: 20px;
        }

        .error-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 40px;
          max-width: 500px;
          text-align: center;
          color: white;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .error-card h2 {
          margin: 0 0 15px 0;
          font-size: clamp(24px, 5vw, 32px);
          color: #ffc107;
        }

        .error-card p {
          margin: 0 0 25px 0;
          font-size: 16px;
          color: rgba(255, 255, 255, 0.9);
        }

        .error-card button {
          padding: 12px 30px;
          border: none;
          border-radius: 25px;
          background: linear-gradient(135deg, #28a745, #20c997);
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
        }

        .error-card button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(40, 167, 69, 0.4);
        }

        @media (max-width: 768px) {
          .error-card {
            padding: 30px 20px;
          }
        }
      `}</style>
    </>
  );
}
