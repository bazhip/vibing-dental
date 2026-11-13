import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { WHATS_NEW } from '../constants/whatsNew';

/** The one-time "What's new" announcement (also reopenable from the
 *  Settings menu). Content lives in constants/whatsNew.ts and the whatsNew catalog. */
export const WhatsNewModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // Content is read through WHATS_NEW's getters; this re-renders on a language change.
  const { t } = useTranslation('whatsNew');
  const modalRef = useModalFocus<HTMLDivElement>(true);
  const backdrop = useBackdropDismiss(onClose);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div className="ai-settings-modal whats-new" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2 id="whats-new-title">{WHATS_NEW.title}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('actions.close', { ns: 'common' })}>×</button>
        </header>
        <div className="ai-settings-body whats-new__body">
          <p className="whats-new__intro">{WHATS_NEW.intro}</p>
          {WHATS_NEW.groups.map((g) => (
            <section key={g.id} className="whats-new__group">
              <h3 className="ai-settings-subhead">{g.heading}</h3>
              <ul className="whats-new__list">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <strong>{it.title}.</strong> {it.body}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="ai-settings-footer">
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onClose} autoFocus>
            {t('gotIt')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};
