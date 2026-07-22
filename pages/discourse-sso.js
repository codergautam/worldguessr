import { useEffect, useState } from 'react';
import config from '@/clientConfig';
import { asset } from '@/lib/basePath';

// Landing page for forum logins (DiscourseConnect). The forum sends users
// here with ?sso&sig; we forward the wg_secret from localStorage to
// /api/discourseSSO, which validates everything and returns the signed
// redirect that logs them into worldguessr.forum.
const card = {
  width: 'min(360px, 100%)',
  background: 'rgba(15, 26, 19, 0.82)',
  border: '1px solid rgba(168, 184, 178, 0.16)',
  borderRadius: '16px',
  padding: '36px 32px',
  textAlign: 'center',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
};

const cta = {
  display: 'inline-block',
  marginTop: '20px',
  fontSize: '15px',
  fontWeight: 600,
  color: '#fff',
  textDecoration: 'none',
  background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  padding: '12px 30px',
  boxShadow: '0 6px 18px rgba(76, 175, 80, 0.32)',
};

export default function DiscourseSSO() {
  const [state, setState] = useState('connecting'); // connecting | login | error

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sso = params.get('sso');
    const sig = params.get('sig');
    if (!sso || !sig) {
      setState('error');
      return;
    }

    const secret = window.localStorage.getItem('wg_secret');
    if (!secret) {
      setState('login');
      return;
    }

    fetch(config().apiUrl + '/api/discourseSSO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, sso, sig }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.redirect) {
          window.location.href = data.redirect;
        } else if (data.message === 'Not logged in') {
          setState('login');
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '32px 20px',
      fontFamily: "'Lexend', sans-serif", color: '#f2f5f3',
      backgroundColor: '#0a120c',
      backgroundImage: `linear-gradient(rgba(10,18,12,0.86), rgba(10,18,12,0.93)), url(${asset('/street2.webp')})`,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
    }}>
      <style>{`
        @keyframes wgspin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .wg-spin { animation-duration: 2.4s !important; } }
      `}</style>
      <div style={card}>
        <div style={{ fontSize: '21px', fontWeight: 700, marginBottom: '26px' }}>
          WorldGuessr <span style={{ color: '#4CAF50', fontWeight: 600 }}>Forum</span>
        </div>

        {state === 'connecting' && (
          <>
            <div className="wg-spin" role="status" aria-label="Connecting" style={{
              width: '42px', height: '42px', margin: '4px auto 18px', borderRadius: '50%',
              border: '3px solid rgba(76, 175, 80, 0.18)', borderTopColor: '#4CAF50',
              animation: 'wgspin 0.9s linear infinite',
            }} />
            <div style={{ fontSize: '17px', fontWeight: 500 }}>Signing you in…</div>
          </>
        )}

        {state === 'login' && (
          <>
            <div style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.4 }}>
              Log in to WorldGuessr,<br />then try again
            </div>
            <a style={cta} href="/">Open WorldGuessr</a>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ fontSize: '17px', fontWeight: 500, color: '#e8a13c' }}>
              Login failed — try again
            </div>
            <a style={{ ...cta, background: 'none', color: '#a8b8b2', boxShadow: 'none', border: '1px solid rgba(168,184,178,0.3)', fontWeight: 500 }}
              href="https://worldguessr.forum">Back to forum</a>
          </>
        )}
      </div>
    </div>
  );
}
