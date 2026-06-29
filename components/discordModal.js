import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import gameStorage from "./utils/localStorage";

export default function DiscordModal({ shown, setOpen }) {
  const { t: text } = useTranslation("common");

  const handleClose = () => {
    gameStorage.setItem("shownDiscordModal", Date.now().toString());
    setOpen(false);
  };

  return (
    <Modal
      id="signUpModal"
      styles={{
        modal: {
          background: 'linear-gradient(135deg, rgba(35, 45, 120, 0.97) 0%, rgba(15, 20, 60, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '30px',
          maxWidth: '440px',
          textAlign: 'center',
          color: 'white',
          fontFamily: 'Lexend, sans-serif',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
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
        {text("joinDiscord")}
      </h2>

      <p style={{
        fontSize: '1rem',
        marginBottom: '24px',
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: '1.6',
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)'
      }}>
        {text("joinDiscordDesc")}
      </p>

      <div style={{
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
        marginBottom: '20px',
        background: 'rgba(0, 0, 0, 0.2)',
      }}>
        <iframe
          src="https://discord.com/widget?id=1229957469116301412&theme=dark"
          width="100%"
          height="350"
          allowtransparency="true"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          style={{ display: 'block' }}
        ></iframe>
      </div>

      <button
        onClick={handleClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.65)',
          fontSize: '0.95rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
          padding: '6px 12px',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(255, 255, 255, 0.3)',
          textUnderlineOffset: '2px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)'; }}
      >
        {text("notNow")}
      </button>

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
