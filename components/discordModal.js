import { Modal } from "react-responsive-modal";
import { useTranslation } from 'next-i18next';
import { signIn } from "next-auth/react";
import gameStorage from "./utils/localStorage";

export default function DiscordModal({ shown, setOpen }) {
  const { t: text } = useTranslation("common");

  return (
    <Modal id="signUpModal" styles={{
        modal: {
            zIndex: 100,
            background: '#333', // dark mode: #333
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            fontFamily: "'Arial', sans-serif",
            maxWidth: '500px',
            textAlign: 'center',
        }
    }} open={shown} center onClose={() => {
        gameStorage.setItem("shownDiscordModal", Date.now().toString())
      setOpen(false)
    }}>

<h2>{text("joinDiscord")}</h2>
      <p>{text("joinDiscordDesc")}</p>

<iframe src="https://discord.com/widget?id=1229957469116301412&theme=dark" width="350"
height="350"
allowtransparency="true" frameborder="0" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>

<br/>

      <button onClick={() => {
          gameStorage.setItem("shownDiscordModal", Date.now().toString())

        setOpen(false)
      }} style={{
          background: 'transparent',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          border: '1px solid white',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          marginTop: '20px',
          marginLeft: '20px'
      }}>
        {text("notNow")}
      </button>
    </Modal>
  );
}
