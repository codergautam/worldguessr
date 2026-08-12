import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useTranslation } from '@/components/useTranslations';
import useStampShop from './useStampShop';
import ShopView from './ShopView';

/* ===========================================================================
 *  THE SHOP, AS ITS OWN SURFACE.
 *
 *  It used to be a tab inside the account modal, sharing that modal's scroller,
 *  its header and its nav bar. It is not an account setting — it is a store, it
 *  is the destination of a button on the home screen, and it now owns its own
 *  card. accountModal.js keeps its wallet chip and nothing else of the shop.
 *
 *  ONE SCROLLER, AND IT IS NOT OURS. components/ui/Modal's .modal-content is
 *  already `overflow-y: auto`, so this file introduces NO scroll container of
 *  its own and neither does ShopView. That is the modal-scroll rule in this
 *  repo: a second nested overflow:auto inside a modal goes dead on iOS outright
 *  (see project_g2_modal_ios_scroll), which is also why react-responsive-modal
 *  is run with blockScroll={false} everywhere it is used. Owning the scroller
 *  directly is what let the `:has()` sticky workaround in styles/shop.css be
 *  deleted: .shop is a direct child of the real scrolling box, so the rail
 *  inside it sticks with no help.
 *
 *  MOUNTED ONLY WHILE OPEN. home.js renders this behind `{shopModalOpen && …}`
 *  and next/dynamic({ ssr:false }), so the chunk is not on the critical path
 *  and — the part that matters — every effect this subtree owns is torn down on
 *  close. useStampShop runs the ad-free countdown on a single setInterval; a
 *  modal that stayed mounted after close would leave that interval ticking and
 *  re-rendering for the rest of the session.
 *
 *  THE EXIT ANIMATION IS WHY THIS IS TWO STATES AND NOT ONE. ui/Modal plays a
 *  200ms slide-out when its `isOpen` goes false, and it can only play that
 *  while it is still mounted. So the close is: flip our own `open` flag (the
 *  card animates away), then tell home to unmount us once the animation has
 *  finished. The teardown still happens, just one beat later.
 * ======================================================================== */

/** ui/Modal's close animation is 200ms; one frame of slack on top of it. */
const EXIT_MS = 220;

export default function ShopModal({ session, setSession, onClose, onReady, coveredEntry = false }) {
  const { t: text, lang } = useTranslation('common');

  // ONE instance of the shop's data layer for the life of this modal: one
  // catalogue fetch per open, one entitlement patch path, one countdown.
  const shop = useStampShop({ session, setSession });

  // CSS animations begin when their node is inserted, so the modal can mount
  // open and animate immediately. Starting false added two empty React passes
  // before the storefront painted, which exposed the home screen during the
  // profile-to-shop handoff.
  const [open, setOpen] = useState(true);

  // Latest onClose without putting it in a dep array — home hands us a fresh
  // arrow on every one of its (many) renders and this must not re-arm.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // A raw import promise resolving does not guarantee that Next's dynamic
  // wrapper has committed the imported component yet. Notify home from a
  // layout effect so the profile remains the last complete frame until the
  // shop backdrop and surface physically exist in the DOM.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const readyNotifiedRef = useRef(false);
  useLayoutEffect(() => {
    if (!shop.enabled || readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    if (onReadyRef.current) onReadyRef.current();
  }, [shop.enabled]);

  const exitTimerRef = useRef(null);
  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  const requestClose = useCallback(() => {
    // One exit only. The backdrop, the X and Escape can all land in the same
    // gesture, and a second timer would call onClose into an unmounted parent.
    if (exitTimerRef.current) return;
    setOpen(false);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      if (onCloseRef.current) onCloseRef.current();
    }, EXIT_MS);
  }, []);

  // FAIL CLOSED, third layer. The home button is gated on the same flag, so
  // this is only reachable when the kill switch is thrown between the click and
  // the catalogue response coming back { enabled: false }. Render nothing, and
  // hand the mount back to home rather than leaving a dead open flag behind.
  useEffect(() => {
    if (!shop.enabled) requestClose();
  }, [shop.enabled, requestClose]);

  if (!shop.enabled) return null;

  return (
    <Modal
      isOpen={open}
      onClose={requestClose}
      variant="shopFullscreen"
      coveredEntry={coveredEntry}
    >
      <ShopView
        shop={shop}
        username={session?.token?.username}
        title={text('shopShortTitle')}
        closeLabel={text('close')}
        onClose={requestClose}
        text={text}
        lang={lang}
      />
    </Modal>
  );
}
