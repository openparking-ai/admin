import Logo from './Logo.jsx';

/**
 * The frame of every screen shown signed out: the sign-in screen, and the
 * three an emailed link or a forgotten password opens (U7d-2). The look and
 * language choosers sit at the top, the screen in one card under the mark.
 */
export default function SignedOut({ t, controls, children }) {
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
        {children}
      </main>
    </div>
  );
}
