import { useCallback, useState } from 'react';
import { ProblemNote, Stored, useGarageRead } from './parts.jsx';
import { STALE, bannedPicturePath } from './api.js';
import { garageTime } from './time.js';
import { PAGES, hashFor } from './pages.js';
import FieldName from './FieldName.jsx';

/**
 * U7f: the cars banned at this garage, each with its pictures, newest first.
 * A car is put on the list only by the lane, as a tailgater, where the owner
 * has chosen to ban tailgaters (on the Setup page). Here a car can only be
 * taken off -- never added.
 */
export default function BannedPage({ t, language, client, garage }) {
  const banned = useGarageRead(useCallback((id) => client.banned(id), [client]), garage.id);
  const [asking, setAsking] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState(null);

  if (banned.problem) return <ProblemNote t={t} kind={banned.problem} onRetry={banned.retry} />;
  if (!banned.data) return <p className="quiet">{t('loading')}</p>;
  const { banTailgaters, cars } = banned.data;
  const setup = PAGES.find((p) => p.id === 'setup');

  const remove = async (car) => {
    setRemoving(true);
    setProblem(null);
    try {
      await client.removeBanned(garage.id, car.id);
      setAsking(null);
      banned.retry();
    } catch (p) {
      if (p.kind !== STALE && p.kind !== 'ended') setProblem(p.kind);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="panel" data-list="banned">
      <div className="list-head">
        <h2 className="section-title">{t('page.banned.title')}</h2>
      </div>
      <p className="quiet" data-notice={banTailgaters ? 'banning' : 'not-banning'}>
        {banTailgaters ? t('banned.on') : t('banned.off')}{' '}
        <a href={hashFor(setup)} data-go="setup">
          {t('setup.goTo', { page: t('page.setup.title') })}
        </a>
      </p>
      {cars.length === 0 ? (
        <p className="quiet" data-notice="none-banned">
          {t('banned.empty')}
        </p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="banned.pictures" />
              </th>
              <th>
                <FieldName t={t} name="banned.plate" />
              </th>
              <th>
                <FieldName t={t} name="banned.listed" />
              </th>
              <th>
                <FieldName t={t} name="banned.garage" />
              </th>
              <th>
                <FieldName t={t} name="banned.remove" />
              </th>
            </tr>
          </thead>
          <tbody>
            {cars.map((car) => (
              <tr key={car.id} data-banned={car.id}>
                <td className="banned-pictures">
                  {car.pictures.map((picture) => (
                    <img
                      key={picture.id}
                      className="banned-picture"
                      src={bannedPicturePath(garage.id, car.id, picture.id)}
                      alt={t('banned.pictureOf', { plate: car.plate })}
                      width="120"
                      height="80"
                      loading="lazy"
                    />
                  ))}
                </td>
                <td>
                  <Stored parts={[car.plate]} />
                </td>
                <td>{garageTime(car.listed_at, garage.timezone, language)}</td>
                <td>
                  <bdi>{car.garage_name}</bdi>
                </td>
                <td>
                  {asking === car.id ? (
                    <div className="lane-actions" data-confirm="remove-banned">
                      <span>{t('banned.removeAsk')}</span>
                      <button type="button" className="primary-button" data-action="remove-banned-yes" disabled={removing} onClick={() => remove(car)}>
                        {removing ? t('banned.removing') : t('banned.removeYes')}
                      </button>
                      <button type="button" className="link-button" data-action="remove-banned-keep" onClick={() => setAsking(null)}>
                        {t('banned.keep')}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="link-button" data-action="remove-banned" onClick={() => setAsking(car.id)}>
                      {t('banned.removeButton')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {problem ? <ProblemNote t={t} kind={problem} /> : null}
    </section>
  );
}
