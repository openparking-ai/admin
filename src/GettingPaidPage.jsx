import { useCallback, useState } from 'react';
import { Opens, ProblemNote, useGarageRead } from './parts.jsx';
import { STALE } from './api.js';
import { accountFacts, accountWords, detailsGiven, driversAnswer, takesCards } from './payments.js';
import { countryChoices, firstCountry } from './countries.js';
import { PAGES, hashFor } from './pages.js';
import FieldName from './FieldName.jsx';

/**
 * Read for the page: whether the garage takes drivers without a pass (the
 * setup read's answer), and, only for one that does, its payment account as
 * the platform last read it. A platform with no card payments set up says so
 * by name (`connect_not_configured`), and that is a state of the page, not a
 * failure.
 */
export async function readPaid(client, garageId) {
  const setup = await client.setup(garageId);
  const answer = driversAnswer(setup.takes_any_driver);
  if (answer !== 'any') return { answer };
  try {
    return { answer, account: await client.paymentAccount(garageId) };
  } catch (p) {
    if (p?.kind === 'cardsNotSetUp') return { answer, notSetUp: true };
    throw p;
  }
}

/**
 * Open Stripe's page for the garage's details in a new tab. The tab is
 * opened at once, on the owner's click, so the browser lets it open; it is
 * cut off from this page (no `opener`) before it is sent to Stripe. Returns
 * whether it opened: a browser that blocks it gets a plain link instead.
 */
async function openStripe(client, garageId, before = async () => {}) {
  const tab = window.open('', '_blank');
  try {
    await before();
    const url = await client.stripePage(garageId);
    if (!tab) return { url };
    tab.opener = null;
    tab.location.replace(url);
    return { opened: true };
  } catch (p) {
    tab?.close();
    throw p;
  }
}

/**
 * Getting paid: the garage's own Stripe account, where card payments are
 * paid out. A garage that takes pass holders only takes no cards at its
 * lanes and needs nothing here. With no account: a country, then "Set up
 * getting paid", which makes it and opens Stripe's page. With one: what it
 * can do now, each fact with when it was checked, "Check again", and
 * "Continue on Stripe" while the garage's details are not finished. No
 * account id or Stripe code is shown.
 */
export default function GettingPaidPage({ t, language, client, garage }) {
  const paid = useGarageRead(useCallback((id) => readPaid(client, id), [client]), garage.id);
  const reread = useCallback(() => paid.refresh().catch(() => paid.retry()), [paid]);
  // A refusal met just after the account was made (Stripe's page would not
  // open): said on the account's own view, which the page then shows.
  const [carried, setCarried] = useState(null);

  if (paid.problem) return <ProblemNote t={t} kind={paid.problem} onRetry={paid.retry} />;
  if (!paid.data) return <p className="quiet">{t('loading')}</p>;
  const { answer, account, notSetUp } = paid.data;

  if (answer === 'passOnly') {
    return (
      <section className="panel" data-paid="pass-only">
        <p>{t('paid.passOnly')}</p>
      </section>
    );
  }
  if (answer === 'unanswered') {
    const setup = PAGES.find((p) => p.id === 'setup');
    return (
      <section className="panel" data-paid="unanswered">
        <p>{t('paid.unanswered')}</p>
        <p>
          <a className="page-link" href={hashFor(setup)} data-go="setup">
            {t('paid.toSetup')}
          </a>
        </p>
      </section>
    );
  }
  if (notSetUp) {
    return (
      <section className="panel" data-paid="not-set-up">
        <p>{t('problem.cardsNotSetUp')}</p>
      </section>
    );
  }
  if (!account) {
    return (
      <MakeAccount
        t={t}
        language={language}
        client={client}
        garage={garage}
        onMade={(problem = null) => {
          setCarried(problem);
          reread();
        }}
      />
    );
  }
  return <Account t={t} language={language} client={client} garage={garage} account={account} carried={carried} onChecked={reread} />;
}

/**
 * No account yet: "Set up getting paid" opens the form (U7a), which asks the
 * garage's country, then makes the account and opens Stripe's page.
 */
function MakeAccount({ t, language, client, garage, onMade }) {
  return (
    <section className="panel" data-paid="no-account">
      <p className="paid-state" data-state="none">
        {t('paid.noAccount')}
      </p>
      <Opens t={t} opener="paid.setUp" action="open-set-up-paid">
        {(close) => <AccountForm t={t} language={language} client={client} garage={garage} onMade={onMade} onClose={close} />}
      </Opens>
    </section>
  );
}

function AccountForm({ t, language, client, garage, onMade, onClose }) {
  const [country, setCountry] = useState(firstCountry(garage));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [link, setLink] = useState(null);
  const [tried, setTried] = useState(false);

  const setUp = async () => {
    setTried(true);
    if (!country || busy) return;
    setBusy(true);
    setProblem(null);
    let made = false;
    try {
      const { url } = await openStripe(client, garage.id, async () => {
        await client.makePaymentAccount(garage.id, country);
        made = true;
      });
      if (url) setLink(url);
      else onMade();
    } catch (p) {
      if (p?.kind === STALE || p?.kind === 'ended') return;
      // Made, but Stripe's page would not open: the account's own view says why.
      if (made) onMade(p?.kind ?? 'unexpected');
      else setProblem(p?.kind ?? 'unexpected');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-form" data-form="set-up-paid">
      <div className="lane-panel-head">
        <h2 className="section-title">{t('paid.setUp')}</h2>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t('paid.cancel')}
        </button>
      </div>
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          setUp();
        }}
      >
        <label className="field">
          <FieldName t={t} name="paid.country" />
          <select data-field="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t('paid.countryPick')}</option>
            {countryChoices(language).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {tried && !country ? (
          <p className="warning" data-notice="need-country">
            {t('paid.needCountry')}
          </p>
        ) : null}
        <p className="quiet">{t('paid.setUpSays')}</p>
        <button type="submit" className="primary-button" data-action="set-up-paid" disabled={busy}>
          {busy ? t('paid.opening') : t('paid.setUpGo')}
        </button>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
        {link ? <StripeLink t={t} url={link} onUsed={onMade} /> : null}
      </form>
    </div>
  );
}

/** A browser that kept the new tab from opening: the same page, as a plain link. */
function StripeLink({ t, url, onUsed }) {
  return (
    <p className="warning" data-notice="not-opened">
      {t('paid.notOpened')}{' '}
      <a className="page-link" href={url} target="_blank" rel="noopener noreferrer" data-action="open-stripe" onClick={onUsed}>
        {t('paid.openPage')}
      </a>
    </p>
  );
}

/** An account: what it can do now, each fact with when it was checked; check again; continue on Stripe. */
function Account({ t, language, client, garage, account, carried, onChecked }) {
  const [busy, setBusy] = useState(null); // 'check' | 'stripe'
  const [problem, setProblem] = useState(carried);
  const [link, setLink] = useState(null);
  const facts = Object.fromEntries(accountFacts(t, account, garage, language).map((f) => [f.key, f]));

  const run = async (what, fn) => {
    if (busy) return;
    setBusy(what);
    setProblem(null);
    try {
      await fn();
    } catch (p) {
      if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel" data-paid="account" data-can-take={takesCards(account) ? 'yes' : 'no'}>
      <p className="paid-state" data-state={takesCards(account) ? 'can-take' : 'cannot-yet'}>
        {accountWords(t, account)}
      </p>
      <div className="paid-facts">
        <div className="field paid-fact" data-fact="cards">
          <FieldName t={t} name="paid.cards" />
          <span className="paid-value">{facts['paid.cards'].value}</span>
          <span className="quiet">{facts['paid.cards'].checked}</span>
        </div>
        <div className="field paid-fact" data-fact="charges">
          <FieldName t={t} name="paid.charges" />
          <span className="paid-value">{facts['paid.charges'].value}</span>
          <span className="quiet">{facts['paid.charges'].checked}</span>
        </div>
        <div className="field paid-fact" data-fact="details">
          <FieldName t={t} name="paid.details" />
          <span className="paid-value">{facts['paid.details'].value}</span>
          <span className="quiet">{facts['paid.details'].checked}</span>
        </div>
      </div>
      {detailsGiven(account) ? null : (
        <p className="quiet" data-notice="continue-on-stripe">
          {t('paid.continueSays')}
        </p>
      )}
      <div className="lane-actions">
        <button
          type="button"
          className="primary-button"
          data-action="check-again"
          disabled={busy !== null}
          onClick={() =>
            run('check', async () => {
              await client.checkPaymentAccount(garage.id);
              onChecked();
            })
          }
        >
          {busy === 'check' ? t('paid.checking') : t('paid.checkAgain')}
        </button>
        {detailsGiven(account) ? null : (
          <button
            type="button"
            className="primary-button"
            data-action="continue-on-stripe"
            disabled={busy !== null}
            onClick={() =>
              run('stripe', async () => {
                const { url } = await openStripe(client, garage.id);
                if (url) setLink(url);
              })
            }
          >
            {busy === 'stripe' ? t('paid.opening') : t('paid.continue')}
          </button>
        )}
      </div>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
      {link ? <StripeLink t={t} url={link} onUsed={() => setLink(null)} /> : null}
    </section>
  );
}
