import React from 'react';
import { toast, confirmDialog } from './ui/dialogs';
import { draftOwnerReport } from '../utils/ownerReportAi';
import { ChartSnapshot, OwnerReportOverrides } from '../types';
import {
  buildOwnerReportModel,
  placeholderValuesFor,
  templateForSnapshot,
  templateHomecareTips,
  templateIntro,
} from '../utils/ownerReport';
import type { OwnerReportContext } from '../utils/ownerReportConfig';
import { LOCALE_LABELS } from '../utils/ownerReportI18n';

interface OwnerReportSectionProps {
  /** Live chart snapshot — the generated report content derives from it. */
  snapshot: ChartSnapshot;
  overrides: OwnerReportOverrides;
  onOverrideChange: (field: keyof OwnerReportOverrides, value: string | null) => void;
  /** Open the report preview modal. */
  onPreview: () => void;
  /** Practice templates + branding for placeholders. Omitted = the
   *  built-in report. */
  context?: OwnerReportContext;
  /** View-only (saved visit not unlocked): Preview works, edits don't. */
  readOnly?: boolean;
  /** Offer "Write with AI" (signed-in accounts with AI). */
  aiEnabled?: boolean;
  /** Open the report templates editor ("Customize"). */
  onCustomize?: () => void;
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
  readOnly = false,
  context,
  aiEnabled = false,
  onCustomize,
}) => {
  const model = React.useMemo(() => buildOwnerReportModel(snapshot, context), [snapshot, context]);
  // Prefills follow the chosen template (its intro / tips / language).
  const template = templateForSnapshot(snapshot, context);
  const values = placeholderValuesFor(snapshot, context, template);
  const introDefault = templateIntro(snapshot, template, values);
  const homecareDefault = templateHomecareTips(template, values).join('\n');
  const templates = context?.config?.templates ?? [];
  const defaultTemplateId = context?.config?.defaultTemplateId;
  const chosenKnown = !!overrides.templateId && templates.some((t) => t.id === overrides.templateId);

  // '' is a deliberate customization ("print nothing here"), so edited
  // state is tracked by presence, not truthiness.
  const introEdited = overrides.intro !== undefined;
  const homecareEdited = overrides.homecare !== undefined;

  // "Write with AI": drafts the summary and home-care tips from the chart
  // into the same editable fields. Hand edits are only replaced after a
  // confirm, and the toast offers the previous text back.
  const [drafting, setDrafting] = React.useState(false);
  const writeWithAi = async () => {
    if (drafting) return;
    if ((introEdited || homecareEdited) && !(await confirmDialog({
      title: 'Replace your edited text?',
      message: 'The AI draft replaces the opening summary and home care advice you edited. You can undo right after.',
      confirmLabel: 'Write with AI',
    }))) return;
    setDrafting(true);
    try {
      const draft = await draftOwnerReport(snapshot, context);
      const before = { intro: overrides.intro ?? null, homecare: overrides.homecare ?? null };
      if (draft.intro) onOverrideChange('intro', draft.intro);
      if (draft.homecare) onOverrideChange('homecare', draft.homecare);
      toast('Draft written — please read it over before printing.', {
        kind: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            onOverrideChange('intro', before.intro);
            onOverrideChange('homecare', before.homecare);
          },
        },
      });
    } catch (err) {
      toast(`Couldn’t write the draft. ${err instanceof Error ? err.message : ''}`.trim(), { kind: 'error' });
    } finally {
      setDrafting(false);
    }
  };

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
          <button
            type="button"
            className="diagram-view__action owner-report__reset"
            onClick={() => {
              // Undoable rather than a blocking confirm: reset, then offer
              // the wording back for a few seconds.
              const previous = value;
              onReset();
              toast(`${label} reset to the generated text.`, {
                kind: 'success',
                action: { label: 'Undo', onClick: () => onChange(previous) },
              });
            }}
          >
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
        <div className="owner-report__actions">
          {onCustomize && (
            <button type="button" className="diagram-view__action" onClick={onCustomize} title="Change the report's layout, wording, language and sections">
              Customize
            </button>
          )}
          {aiEnabled && !readOnly && (
            <button
              type="button"
              className="diagram-view__action owner-report__ai"
              onClick={writeWithAi}
              disabled={drafting}
              title="Draft the opening summary and home care advice from this chart — you review before printing"
            >
              {drafting ? 'Writing…' : '✨ Write with AI'}
            </button>
          )}
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onPreview}>
            Preview owner report
          </button>
        </div>
      </div>

      <p className="patient-form__hint">
        A plain-English take-home version of this chart. The findings below
        are generated automatically as you chart; the text blocks are
        prefilled and editable, so you can put it together properly before
        printing. Tag photos as Before/After in the Images section to
        include them.
      </p>

      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
      {templates.length > 1 && (
        <label className="patient-form__label owner-report__block">
          Report template
          <select
            className="patient-form__input"
            value={chosenKnown ? overrides.templateId : ''}
            onChange={(e) => onOverrideChange('templateId', e.target.value || null)}
          >
            <option value="">
              Practice default ({templates.find((t) => t.id === defaultTemplateId)?.name ?? templates[0].name})
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.language !== 'en' ? ` · ${LOCALE_LABELS[t.language]}` : ''}
              </option>
            ))}
          </select>
          <span className="patient-form__hint">
            Sets the layout, language, and default wording. Practice owners
            manage templates in Practice settings.
          </span>
        </label>
      )}

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
      </fieldset>
    </div>
  );
};
