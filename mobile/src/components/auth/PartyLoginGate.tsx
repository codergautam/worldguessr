import { useEffect, useRef, useState } from 'react';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { useAuthStore } from '../../store/authStore';
import { t } from '../../shared/locale';
import AccountSelectSheet from './AccountSelectSheet';

/**
 * Root-mounted login gate for guest party joins (web home.js openLoginUpsell
 * parity). When a guest's join bounces off the server's 2v2 login gate, the
 * multiplayer store parks the code in `pendingLoginJoin` and this raises the
 * standard AccountSelectSheet over whatever screen the guest is on — a
 * deep-link join has no screen of its own, which is why the mount lives in
 * _layout and not on a route. Copy reuses the exact home-screen upsell keys;
 * an inviter name (server's additive hostName) personalizes the pitch.
 *
 * Completing sign-in closes the sheet by itself; the auth secret change
 * reconnects the socket, and the store's verify-ack handler consumes the park
 * and auto-joins — this component never joins anything. Closing WITHOUT
 * signing in abandons the park (web: closeLoginModal clears joinAfterLoginRef)
 * so no surprise join fires on a later reconnect.
 */
export default function PartyLoginGate() {
  const pending = useMultiplayerStore((s) => s.pendingLoginJoin);
  const [visible, setVisible] = useState(false);
  // Copy latched at open so it can't flash to the generic line when the park
  // is consumed while the sheet is still dismissing.
  const copyRef = useRef<{ title: string; subtitle: string } | null>(null);
  const hadPending = useRef(false);

  // Rising edge only, and only for guests: the quiet unnamed-signup re-park
  // also rewrites the field, and the user is authenticated by then — the
  // forced SetUsernameModal owns that moment, not this sheet.
  useEffect(() => {
    if (pending && !hadPending.current && !useAuthStore.getState().isAuthenticated) {
      copyRef.current = {
        title: t('signInToPlay2v2'),
        subtitle: pending.hostName
          ? t('linkGoogle2v2InvitedDesc', { name: pending.hostName })
          : t('linkGoogle2v2Desc'),
      };
      setVisible(true);
    }
    hadPending.current = !!pending;
  }, [pending]);

  const handleClose = () => {
    setVisible(false);
    // Read the STORE, not a render closure: the sheet fires the onClose it
    // captured at press time (email success closes via setTimeout), so a
    // render-time isAuthenticated can be stale (onboarding/play.tsx lesson).
    if (!useAuthStore.getState().isAuthenticated) {
      useMultiplayerStore.getState().clearPendingLoginJoin();
    }
  };

  return (
    <AccountSelectSheet
      visible={visible}
      onClose={handleClose}
      title={copyRef.current?.title}
      subtitle={copyRef.current?.subtitle}
    />
  );
}
