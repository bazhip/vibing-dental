import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useCompactPdfLayout } from './PdfStylePicker';
import './DocumentToolbar.css';

interface Props {
  actions: ReactNode;
  children: ReactNode;
  notice?: ReactNode;
  /** Undefined keeps the controls inline. Null hides them for an inactive tab. */
  controlsHost?: HTMLElement | null;
}

export function DocumentToolbar({ actions, children, notice, controlsHost }: Props) {
  const { t } = useTranslation('media');
  const compact = useCompactPdfLayout();
  const [choice, setChoice] = useState<boolean | null>(null);
  const expanded = choice ?? !compact;
  const id = useId();

  const controls = (
    <div className="document-toolbar__row">
      <button type="button" className="ui-btn ui-btn--secondary" aria-expanded={expanded} aria-controls={id}
        onClick={() => setChoice(!expanded)}>
        {t('documents.customize')} <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>
      <div className="document-toolbar__actions">{actions}</div>
    </div>
  );

  return (
    <div className={controlsHost === undefined ? 'document-toolbar' : 'document-toolbar document-toolbar--in-header'}>
      {controlsHost === undefined ? controls : controlsHost && createPortal(controls, controlsHost)}
      <div id={id} className="document-toolbar__settings" hidden={!expanded}>{children}</div>
      {notice && <div className="document-toolbar__notices">{notice}</div>}
    </div>
  );
}
