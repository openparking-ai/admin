import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAGES, hashFor, pageForHash } from './pages.js';
import { readLanguage, saveLanguage, translate } from './i18n/index.js';
import { THEME_CHOICES } from './theme.js';
import QuickFind from './QuickFind.jsx';
import Icon from './Icon.jsx';

function useHashPage() {
  const [page, setPage] = useState(() => pageForHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setPage(pageForHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return page;
}

export default function App({ theme, storage }) {
  const page = useHashPage();
  const [language, setLanguage] = useState(() => readLanguage(storage, navigator.languages));
  const [themeChoice, setThemeChoice] = useState(theme.choice);

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

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `${t(`page.${page.id}.title`)} · ${t('app.name')}`;
  }, [language, page, t]);

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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="mark" />
          </span>
          <span className="brand-text">
            <span className="brand-name">{t('app.name')}</span>
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
        </header>

        <main className="content" id="content">
          <h1 className="page-title">{t(`page.${page.id}.title`)}</h1>
          <p className="page-purpose">{t(`page.${page.id}.purpose`)}</p>
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
