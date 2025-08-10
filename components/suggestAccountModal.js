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
          background: 'linear-gradient(135deg, rgba(20, 65, 25, 0.95) 0%, rgba(10, 40, 15, 0.98) 100%)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '30px',
          maxWidth: '420px',
          textAlign: 'center',
          color: 'white',
          fontFamily: 'Lexend, sans-serif',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }
      }}
      open={shown}
      center
      onClose={handleClose}
      showCloseIcon={true}
      animationDuration={200}
    >
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
        fontSize: '1.8rem', 
        marginBottom: '12px', 
        fontWeight: '700',
        color: 'white',
        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.4)',
        background: 'linear-gradient(135deg, #ffffff 0%, #e8e8e8 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text'
      }}>
        {text("trackYourProgress")}
      </h2>
      
      <p style={{ 
        fontSize: '1rem', 
        marginBottom: '28px', 
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: '1.6',
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)' 
      }}>
        {text("trackYourProgress1")}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <button 
          onClick={handleGoogleLogin}
          style={{
            background: 'linear-gradient(135deg, #4285F4 0%, #34a853 100%)',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            color: 'white',
            padding: '14px 28px',
            borderRadius: '10px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 15px rgba(66, 133, 244, 0.4)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.2)',
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 8px 25px rgba(66, 133, 244, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 15px rgba(66, 133, 244, 0.4)';
          }}
        >
          <FaGoogle />
          {text("loginWithGoogle1")}
        </button>
        
        <button 
          onClick={handleClose}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255, 255, 255, 0.95)',
            padding: '14px 28px',
            borderRadius: '10px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.2)',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.15)';
            e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.08)';
            e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          {text("playAsGuest")}
        </button>
      </div>

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
