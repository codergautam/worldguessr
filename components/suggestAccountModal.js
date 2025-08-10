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
          padding: 0,
          margin: 0,
          maxWidth: 'none',
          width: '100vw',
          height: '100vh',
          background: 'transparent',
          borderRadius: 0,
          zIndex: 1200,
        },
        modalContainer: {
          height: 'auto',
        }
      }}
      classNames={{ modal: "suggest-account-modal" }}
      open={shown}
      center
      onClose={handleClose}
      showCloseIcon={false}
      animationDuration={300}
    >
      <div className="suggest-account-modal-container">
        {/* Background with overlay */}
        <div className="suggest-account-modal-background"></div>

        {/* Main content */}
        <div className="suggest-account-modal-content">
          {/* Close button */}
          <button
            className="suggest-account-modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            <span className="close-icon">✕</span>
          </button>

          {/* Hero section */}
          <div className="suggest-account-hero">
            <div className="hero-icon">
              <FaTrophy className="trophy-icon" />
            </div>
            <h1 className="hero-title">{text("trackYourProgress")}</h1>
            <p className="hero-subtitle">{text("trackYourProgress1")}</p>
          </div>

          {/* Features showcase */}
          <div className="features-grid">
            <div className="feature-card">
              <FaChartLine className="feature-icon" />
              <h3>Track Stats</h3>
              <p>Monitor your progress and see your improvement over time</p>
            </div>
            <div className="feature-card">
              <FaTrophy className="feature-icon" />
              <h3>Compete</h3>
              <p>Challenge friends and climb the global leaderboards</p>
            </div>
            <div className="feature-card">
              <FaGamepad className="feature-icon" />
              <h3>Save Progress</h3>
              <p>Never lose your achievements and game history</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="action-buttons">
            <button 
              className="google-login-btn"
              onClick={handleGoogleLogin}
            >
              <FaGoogle className="google-icon" />
              <span>{text("loginWithGoogle1")}</span>
            </button>
            
            <button 
              className="guest-btn"
              onClick={handleClose}
            >
              <span>{text("playAsGuest")}</span>
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .suggest-account-modal-container {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }

        .suggest-account-modal-background {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            135deg,
            rgba(0, 0, 0, 0.95) 0%,
            rgba(20, 65, 25, 0.85) 30%,
            rgba(0, 30, 15, 0.9) 70%,
            rgba(0, 0, 0, 0.95) 100%
          ),
          url("/street1.jpg");
          background-size: cover;
          background-position: center;
          backdrop-filter: blur(3px);
          z-index: -1;
        }

        .suggest-account-modal-content {
          position: relative;
          max-width: 800px;
          width: 90%;
          background: linear-gradient(135deg, rgba(20, 65, 25, 0.15) 0%, rgba(20, 65, 25, 0.08) 57%, rgba(255,255,255,0) 100%);
          backdrop-filter: blur(20px);
          border: 1.4px solid rgba(36, 87, 52, 0.3);
          border-radius: 24px;
          padding: 60px 40px 50px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 
                      inset 0 1px 0 rgba(255, 255, 255, 0.1);
          text-align: center;
          animation: modalSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .suggest-account-modal-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
          border: 2px solid rgba(255, 255, 255, 0.2);
          color: white;
          border-radius: 50%;
          width: 45px;
          height: 45px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          font-weight: bold;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 15px rgba(220, 53, 69, 0.4);
          z-index: 1001;
        }

        .suggest-account-modal-close:hover {
          background: linear-gradient(135deg, #c82333 0%, #bd2130 100%);
          transform: scale(1.1) rotate(90deg);
          box-shadow: 0 6px 25px rgba(220, 53, 69, 0.6);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .suggest-account-hero {
          margin-bottom: 50px;
        }

        .hero-icon {
          margin-bottom: 30px;
          position: relative;
        }

        .trophy-icon {
          font-size: 80px;
          color: #ffd700;
          filter: drop-shadow(0 4px 8px rgba(255, 215, 0, 0.4));
          animation: float 3s ease-in-out infinite;
        }

        .hero-title {
          font-size: clamp(2.5rem, 6vw, 4rem);
          font-weight: 700;
          color: white;
          margin: 0 0 20px 0;
          text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.7);
          background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-subtitle {
          font-size: clamp(1.1rem, 3vw, 1.4rem);
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.6;
          margin: 0 0 40px 0;
          font-weight: 400;
          text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.5);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 25px;
          margin-bottom: 50px;
          max-width: 680px;
          margin-left: auto;
          margin-right: auto;
        }

        .feature-card {
          background: linear-gradient(135deg, rgba(36, 87, 52, 0.3) 0%, rgba(36, 87, 52, 0.1) 100%);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 25px 20px;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          cursor: default;
        }

        .feature-card:hover {
          transform: translateY(-5px);
          background: linear-gradient(135deg, rgba(36, 87, 52, 0.4) 0%, rgba(36, 87, 52, 0.2) 100%);
          border-color: rgba(255, 255, 255, 0.2);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        }

        .feature-icon {
          font-size: 36px;
          color: #4CAF50;
          margin-bottom: 15px;
          filter: drop-shadow(0 2px 4px rgba(76, 175, 80, 0.3));
        }

        .feature-card h3 {
          font-size: 1.3rem;
          font-weight: 600;
          color: white;
          margin: 0 0 10px 0;
          text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
        }

        .feature-card p {
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.5;
          margin: 0;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 15px;
          max-width: 400px;
          margin: 0 auto;
        }

        .google-login-btn {
          background: linear-gradient(135deg, #4285F4 0%, #34a853 100%);
          border: 2px solid rgba(255, 255, 255, 0.2);
          color: white;
          padding: 18px 35px;
          border-radius: 16px;
          cursor: pointer;
          font-size: 1.1rem;
          font-weight: 600;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 25px rgba(66, 133, 244, 0.4);
          text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
        }

        .google-login-btn:hover {
          background: linear-gradient(135deg, #3367d6 0%, #2d8a47 100%);
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(66, 133, 244, 0.6);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .google-login-btn:active {
          transform: translateY(0);
        }

        .google-icon {
          font-size: 20px;
        }

        .guest-btn {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
          border: 2px solid rgba(255, 255, 255, 0.3);
          color: rgba(255, 255, 255, 0.9);
          padding: 15px 35px;
          border-radius: 16px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          backdrop-filter: blur(10px);
          text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
        }

        .guest-btn:hover {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
          border-color: rgba(255, 255, 255, 0.5);
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .guest-btn:active {
          transform: translateY(0);
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(50px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .suggest-account-modal-content {
            width: 95%;
            padding: 50px 30px 40px;
          }

          .features-grid {
            grid-template-columns: 1fr;
            gap: 20px;
            margin-bottom: 40px;
          }

          .action-buttons {
            gap: 12px;
          }

          .google-login-btn, .guest-btn {
            padding: 16px 30px;
            font-size: 1rem;
          }

          .hero-title {
            margin-bottom: 15px;
          }

          .hero-subtitle {
            margin-bottom: 30px;
          }

          .trophy-icon {
            font-size: 60px;
          }
        }

        @media (max-width: 480px) {
          .suggest-account-modal-content {
            width: 98%;
            padding: 40px 20px 30px;
          }

          .features-grid {
            margin-bottom: 35px;
          }

          .feature-card {
            padding: 20px 15px;
          }
        }
      `}</style>
    </Modal>
  );
}
