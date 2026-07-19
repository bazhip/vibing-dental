import React from 'react';
import { ChartSnapshot, OwnerReportOverrides } from '../types';
import {
  buildOwnerReportModel,
  generatedIntro,
  DEFAULT_HOMECARE_TIPS,
} from '../utils/ownerReport';

interface OwnerReportSectionProps {
  /** Live chart snapshot — the generated report content derives from it. */
  snapshot: ChartSnapshot;
  overrides: OwnerReportOverrides;
  onOverrideChange: (field: keyof OwnerReportOverrides, value: string | null) => void;
  /** Open the report preview modal. */
  onPreview: () => void;
}

/**
 * The owner report's editing surface. Everything is generated from the
 * chart and prefilled; the three text blocks can be hand-tuned before
 * printing, and the findings list previews exactly what will appear so
 * the team can sanity-check the translation. Lives after the Treatment
 * Report section; only rendered when the practice's flag is on.
 */
export const OwnerReportSection: React.FC<OwnerReportSectionProps> = ({
  snapshot,
  overrides,
  onOverrideChange,
  onPreview,
}) => {
  const model = React.useMemo(() => buildOwnerReportModel(snapshot), [snapshot]);
  const introDefault = generatedIntro(snapshot.patientInfo.patientName);
  const homecareDefault = DEFAULT_HOMECARE_TIPS.join('\n');

  // '' is a deliberate customization ("print nothing here"), so edited
  // state is tracked by presence, not truthiness.
  const introEdited = overrides.intro !== undefined;
  const homecareEdited = overrides.homecare !== undefined;

  const block = (
    label: string,
    hint: string,
    value: string,
    edited: boolean,
    rows: number,
    onChange: (value: string) => void,
    onReset?: () => void
  ) => (
    <label className="patient-form__label owner-report__block">
      <span className="owner-report__block-head">
        {label}
        {onReset && edited && (
          <button type="button" className="diagram-view__action owner-report__reset" onClick={onReset}>
            Reset to generated
          </button>
        )}
      </span>
      <textarea
        className="patient-form__input owner-report__textarea"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="patient-form__hint">{hint}</span>
    </label>
  );

  return (
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">Owner Report</h2>
        <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onPreview}>
          Preview owner report
        </button>
      </div>

      <p className="patient-form__hint">
        A plain-English take-home version of this chart. The findings below
        are generated automatically as you chart; the text blocks are
        prefilled and editable, so you can put it together properly before
        printing. Tag photos as Before/After in the Images section to
        include them.
      </p>

      {block(
        'Opening summary',
        'Prints under the header, before the findings.',
        overrides.intro ?? introDefault,
        introEdited,
        3,
        (value) => onOverrideChange('intro', value),
        () => onOverrideChange('intro', null)
      )}

      {block(
        'A note from your veterinary team (optional)',
        'Printed as its own section — anything specific to this patient.',
        overrides.extraNotes ?? '',
        false,
        3,
        (value) => onOverrideChange('extraNotes', value.trim() === '' ? null : value)
      )}

      {block(
        'Home care advice',
        'One tip per line — each prints as a bullet.',
        overrides.homecare ?? homecareDefault,
        homecareEdited,
        4,
        (value) => onOverrideChange('homecare', value),
        () => onOverrideChange('homecare', null)
      )}

      <div className="owner-report__preview">
        <h3 className="ai-settings-subhead">What will print (generated from the chart)</h3>
        {model.extracted.length > 0 && (
          <p className="owner-report__preview-line">
            <strong>Removed this visit:</strong> {model.extracted.join(', ')}
          </p>
        )}
        {model.teeth.filter((t) => t.notes.length > 0).length > 0 ? (
          <ul className="owner-report__preview-list">
            {model.teeth.filter((t) => t.notes.length > 0).map((tooth) => (
              <li key={tooth.triadan}>
                <strong>{tooth.layName}</strong>
                {tooth.extracted ? ' — removed today' : ''}: {tooth.notes.join('; ')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="owner-report__preview-line">
            No per-tooth findings recorded yet — the report will say so (in a
            good way).
          </p>
        )}
        {model.examNotes.length > 0 && (
          <p className="owner-report__preview-line">
            <strong>Exam notes:</strong>{' '}
            {model.examNotes.map((n) => `${n.area}${n.comment ? ` (${n.comment})` : ''}`).join(' · ')}
          </p>
        )}
        {model.recallDate && (
          <p className="owner-report__preview-line">
            <strong>Recommended recheck:</strong> {model.recallDate}
          </p>
        )}
      </div>
    </div>
  );
};
