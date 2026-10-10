import { useCallback, useState } from 'react';
import { PrintHead, ProblemNote, useGarageRead, usePrint } from './parts.jsx';
import { STALE } from './api.js';
import { ADDRESS_MAX, PLACE_MAX, driversAnswer, placeLine, takesCards } from './payments.js';
import { countryChoices, firstCountry } from './countries.js';
import { garageDateTime } from './time.js';
import { PAGES, hashFor } from './pages.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/**
 * Read for the page: whether the garage takes drivers without a pass; for
 * one that does, its payment account, where its readers are (the place as
 * the platform recorded it, or none), its lanes and every reader connection
 * there has been, current ones first.
 */
export async function readReaders(client, garageId) {
  const setup = await client.setup(garageId);
  const answer = driversAnswer(setup.takes_any_driver);
  if (answer !== 'any') return { answer };
  let account;
  try {
    account = await client.paymentAccount(garageId);
  } catch (p) {
    if (p?.kind === 'cardsNotSetUp') return { answer, notSetUp: true };
    throw p;
  }
  const [place, lanes, connections] = await Promise.all([client.readerPlace(garageId), client.lanes(garageId), client.readerConnections(garageId)]);
  return { answer, account, place, lanes: lanes.lanes, connections };
}

const NOTHING = '–';

/**
 * Card readers: offered only when the garage's account can take cards;
 * otherwise what to do first, and where. A garage that takes pass holders
 * only has none. The address of the readers, entered once, then shown. Each
 * way out with its reader or "No card reader"; connect one with the code it
 * shows and a name, or disconnect it, confirmed on the page. The code is kept
 * nowhere: not in browser storage, the address, a log line or a file. Every
 * connection there has been prints and downloads like the other lists.
 */
export default function CardReadersPage({ t, language, client, garage }) {
  const { printedAt, print } = usePrint();
  const readers = useGarageRead(useCallback((id) => readReaders(client, id), [client]), garage.id);
  const reread = useCallback(() => readers.refresh().catch(() => readers.retry()), [readers]);
  const [panel, setPanel] = useState(null); // { kind: 'connect' | 'disconnect', lane }

  if (readers.problem) return <ProblemNote t={t} kind={readers.problem} onRetry={readers.retry} />;
  if (!readers.data) return <p className="quiet">{t('loading')}</p>;
  const { answer, account, notSetUp, place, lanes, connections } = readers.data;

  if (answer === 'passOnly') {
    return (
      <section className="panel" data-readers="pass-only">
        <p>{t('readers.passOnly')}</p>
      </section>
    );
  }
  if (answer === 'unanswered') {
    return (
      <section className="panel" data-readers="unanswered">
        <p>{t('readers.unanswered')}</p>
        <p>
          <a className="page-link" href={hashFor(PAGES.find((p) => p.id === 'setup'))} data-go="setup">
            {t('paid.toSetup')}
          </a>
        </p>
      </section>
    );
  }
  if (notSetUp) {
    return (
      <section className="panel" data-readers="not-set-up">
        <p>{t('problem.cardsNotSetUp')}</p>
      </section>
    );
  }

  const can = takesCards(account);
  const at = (iso) => garageDateTime(iso, garage.timezone, language);
  const waysOut = lanes.filter((l) => l.direction === 'exit');
  const laneName = (id) => lanes.find((l) => l.id === id)?.name ?? null;

  return (
    <>
      {can ? null : (
        <section className="panel" data-readers="first">
          <p data-notice="readers-first">{t(account ? 'readers.cannotYet' : 'readers.noAccount')}</p>
          <p>
            <a className="page-link" href={hashFor(PAGES.find((p) => p.id === 'paid'))} data-go="paid">
              {t('readers.toPaid')}
            </a>
          </p>
        </section>
      )}

      {can ? (
        place ? (
          <section className="panel no-print" data-readers="place">
            <h2 className="section-title">{t('readers.place')}</h2>
            <p className="field">
              <FieldName t={t} name="readers.address" />
              <bdi className="reader-place">{place.display_name}</bdi>
              <span className="quiet">{t('readers.placeEntered', { time: at(place.created_at) })}</span>
            </p>
          </section>
        ) : (
          <PlaceForm t={t} language={language} client={client} garage={garage} onSaved={reread} />
        )
      ) : null}

      <section className="panel no-print" data-list="ways-out">
        <h2 className="section-title">{t('readers.wayOuts')}</h2>
        {waysOut.length === 0 ? (
          <p className="quiet">{t('readers.noWayOut')}</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>
                  <FieldName t={t} name="readers.wayOut" />
                </th>
                <th>
                  <FieldName t={t} name="readers.reader" />
                </th>
                <th>
                  <FieldName t={t} name="readers.since" />
                </th>
                {can ? (
                  <th>
                    <FieldName t={t} name="readers.change" />
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {waysOut.map((lane) => (
                <tr key={lane.id} data-lane={lane.id} data-reader={lane.reader ? 'yes' : 'no'}>
                  <td>
                    <bdi>{lane.name}</bdi>
                  </td>
                  <td>{lane.reader ? <bdi>{lane.reader.label}</bdi> : <span className="quiet">{t('readers.none')}</span>}</td>
                  <td>{lane.reader ? at(lane.reader.bound_at) : NOTHING}</td>
                  {can ? (
                    <td>
                      {lane.reader ? (
                        <button type="button" className="link-button" data-action="disconnect-reader" onClick={() => setPanel({ kind: 'disconnect', lane })}>
                          {t('readers.disconnect')}
                        </button>
                      ) : place ? (
                        <button type="button" className="link-button" data-action="connect-reader" onClick={() => setPanel({ kind: 'connect', lane })}>
                          {t('readers.connect')}
                        </button>
                      ) : (
                        <span className="quiet" data-notice="place-first">
                          {t('readers.placeFirst')}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {can && panel ? (
        <ReaderPanel
          key={`${panel.kind}:${panel.lane.id}`}
          t={t}
          client={client}
          panel={panel}
          onDone={() => reread()}
          onClose={() => setPanel(null)}
        />
      ) : null}

      <section className="panel printable" data-list="readers">
        <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={readers.readAt} />
        <div className="list-head">
          <h2 className="section-title">{t('readers.history')}</h2>
          <ListActions t={t} list="readers" language={language} client={client} garage={garage} refresh={readers.refresh} print={print} />
        </div>
        {connections.length === 0 ? (
          <p className="quiet">{t('readers.historyNone')}</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>
                  <FieldName t={t} name="readers.histLane" />
                </th>
                <th>
                  <FieldName t={t} name="readers.histReader" />
                </th>
                <th>
                  <FieldName t={t} name="readers.connected" />
                </th>
                <th>
                  <FieldName t={t} name="readers.ended" />
                </th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={`${c.reader_id}:${c.bound_at}`} data-connection={c.unbound_at ? 'ended' : 'current'}>
                  <td>{laneName(c.lane_id) ? <bdi>{laneName(c.lane_id)}</bdi> : NOTHING}</td>
                  <td>
                    <bdi>{c.label}</bdi>
                  </td>
                  <td>{at(c.bound_at)}</td>
                  <td>{c.unbound_at ? at(c.unbound_at) : t('readers.stillConnected')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

/** A request's refusal, in plain words; a sign-out on the way is not this page's to show. */
function useProblem() {
  const [problem, setProblem] = useState(null);
  const fail = (p) => {
    if (p?.kind !== STALE && p?.kind !== 'ended') setProblem(p?.kind ?? 'unexpected');
  };
  return [problem, setProblem, fail];
}

const EMPTY_PLACE = { line1: '', city: '', state: '', postal_code: '' };

/**
 * The address of the garage's card readers, entered once: street, city,
 * state, ZIP code and country. Sent as the address, and as the place's name
 * the same address on one line, which is what the page shows afterwards.
 */
function PlaceForm({ t, language, client, garage, onSaved }) {
  const [place, setPlace] = useState({ ...EMPTY_PLACE, country: firstCountry(garage) });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  const set = (field) => (e) => setPlace((p) => ({ ...p, [field]: e.target.value }));
  const missing = [
    !place.line1.trim() && 'readers.needStreet',
    !place.city.trim() && 'readers.needCity',
    !place.country && 'readers.needCountry',
  ].filter(Boolean);
  const line = placeLine(place);

  const save = async () => {
    setTried(true);
    if (missing.length || busy || line.length > PLACE_MAX) return;
    setBusy(true);
    setProblem(null);
    // Stripe takes no empty part of an address: a part left empty is not sent.
    const address = Object.fromEntries(Object.entries(place).map(([k, v]) => [k, v.trim().replace(/\s+/g, ' ')]).filter(([, v]) => v));
    try {
      await client.setReaderPlace(garage.id, { display_name: line, address });
      onSaved();
    } catch (p) {
      fail(p);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel no-print" data-form="reader-place">
      <h2 className="section-title">{t('readers.place')}</h2>
      <p className="quiet">{t('readers.placeSays')}</p>
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <FieldName t={t} name="readers.street" />
          <input type="text" data-field="street" value={place.line1} maxLength={ADDRESS_MAX.line1} autoComplete="off" onChange={set('line1')} />
        </label>
        <label className="field">
          <FieldName t={t} name="readers.city" />
          <input type="text" data-field="city" value={place.city} maxLength={ADDRESS_MAX.city} autoComplete="off" onChange={set('city')} />
        </label>
        <label className="field">
          <FieldName t={t} name="readers.state" />
          <input type="text" data-field="state" value={place.state} maxLength={ADDRESS_MAX.state} autoComplete="off" onChange={set('state')} />
        </label>
        <label className="field">
          <FieldName t={t} name="readers.zip" />
          <input type="text" data-field="zip" value={place.postal_code} maxLength={ADDRESS_MAX.postal_code} autoComplete="off" onChange={set('postal_code')} />
        </label>
        <label className="field">
          <FieldName t={t} name="readers.country" />
          <select data-field="place-country" value={place.country} onChange={set('country')}>
            <option value="">{t('paid.countryPick')}</option>
            {countryChoices(language).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {tried && missing.length ? (
          <p className="warning" data-notice="place-missing">
            {missing.map((key) => t(key)).join(' ')}
          </p>
        ) : null}
        <button type="submit" className="primary-button" data-action="save-place" disabled={busy}>
          {t('readers.placeSave')}
        </button>
        {problem ? <ProblemNote t={t} kind={problem} /> : null}
      </form>
    </section>
  );
}

/** What closes a panel: "Cancel" on a form, "No, keep it" beside a question asked with "Yes". */
const CLOSE_WORDS = { connect: 'readers.panelCancel', disconnect: 'readers.panelKeep' };

function ReaderPanel({ t, client, panel, onDone, onClose }) {
  const Body = panel.kind === 'connect' ? Connect : Disconnect;
  return (
    <section className="panel no-print lane-panel" data-panel={`${panel.kind}-reader`} aria-live="polite">
      <div className="lane-panel-head">
        <h2 className="section-title">
          {t(`readers.panel.${panel.kind}`)} <bdi>{panel.lane.name}</bdi>
        </h2>
        <button type="button" className="link-button" data-action="close-panel" onClick={onClose}>
          {t(CLOSE_WORDS[panel.kind])}
        </button>
      </div>
      <Body t={t} client={client} lane={panel.lane} onDone={onDone} onClose={onClose} />
    </section>
  );
}

/**
 * Connect a reader: the code it shows on its screen, and a name. The code
 * lives in this panel's state only, while it is typed -- never in browser
 * storage, the address, a log line or a file -- and is let go after every
 * try, kept or refused: a refused code is typed again.
 */
function Connect({ t, client, lane, onDone, onClose }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem, fail] = useProblem();
  return (
    <form
      className="setup-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim() || !label.trim() || busy) return;
        setBusy(true);
        setProblem(null);
        const sent = code.trim();
        setCode('');
        try {
          await client.connectReader(lane.id, sent, label.trim());
          onDone();
          onClose();
        } catch (p) {
          fail(p);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <FieldName t={t} name="readers.code" />
        <input type="text" data-field="reader-code" value={code} maxLength={100} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
      </label>
      <label className="field">
        <FieldName t={t} name="readers.label" />
        <input type="text" data-field="reader-label" value={label} maxLength={80} autoComplete="off" onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button type="submit" className="primary-button" data-action="connect-confirm" disabled={!code.trim() || !label.trim() || busy}>
        {t('readers.connectButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </form>
  );
}

function Disconnect({ t, client, lane, onDone, onClose }) {
  const [problem, setProblem, fail] = useProblem();
  return (
    <div className="setup-form">
      <p>{t('readers.disconnectAsk')}</p>
      <button
        type="button"
        className="primary-button"
        data-action="disconnect-confirm"
        onClick={async () => {
          setProblem(null);
          try {
            await client.disconnectReader(lane.id);
            onDone();
            onClose();
          } catch (p) {
            fail(p);
          }
        }}
      >
        {t('readers.disconnectButton')}
      </button>
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </div>
  );
}
