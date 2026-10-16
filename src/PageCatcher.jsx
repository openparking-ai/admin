import { Component } from 'react';
import { readLanguage, translate } from './i18n/index.js';

/**
 * The page-level catcher (OP-NODE-010): anything that goes wrong while the
 * screens are drawn says so in plain words, with a way to load the page
 * again -- never a blank screen. React keeps nothing of a tree that threw
 * while drawing, so without this one fault anywhere emptied the whole admin.
 * Nothing the owner was typing is saved by it; a save is only ever the
 * platform's answer to Confirm.
 *
 * It sits above the screens (src/main.jsx), so it speaks the language last
 * used on this computer, as the sign-in screen does (src/i18n/index.js).
 */
export default class PageCatcher extends Component {
  constructor(props) {
    super(props);
    this.state = { broke: false };
  }

  static getDerivedStateFromError() {
    return { broke: true };
  }

  render() {
    if (!this.state.broke) return this.props.children;
    const language = readLanguage(this.props.storage);
    const t = (key) => translate(language, key);
    return (
      <main className="content" id="content" lang={language}>
        <div className="problem-note" role="alert" data-problem="pageBroke">
          <p>{t('problem.unexpected')}</p>
          <button type="button" className="link-button" data-action="load-again" onClick={() => window.location.reload()}>
            {t('retry')}
          </button>
        </div>
      </main>
    );
  }
}
