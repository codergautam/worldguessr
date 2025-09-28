import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ModDashboard from '../components/modDashboard';

export default function ModPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check for session in localStorage or your session management system
    const checkSession = () => {
      if (typeof window !== 'undefined') {
        const sessionData = localStorage.getItem('wg_session');
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData);
            setSession(parsed);
          } catch (error) {
            console.error('Failed to parse session:', error);
            router.push('/');
          }
        } else {
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
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        color: '#fff'
      }}>
        <div>Loading mod dashboard...</div>
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
      </Head>

      <ModDashboard session={session} />
    </>
  );
}