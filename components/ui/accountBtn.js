import { signIn } from "@/components/auth/auth";
import { FaGoogle } from "react-icons/fa";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "../utils/sendEvent";

export default function AccountBtn({ session, openAccountModal, navbarMode, inCrazyGames }) {
  const { t: text } = useTranslation("common");


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
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'} ${session?.token?.supporter ? 'supporterBtn' : ''}`} onClick={() => {
        openAccountModal()
        }}>
          {session?.token?.username ? <p style={{ color:'white', marginRight: '10px',marginLeft: '10px' }}>{session?.token?.username}</p> : null}

        </button>
    )}
    </>
  )
}