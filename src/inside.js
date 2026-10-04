// What to say about the cars inside, from what the platform returns.

/**
 * The platform's own figures, in words. The count is of cars the sensors saw
 * drive in. When it is none but some were let in that the lane could not
 * confirm, it says "none confirmed", never "no cars": those cars may be
 * inside. The second line is null when every open stay is confirmed.
 */
export function insideWords(t, data) {
  const count = Number(data.inside_count) || 0;
  const unconfirmed = Number(data.unconfirmable_count) || 0;
  let figure;
  if (count === 1) figure = t('inside.countOne');
  else if (count > 1) figure = t('inside.countMany', { count });
  else figure = unconfirmed > 0 ? t('inside.countNoneConfirmed') : t('inside.countNone');
  const more = unconfirmed === 0 ? null : unconfirmed === 1 ? t('inside.unconfirmedOne') : t('inside.unconfirmedMany', { count: unconfirmed });
  return { figure, more };
}
