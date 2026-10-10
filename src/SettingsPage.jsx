import { Segmented } from './parts.jsx';
import { THEME_CHOICES } from './theme.js';
import FieldName from './FieldName.jsx';

/**
 * The two choices that are about these pages themselves, not a garage: the
 * language they are in and how they look. Each named with its description
 * under it, then its choices. On the Settings page, and on the sign-in screen
 * (which keeps its language choice); nowhere else (U7a).
 */
export function Choosers({ t, language, themeChoice, onLanguage, onTheme }) {
  return (
    <div className="choosers">
      <div className="chooser" data-chooser="language">
        <FieldName t={t} name="language.label" />
        <Segmented
          label={t('language.label')}
          value={language}
          options={['en', 'es'].map((l) => ({ value: l, text: t(`language.${l}`) }))}
          onChange={onLanguage}
          name="language"
        />
      </div>
      <div className="chooser" data-chooser="theme">
        <FieldName t={t} name="theme.label" />
        <Segmented
          label={t('theme.label')}
          value={themeChoice}
          options={THEME_CHOICES.map((c) => ({
            value: c,
            text: t(`theme.${c}`),
            icon: c,
            hint: c === 'auto' ? t('theme.autoHint') : undefined,
          }))}
          onChange={onTheme}
          name="theme"
        />
      </div>
    </div>
  );
}

/** Settings: the language and the look, small, in one place. A choice takes effect at once. */
export default function SettingsPage({ t, language, themeChoice, onLanguage, onTheme }) {
  return (
    <section className="panel settings" data-section="settings">
      <Choosers t={t} language={language} themeChoice={themeChoice} onLanguage={onLanguage} onTheme={onTheme} />
    </section>
  );
}
