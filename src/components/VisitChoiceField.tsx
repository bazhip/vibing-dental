import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteChoiceInputType } from '../utils/consultationTemplates';
import { VISIT_DOCUMENT_MAX_LENGTH } from '../utils/visitDocumentation';
import './VisitChoiceField.css';

interface VisitChoiceFieldProps {
  id: string;
  labelId?: string;
  describedBy?: string;
  options: readonly string[];
  type: NoteChoiceInputType;
  value: string;
  readOnly?: boolean;
  onChange: (next: string) => void;
}

export function VisitChoiceField({
  id, labelId = `${id}-label`, describedBy, options, type, value, readOnly, onChange,
}: VisitChoiceFieldProps) {
  const { t, i18n } = useTranslation('visitDocumentation');
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const single = type === 'radio' || type === 'dropdown';
  const compact = type === 'multiselectDropdown';
  const lines = value ? value.split(/\r\n|\n|\r/u) : [];
  const recordedText = single
    ? !!value && !options.includes(value)
    : lines.some(line => !options.includes(line));
  const selectionDisabled = readOnly || (single && recordedText);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const searchText = query.trim().toLocaleLowerCase(language);
  const visibleOptions = compact && searchText
    ? options.filter(option => option.toLocaleLowerCase(language).includes(searchText))
    : options;
  const selected = compact ? options.filter(option => lines.includes(option)) : [];
  const summary = compact && (selected.length > 1
    ? t('consultation.templates.builder.selectedOptions', { count: selected.length })
    : selected[0] ?? t('consultation.templates.builder.chooseOptions'));

  useEffect(() => {
    if (expanded) search.current?.focus();
  }, [expanded]);

  const close = () => {
    setExpanded(false);
    setQuery('');
    toggle.current?.focus();
  };

  const choiceList = <fieldset className="visit-choice__options" disabled={selectionDisabled}
    aria-labelledby={labelId} aria-describedby={describedBy}>
    {visibleOptions.map(option => {
      const checked = single ? value === option : lines.includes(option);
      const next = single ? option : checked
        ? lines.filter(line => line !== option).join('\n')
        : [value, option].filter(Boolean).join('\n');
      return <label className="choice-row visit-choice__option" key={option}>
        <input type={single ? 'radio' : 'checkbox'} name={id} checked={checked}
          disabled={next.length > VISIT_DOCUMENT_MAX_LENGTH}
          onChange={() => { if (!selectionDisabled && next.length <= VISIT_DOCUMENT_MAX_LENGTH) onChange(next); }} />
        <span dir="auto">{option}</span>
      </label>;
    })}
  </fieldset>;

  return <>
    {type === 'dropdown' ? (
      <select id={id} className="patient-form__input visit-choice__control"
        dir="auto" value={recordedText ? '' : value} disabled={selectionDisabled}
        aria-labelledby={labelId} aria-describedby={describedBy} onChange={event => {
          const next = event.target.value;
          if (!selectionDisabled && (!next || options.includes(next))) onChange(next);
        }}>
        <option value="">{t('consultation.templates.builder.chooseOption')}</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : compact ? (
      <div className="visit-choice__disclosure" onKeyDown={event => {
        if (expanded && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}>
        <button ref={toggle} id={id} className="patient-form__input visit-choice__control visit-choice__toggle"
          type="button" aria-labelledby={`${labelId} ${id}-summary`} aria-describedby={describedBy}
          aria-expanded={expanded} aria-controls={`${id}-choices`}
          onClick={() => { if (expanded) close(); else setExpanded(true); }}>
          <span id={`${id}-summary`} dir="auto">{summary}</span>
        </button>
        <div id={`${id}-choices`} className="visit-choice__panel" hidden={!expanded}>
          {expanded && <>
            <input ref={search} type="search" className="patient-form__input visit-choice__control" dir="auto"
              aria-label={t('consultation.templates.builder.searchOptions')}
              placeholder={t('consultation.templates.builder.searchOptions')}
              value={query} onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
            {visibleOptions.length ? choiceList : <p className="visit-choice__empty" role="status">
              {t('consultation.templates.builder.noMatchingOptions')}
            </p>}
          </>}
        </div>
      </div>
    ) : choiceList}
    {recordedText && <div className="visit-choice__recorded-text">
      <label htmlFor={`${id}-recorded`} id={`${id}-recorded-label`} className="patient-form__label">{t('consultation.templates.builder.recordedText')}</label>
      <textarea id={`${id}-recorded`} className="patient-form__textarea" rows={3} dir="auto"
        value={value} maxLength={VISIT_DOCUMENT_MAX_LENGTH} readOnly={readOnly}
        aria-labelledby={`${labelId} ${id}-recorded-label`}
        aria-describedby={single && !readOnly ? `${id}-recorded-help` : undefined}
        onChange={event => { if (!readOnly) onChange(event.target.value); }} />
      {single && !readOnly && <p className="visit-choice__empty" id={`${id}-recorded-help`}>
        {t('consultation.templates.builder.choiceLegacyHelp')}
      </p>}
    </div>}
    {type === 'radio' && !readOnly && !!value && !recordedText &&
      <button type="button" className="diagram-view__action" onClick={() => onChange('')}>
        {t('consultation.templates.builder.clearSelection')}
      </button>}
  </>;
}
