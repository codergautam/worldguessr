import { useEffect, useState } from 'react';
import { Modal } from 'react-responsive-modal';
import { FaCheck, FaTimes } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import sendEvent from './utils/sendEvent';
import { USERNAME_MAX, LEN_VARS, postJson, usernameSyncVerdict, checkUsernameAvailability } from './auth/loginApi';

/**
 * The first username after a Google / Apple sign-in. (The email + code flow
 * collects its name BEFORE the account exists, so it never shows this.)
 * Forced: no close, no backdrop or Escape dismissal, and the page reloads once
 * the name is saved (api/setName.js). Rendered by home.js whenever the session
 * has a secret and no username.
 *
 * The SAME surface and the SAME live availability check as the username step
 * of components/auth/LoginModal.js: styles/login.css recipes under .wgLogin,
 * verdicts from components/auth/loginApi.js. Two places a player names
 * themselves, one look, one set of rules.
 *
 * Stays on react-responsive-modal (not ui/Modal) for its z-index alone: it
 * must sit above the Daily results backdrop (z 10000, styles/daily.scss), or
 * the first-time prompt is trapped behind an open results modal.
 */
// The shell paints NOTHING and sizes to its content. globals.scss:7998 forces
// `.react-responsive-modal-modal { max-width: none !important }`, which beats
// any inline max-width here — putting a width on the shell stretched the card
// to the full viewport. The card owns its own width (.wgLogin--card).
const SHELL = {
  root: { zIndex: 20000 },
  overlay: { background: 'rgba(0, 0, 0, 0.62)', overflow: 'hidden' },
  modal: { background: 'transparent', padding: 0, margin: 0, boxShadow: 'none', width: 'auto', overflow: 'visible' },
  closeButton: { display: 'none' },
};

export default function SetUsernameModal({ shown, session }) {
  const { t: text } = useTranslation('common');
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState('idle'); // idle | checking | ok | taken | invalid | unknown (no verdict; may continue)
  const [err, setErr] = useState(null);       // locale key, or a raw server sentence
  const [busy, setBusy] = useState(false);

  // Live availability, debounced. The sync rules answer at once; only names
  // that pass them cost a request (same wiring as LoginModal's username step).
  useEffect(() => {
    if (!shown) return undefined;
    const name = username;
    const sync = usernameSyncVerdict(name);
    if (sync) { setAvail(sync.avail); setErr(sync.key); return undefined; }
    setAvail('checking'); setErr(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      const verdict = await checkUsernameAvailability(name);
      if (cancelled) return;
      setAvail(verdict.avail); setErr(verdict.key);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [shown, username]);

  // 'unknown' (the check could not answer) may continue: the server decides.
  const canSubmit = (avail === 'ok' || avail === 'unknown') && !busy;

  const save = async (e) => {
    e?.preventDefault();
    // window.settingName: the same latch components/accountView.js honours, so
    // two surfaces can never race a name set.
    if (!canSubmit || window.settingName) return;
    setBusy(true); setErr(null);
    window.settingName = true;
    const r = await postJson('/api/setName', { username, token: session.token.secret }, 'setName');
    if (r.ok) {
      sendEvent('sign_up');
      // Stay busy: the page is leaving. The reload is what re-verifies the
      // session (and the websocket) with the name in place.
      setTimeout(() => window.location.reload(), 200);
      return;
    }
    window.settingName = false;
    setBusy(false);
    // api/setName.js answers with a sentence (`message`), not a key: shown
    // as-is. A dead network comes back as the errorNetworkRequest key.
    setErr(r.status === 0 ? 'errorNetworkRequest' : (r.data.message || 'errorNetworkRequest'));
  };

  return (
    <Modal
      id="setUsernameModal"
      styles={SHELL}
      open={shown}
      center
      onClose={() => {}}
      closeOnOverlayClick={false}
      closeOnEsc={false}
      showCloseIcon={false}
      animationDuration={200}
    >
      <div className="wgLogin wgLogin--card wgLogin--noClose">
        <div className="wgLogin__head">
          <h2 className="wgLogin__title">{text('welcomeToWorldguessr')}</h2>
          <p className="wgLogin__lede">{text('enterUsername')}</p>
        </div>
        <form className="wgLogin__form" onSubmit={save}>
          {err && (
            <div className="wgLogin__errorSlot wgLogin__errorSlot--in" role="alert">
              <div className="wgLogin__error">{text(err, LEN_VARS)}</div>
            </div>
          )}
          <div className="wgLogin__field">
            <input
              className={`wgLogin__input${avail === 'taken' || avail === 'invalid' ? ' wgLogin__input--error' : ''}`}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={USERNAME_MAX}
              placeholder={text('enterUsernameBox')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              autoFocus
              aria-label={text('enterUsernameBox')}
            />
            <span className={`wgLogin__avail wgLogin__avail--${avail}`} aria-hidden="true">
              {avail === 'ok' && <FaCheck />}
              {(avail === 'taken' || avail === 'invalid') && <FaTimes />}
            </span>
          </div>
          <button
            type="submit"
            className={`wgLogin__btn${busy ? ' wgLogin__btn--busy' : ''}`}
            disabled={!canSubmit}
            aria-busy={busy || undefined}
          >
            <span className="wgLogin__btnLabel">{text('continue')}</span>
            <span className="wgLogin__dots" aria-hidden="true"><i /><i /><i /></span>
          </button>
        </form>
      </div>
    </Modal>
  );
}
