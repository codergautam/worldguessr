import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function UserProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query?.u || router.query?.username;
    const username = Array.isArray(q) ? q[0] : q;
    const target = username
      ? { pathname: '/', query: { profile: String(username) } }
      : { pathname: '/' };
    router.replace(target);
  }, [router.isReady, router.query?.u, router.query?.username]);

  return (
    <>
      <Head>
        <title>WorldGuessr — Profile</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0e18',
          color: 'rgba(255, 255, 255, 0.75)',
          fontFamily: 'Lexend, sans-serif',
        }}
      >
        Loading profile…
      </div>
    </>
  );
}
