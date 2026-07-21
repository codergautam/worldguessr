import { useEffect, useState } from 'react';
import config from '@/clientConfig';

// Landing page for forum logins (DiscourseConnect). The forum sends users here
// with ?sso&sig; we forward them with the wg_secret from localStorage to
// /api/discourseSSO, which validates everything and returns the signed
// redirect that logs them into worldguessr.forum.
export default function DiscourseSSO() {
  const [status, setStatus] = useState('Connecting to forum...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sso = params.get('sso');
    const sig = params.get('sig');
    if (!sso || !sig) {
      setStatus('Invalid forum login link — please start from worldguessr.forum');
      return;
    }

    const secret = window.localStorage.getItem('wg_secret');
    if (!secret) {
      setStatus('Please log in on WorldGuessr first, then press "Log In" on the forum again.');
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
        } else {
          setStatus(data.message || 'Forum login failed — please try again');
        }
      })
      .catch(() => setStatus('Forum login failed — please try again'));
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0b0b1a', color: '#fff',
      fontFamily: 'sans-serif', textAlign: 'center', padding: '20px',
    }}>
      <div>
        <h2>WorldGuessr Forum</h2>
        <p>{status}</p>
      </div>
    </div>
  );
}
