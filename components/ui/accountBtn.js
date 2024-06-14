import { signIn } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";

export default function AccountBtn({ session, openAccountModal, navbarMode }) {
  return (
    <>
    {!session || !session?.token?.secret ? (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} onClick={() => session === null && signIn('google')}>
        Login <FaGoogle className="home__squarebtnicon" />
        </button>
    ) : (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} onClick={() => openAccountModal()}>
          {session?.token?.username ? <p style={{ color: 'white', marginRight: '10px' }}>{session?.token?.username}</p> : null}
        </button>
    )}
    </>
  )
}