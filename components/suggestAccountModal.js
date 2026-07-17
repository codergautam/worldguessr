import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { signIn } from "@/components/auth/auth";
import gameStorage from "./utils/localStorage";
import { FaGoogle, FaTrophy, FaChartLine, FaGamepad, FaUsers } from 'react-icons/fa';

// Locked-mode conversion variants: guests clicking 2v2 / Ranked get this same
// modal shell with mode-specific copy ("link Google", never "make an account")
// and "Maybe later" instead of "Continue as Guest" (dismissing doesn't unlock
// the mode). The default variant stays the periodic home-screen suggestion.
// On CrazyGames the linked account is the platform's, not Google, so titles
// and the CTA swap to CrazyGames-branded keys.
const VARIANTS = {
  // invitedDescKey: personalized copy when the prompt was triggered by a
  // party invite and the server told us who sent it (hostName on the
  // gameJoinError) — a friend's name converts better than generic copy.
  '2v2': { Icon: FaUsers, titleKey: 'linkGoogle2v2Title', crazyTitleKey: 'linkCrazyGames2v2Title', descKey: 'linkGoogle2v2Desc', invitedDescKey: 'linkGoogle2v2InvitedDesc' },
  'ranked': { Icon: FaTrophy, titleKey: 'linkGoogleRankedTitle', crazyTitleKey: 'linkCrazyGamesRankedTitle', descKey: 'linkGoogleRankedDesc' },
};

export default function SuggestAccountModal({ shown, setOpen, showNeverAgain, variant = null, inviterName = null, inCrazyGames = false }) {
  const { t: text } = useTranslation("common");
  const variantDef = variant ? VARIANTS[variant] : null;
  const Icon = variantDef?.Icon || FaTrophy;

  const handleClose = () => {
    setOpen(false);
  };

  const handleGoogleLogin = () => {
    // CrazyGames accounts link through the platform's own auth popup; the SDK
    // auth listener registered in home.js picks up the result and completes
    // the wg session + ws re-verify automatically, which then auto-closes
    // this modal via the session effect.
    if (inCrazyGames && typeof window !== 'undefined' && window.CrazyGames?.SDK?.user) {
      window.CrazyGames.SDK.user.showAuthPrompt((error, user) => {
        const code = error?.code || error;
        // userCancelled keeps the modal up (they may reconsider);
        // userAlreadySignedIn means the auth listener already has it covered.
        if (error && code !== 'userAlreadySignedIn') {
          console.log('CrazyGames auth prompt:', code);
          return;
        }
        setOpen(false);
      });
      return;
    }
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
        {text(variantDef ? (inCrazyGames ? variantDef.crazyTitleKey : variantDef.titleKey) : "trackYourProgress")}
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
        {variantDef
          ? (inviterName && variantDef.invitedDescKey
            ? text(variantDef.invitedDescKey, { name: inviterName })
            : text(variantDef.descKey))
          : text(inCrazyGames ? "trackYourProgressCrazy" : "trackYourProgress1")}
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
          {inCrazyGames ? <FaGamepad /> : <FaGoogle />}
          {text(inCrazyGames ? "linkWithCrazyGames" : "loginWithGoogle1")}
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
          {text(variantDef ? "maybeLater" : "playAsGuest")}
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
            fontFamily: 'Lexend, "Lexend Fallback", sans-serif',
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
