import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { signIn } from "@/components/auth/auth";
import gameStorage from "./utils/localStorage";
import { FaGoogle, FaTrophy, FaChartLine, FaGamepad } from 'react-icons/fa';

export default function SuggestAccountModal({ shown, setOpen }) {
  const { t: text } = useTranslation("common");

  const handleClose = () => {
    gameStorage.setItem("onboarding", 'done');
    setOpen(false);
  };

  const handleGoogleLogin = () => {
    signIn('google');
  };

  return (
    <Modal 
      id="signUpModal" 
      styles={{
        modal: {
          background: '#333',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '25px',
          maxWidth: '380px',
          textAlign: 'center',
          color: 'white',
          fontFamily: 'Lexend, sans-serif',
        }
      }}
      open={shown}
      center
      onClose={handleClose}
      showCloseIcon={true}
      animationDuration={200}
    >
      <FaTrophy style={{ 
        fontSize: '40px', 
        color: '#ffd700', 
        marginBottom: '15px',
        display: 'block'
      }} />
      
      <h2 style={{ 
        fontSize: '1.5rem', 
        marginBottom: '10px', 
        fontWeight: '600',
        color: 'white' 
      }}>
        {text("trackYourProgress")}
      </h2>
      
      <p style={{ 
        fontSize: '0.95rem', 
        marginBottom: '20px', 
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: '1.4' 
      }}>
        {text("trackYourProgress1")}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button 
          onClick={handleGoogleLogin}
          style={{
            background: '#4285F4',
            border: 'none',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '0.95rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <FaGoogle />
          {text("loginWithGoogle1")}
        </button>
        
        <button 
          onClick={handleClose}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'rgba(255, 255, 255, 0.8)',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '0.95rem',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          {text("playAsGuest")}
        </button>
      </div>
    </Modal>
  );
}
