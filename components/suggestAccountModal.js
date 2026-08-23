import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { HIDE_ACCOUNT_UI } from "./utils/accountUi";
import { FaTrophy, FaGamepad, FaUsers } from 'react-icons/fa';

// CRAZYGAMES ONLY. A guest on CrazyGames taps Ranked / 2v2 (or opens a
// friend's 2v2 invite): this prompt names the mode and offers to link the
// CrazyGames account through the platform's own auth popup. Everywhere else
// that same moment opens components/auth/LoginModal.js directly (email + code,
// Google, Apple) with the mode copy as its title/subtitle. A CrazyGames
// account links through the SDK, not through our login, so the email modal is
// wrong there and this prompt stays. The periodic home-screen prompt never ran
// on CrazyGames (home.js gates it), so only the locked-mode variants exist.
const VARIANTS = {
  // invitedDescKey: personalized copy when the prompt was triggered by a
  // party invite and the server told us who sent it (hostName on the
  // gameJoinError): a friend's name converts better than generic copy.
  '2v2': { Icon: FaUsers, titleKey: 'linkCrazyGames2v2Title', descKey: 'linkGoogle2v2Desc', invitedDescKey: 'linkGoogle2v2InvitedDesc' },
  'ranked': { Icon: FaTrophy, titleKey: 'linkCrazyGamesRankedTitle', descKey: 'linkGoogleRankedDesc' },
};

export default function SuggestAccountModal({ shown, setOpen, variant, inviterName = null }) {
  const { t: text } = useTranslation("common");
  // Account-signup copy can never render on a no-account build. Guarded HERE
  // rather than trusting call sites: the 2v2 join-error path opens it from a
  // WebSocket handler, which is precisely the caller that forgets.
  if (HIDE_ACCOUNT_UI) return null;
  const variantDef = VARIANTS[variant];
  if (!variantDef) return null;
  const Icon = variantDef.Icon;

  const handleClose = () => {
    setOpen(false);
  };

  const handleLink = () => {
    // CrazyGames accounts link through the platform's own auth popup; the SDK
    // auth listener registered in home.js picks up the result and completes
    // the wg session + ws re-verify (which also retries a gated party join),
    // and the session effect in home.js then closes this modal.
    if (typeof window === 'undefined' || !window.CrazyGames?.SDK?.user) return;
    window.CrazyGames.SDK.user.showAuthPrompt((error) => {
      const code = error?.code || error;
      // userCancelled keeps the modal up (they may reconsider);
      // userAlreadySignedIn means the auth listener already has it covered.
      if (error && code !== 'userAlreadySignedIn') {
        console.log('CrazyGames auth prompt:', code);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <Modal
      id="signUpModal"
      styles={{
        modal: {
          background: 'linear-gradient(135deg, rgba(20, 65, 25, 0.97) 0%, rgba(10, 40, 15, 0.99) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '30px',
          maxWidth: '420px',
          textAlign: 'center',
          color: 'white',
          fontFamily: 'Lexend, "Lexend Fallback", sans-serif',
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

      <div style={{
        marginBottom: '24px',
        animation: 'float 3s ease-in-out infinite'
      }}>
        <Icon style={{
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
        {text(variantDef.titleKey)}
      </h2>

      <p style={{
        fontSize: '1rem',
        marginBottom: '28px',
        color: 'rgba(255, 255, 255, 0.9)',
        lineHeight: '1.6',
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
        // Honor the \n in linkGoogle2v2InvitedDesc (invite line / CTA line).
        // The other descs are single-line strings, so they're unaffected.
        whiteSpace: 'pre-line'
      }}>
        {inviterName && variantDef.invitedDescKey
          ? text(variantDef.invitedDescKey, { name: inviterName })
          : text(variantDef.descKey)}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <button
          onClick={handleLink}
          style={{
            // The house primary (.join-party-button): solid --primary, 2px
            // Night Green frame, 12px radius.
            background: 'var(--primary)',
            border: '2px solid var(--primaryDark)',
            color: 'white',
            padding: '14px 28px',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--primaryDark)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
          }}
        >
          <FaGamepad />
          {text("linkWithCrazyGames")}
        </button>

        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255, 255, 255, 0.12)',
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
            e.target.style.background = 'rgba(255, 255, 255, 0.12)';
            e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          {text("maybeLater")}
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
