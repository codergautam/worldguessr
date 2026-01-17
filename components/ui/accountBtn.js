import { signIn } from "@/components/auth/auth";
import { FaGoogle } from "react-icons/fa";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "../utils/sendEvent";
import CountryFlag from '../utils/countryFlag';

export default function AccountBtn({ session, openAccountModal, navbarMode, inCrazyGames }) {
  const { t: text } = useTranslation("common");
  // Use countryCode from session (now included in googleAuth response)
  const countryCode = session?.token?.countryCode || null;


  if(inCrazyGames && (!session || !session?.token?.secret)) {
    return null;
  }

  return (
    <>
    {!session || !session?.token?.secret ? (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} disabled={inCrazyGames} onClick={() => {
          if(session === null) {
            sendEvent("login_attempt")
            signIn('google')
          }
          }}>

        { !session?.token?.secret && session !== null ? '...' :
        (
          // <div style="margin-right: 10px; margin-left: 10px; display: flex; align-items: center; justify-content: center;">
          <div style={{marginRight: '10px',marginLeft: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>

            {!inCrazyGames ? (
              <>
            {text("login")}&nbsp;&nbsp;
            <FaGoogle className="home__squarebtnicon" />
            </>
            ): (
              <>
            ...
            </>
            )}
          </div>
        )}
        </button>
    ) : (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn loggedIn'} ${session?.token?.supporter ? 'supporterBtn' : ''}`} onClick={() => {
        openAccountModal()
        }}>
          {session?.token?.username ? (
            <p style={{ color:'white', paddingRight: '-13px',marginLeft: '0px', fontSize: "1.4em", fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {session?.token?.username}
              {countryCode && <CountryFlag countryCode={countryCode} style={{ fontSize: '1em' }} />}
            </p>
          ) : null}

        </button>
    )}
    </>
  )
}