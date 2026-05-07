import { signIn } from "@/components/auth/auth";
import { useEffect, useState } from "react";
import { FaApple, FaGoogle, FaTimes } from "react-icons/fa";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "../utils/sendEvent";
import CountryFlag from '../utils/countryFlag';

export default function AccountBtn({ session, openAccountModal, navbarMode, inCrazyGames, inGameDistribution, loginQueued, setLoginQueued }) {
  const { t: text } = useTranslation("common");
  const hasGoogleClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [nativePlatform, setNativePlatform] = useState(null);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  // Use countryCode from session (now included in googleAuth response)
  const countryCode = session?.token?.countryCode || null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const capacitor = window.Capacitor;
    if (capacitor?.isNativePlatform?.()) {
      setNativePlatform(capacitor.getPlatform?.() || 'native');
    }
  }, []);

  const startLogin = (provider = 'google') => {
    if (session === null && !loginQueued) {
      if (hasGoogleClientId || nativePlatform) {
        setLoginQueued?.(true);
      }
      sendEvent("login_attempt")
      signIn(provider)
    }
  };

  const openLogin = () => {
    if (nativePlatform) {
      setAuthSheetOpen(true);
      return;
    }
    startLogin('google');
  };

  if((inCrazyGames || inGameDistribution) && (!session || !session?.token?.secret)) {
    return null;
  }

  return (
    <>
    {!session || !session?.token?.secret ? (
        <>
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} disabled={inCrazyGames || loginQueued} onClick={openLogin}>

        { loginQueued ? (
          <div style={{ marginRight: '10px', marginLeft: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {text("login")}&nbsp;&nbsp;
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTop: '2px solid white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        ) : !session?.token?.secret && session !== null ? '...' :
        (
          // <div style="margin-right: 10px; margin-left: 10px; display: flex; align-items: center; justify-content: center;">
          <div style={{marginRight: '10px',marginLeft: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>

            {!inCrazyGames ? (
              <>
            <FaGoogle className="home__squarebtnicon" />
            &nbsp;&nbsp;
            {text("login")}
            </>
            ): (
              <>
            ...
            </>
            )}
          </div>
        )}
        </button>
        {authSheetOpen && (
          <div className="nativeAuthSheetBackdrop" onClick={() => setAuthSheetOpen(false)}>
            <div className="nativeAuthSheet" role="dialog" aria-modal="true" aria-label="Sign in" onClick={(event) => event.stopPropagation()}>
              <button className="nativeAuthSheet__close" aria-label="Close" onClick={() => setAuthSheetOpen(false)}>
                <FaTimes />
              </button>
              <div className="nativeAuthSheet__header">
                <h2>Sign in to WorldGuessr</h2>
                <p>Sync progress, duels, friends, maps, and daily results.</p>
              </div>
              <div className="nativeAuthSheet__actions">
                {nativePlatform === 'ios' && (
                  <button
                    className="nativeAuthSheet__provider nativeAuthSheet__provider--apple"
                    disabled={loginQueued}
                    onClick={() => {
                      setAuthSheetOpen(false);
                      startLogin('apple');
                    }}
                  >
                    <FaApple />
                    <span>Continue with Apple</span>
                  </button>
                )}
                <button
                  className="nativeAuthSheet__provider nativeAuthSheet__provider--google"
                  disabled={loginQueued}
                  onClick={() => {
                    setAuthSheetOpen(false);
                    startLogin('google');
                  }}
                >
                  <FaGoogle />
                  <span>Continue with Google</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </>
    ) : (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn loggedIn'} ${session?.token?.supporter ? 'supporterBtn' : ''}`} onClick={() => {
        openAccountModal()
        }}>
          {session?.token?.username ? (
            <p style={{ color:'white', paddingRight: '-13px',marginLeft: '0px', fontSize: "1.4em", fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {session?.token?.username}
              {countryCode && <CountryFlag countryCode={countryCode} style={{ fontSize: '1em' }} marginRight="0px" />}
            </p>
          ) : null}

        </button>
    )}
    </>
  )
}
