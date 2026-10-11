import FieldName from './FieldName.jsx';

/**
 * A new password, typed twice (U7d-2): on accepting an invite, and on
 * choosing a new password from an emailed link. Under the two fields, once
 * the person has pressed to send, what is wrong in plain words -- too short,
 * too long, or not the same twice -- and nothing is sent until nothing is.
 * The two are held by the screen only while they are typed: it empties them
 * after every attempt, whatever the answer.
 */
export default function NewPassword({ t, first, second, onFirst, onSecond, problems, firstRef }) {
  return (
    <>
      <label className="field">
        <FieldName t={t} name="password.new" />
        <input
          ref={firstRef}
          type="password"
          name="new-password"
          data-field="new-password"
          autoComplete="new-password"
          value={first}
          onChange={(e) => onFirst(e.target.value)}
        />
      </label>
      <label className="field">
        <FieldName t={t} name="password.again" />
        <input
          type="password"
          name="new-password-again"
          data-field="new-password-again"
          autoComplete="new-password"
          value={second}
          onChange={(e) => onSecond(e.target.value)}
        />
      </label>
      {problems.map((key) => (
        <p key={key} className="warning" data-notice={key}>
          {t(key)}
        </p>
      ))}
    </>
  );
}
