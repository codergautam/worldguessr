import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FaApple, FaCheck, FaTimes } from 'react-icons/fa';
import Modal from '@/components/ui/Modal';
import { useTranslation } from '@/components/useTranslations';
import { HIDE_ACCOUNT_UI } from '@/components/utils/accountUi';
import sendEvent from '@/components/utils/sendEvent';
import {
  USERNAME_MIN,
  USERNAME_MAX,
  LEN_VARS,
  postJson,
  newClientId,
  deviceTz,
  usernameSyncVerdict,
  checkUsernameAvailability,
} from './loginApi';
import CodeInput from './CodeInput';

/**
 * THE LOGIN. Email first, then (new accounts only) a username, then the
 * 6-digit code. `window.login` (set in home.js) opens this, so every existing
 * sign-in prompt (navbar/onboarding AccountBtn, daily onSignIn) lands here
 * through auth.js signIn() with no call-site edits. home.js also opens it
 * directly: the locked-mode upsells (Ranked / 2v2 / a friend's 2v2 invite)
 * and the periodic home prompt for guests (first visit, then every 7 days;
 * the repeat shows pass onNeverShowAgain).
 *
 * Server: api/emailLogin.js (send), api/checkUsername.js (live availability),
 * api/emailVerify.js (redeem). The verify response is the googleAuth shape, so
 * onSuccess hands it to the same applySignIn the Google popup uses.
 *
 * Motion thesis: the code is the button. Everything else is feedback.
 * Materials: styles/login.css restates the house recipes (join-party field and
 * button, Modal.js close, party-lobby digits).
 */

const CODE_LENGTH = 6;
const EMAIL_SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STACK_PAD_BOTTOM = 8; // keep in sync with .wgLogin__stack padding-bottom (styles/login.css)

// The four-colour Google "G" (brand guideline mark), inline so it needs no asset.
function GoogleMark() {
  return (
    <svg className="wgLogin__gmark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// `title` / `subtitle` override the step-1 headline and pitch: the locked-mode
// upsells (Ranked, 2v2, a friend's 2v2 invite) pass the mode's copy; a plain
// sign-in leaves them undefined and gets "Welcome to WorldGuessr".
// `unprompted`: the modal opened on its own (the periodic home prompt), not
// from a tap. On touch devices the email field then does NOT autofocus: a
// software keyboard must never ambush a phone seconds after landing
// (Android Chrome raises it on programmatic focus). A tap-opened modal and
// every desktop keep the cursor in the field.
// `onNeverShowAgain`: set ONLY by a repeat periodic home prompt; renders the
// quiet "Don't show this again" opt-out under the email form (step 1).
export default function LoginModal({ open, onClose, onSuccess, onGoogle = null, googleBusy = false, onApple = null, appleBusy = false, title, subtitle, unprompted = false, onNeverShowAgain = null }) {
  const { t: text } = useTranslation('common');
  // Primary pointer is a finger (phones/tablets); sampled once, it never changes mid-session.
  const [coarsePointer] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  const focusEmail = !(unprompted && coarsePointer);

  const [step, setStep] = useState('email');      // 'email' | 'username' | 'code'
  const [prevStep, setPrevStep] = useState(null); // the exit ghost
  const [dir, setDir] = useState(1);              // +1 forward, -1 back

  const [email, setEmail] = useState('');
  const [loginId, setLoginId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState('idle');     // idle | checking | ok | taken | invalid | unknown (no verdict; may continue)
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle'); // idle | busy | ok | error
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);           // locale key, or a raw server sentence
  const [resendAt, setResendAt] = useState(0);
  const [, setTick] = useState(0);                // re-render driver for the countdown

  const codeRef = useRef('');                     // survives the username bounce
  const clientIdRef = useRef('');                 // this open's session nonce (newClientId)
  // Set when the server bounced us back to the username step with its verdict
  // on the name: the availability effect skips ONE run so that verdict (and
  // its sentence) stand until the player edits the name.
  const bounceRef = useRef(false);
  // The live (non-ghost) step's element. A callback ref into STATE, not a
  // useRef: ui/Modal mounts its content one tick after `open` flips (its own
  // isVisible effect), so anything keyed on `open` alone runs before the
  // element exists. State re-runs the effects below when it actually mounts.
  const [stepEl, setStepEl] = useState(null);
  const [stackH, setStackH] = useState(null);     // px; null = auto (first paint of an open)
  const lastErrRef = useRef(null);                // the error that is collapsing away (kept for its exit)
  const [closingErr, setClosingErr] = useState(null);

  // The error line grows in and collapses out on its own height, so the field
  // below slides instead of jumping. The text is kept for the collapse. A
  // LAYOUT effect on purpose: a plain effect ran after paint, so one frame
  // had no line at all and the card visibly jumped before the ghost appeared.
  // A step change drops the ghost (go() clears lastErrRef first).
  useLayoutEffect(() => {
    if (err) { lastErrRef.current = err; setClosingErr(null); return undefined; }
    const gone = lastErrRef.current;
    if (!gone) return undefined;
    lastErrRef.current = null;
    setClosingErr(gone);
    const t = setTimeout(() => setClosingErr(null), 220);
    return () => clearTimeout(t);
  }, [err]);

  // HIDE_ACCOUNT_UI builds never render a login surface. Guarded here, after
  // the hooks (never before: hook order).
  const hidden = HIDE_ACCOUNT_UI;

  const reset = useCallback(() => {
    setStep('email'); setPrevStep(null); setDir(1);
    setEmail(''); setLoginId(null); setIsNew(false);
    setUsername(''); setAvail('idle');
    setCode(''); setCodeState('idle'); setShake(0);
    setBusy(false); setErr(null); setResendAt(0);
    setStackH(null);
    lastErrRef.current = null; setClosingErr(null);
    codeRef.current = '';
    bounceRef.current = false;
    clientIdRef.current = newClientId();
  }, []);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  // The card glides between heights (step swaps, error lines coming and
  // going): height:auto cannot transition, so the live step is measured and
  // the stack gets an explicit, transitioned height (.wgLogin__stack).
  useLayoutEffect(() => {
    if (!open || !stepEl || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setStackH(stepEl.offsetHeight + STACK_PAD_BOTTOM);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stepEl);
    return () => ro.disconnect();
  }, [open, stepEl]);

  // Accidental dismissal is only possible on the first step: once a code is
  // in flight (username / code steps) the backdrop and Escape do nothing and
  // only the × closes. (ui/Modal has no key handling of its own.)
  const canDismiss = step === 'email' && !busy;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && canDismiss) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canDismiss, onClose]);

  // Resend countdown: one tick per second while it matters.
  useEffect(() => {
    if (!open || step !== 'code' || resendAt <= Date.now()) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open, step, resendAt]);

  // Live availability, debounced. The sync rules answer instantly; only names
  // that pass them cost a request.
  useEffect(() => {
    if (!open || step !== 'username') return undefined;
    if (bounceRef.current) {
      // Back from the code step with the server's verdict on this exact
      // name (taken / invalid + sentence): keep it until the name changes.
      bounceRef.current = false;
      return undefined;
    }
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
  }, [open, step, username]);

  const go = (next, direction = 1) => {
    setDir(direction);
    setPrevStep(step);
    setStep(next);
    lastErrRef.current = null; // a step change never plays the error's collapse
    setErr(null);
  };

  const sendCode = async (em) => {
    const r = await postJson('/api/emailLogin', { email: em, tz: deviceTz(), clientId: clientIdRef.current }, 'emailLogin');
    if (r.ok && r.data.loginId) {
      setLoginId(r.data.loginId);
      setResendAt(Date.now() + (r.data.resendAfter || 30) * 1000);
      setCode(''); setCodeState('idle');
      return r.data;
    }
    setErr(r.data.error || 'emailSendFailed');
    if (r.status === 429 && r.data.retryAfter) setResendAt(Date.now() + r.data.retryAfter * 1000);
    return null;
  };

  const submitEmail = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const em = email.trim().toLowerCase();
    if (!EMAIL_SYNTAX.test(em)) { setErr('invalidEmail'); return; }
    setBusy(true); setErr(null);
    const data = await sendCode(em);
    setBusy(false);
    if (!data) return;
    setEmail(em);
    setIsNew(!data.exists);
    sendEvent('login_code_sent', { new: !data.exists });
    go(data.exists ? 'code' : 'username');
  };

  const submitCode = async (c) => {
    if (busy || !loginId || c.length !== CODE_LENGTH) return;
    setBusy(true); setErr(null); setCodeState('busy');
    const r = await postJson('/api/emailVerify', {
      loginId, code: c, username: isNew ? username : undefined, tz: deviceTz(), clientId: clientIdRef.current,
    }, 'emailVerify');

    if (r.ok && r.data.secret) {
      // The focal moment: green lands, then the dialog leaves (home closes it
      // off the session effect once applySignIn publishes the session).
      setCodeState('ok');
      setTimeout(() => onSuccess?.(r.data), 450);
      return;
    }

    const key = r.data.error || 'wrongCode';
    setBusy(false);
    if (key === 'wrongCode') {
      setCodeState('error'); setShake((n) => n + 1); setErr('wrongCode');
      setTimeout(() => { setCode(''); setCodeState('idle'); }, 400);
      return;
    }
    if (key === 'codeExpired' || key === 'codeUsed') {
      setCodeState('error'); setErr(key); setResendAt(0); setCode('');
      return;
    }
    if (typeof key === 'string' && key.startsWith('username')) {
      // The code is still live (the server refused before consuming it):
      // keep it, fix the name, and it resubmits on the way back.
      codeRef.current = c;
      setCodeState('idle'); setCode('');
      bounceRef.current = true;
      setAvail(key === 'usernameTaken' ? 'taken' : 'invalid');
      go('username', -1);
      setErr(key); // AFTER go(): go() clears err, and this sentence must win the batch
      return;
    }
    // Anything else (network, server error, a refusal sentence): say it and
    // clear the digits so a fresh entry resubmits.
    setCodeState('idle'); setCode('');
    setErr(key);
  };

  const submitUsername = (e) => {
    e?.preventDefault();
    if (busy) return;
    // 'unknown' (the check could not answer) may continue: the server decides.
    if (avail !== 'ok' && avail !== 'unknown') {
      // Enter on a name that is still too short: now the rule is worth saying.
      if (username.length > 0 && username.length < USERNAME_MIN) setErr('usernameLengthError');
      return;
    }
    const remembered = codeRef.current;
    codeRef.current = '';
    go('code');
    if (remembered.length === CODE_LENGTH) {
      setCode(remembered);
      // Next tick: the code step must be mounted before it verifies.
      setTimeout(() => submitCode(remembered), 0);
    }
  };

  const resend = async () => {
    if (busy || Date.now() < resendAt) return;
    setBusy(true); setErr(null);
    await sendCode(email);
    setBusy(false);
  };

  const useDifferentEmail = () => {
    reset();
    setDir(-1);
  };

  const handleGoogle = () => {
    if (!onGoogle || googleBusy || busy) return;
    onGoogle();
  };

  const handleApple = () => {
    if (!onApple || appleBusy || busy) return;
    onApple();
  };

  if (hidden) return null;

  const resendLeft = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
  // One small red sentence above the field. It grows in and collapses out on
  // its own height (styles/login.css .wgLogin__errorSlot), so the field
  // below slides rather than jumps.
  const errorLine = err ? (
    <div className="wgLogin__errorSlot wgLogin__errorSlot--in" role="alert">
      <div className="wgLogin__error">{text(err, LEN_VARS)}</div>
    </div>
  ) : closingErr ? (
    <div className="wgLogin__errorSlot wgLogin__errorSlot--out" aria-hidden="true">
      <div className="wgLogin__error">{text(closingErr, LEN_VARS)}</div>
    </div>
  ) : null;

  const renderStep = (which, ghost) => {
    if (which === 'email') {
      return (
        <>
          <div className="wgLogin__head">
            <h2 className="wgLogin__title">{title ?? text('welcomeToWorldguessr')}</h2>
            <p className="wgLogin__lede">{subtitle ?? text('signInSubtitle')}</p>
          </div>
          {/* Providers first: for a young audience the one-click path converts
              best. The email form follows under a quiet "or". */}
          {(onGoogle || onApple) && (
            <>
              {onGoogle && (
                <button
                  type="button"
                  className="wgLogin__btn wgLogin__btn--quiet"
                  onClick={handleGoogle}
                  disabled={busy || googleBusy || ghost}
                >
                  {googleBusy ? <span className="wgLogin__spinner wgLogin__spinner--dark" aria-hidden="true" /> : <GoogleMark />}
                  <span>{text('continueWithGoogle')}</span>
                </button>
              )}
              {onApple && (
                <button
                  type="button"
                  className="wgLogin__btn wgLogin__btn--quiet"
                  onClick={handleApple}
                  disabled={busy || appleBusy || ghost}
                >
                  {appleBusy ? <span className="wgLogin__spinner wgLogin__spinner--dark" aria-hidden="true" /> : <FaApple className="wgLogin__amark" aria-hidden="true" />}
                  <span>{text('continueWithApple')}</span>
                </button>
              )}
              <div className="wgLogin__or">{text('orDivider')}</div>
            </>
          )}
          <form className="wgLogin__form" onSubmit={ghost ? (e) => e.preventDefault() : submitEmail} noValidate>
            {errorLine}
            <input
              className={`wgLogin__input${err === 'invalidEmail' || err === 'emailDomainNotAllowed' ? ' wgLogin__input--error' : ''}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={text('emailPlaceholder')}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (err) setErr(null); }}
              disabled={busy || ghost}
              autoFocus={!ghost && focusEmail}
              aria-label={text('emailPlaceholder')}
            />
            <button
              type="submit"
              className={`wgLogin__btn${busy ? ' wgLogin__btn--busy' : ''}`}
              disabled={busy || ghost || !email.trim()}
              aria-busy={busy || undefined}
            >
              <span className="wgLogin__btnLabel">{text('continue')}</span>
              {/* Sending: the label hops out and three dots bounce in its place. */}
              <span className="wgLogin__dots" aria-hidden="true"><i /><i /><i /></span>
            </button>
          </form>
          {/* Repeat periodic prompt only: a quiet opt-out that must never
              compete with Continue (muted, 13px; --quiet). */}
          {onNeverShowAgain && (
            <div className="wgLogin__links">
              <button type="button" className="wgLogin__link wgLogin__link--quiet" onClick={onNeverShowAgain} disabled={ghost}>
                {text('neverShowAgain')}
              </button>
            </div>
          )}
        </>
      );
    }

    if (which === 'username') {
      return (
        <>
          <div className="wgLogin__head">
            <h2 className="wgLogin__title">{text('pickUsernameTitle')}</h2>
            <p className="wgLogin__lede">{text('enterUsername')}</p>
          </div>
          <form className="wgLogin__form" onSubmit={ghost ? (e) => e.preventDefault() : submitUsername}>
            {errorLine}
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
                disabled={busy || ghost}
                autoFocus={!ghost}
                aria-label={text('enterUsernameBox')}
              />
              <span className={`wgLogin__avail wgLogin__avail--${avail}`} aria-hidden="true">
                {avail === 'ok' && <FaCheck />}
                {(avail === 'taken' || avail === 'invalid') && <FaTimes />}
              </span>
            </div>
            <button type="submit" className="wgLogin__btn" disabled={!(avail === 'ok' || avail === 'unknown') || busy || ghost}>
              <span>{text('continue')}</span>
            </button>
          </form>
          <div className="wgLogin__links">
            <button type="button" className="wgLogin__link" onClick={() => go('email', -1)} disabled={ghost}>
              {text('back')}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="wgLogin__head">
          <h2 className="wgLogin__title">{text(isNew ? 'codeTitleNew' : 'codeTitleReturning')}</h2>
          {/* One sentence, the address inline and bold: three stacked lines of
              copy above the cells read as clutter. */}
          <p className="wgLogin__lede">{text('codeSentTo')} <strong className="wgLogin__email">{email}</strong></p>
        </div>
        {errorLine}
        <CodeInput
          value={code}
          onChange={(v) => { setCode(v); if (codeState === 'error') setCodeState('idle'); if (err) setErr(null); }}
          onComplete={ghost ? undefined : submitCode}
          disabled={busy || ghost}
          state={codeState}
          shakeKey={shake}
          autoFocus={!ghost}
          label={text('codeTitle')}
        />
        {/* The two quiet actions on ONE row, a middle dot between them (no
            spam-folder line: the mail is DKIM/SPF-signed, and a warning under
            every code step made the whole thing look unsure of itself). */}
        <div className="wgLogin__row">
          <button type="button" className="wgLogin__link" onClick={resend} disabled={ghost || busy || resendLeft > 0}>
            {resendLeft > 0 ? text('resendIn', { s: resendLeft }) : text('resendCode')}
          </button>
          <span className="wgLogin__sep" aria-hidden="true">·</span>
          <button type="button" className="wgLogin__link" onClick={useDifferentEmail} disabled={ghost || busy}>
            {text('useDifferentEmail')}
          </button>
        </div>
      </>
    );
  };

  return (
    <Modal isOpen={open} onClose={onClose} borderless disableBackdropClose={!canDismiss}>
      <div className="wgLogin">
        {/* The username step is the lock-in: no close at all there. Back is the
            only way out (it returns to the email step, which has the X). The
            button fades rather than unmounts so nothing shifts. */}
        <button type="button" className={`wgLogin__close${step === 'username' ? ' wgLogin__close--hidden' : ''}`} onClick={onClose} aria-label={text('closeSignInOptions')}>
          {/* Icon, not a text × : a button does not inherit the page font, so the
              glyph came from the UA button face and sat off-centre. Same FaTimes
              as the username field cross. */}
          <FaTimes aria-hidden="true" />
        </button>
        <div className="wgLogin__stack" style={{ '--wgDir': dir, height: stackH == null ? 'auto' : `${stackH}px` }}>
          {prevStep && (
            <div
              key={`out-${prevStep}`}
              className="wgLogin__step wgLogin__step--out"
              aria-hidden="true"
              onAnimationEnd={() => setPrevStep(null)}
            >
              {renderStep(prevStep, true)}
            </div>
          )}
          <div key={step} ref={setStepEl} className="wgLogin__step">
            {renderStep(step, false)}
          </div>
        </div>
      </div>
    </Modal>
  );
}
