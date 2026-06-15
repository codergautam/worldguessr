import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { signIn } from "@/components/auth/auth";
import gameStorage from "./utils/localStorage";
import { FaGoogle, FaTrophy, FaChartLine, FaGamepad } from 'react-icons/fa';

export default function SuggestAccountModal({ shown, setOpen, showNeverAgain }) {
  const { t: text } = useTranslation("common");

  const handleClose = () => {
    setOpen(false);
  };

  const handleGoogleLogin = () => {
    signIn('google');
  };

  const handleNeverAgain = () => {
    try { gameStorage.setItem("suggestLoginNeverShow", "1"); } catch(e) {}
    setOpen(false);
  };

  return (
    <Modal
      id="signUpModal"
      styles={{
        modal: {
          background: 'linear-gradient(160deg, rgba(28, 44, 78, 0.65) 0%, rgba(13, 18, 30, 0.95) 60%), rgba(5, 8, 16, 0.95)',
          border: '1px solid rgba(96, 165, 250, 0.32)',
          borderRadius: '16px',
          padding: '30px',
          maxWidth: '420px',
          textAlign: 'center',
          color: 'white',
          fontFamily: 'Lexend, sans-serif',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }
      }}
      open={shown}
      center
      onClose={handleClose}
      showCloseIcon={false}
      animationDuration={200}
    >
      <button
        onClick={handleClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: 'rgba(255, 255, 255, 0.85)',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: '16px',
          lineHeight: 1,
          padding: 0,
          fontFamily: 'inherit',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        ✕
      </button>

      <div style={{
        marginBottom: '24px',
        animation: 'float 3s ease-in-out infinite'
      }}>
        <FaTrophy style={{ 
          fontSize: '56px', 
          color: '#ffd700', 
          filter: 'drop-shadow(0 4px 8px rgba(255, 215, 0, 0.5))'
        }} />
      </div>
      
      <h2 style={{
        fontFamily: '"GmarketSans", "Lexend", sans-serif',
        fontSize: '1.9rem',
        marginBottom: '12px',
        fontWeight: '700',
        color: 'white',
        letterSpacing: '0.3px',
      }}>
        {text("trackYourProgress")}
      </h2>

      <p style={{
        fontSize: '1rem',
        marginBottom: '28px',
        color: 'rgba(255, 255, 255, 0.85)',
        lineHeight: '1.6',
      }}>
        {text("trackYourProgress1")}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <button
          onClick={handleGoogleLogin}
          className="wg-tutorialBtn wg-tutorialBtn--primary"
        >
          <FaGoogle />
          {text("loginWithGoogle1")}
        </button>

        <button
          onClick={handleClose}
          className="wg-tutorialBtn wg-tutorialBtn--ghost"
        >
          {text("playAsGuest")}
        </button>
      </div>

      {showNeverAgain && (
        <button
          onClick={handleNeverAgain}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.45)',
            fontSize: '0.75rem',
            fontFamily: 'Lexend, sans-serif',
            cursor: 'pointer',
            marginTop: '14px',
            padding: '4px 8px',
            textDecoration: 'underline',
            textDecorationColor: 'rgba(255, 255, 255, 0.3)',
            textUnderlineOffset: '2px',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { e.target.style.color = 'rgba(255, 255, 255, 0.8)'; }}
          onMouseLeave={(e) => { e.target.style.color = 'rgba(255, 255, 255, 0.45)'; }}
        >
          {text("neverShowAgain")}
        </button>
      )}

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }
      `}</style>
    </Modal>
  );
}
