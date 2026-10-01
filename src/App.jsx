import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { PAGES, hashFor, pageForHash } from './pages.js';
import { readLanguage, saveLanguage, translate } from './i18n/index.js';
import { THEME_CHOICES } from './theme.js';
import { EMPTY_OWNER, ownerReducer } from './owner.js';
import { STALE } from './api.js';
import QuickFind from './QuickFind.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import SignIn from './SignIn.jsx';
import { GaragePicker, ProblemNote } from './parts.jsx';
import Home from './Home.jsx';
import LanesPage from './LanesPage.jsx';
import InsidePage from './InsidePage.jsx';

const PAGE_BODIES = { home: Home, lanes: LanesPage, inside: InsidePage };

function useHashPage() {
  const [page, setPage] = useState(() => pageForHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setPage(pageForHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return page;
}

export default function App({ theme, storage, client }) {
  const page = useHashPage();
  const [language, setLanguage] = useState(() => readLanguage(storage, navigator.languages));
  const [themeChoice, setThemeChoice] = useState(theme.choice);
  const [owner, dispatch] = useReducer(ownerReducer, EMPTY_OWNER);

  const t = useCallback((key, values) => translate(language, key, values), [language]);

  const chooseLanguage = useCallback(
    (next) => {
      saveLanguage(storage, next);
      setLanguage(next);
    },
    [storage],
  );
  const chooseTheme = useCallback(
    (next) => {
      theme.choose(next);
      setThemeChoice(theme.choice);
    },
    [theme],
  );

  // Any 401, from any request, lets go of everything held about this owner.
  useEffect(() => client.listen((notice) => dispatch({ type: 'drop', notice })), [client]);

  useEffect(() => {
    let live = true;
    client.me().then(
      (who) => live && who && dispatch({ type: 'signedIn', who }),
      (problem) => live && problem.kind !== STALE && dispatch({ type: 'drop', notice: problem.kind }),
    );
    return () => {
      live = false;
    };
  }, [client]);

  const loadGarages = useCallback(() => {
    client.garages().then(
      (garages) => dispatch({ type: 'garages', garages }),
      (problem) => problem.kind !== STALE && problem.kind !== 'ended' && dispatch({ type: 'garagesProblem', kind: problem.kind }),
    );
  }, [client]);

  useEffect(() => {
    if (owner.status === 'signedIn') loadGarages();
  }, [owner.status, owner.epoch, loadGarages]);

  const signedIn = owner.status === 'signedIn';
  const garage = owner.garages?.find((g) => g.id === owner.garageId) ?? null;

  useEffect(() => {
    document.documentElement.lang = language;
    const title = signedIn ? t(`page.${page.id}.title`) : t('signIn.title');
    document.title = `${title} · ${t('app.name')}`;
  }, [language, page, t, signedIn]);

  const actions = useMemo(
    () => ({
      go: (target) => {
        window.location.hash = hashFor(target);
      },
      theme: chooseTheme,
      language: chooseLanguage,
    }),
    [chooseTheme, chooseLanguage],
  );

  const controls = (
    <div className="topbar-controls">
      <Segmented
        label={t('language.label')}
        value={language}
        options={['en', 'es'].map((l) => ({ value: l, text: t(`language.${l}`) }))}
        onChange={chooseLanguage}
        name="language"
      />
      <Segmented
        label={t('theme.label')}
        value={themeChoice}
        options={THEME_CHOICES.map((c) => ({
          value: c,
          text: t(`theme.${c}`),
          icon: c,
          hint: c === 'auto' ? t('theme.autoHint') : undefined,
        }))}
        onChange={chooseTheme}
        name="theme"
      />
    </div>
  );

  if (owner.status === 'checking') return <div className="checking" aria-busy="true" />;
  if (!signedIn) {
    return (
      <SignIn
        t={t}
        client={client}
        notice={owner.notice}
        controls={controls}
        onSignedIn={(who) => dispatch({ type: 'signedIn', who })}
      />
    );
  }

  const Body = PAGE_BODIES[page.id];
  let content;
  if (owner.garagesProblem) {
    content = <ProblemNote t={t} kind={owner.garagesProblem} onRetry={loadGarages} />;
  } else if (!owner.garages) {
    content = <p className="quiet">{t('loading')}</p>;
  } else if (owner.garages.length === 0) {
    content = <p className="quiet">{t('garage.none')}</p>;
  } else if (!garage) {
    content = <GaragePicker t={t} garages={owner.garages} onChoose={(garageId) => dispatch({ type: 'choose', garageId })} />;
  } else if (Body) {
    content = <Body key={garage.id} t={t} language={language} client={client} garage={garage} />;
  }

  return (
    <div className="shell" key={owner.epoch}>
      <aside className="sidebar">
        <div className="brand">
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
        <nav aria-label={t('nav.label')}>
          <ul className="nav">
            {PAGES.map((p) => (
              <li key={p.id}>
                <a
                  className="nav-item"
                  href={hashFor(p)}
                  aria-current={p.id === page.id ? 'page' : undefined}
                >
                  <Icon name={p.icon} />
                  <span>{t(`page.${p.id}.title`)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <QuickFind language={language} t={t} actions={actions} />
          <div className="topbar-owner">
            {garage ? (
              <span className="garage-current" data-garage={garage.id}>
                <Icon name="garage" />
                <span>{garage.name}</span>
              </span>
            ) : null}
            {garage && owner.garages.length > 1 ? (
              <button type="button" className="link-button" data-action="change-garage" onClick={() => dispatch({ type: 'choose', garageId: null })}>
                {t('garage.change')}
              </button>
            ) : null}
            <button type="button" className="link-button" data-action="sign-out" onClick={() => client.signOut().catch(() => {})}>
              {t('signOut')}
            </button>
          </div>
          {controls}
        </header>

        <main className="content" id="content">
          <h1 className="page-title">{t(`page.${page.id}.title`)}</h1>
          <p className="page-purpose">{t(`page.${page.id}.purpose`)}</p>
          {content}
        </main>
      </div>
    </div>
  );
}

function Segmented({ label, value, options, onChange, name }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} data-control={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.hint}
          data-value={o.value}
          className="segment"
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} /> : null}
          <span>{o.text}</span>
        </button>
      ))}
    </div>
  );
}
