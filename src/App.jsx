import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PAGES, hashFor, pageForHash } from './pages.js';
import { knownLanguage, readLanguage, saveLanguage, translate } from './i18n/index.js';
import { EMPTY_OWNER, ownerReducer } from './owner.js';
import { STALE } from './api.js';
import QuickFind from './QuickFind.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import SignIn from './SignIn.jsx';
import InviteScreen from './InviteScreen.jsx';
import ForgotScreen from './ForgotScreen.jsx';
import ResetScreen from './ResetScreen.jsx';
import { takeLink } from './links.js';
import { GaragePicker, ProblemNote } from './parts.jsx';
import Home from './Home.jsx';
import SettingsPage, { Choosers } from './SettingsPage.jsx';
import LanesPage from './LanesPage.jsx';
import InsidePage from './InsidePage.jsx';
import SetupPage from './SetupPage.jsx';
import ChangesPage from './ChangesPage.jsx';
import AlertsPage from './AlertsPage.jsx';
import DrawingsPage from './DrawingsPage.jsx';
import TaxesPage from './TaxesPage.jsx';
import GettingPaidPage from './GettingPaidPage.jsx';
import CardReadersPage from './CardReadersPage.jsx';
import GaragesPage, { NoGarages } from './GaragesPage.jsx';

// Home, Garages and Settings are drawn apart: Home and Garages list every garage, and Settings is about these pages, not a garage.
const PAGE_BODIES = {
  setup: SetupPage, lanes: LanesPage, inside: InsidePage, changes: ChangesPage, alerts: AlertsPage, drawings: DrawingsPage,
  taxes: TaxesPage, paid: GettingPaidPage, readers: CardReadersPage,
};

/** The page in the address; a page's old address is put right, in place (U7a: Garage View). */
function useHashPage() {
  const [page, setPage] = useState(() => pageForHash(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      const now = pageForHash(window.location.hash);
      if (now.was?.includes(window.location.hash.replace(/^#/, ''))) window.history.replaceState(null, '', hashFor(now));
      setPage(now);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return page;
}

/**
 * U7d-2: the screen an emailed link opens, `{ kind, token }`, or null. The
 * one the page started with was taken out of the address by src/main.jsx; a
 * link opened in this page while it is open is taken out the same way, the
 * moment the address changes.
 */
function useLink(first) {
  const [link, setLink] = useState(first ?? null);
  useEffect(() => {
    const onHash = () => {
      const opened = takeLink(window.location, window.history);
      if (opened) setLink(opened);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [link, setLink];
}

export default function App({ theme, storage, client, link: startLink = null }) {
  const page = useHashPage();
  const [link, setLink] = useLink(startLink);
  // U7d-2: "Forgot your password?", opened from the sign-in screen or a reset link that no longer works.
  const [forgot, setForgot] = useState(false);
  // Signed out: the language last used on this computer, else English.
  // Signed in: the owner's profile (signedInAs below).
  const [language, setLanguage] = useState(() => readLanguage(storage));
  const [languageNotKept, setLanguageNotKept] = useState(false);
  const [themeChoice, setThemeChoice] = useState(theme.choice);
  const [owner, dispatch] = useReducer(ownerReducer, EMPTY_OWNER);
  const signedInNow = useRef(false);
  // The language picked on the sign-in screen, if one was: kept on the
  // profile of whoever signs in from it.
  const pickedOnSignIn = useRef(null);
  // Saves to the profile go one after another, so the last choice is the one kept.
  const saving = useRef(Promise.resolve());

  // U7d-2: an invite's screen speaks the invite's language, or the one picked on it: { token, language }.
  // It is the screen's only, and goes with it: left without accepting, a
  // signed-in owner's pages speak the account's language again.
  const [inviteLanguage, setInviteLanguage] = useState(null);
  const speaking = link?.kind === 'invite' && inviteLanguage?.token === link.token ? inviteLanguage.language : language;

  const t = useCallback((key, values) => translate(speaking, key, values), [speaking]);

  /** This visit and this computer: the screens, and the copy the next sign-in screen reads. */
  const show = useCallback(
    (next) => {
      setLanguage(next);
      saveLanguage(storage, next);
    },
    [storage],
  );

  /**
   * Keep `next` on the owner's profile. If that fails the screens still speak
   * it for this visit, and one sentence says it was not kept for next time. A
   * 401 is not this sentence's: the client has already sent the owner to the
   * sign-in screen.
   */
  const keepOnProfile = useCallback(
    (next) => {
      saving.current = saving.current.then(() =>
        client.setLanguage(next).then(
          () => setLanguageNotKept(false),
          (problem) => {
            if (problem?.kind === STALE || problem?.kind === 'ended') return;
            setLanguageNotKept(true);
          },
        ),
      );
    },
    [client],
  );

  const chooseLanguage = useCallback(
    (next) => {
      if (!knownLanguage(next)) return;
      show(next);
      if (signedInNow.current) keepOnProfile(next);
      else pickedOnSignIn.current = next;
    },
    [show, keepOnProfile],
  );

  /**
   * Someone is signed in. The profile's language is shown from the first
   * frame -- unless the owner picked one on the sign-in screen just now: then
   * that one is shown, and kept on the profile. Either way this computer's
   * copy is set to match, so the next sign-in screen already speaks it.
   */
  const signedInAs = useCallback(
    (who, { fromSignInScreen }) => {
      const profile = knownLanguage(who?.language);
      const picked = fromSignInScreen ? pickedOnSignIn.current : null;
      pickedOnSignIn.current = null;
      setLanguageNotKept(false);
      const next = picked ?? profile;
      if (next) show(next);
      signedInNow.current = true;
      dispatch({ type: 'signedIn', who });
      if (picked && picked !== profile) keepOnProfile(picked);
    },
    [show, keepOnProfile],
  );
  const chooseTheme = useCallback(
    (next) => {
      theme.choose(next);
      setThemeChoice(theme.choice);
    },
    [theme],
  );

  // Any 401, from any request, lets go of everything held about this owner.
  useEffect(
    () =>
      client.listen((notice) => {
        signedInNow.current = false;
        dispatch({ type: 'drop', notice });
      }),
    [client],
  );

  useEffect(() => {
    let live = true;
    client.me().then(
      (who) => live && who && signedInAs(who, { fromSignInScreen: false }),
      (problem) => live && problem.kind !== STALE && dispatch({ type: 'drop', notice: problem.kind }),
    );
    return () => {
      live = false;
    };
  }, [client, signedInAs]);

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
    document.documentElement.lang = speaking;
    const linkTitle = { invite: 'invite.title', reset: 'reset.title' }[link?.kind];
    const title = linkTitle ? t(linkTitle) : signedIn ? t(`page.${page.id}.title`) : forgot ? t('forgot.title') : t('signIn.title');
    document.title = `${title} · ${t('app.name')}`;
  }, [speaking, page, t, signedIn, link, forgot]);

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

  // The language and the look: on the Settings page, and on the sign-in screen.
  const choosers = <Choosers t={t} language={language} themeChoice={themeChoice} onLanguage={chooseLanguage} onTheme={chooseTheme} />;

  // U7d-2: an emailed link's screen comes first, signed in or not: it is what the link was opened for.
  const toSignIn = () => {
    setLink(null);
    setForgot(false);
  };
  if (link?.kind === 'invite') {
    const { token } = link;
    // Left without accepting: signed in, back to Home in the account's own
    // language; signed out, the sign-in screen goes on in the invite's.
    const leave = () => {
      if (!signedIn && inviteLanguage?.token === token) setLanguage(inviteLanguage.language);
      setInviteLanguage(null);
      if (signedIn) actions.go(PAGES.find((p) => p.id === 'home'));
      toSignIn();
    };
    return (
      <InviteScreen
        key={token}
        t={t}
        client={client}
        token={token}
        language={speaking}
        signedIn={signedIn}
        // The screens speak the language picked for the account; this computer keeps it once the account is made.
        onLanguage={(next) => knownLanguage(next) && setInviteLanguage({ token, language: next })}
        controls={<Choosers t={t} language={speaking} themeChoice={themeChoice} onLanguage={chooseLanguage} onTheme={chooseTheme} withLanguage={false} />}
        onSignedIn={(who) => {
          setLink(null);
          setInviteLanguage(null);
          signedInAs(who, { fromSignInScreen: false });
          actions.go(PAGES.find((p) => p.id === 'garages'));
        }}
        onLeave={leave}
      />
    );
  }
  if (link?.kind === 'reset') {
    return (
      <ResetScreen
        key={link.token}
        t={t}
        client={client}
        token={link.token}
        controls={choosers}
        // A reset signs nobody in and signs the account out everywhere: the sign-in screen, saying so.
        onChanged={() => {
          setLink(null);
          // Opened where "Forgot your password?" was asked, it is the sign-in screen that says so, not Forgot again.
          setForgot(false);
          signedInNow.current = false;
          dispatch({ type: 'drop', notice: 'passwordChanged' });
        }}
        onForgot={() => {
          setLink(null);
          setForgot(true);
        }}
        onSignIn={toSignIn}
      />
    );
  }
  if (owner.status === 'checking') return <div className="checking" aria-busy="true" />;
  if (!signedIn) {
    if (forgot) return <ForgotScreen t={t} client={client} controls={choosers} onSignIn={toSignIn} />;
    return (
      <SignIn
        t={t}
        client={client}
        notice={owner.notice}
        controls={choosers}
        onSignedIn={(who) => signedInAs(who, { fromSignInScreen: true })}
        onForgot={() => setForgot(true)}
      />
    );
  }

  const Body = PAGE_BODIES[page.id];
  const choose = (garageId) => dispatch({ type: 'choose', garageId });
  const setupPage = PAGES.find((p) => p.id === 'setup');
  // U7c: a garage pressed on the Garages page is chosen, and its Setup opened.
  const open = (garageId) => {
    choose(garageId);
    actions.go(setupPage);
  };
  // U7c: a garage just added is chosen and its Setup opened. The list is the
  // platform's as read after it; if that read failed, the new one is added to
  // the list held, as the platform shows a garage.
  const added = (made, garages) => {
    const presented = { id: made.id, name: made.name, timezone: made.timezone, currency: made.currency, live: Boolean(made.activated_at) };
    const list = garages ?? [...(owner.garages ?? []).filter((g) => g.id !== made.id), presented];
    dispatch({ type: 'added', garages: list, garageId: made.id });
    actions.go(setupPage);
  };
  let content;
  if (page.id === 'settings') {
    content = <SettingsPage t={t} language={language} themeChoice={themeChoice} onLanguage={chooseLanguage} onTheme={chooseTheme} />;
  } else if (owner.garagesProblem) {
    content = <ProblemNote t={t} kind={owner.garagesProblem} onRetry={loadGarages} />;
  } else if (!owner.garages) {
    content = <p className="quiet">{t('loading')}</p>;
  } else if (page.id === 'garages') {
    content = <GaragesPage t={t} language={language} client={client} garages={owner.garages} chosen={garage?.id ?? null} onOpen={open} onAdded={added} />;
  } else if (owner.garages.length === 0) {
    // U7c: an account with no garage starts by adding one, from whichever page it is on.
    content = <NoGarages t={t} language={language} client={client} onAdded={added} />;
  } else if (page.id === 'home') {
    content = <Home t={t} language={language} client={client} garages={owner.garages} garage={garage} onChoose={choose} />;
  } else if (!garage) {
    content = <GaragePicker t={t} language={language} garages={owner.garages} onChoose={choose} />;
  } else if (Body) {
    content = <Body key={garage.id} t={t} language={language} client={client} garage={garage} />;
  } else {
    content = (
      <p className="quiet" data-notice="not-yet">
        {t('page.notYet')}
      </p>
    );
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
                <span>
                  <bdi>{garage.name}</bdi>
                </span>
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
        </header>

        <main className="content" id="content">
          <h1 className="page-title">{t(`page.${page.id}.title`)}</h1>
          <p className="page-purpose">{t(`page.${page.id}.purpose`)}</p>
          {languageNotKept ? (
            <p className="problem-note" role="status" data-notice="language-not-kept">
              {t('language.notKept')}
            </p>
          ) : null}
          {content}
        </main>
      </div>
    </div>
  );
}
