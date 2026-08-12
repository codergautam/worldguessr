import { signIn } from "@/components/auth/auth";
import { FaGoogle } from "react-icons/fa";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "../utils/sendEvent";
import CountryFlag from '../utils/countryFlag';
import { nameGlowProps, GlowName } from '../utils/usernameWithFlag';

/**
 * THE SIGN-IN BUTTON.
 *
 * On the home screen this is now the SIGNED-OUT branch only: once you have a
 * session, the top-right corner is components/ui/playerCard.js, which carries
 * the username, the flag, the glow, the rating, the tier and the balance in one
 * card. This component's signed-in branch is still live on the onboarding
 * screen, which has no card — it renders there with navbarMode={true}.
 *
 * It has no fixed coordinates any more. Both of its render sites lay it out:
 * the .hudCorner column on home, .onboardingTopRightBtns on onboarding.
 *
 * NO STAMPS BALANCE HERE, and none is coming back. It carried one when the shop
 * was a tab inside the account modal and this was the only chrome that could
 * advertise the currency. Two live copies of the same number a few pixels apart
 * is noise.
 */
export default function AccountBtn({ session, openAccountModal, navbarMode, inCrazyGames, inGameDistribution, loginQueued, setLoginQueued }) {
  const { t: text } = useTranslation("common");
  const hasGoogleClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  // Use countryCode from session (now included in googleAuth response)
  const countryCode = session?.token?.countryCode || null;
  // THE FIRST PLACE A BUYER LOOKS, and it was the last place to get a glow.
  // Everything else that renders this sku reads it off a multiplayer roster; up
  // here there is no roster, so it comes straight off the session — which
  // useStampShop already patches in place on equip (applyEntitlements), so the
  // halo appears under the cursor rather than on the next reload. Dark pill →
  // the dark variant.
  const glow = nameGlowProps(session?.token?.cosmetics?.equipped?.nameGlow);


  if((inCrazyGames || inGameDistribution) && (!session || !session?.token?.secret)) {
    return null;
  }

  return (
    <>
    {!session || !session?.token?.secret ? (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn'}`} disabled={inCrazyGames || loginQueued} onClick={() => {
          if(session === null && !loginQueued) {
            if (hasGoogleClientId) {
              setLoginQueued?.(true);
            }
            sendEvent("login_attempt")
            signIn('google')
          }
          }}>

        { loginQueued ? (
          <div style={{ marginRight: '10px', marginLeft: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {text("login")}&nbsp;&nbsp;
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTop: '2px solid white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        ) : !session?.token?.secret && session !== null ? '...' :
        (
          // <div style="margin-right: 10px; margin-left: 10px; display: flex; align-items: center; justify-content: center;">
          <div style={{marginRight: '10px',marginLeft: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>

            {!inCrazyGames ? (
              <>
            <FaGoogle className="home__squarebtnicon" />
            &nbsp;&nbsp;
            {text("login")}
            </>
            ): (
              <>
            ...
            </>
            )}
          </div>
        )}
        </button>
    ) : (
        <button className={`gameBtn ${navbarMode ? 'navBtn' : 'accountBtn loggedIn'}`} onClick={() => {
        openAccountModal()
        }}>
          {session?.token?.username ? (
            <p style={{ color:'white', paddingRight: '-13px',marginLeft: '0px', fontSize: "1.4em", fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Wrapped ONLY when a glow resolves, and even then the wrapper is
                  boxless — a purchase must not add a flex item, a 6px gap or a
                  pixel of width to the pill it sits in. */}
              <GlowName glow={glow}>{session?.token?.username}</GlowName>
              {countryCode && <CountryFlag countryCode={countryCode} style={{ fontSize: '1em' }} marginRight="0px" />}
            </p>
          ) : null}

        </button>
    )}
    </>
  )
}
