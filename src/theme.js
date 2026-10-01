// Day, night, or auto. Auto follows the computer's own setting, and changes
// the moment that setting changes. The choice is kept for the next visit.
//
// The look is applied as `data-theme` on the root element; styles.css holds
// the colours for each. Everything the browser provides is passed in, so the
// tests can drive it with no browser at all.

export const THEME_CHOICES = ['day', 'night', 'auto'];
export const THEME_KEY = 'openparking-admin.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readChoice(storage) {
  try {
    const stored = storage?.getItem(THEME_KEY);
    return THEME_CHOICES.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveChoice(storage, choice) {
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    // Storage switched off: the choice holds for this visit only.
  }
}

/** The look a choice produces, given whether the computer is set to dark. */
export const lookFor = (choice, computerIsDark) =>
  choice === 'auto' ? (computerIsDark ? 'night' : 'day') : choice;

export function createTheme({ storage, matchMedia, root, onChange } = {}) {
  const media = matchMedia ? matchMedia(DARK_QUERY) : null;
  let choice = readChoice(storage);
  let look;

  const apply = () => {
    look = lookFor(choice, Boolean(media?.matches));
    root.dataset.theme = look;
    onChange?.({ choice, look });
  };

  const onComputerChange = () => {
    if (choice === 'auto') apply();
  };
  media?.addEventListener?.('change', onComputerChange);
  apply();

  return {
    get choice() {
      return choice;
    },
    get look() {
      return look;
    },
    choose(next) {
      if (!THEME_CHOICES.includes(next)) return;
      choice = next;
      saveChoice(storage, choice);
      apply();
    },
    stop() {
      media?.removeEventListener?.('change', onComputerChange);
    },
  };
}
