import { useRef, useState } from 'react';
import { problemKey } from './api.js';
import Logo from './Logo.jsx';
import FieldName from './FieldName.jsx';

/**
 * Email and password. The password lives in this form only while it is being
 * typed: it is cleared after every attempt, whatever the answer, and is never
 * put in the address, in browser storage or in a log.
 */
export default function SignIn({ t, client, notice, controls, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState(null);
  const [working, setWorking] = useState(false);
  const passwordRef = useRef(null);

  // What to say: this form's own answer first, else why the owner is here.
  const shown = problem ?? (notice ? { kind: notice } : null);

  const submit = async (e) => {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    setProblem(null);
    const typed = password;
    setPassword('');
    try {
      const who = await client.signIn(email.trim(), typed);
      onSignedIn(who);
    } catch (caught) {
      setProblem({ kind: caught?.kind });
      passwordRef.current?.focus();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="signin-page">
      <header className="signin-top">{controls}</header>
      <main className="signin-card">
        <div className="brand signin-brand">
          <span className="brand-mark">
            <Logo label={t('app.name')} />
          </span>
          <span className="brand-text">
            <span className="brand-name">
              {t('app.wordmark')}
              <i>{t('app.wordmarkEnd')}</i>
            </span>
            <span className="brand-tagline">{t('app.tagline')}</span>
          </span>
        </div>
        <h1 className="page-title">{t('signIn.title')}</h1>
        <p className="page-purpose">{t('signIn.intro')}</p>
        {shown ? (
          <p className="signin-problem" role="alert" data-problem={shown.kind}>
            {t(problemKey(shown))}
          </p>
        ) : null}
        <form className="signin-form" method="post" onSubmit={submit} noValidate>
          <label className="field">
            <FieldName t={t} name="signIn.email" />
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <FieldName t={t} name="signIn.password" />
            <input
              ref={passwordRef}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="primary-button" disabled={working}>
            {working ? t('signIn.working') : t('signIn.submit')}
          </button>
        </form>
      </main>
    </div>
  );
}
