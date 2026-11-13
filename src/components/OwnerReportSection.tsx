import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast, confirmDialog } from './ui/dialogs';
import { detailText } from '../utils/apiErrors';
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
  const { t } = useTranslation('reportui');
  const model = React.useMemo(() => buildOwnerReportModel(snapshot, context), [snapshot, context]);
  // Prefills follow the chosen template (its intro / tips / language).
  const template = templateForSnapshot(snapshot, context);
  const values = placeholderValuesFor(snapshot, context, template);
  const introDefault = templateIntro(snapshot, template, values);
  const homecareDefault = templateHomecareTips(template, values).join('\n');
  const templates = context?.config?.templates ?? [];
  const defaultTemplateId = context?.config?.defaultTemplateId;
  const chosenKnown = !!overrides.templateId && templates.some((tpl) => tpl.id === overrides.templateId);

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
      title: t('section.replaceTitle'),
      message: t('section.replaceMessage'),
      confirmLabel: t('section.writeWithAi'),
    }))) return;
    setDrafting(true);
    try {
      const draft = await draftOwnerReport(snapshot, context);
      const before = { intro: overrides.intro ?? null, homecare: overrides.homecare ?? null };
      if (draft.intro) onOverrideChange('intro', draft.intro);
      if (draft.homecare) onOverrideChange('homecare', draft.homecare);
      toast(t('section.drafted'), {
        kind: 'success',
        action: {
          label: t('section.undo'),
          onClick: () => {
            onOverrideChange('intro', before.intro);
            onOverrideChange('homecare', before.homecare);
          },
        },
      });
    } catch (err) {
      toast(t('section.draftFailed', { reason: detailText(err) }).trim(), { kind: 'error' });
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
              toast(t('section.resetToast', { label }), {
                kind: 'success',
                action: { label: t('section.undo'), onClick: () => onChange(previous) },
              });
            }}
          >
            {t('section.reset')}
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

  const summaryBlock = block(
    t('section.summaryLabel'),
    t('section.summaryHint'),
    overrides.intro ?? introDefault,
    introEdited,
    3,
    (value) => onOverrideChange('intro', value),
    () => onOverrideChange('intro', null)
  );

  const noteBlock = block(
    t('section.noteLabel'),
    t('section.noteHint'),
    overrides.extraNotes ?? '',
    false,
    3,
    (value) => onOverrideChange('extraNotes', value.trim() === '' ? null : value)
  );

  const homecareBlock = block(
    t('section.homecareLabel'),
    t('section.homecareHint'),
    overrides.homecare ?? homecareDefault,
    homecareEdited,
    4,
    (value) => onOverrideChange('homecare', value),
    () => onOverrideChange('homecare', null)
  );

  return (
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">{t('section.title')}</h2>
        <div className="owner-report__actions">
          {onCustomize && (
            <button type="button" className="diagram-view__action" onClick={onCustomize} title={t('section.customizeTitle')}>
              {t('section.customize')}
            </button>
          )}
          {aiEnabled && !readOnly && (
            <button
              type="button"
              className="diagram-view__action owner-report__ai"
              onClick={writeWithAi}
              disabled={drafting}
              title={t('section.writeTitle')}
            >
              {drafting ? t('section.writing') : t('section.writeWithAi')}
            </button>
          )}
          <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={onPreview}>
            {t('section.previewButton')}
          </button>
        </div>
      </div>

      <p className="patient-form__hint">
        {t('section.intro')}
      </p>

      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
      {templates.length > 1 && (
        <label className="patient-form__label owner-report__block">
          {t('section.templateLabel')}
          <select
            className="patient-form__input"
            value={chosenKnown ? overrides.templateId : ''}
            onChange={(e) => onOverrideChange('templateId', e.target.value || null)}
          >
            <option value="">
              {t('section.practiceDefault', { name: (templates.find((tpl) => tpl.id === defaultTemplateId) ?? templates[0]).name })}
            </option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.language !== 'en'
                  ? t('section.templateOption', { name: tpl.name, language: t(`languages.${tpl.language}`) })
                  : tpl.name}
              </option>
            ))}
          </select>
          <span className="patient-form__hint">{t('section.templateHint')}</span>
        </label>
      )}

      {summaryBlock}

      {noteBlock}

      {homecareBlock}

      <div className="owner-report__preview">
        <h3 className="ai-settings-subhead">{t('section.printTitle')}</h3>
        {model.extracted.length > 0 && (
          <p className="owner-report__preview-line">
            <strong>{t('section.removedThisVisit')}</strong> {model.extracted.join(', ')}
          </p>
        )}
        {model.teeth.filter((tooth) => tooth.notes.length > 0).length > 0 ? (
          <ul className="owner-report__preview-list">
            {model.teeth.filter((tooth) => tooth.notes.length > 0).map((tooth) => (
              <li key={tooth.triadan}>
                <strong>{tooth.layName}</strong>
                {tooth.extracted && <>{' '}{t('section.removedToday')}</>}: {tooth.notes.join('; ')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="owner-report__preview-line">
            {t('section.noFindings')}
          </p>
        )}
        {model.examNotes.length > 0 && (
          <p className="owner-report__preview-line">
            <strong>{t('section.examNotes')}</strong>{' '}
            {model.examNotes.map((n) => `${n.area}${n.comment ? ` (${n.comment})` : ''}`).join(' · ')}
          </p>
        )}
        {model.recallDate && (
          <p className="owner-report__preview-line">
            <strong>{t('section.recheck')}</strong> {model.recallDate}
          </p>
        )}
      </div>
      </fieldset>
    </div>
  );
};
