/**
 * A field's name and, directly under it, one short sentence saying what it
 * is: `name` and `name.about` in the dictionaries. Always on screen, never
 * behind a pointer or a click, and printed with the list.
 *
 * Every field a person reads or fills -- a form field, a figure on Home, a
 * column of a list -- is named through this, and scripts/check-descriptions.js
 * fails a field that is not, or whose description is missing.
 */
export default function FieldName({ t, name }) {
  return (
    <>
      <span className="field-name">{t(name)}</span>
      <span className="field-about" data-about={name}>
        {t(`${name}.about`)}
      </span>
    </>
  );
}
