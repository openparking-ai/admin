import { useRef, useState } from 'react';
import { STALE } from './api.js';
import SignedOut from './SignedOut.jsx';
import FieldName from './FieldName.jsx';
import { ProblemNote } from './parts.jsx';

/** Something that could be an email address: something, one @, something. The platform reads the rest. */
const looksLikeEmail = (typed) => /^[^\s@]+@[^\s@]+$/.test(typed);

/**
 * Forgot your password? (U7d-2), from the sign-in screen: the email, then
 * one plain sentence -- the same whatever email was typed, as the platform's
 * answer is the same whoever it names, so this screen never says whether an
 * account exists. A refusal on the way (too many tries, the platform not
 * reached) is said as itself, so nobody waits for an email that was never
 * asked for.
 */
export default function ForgotScreen({ t, client, controls, onSignIn }) {
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [working, setWorking] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState(null);
  const sending = useRef(false);

  const typed = email.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (sending.current) return;
    setTried(true);
    if (!looksLikeEmail(typed)) return;
    sending.current = true;
    setWorking(true);
    setProblem(null);
    try {
      await client.forgot(typed);
      setSent(true);
    } catch (caught) {
      if (caught?.kind !== STALE) setProblem(caught?.kind ?? 'unexpected');
    } finally {
      sending.current = false;
      setWorking(false);
    }
  };

  return (
    <SignedOut t={t} controls={controls}>
      <h1 className="page-title">{t('forgot.title')}</h1>
      {sent ? (
        <>
          <p className="signin-said" role="status" data-notice="forgot-sent">
            {t('forgot.sent')}
          </p>
          <p className="signin-more">
            <button type="button" className="primary-button" data-action="back-to-sign-in" onClick={onSignIn}>
              {t('links.backToSignIn')}
            </button>
          </p>
        </>
      ) : (
        <>
          <p className="page-purpose">{t('forgot.intro')}</p>
          <form className="signin-form" method="post" data-form="forgot" onSubmit={submit} noValidate>
            <label className="field">
              <FieldName t={t} name="forgot.email" />
              <input type="email" name="email" data-field="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {tried && !looksLikeEmail(typed) ? (
              <p className="warning" data-notice="need-email">
                {t('forgot.needEmail')}
              </p>
            ) : null}
            <button type="submit" className="primary-button" data-action="send-link" disabled={working}>
              {working ? t('forgot.working') : t('forgot.submit')}
            </button>
          </form>
          {problem ? <ProblemNote t={t} kind={problem} /> : null}
          <p className="signin-more">
            <button type="button" className="link-button" data-action="back-to-sign-in" onClick={onSignIn}>
              {t('links.backToSignIn')}
            </button>
          </p>
        </>
      )}
    </SignedOut>
  );
}
