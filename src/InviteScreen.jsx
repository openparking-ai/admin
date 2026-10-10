import { useEffect, useRef, useState } from 'react';
import { STALE } from './api.js';
import { couldBeToken, passwordProblems } from './links.js';
import SignedOut from './SignedOut.jsx';
import NewPassword from './NewPassword.jsx';
import FieldName from './FieldName.jsx';
import { ProblemNote, Segmented } from './parts.jsx';

/** A refusal of accepting, as the invite it says the link now is (`invite.<status>`). */
const STATUS_OF = {
  inviteUsed: 'used',
  inviteExpired: 'expired',
  inviteReplaced: 'replaced',
  inviteInvalid: 'invalid',
  inviteTaken: 'taken',
  inviteEmailTaken: 'emailTaken',
};
/** The statuses whose one thing to do is to sign in: the account is there already. */
const SIGN_IN_INSTEAD = ['used', 'taken', 'emailTaken'];

/**
 * Accept your invite (U7d-2), at `#invite=<token>`. The platform says what
 * the link is now, in one plain sentence here: ready, used, expired,
 * replaced or invalid. Ready, it shows the email the invite was sent to
 * (read only), a new password typed twice and the language, the invite's
 * own to start with; the account is made, the owner signed in, and the
 * Garages page opened. Any other status is its sentence and the one thing
 * to do, and no form.
 *
 * The token came from the address and was taken out of it before the page
 * was drawn (src/links.js); it is sent only in a POST body.
 *
 * Opened while an owner is signed in, its way out says where it goes: Home.
 */
export default function InviteScreen({ t, client, token, language, signedIn, onLanguage, controls, onSignedIn, onLeave }) {
  // { step: 'reading' } | { step: 'ready', email } | { step: 'status', status } | { step: 'problem', kind }
  const [state, setState] = useState(() => (couldBeToken(token) ? { step: 'reading' } : { step: 'status', status: 'invalid' }));
  const [chosen, setChosen] = useState(language);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [tried, setTried] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState(null);
  const sending = useRef(false);
  const firstRef = useRef(null);

  const read = () => {
    let live = true;
    setState({ step: 'reading' });
    client.inviteStatus(token).then(
      (found) => {
        if (!live) return;
        if (found.status !== 'ready') return setState({ step: 'status', status: found.status });
        setChosen(found.language);
        onLanguage(found.language);
        setState({ step: 'ready', email: found.email });
      },
      (p) => live && p?.kind !== STALE && setState({ step: 'problem', kind: p?.kind ?? 'unexpected' }),
    );
    return () => {
      live = false;
    };
  };
  // Read once, for this link (the screen is drawn anew for another). The
  // language is the invite's until the owner picks.
  useEffect(() => (couldBeToken(token) ? read() : undefined), []);

  const pick = (next) => {
    setChosen(next);
    onLanguage(next);
  };

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
      const who = await client.acceptInvite(token, typed, chosen);
      onSignedIn(who);
    } catch (caught) {
      const status = STATUS_OF[caught?.kind];
      if (status) setState({ step: 'status', status });
      else if (caught?.kind !== STALE) setProblem(caught?.kind ?? 'unexpected');
      firstRef.current?.focus();
    } finally {
      sending.current = false;
      setWorking(false);
    }
  };

  let body;
  if (state.step === 'reading') {
    body = (
      <p className="quiet" data-notice="invite-reading">
        {t('invite.reading')}
      </p>
    );
  } else if (state.step === 'problem') {
    body = <ProblemNote t={t} kind={state.kind} onRetry={read} />;
  } else if (state.step === 'status') {
    const signIn = SIGN_IN_INSTEAD.includes(state.status);
    body = (
      <div className="link-status" data-status={state.status}>
        <p className="signin-problem" role="alert" data-notice={`invite-${state.status}`}>
          {t(`invite.${state.status}`)}
        </p>
        <p className="link-do" data-do={state.status}>
          {t(`invite.${state.status}.do`)}
        </p>
        {signIn ? (
          <button type="button" className="primary-button" data-action={signedIn ? 'go-home' : 'go-sign-in'} onClick={onLeave}>
            {signedIn ? t('links.backHome') : t('links.signIn')}
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <>
        <p className="page-purpose">{t('invite.intro')}</p>
        <form className="signin-form" method="post" data-form="accept-invite" onSubmit={submit} noValidate>
          <label className="field">
            <FieldName t={t} name="invite.email" />
            <input type="email" name="email" data-field="email" autoComplete="username" readOnly value={state.email} />
          </label>
          <div className="chooser" data-chooser="account-language">
            <FieldName t={t} name="invite.language" />
            <Segmented
              label={t('invite.language')}
              value={chosen}
              options={['en', 'es'].map((l) => ({ value: l, text: t(`language.${l}`) }))}
              onChange={pick}
              name="account-language"
            />
          </div>
          <NewPassword t={t} first={first} second={second} onFirst={setFirst} onSecond={setSecond} problems={problems} firstRef={firstRef} />
          <button type="submit" className="primary-button" data-action="accept-invite" disabled={working}>
            {working ? t('invite.working') : t('invite.submit')}
          </button>
        </form>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </>
    );
  }

  return (
    <SignedOut t={t} controls={controls}>
      <h1 className="page-title">{t('invite.title')}</h1>
      {body}
      {state.step === 'status' && SIGN_IN_INSTEAD.includes(state.status) ? null : (
        <p className="signin-more">
          <button type="button" className="link-button" data-action={signedIn ? 'back-home' : 'back-to-sign-in'} onClick={onLeave}>
            {signedIn ? t('links.backHome') : t('links.backToSignIn')}
          </button>
        </p>
      )}
    </SignedOut>
  );
}
