import { useRef, useState } from 'react';
import { STALE } from './api.js';
import { couldBeToken, passwordProblems } from './links.js';
import SignedOut from './SignedOut.jsx';
import NewPassword from './NewPassword.jsx';
import { ProblemNote, WithEmails } from './parts.jsx';

/** A link that is not ready, as the platform refuses it (`reset.<status>`). */
const STATUS_OF = { resetUsed: 'used', resetExpired: 'expired', resetReplaced: 'replaced', resetInvalid: 'invalid' };

/**
 * Choose a new password (U7d-2), at `#reset=<token>`: the new password typed
 * twice. Changed, the owner is taken to the sign-in screen, which says the
 * password is changed and to sign in with it: a reset signs nobody in, and
 * signs the account out everywhere. A link used, ended, replaced or not one
 * says so plainly, and offers "Forgot your password?" again.
 *
 * The token came from the address and was taken out of it before the page
 * was drawn (src/links.js); it is sent only in a POST body.
 *
 * Opened while an owner is signed in (`signedInAs`, their email), every way
 * out says where it goes: Home, as Forgot is not shown to someone signed in.
 * The platform ends the sessions of the link's account only (platform
 * 130d38d, completeReset): the owner's own, and they are signed out, as
 * above; another's, and they are still signed in, which this screen says.
 */
export default function ResetScreen({ t, client, token, controls, signedInAs, onChanged, onForgot, onLeave }) {
  const [status, setStatus] = useState(() => (couldBeToken(token) ? null : 'invalid'));
  // Another account's password changed while this owner is signed in: its email.
  const [changedFor, setChangedFor] = useState(null);
  const signedIn = Boolean(signedInAs);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [tried, setTried] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState(null);
  const sending = useRef(false);
  const firstRef = useRef(null);

  const problems = tried ? passwordProblems(first, second) : [];
  const submit = async (e) => {
    e.preventDefault();
    if (sending.current) return;
    setTried(true);
    if (passwordProblems(first, second).length) return;
    sending.current = true;
    setWorking(true);
    setProblem(null);
    const typed = first;
    setFirst('');
    setSecond('');
    setTried(false);
    try {
      const done = await client.resetPassword(token, typed);
      const own = !signedIn || String(done?.email).toLowerCase() === signedInAs.toLowerCase();
      if (own) onChanged();
      else setChangedFor(done.email);
    } catch (caught) {
      const said = STATUS_OF[caught?.kind];
      if (said) setStatus(said);
      else if (caught?.kind !== STALE) setProblem(caught?.kind ?? 'unexpected');
      firstRef.current?.focus();
    } finally {
      sending.current = false;
      setWorking(false);
    }
  };

  const backHome = (
    <button type="button" className="primary-button" data-action="go-home" onClick={onLeave}>
      {t('links.backHome')}
    </button>
  );
  let body;
  if (changedFor) {
    body = (
      <div className="link-status" data-status="changed-other">
        <p className="signin-said" role="status" data-notice="reset-changed-other">
          <WithEmails sentence={t('reset.changedOther', { email: changedFor, you: signedInAs })} addresses={[changedFor, signedInAs]} />
        </p>
        {backHome}
      </div>
    );
  } else if (status) {
    body = (
      <div className="link-status" data-status={status}>
        <p className="signin-problem" role="alert" data-notice={`reset-${status}`}>
          {t(`reset.${status}`)}
        </p>
        <p className="link-do" data-do={status}>
          {t(signedIn ? 'reset.askAgain.signedIn' : 'reset.askAgain')}
        </p>
        {signedIn ? (
          backHome
        ) : (
          <button type="button" className="primary-button" data-action="forgot" onClick={onForgot}>
            {t('signIn.forgot')}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <p className="page-purpose">{t(signedIn ? 'reset.intro.signedIn' : 'reset.intro')}</p>
        <form className="signin-form" method="post" data-form="reset" onSubmit={submit} noValidate>
          <NewPassword t={t} first={first} second={second} onFirst={setFirst} onSecond={setSecond} problems={problems} firstRef={firstRef} />
          <button type="submit" className="primary-button" data-action="change-password" disabled={working}>
            {working ? t('reset.working') : t('reset.submit')}
          </button>
        </form>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </>
    );
  }

  return (
    <SignedOut t={t} controls={controls}>
      <h1 className="page-title">{t('reset.title')}</h1>
      {body}
      {/* Signed in, a screen with its own button to Home needs no second one. */}
      {signedIn && (changedFor || status) ? null : (
        <p className="signin-more">
          <button type="button" className="link-button" data-action={signedIn ? 'back-home' : 'back-to-sign-in'} onClick={onLeave}>
            {signedIn ? t('links.backHome') : t('links.backToSignIn')}
          </button>
        </p>
      )}
    </SignedOut>
  );
}
