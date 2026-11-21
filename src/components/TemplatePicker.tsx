import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import './TemplatePicker.css';

interface TemplateChoice {
  id: string;
  label: string;
  note?: string;
}

interface Props {
  label: string;
  choices?: TemplateChoice[];
  activeId?: string;
  onSelect?: (id: string) => void;
  disabled?: boolean;
  status?: ReactNode;
  actions?: ReactNode;
  help?: { label: string; href: string };
  embedded?: boolean;
}

export function TemplatePicker({
  label, choices = [], activeId, onSelect, disabled, status, actions, help, embedded,
}: Props) {
  const labelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollable = choices.length > 6;
  useLayoutEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector('[aria-pressed="true"]');
    if (!list || !selected) return;
    const viewport = list.getBoundingClientRect();
    const button = selected.getBoundingClientRect();
    if (button.top < viewport.top) list.scrollTop += button.top - viewport.top - 4;
    else if (button.bottom > viewport.bottom) list.scrollTop += button.bottom - viewport.bottom + 4;
  }, [activeId, scrollable]);
  const active = choices.find(choice => choice.id === activeId);
  return (
    <div className={embedded ? 'template-picker template-picker--embedded' : 'template-picker'} role="group" aria-labelledby={labelId}>
      <div className="template-picker__heading">
        <span id={labelId} className="patient-form__label">{label}</span>
        {help && <a className="template-help" href={help.href} target="_blank" rel="noopener noreferrer"
          aria-label={help.label} title={help.label}><span aria-hidden="true">?</span></a>}
      </div>
      <div className="template-picker__selection">
        {status ?? (onSelect ? (
          <div ref={scrollable ? listRef : undefined} className={scrollable ? 'template-picker__choices template-picker__choices--scroll' : 'template-picker__choices'}>
            {choices.map(({ id, label, note }) => (
              <button key={id} type="button" className="diagram-view__action template-picker__choice"
                aria-pressed={activeId === id} disabled={disabled} onClick={() => { if (activeId !== id) onSelect(id); }}>
                <span dir="auto">{label}</span>
                {note && <span className="template-picker__note">{note}</span>}
              </button>
            ))}
          </div>
        ) : active && (
          <div className="template-picker__current"><span dir="auto">{active.label}</span>
            {active.note && <span className="template-picker__note">{active.note}</span>}
          </div>
        ))}
      </div>
      {actions && <div className="template-picker__actions">{actions}</div>}
    </div>
  );
}
