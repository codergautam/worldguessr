import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from '@/components/auth/auth';
import ModDashboard from '../components/modDashboard';

export default function ModPage() {
  const session = useSession();
  const router = useRouter();

  // If no session, redirect to home
  if (!session?.token?.secret) {
    if (typeof window !== 'undefined') {
      router.push('/');
    }
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        color: '#fff'
      }}>
        <div>Redirecting...</div>
      </div>
    );
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