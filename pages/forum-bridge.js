import { useEffect, useState } from 'react';
import config from '@/clientConfig';

// Carries a game session from embedded contexts (CrazyGames iframe) to
// top-level worldguessr.com. The in-game Forum button mints a one-time code
// (api/forumBridge) and opens this page with it; we exchange the code for
// the wg_secret, store it in top-level localStorage, and continue straight
// into forum SSO — so CrazyGames players get forum accounts too.
const card = {
  width: 'min(360px, 100%)',
  background: 'rgba(13, 19, 31, 0.82)',
  border: '1px solid rgba(168, 184, 178, 0.16)',
  borderRadius: '16px',
  padding: '36px 32px',
  textAlign: 'center',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
};

export default function ForumBridge() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');

    const goToForum = () => {
      // /session/sso kicks off DiscourseConnect immediately — lands logged in
      window.location.href = 'https://worldguessr.forum/session/sso';
    };

    if (!code) {
      // No code but maybe already bridged earlier — just head to the forum
      if (window.localStorage.getItem('wg_secret')) return goToForum();
      setFailed(true);
      return;
    }

    fetch(config().apiUrl + '/api/forumBridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exchange', code }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.secret) {
          window.localStorage.setItem('wg_secret', data.secret);
          goToForum();
        } else if (window.localStorage.getItem('wg_secret')) {
          // Code expired but a previous bridge already planted the session
          goToForum();
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '32px 20px',
      fontFamily: "'Lexend', sans-serif", color: '#f2f5f3',
      backgroundImage: 'linear-gradient(rgba(7,11,19,0.72), rgba(7,11,19,0.86)), url(/street1.jpg)',
      backgroundSize: 'cover', backgroundPosition: 'center',
    }}>
      <style>{`
        @keyframes wgspin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .wg-spin { animation-duration: 2.4s !important; } }
      `}</style>
      <div style={card}>
        <div style={{ fontSize: '21px', fontWeight: 700, marginBottom: '26px' }}>
          WorldGuessr <span style={{ color: '#4CAF50', fontWeight: 600 }}>Forum</span>
        </div>

        {!failed ? (
          <>
            <div className="wg-spin" role="status" aria-label="Loading" style={{
              width: '42px', height: '42px', margin: '4px auto 18px', borderRadius: '50%',
              border: '3px solid rgba(76, 175, 80, 0.18)', borderTopColor: '#4CAF50',
              animation: 'wgspin 0.9s linear infinite',
            }} />
            <div style={{ fontSize: '17px', fontWeight: 500 }}>Taking you to the forum…</div>
          </>
        ) : (
          <div style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.4, color: '#e8a13c' }}>
            Link expired — press the Forum<br />button in the game again
          </div>
        )}
      </div>
    </div>
  );
}
