import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ModDashboard from '../components/modDashboard';
import config from '@/clientConfig';

export default function ModPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();


  useEffect(() => {
    const checkSession = async () => {
      if (typeof window !== 'undefined') {
        try {
          // Initialize config
          window.cConfig = config();

          // Get secret from localStorage
          const secret = localStorage.getItem('wg_secret');
          console.log('Found wg_secret in localStorage:', secret ? 'YES' : 'NO');

          if (!secret) {
            console.log('No secret found, redirecting to home');
            router.push('/');
            return;
          }

          // Verify the secret and get user data
          const response = await fetch(window.cConfig.apiUrl + '/api/mod/userLookup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              secret: secret,
              username: 'self' // Special case to get own user data
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const sessionData = {
              token: {
                secret: secret,
                staff: data.targetUser.staff
              },
              user: data.targetUser
            };
            console.log('Session created:', sessionData);
            setSession(sessionData);
          } else {
            console.log('Failed to verify secret, redirecting to home');
            router.push('/');
          }
        } catch (error) {
          console.error('Session check error:', error);
          router.push('/');
        }
      }
      setLoading(false);
    };

    checkSession();
  }, [router]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        color: '#fff',
        position: 'relative'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'rgba(36, 87, 52, 0.1)',
          borderRadius: '20px',
          border: '1px solid rgba(36, 87, 52, 0.3)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{
            fontSize: '3rem',
            marginBottom: '20px',
            animation: 'pulse 2s ease-in-out infinite'
          }}>🌍</div>
          <div style={{
            fontSize: '1.2rem',
            fontWeight: '600',
            marginBottom: '10px',
            color: '#4CAF50'
          }}>WorldGuessr</div>
          <div style={{
            fontSize: '1rem',
            opacity: '0.8'
          }}>Loading mod dashboard...</div>
          <style jsx>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <>
      <Head>
        <title>Mod Dashboard - WorldGuessr</title>
        <meta name="description" content="Moderator dashboard for WorldGuessr" />
        <meta name="robots" content="noindex, nofollow" />
        <style>
        {`
          .mainBody {
            user-select: auto !important;
            overflow: auto !important;
          }
        `}
        </style>
      </Head>

      <ModDashboard session={session} />
    </>
  );
}