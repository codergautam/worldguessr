import { signIn } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";
import { useTranslation } from 'next-i18next'
import sendEvent from "../utils/sendEvent";

export default function AccountBtn({ session, openAccountModal, navbarMode }) {
  const { t: text } = useTranslation("common");

  return (
    <>
    {!session || !session?.token?.secret ? (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} onClick={() => {
          if(session === null) {
            sendEvent("login_attempt")
            signIn('google')
          }
          }}>

        { !session?.token?.secret && session !== null ? '...' :
        (
          <div style={{marginRight: '10px',marginLeft: '10px'}}>
            
            {text("login")}
            <FaGoogle className="home__squarebtnicon" />
          </div> 
        )}
        </button>
    ) : (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} onClick={() => {
        sendEvent("open_account_modal")
        openAccountModal()
        }}>
          {session?.token?.username ? <p style={{ color: 'white', marginRight: '10px',marginLeft: '10px' }}>{session?.token?.username}</p> : null}
        </button>
    )}
    </>
  )
}