import { Modal } from "react-responsive-modal";
import { useTranslation } from 'next-i18next';
import { signIn } from "next-auth/react";

export default function SuggestAccountModal({ shown, setOpen }) {
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
    }} open={shown} center onClose={() => { setOpen(false) }}>
      <h2>{text("trackYourProgress")}</h2>
      <p>{text("trackYourProgress1")}</p>
      <button onClick={() => signIn('google')} style={{
          background: '#4285F4', // Google blue
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          marginTop: '20px'
      }}>
        {text("loginWithGoogle1")}
      </button>
      <button onClick={() => setOpen(false)} style={{
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
        {text("playAsGuest")}
      </button>
    </Modal>
  );
}
