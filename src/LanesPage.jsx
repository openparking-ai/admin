import { useCallback } from 'react';
import { PrintHead, ProblemNote, useGarageRead, useNow, usePrint } from './parts.jsx';
import { deviceWords, directionKey } from './lanes.js';
import { garageTime } from './time.js';
import FieldName from './FieldName.jsx';
import ListActions from './ListActions.jsx';

/** Every lane of the garage, its lane computers and whether it has a card reader. Read only. */
export default function LanesPage({ t, language, client, garage }) {
  const now = useNow();
  const { printedAt, print } = usePrint();
  const lanes = useGarageRead(useCallback((id) => client.lanes(id), [client]), garage.id);

  if (lanes.problem) return <ProblemNote t={t} kind={lanes.problem} onRetry={lanes.retry} />;
  if (!lanes.data) return <p className="quiet">{t('loading')}</p>;

  return (
    <section className="panel printable" data-list="lanes">
      <PrintHead t={t} garage={garage} language={language} printedAt={printedAt} readAt={lanes.readAt} />
      <div className="list-head">
        <h2 className="section-title">{t('page.lanes.title')}</h2>
        <ListActions t={t} list="lanes" language={language} client={client} garage={garage} refresh={lanes.refresh} print={print} />
      </div>
      {lanes.data.length === 0 ? (
        <p className="quiet">{t('lanes.none')}</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <FieldName t={t} name="lanes.lane" />
              </th>
              <th>
                <FieldName t={t} name="lanes.direction" />
              </th>
              <th>
                <FieldName t={t} name="lanes.computers" />
              </th>
              <th>
                <FieldName t={t} name="lanes.reader" />
              </th>
            </tr>
          </thead>
          <tbody>
            {lanes.data.map((lane) => (
              <tr key={lane.id}>
                <td>
                  <bdi>{lane.name}</bdi>
                </td>
                <td>{t(directionKey(lane))}</td>
                <td>
                  {(lane.devices ?? []).length === 0 ? (
                    <span className="quiet">{t('lane.noComputer')}</span>
                  ) : (
                    <ul className="device-list">
                      {lane.devices.map((d) => (
                        <li key={d.id} data-device={d.id}>
                          <span className="device-name">
                            <bdi>{d.name}</bdi>
                          </span>{' '}
                          <span className="quiet">
                            {d.revoked_at
                              ? t('device.off', { time: garageTime(d.revoked_at, garage.timezone, language, now) })
                              : deviceWords(t, d, garage, language, now).text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>{lane.reader ? t('lanes.readerYes') : t('lanes.readerNo')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
