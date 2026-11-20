import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import type { VisitType } from '../utils/visitTypes';
import './VisitTypeChooser.css';

const VISIT_TYPES = ['dental', 'consultation'] as const satisfies readonly VisitType[];

export function VisitTypeChooser({ open, onChoose }: { open: boolean; onChoose: (type: VisitType | null) => void }) {
  const { t } = useTranslation(['app', 'common']);
  const id = useId();
  const native = isNativeApp();
  const [selected, setSelected] = useState<VisitType>('dental');
  const focus = useModalFocus(open && !native);
  const cancel = () => onChoose(null);
  const backdrop = useBackdropDismiss(cancel);
  const title = t('visitTypes.choose');

  const choices = (
    <div role="radiogroup" aria-label={title} className="visit-type-chooser__choices">
      {VISIT_TYPES.map(type => (
        <label className="visit-type-chooser__option" key={type}>
          <input type="radio" name={id} checked={selected === type} onChange={() => setSelected(type)} />
          <span>
            <strong>{t(`visitTypes.${type}` as const)}</strong>
            <span className="visit-type-chooser__description">{t(`visitTypes.${type}Description` as const)}</span>
          </span>
        </label>
      ))}
    </div>
  );
  if (native) return <Sheet open={open} title={title} onClose={cancel}
    onDone={() => onChoose(selected)} doneLabel={t('visitTypes.start')} cancelLabel={t('common:actions.cancel')}>
    <div className="visit-type-chooser--native">{choices}</div>
  </Sheet>;

  if (!open) return null;
  return createPortal(
    <div className="ui-dialog-overlay" {...backdrop}>
      <div className="ui-dialog visit-type-chooser" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        ref={focus} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancel(); } }}>
        <h2 id={`${id}-title`} className="ui-dialog__title">{title}</h2>
        {choices}
        <div className="ui-dialog__actions">
          <button className="ui-btn ui-btn--secondary" type="button" onClick={cancel}>{t('common:actions.cancel')}</button>
          <button className="ui-btn ui-btn--primary" type="button" onClick={() => onChoose(selected)}>{t('visitTypes.start')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
