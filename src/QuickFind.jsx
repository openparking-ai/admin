import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildIndex, pageOf, search } from './search.js';
import Icon from './Icon.jsx';
import { FieldAbout } from './FieldName.jsx';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/**
 * The search pill in the frame, and the finder it opens. Opened by a click or
 * by Cmd/Ctrl+K from anywhere; arrow keys move, Enter goes, Escape closes.
 */
export default function QuickFind({ language, t, actions }) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    setOpen(false);
    pillRef.current?.focus();
  };

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className="find-pill"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="search" />
        <span className="find-pill-text">{t('quickFind.pill')}</span>
        <kbd className="find-kbd">{t(isMac() ? 'quickFind.shortcutMac' : 'quickFind.shortcutOther')}</kbd>
      </button>
      {open ? <Finder language={language} t={t} actions={actions} onClose={close} /> : null}
    </>
  );
}

function Finder({ language, t, actions, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const index = useMemo(() => buildIndex(language), [language]);
  const results = useMemo(() => search(index, query), [index, query]);
  const pages = results.filter((r) => r.kind === 'page');
  const settings = results.filter((r) => r.kind === 'feature');
  const ordered = [...pages, ...settings];

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [query, language]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item) => {
    if (!item) return;
    if (item.kind === 'page') actions.go(item.page);
    else if (item.action.page) actions.go(pageOf(item));
    else if (item.action.theme) actions.theme(item.action.theme);
    else if (item.action.language) actions.language(item.action.language);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (ordered.length ? (i + 1) % ordered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (ordered.length ? (i - 1 + ordered.length) % ordered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(ordered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const optionId = (i) => `${listId}-${i}`;
  const group = (heading, items, offset) =>
    items.length ? (
      <li role="presentation" className="find-group">
        <div className="find-group-heading" aria-hidden="true">
          {heading}
        </div>
        <ul role="group" aria-label={heading}>
          {items.map((item, j) => {
            const i = offset + j;
            return (
              <li
                key={`${item.kind}:${item.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className="find-option"
                data-kind={item.kind}
                data-id={item.id}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item)}
              >
                <Icon name={item.kind === 'page' ? item.page.icon : item.action.page ? pageOf(item).icon : item.id === 'en' || item.id === 'es' ? 'arrow' : item.id} />
                <span>{item.title}</span>
              </li>
            );
          })}
        </ul>
      </li>
    ) : null;

  return (
    <div className="find-backdrop" onMouseDown={onClose}>
      <div
        className="find-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('quickFind.label')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="find-input-row">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="find-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={ordered.length ? optionId(active) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck="false"
            placeholder={t('quickFind.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <p className="find-about">
          <FieldAbout t={t} name="quickFind.label" />
        </p>
        {ordered.length ? (
          <ul ref={listRef} id={listId} role="listbox" aria-label={t('quickFind.label')} className="find-results">
            {group(t('quickFind.groupPages'), pages, 0)}
            {group(t('quickFind.groupSettings'), settings, pages.length)}
          </ul>
        ) : (
          <p className="find-nothing" role="status">
            {t('quickFind.nothing', { typed: query.trim() })}
          </p>
        )}
        <p className="find-hint" aria-hidden="true">
          {t('quickFind.hint')}
        </p>
      </div>
    </div>
  );
}
