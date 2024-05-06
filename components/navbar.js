import { signIn } from "next-auth/react"
import { FaGoogle, FaUser } from "react-icons/fa";

export default function Navbar({mapShown, session, fullReset, setMultiplayerModal, playingMultiplayer, openAccountModal}) {
  return (
    <div className={`top ${mapShown ? 'hideOnMobile' : ''}`}>
      <div className="topItem navbar">
        <div>
          <a id="logo" alt="worldguessr logo" onClick={() => {
            if (!playingMultiplayer) fullReset();
          }} style={{ cursor: "pointer" }}>
            <img id="icon" src="/logo.png" alt="WorldGuessr logo" />
          </a>
          {playingMultiplayer ? <p style={{ color: 'white' }}>Multiplayer</p> : (
            <button className="navButton" onClick={() => setMultiplayerModal(true)}>Play with Friends</button>
          )}
        </div>

        {!session || !session?.token?.secret ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="navButton" onClick={() => signIn('google')}>
              <FaUser style={{ marginRight: '10px' }} />
              Sign In
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="navButton" onClick={() => openAccountModal()}>
              {session?.token?.username ? <p style={{ color: 'white', marginRight: '10px' }}>{session?.token?.username}</p> : null}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}