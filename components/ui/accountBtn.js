import { signIn } from "next-auth/react";
import { FaGoogle } from "react-icons/fa";

export default function AccountBtn({ session, openAccountModal, shown }) {
  return (
    <>
    {!session || !session?.token?.secret ? (
      <div style={{ display: 'flex', alignItems: 'center', opacity: shown ? 1 : 0 }} className="accountBtnContainer">
        <button className="gameBtn accountBtn" onClick={() => signIn('google')}>
        Login <FaGoogle className="home__squarebtnicon" />
        </button>
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', opacity: shown ? 1 : 0 }} className="accountBtnContainer">
        <button className="gameBtn accountBtn" onClick={() => openAccountModal()}>
          {session?.token?.username ? <p style={{ color: 'white', marginRight: '10px' }}>{session?.token?.username}</p> : null}
        </button>
      </div>
    )}
    </>
  )
}