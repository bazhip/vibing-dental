import { SectionHeader } from './SectionHeader';
import { RefineTextAction } from './RefineTextAction';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog, friendlyDetail, toast } from './ui/dialogs';
import { ensureAiConsent } from '../native/aiConsent';
import { draftOwnerReport } from '../utils/ownerReportAi';
import { ChartSnapshot, OwnerReportOverrides } from '../types';
import {
  buildOwnerReportModel,
  hasSection,
  ownerReportChartWording,
  OWNER_REPORT_WORDING_LIMIT,
  ownerReportReviewBasis,
  placeholderValuesFor,
  templateForSnapshot,
  templateHomecareTips,
  templateIntro,
} from '../utils/ownerReport';
import { MAX_TEMPLATES, type OwnerReportContext } from '../utils/ownerReportConfig';

const NEW_OWNER_TEMPLATE = '__new_owner_template__';

type GeneratedField = 'extractionsText' | 'findingsText' | 'examNotesText';

interface OwnerReportSectionProps {
  /** Live chart snapshot — the generated report content derives from it. */
  snapshot: ChartSnapshot;
  chartId?: string | null;
  editorRef?: React.Ref<HTMLElement>;
  overrides: OwnerReportOverrides;
  onOverrideChange: (field: keyof OwnerReportOverrides, value: string | null) => void;
  /** Open the report preview modal. */
  onPreview: () => void;
  /** Practice templates + branding for placeholders. Omitted = the
   *  built-in report. */
  context?: OwnerReportContext;
  /** View-only (saved visit not unlocked): Preview works, edits don't. */
  readOnly?: boolean;
  /** Enable drafting and refinement. */
  aiEnabled?: boolean;
  /** Open the report templates editor ("Customize"). */
  onCustomize?: () => void;
  onNewTemplate?: () => void;
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
  chartId = '',
  editorRef,
  overrides,
  onOverrideChange,
  onPreview,
  readOnly = false,
  context,
  aiEnabled = false,
  onCustomize,
  onNewTemplate,
}) => {
  const { t } = useTranslation('reportui');
  const fieldPrefix = React.useId();
  const [expandedFields, setExpandedFields] = React.useState<Partial<Record<GeneratedField, boolean>>>({});
  const model = React.useMemo(() => buildOwnerReportModel(snapshot, context), [snapshot, context]);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reviewState = React.useRef({ snapshot, context, readOnly, chartId, aiEnabled });
  reviewState.current = { snapshot, context, readOnly, chartId, aiEnabled };
  const draftingLock = React.useRef(false);
  const [drafting, setDrafting] = React.useState(false);
  const canApply = (basis: string, forChart = chartId) => mounted.current && !reviewState.current.readOnly && reviewState.current.chartId === forChart && ownerReportReviewBasis(reviewState.current.snapshot, reviewState.current.context) === basis;
  const defaultWording = ownerReportChartWording(model);
  // Prefills follow the chosen template (its intro / tips / language).
  const template = templateForSnapshot(snapshot, context);
  const values = placeholderValuesFor(snapshot, context, template);
  const introDefault = model.generatedOpening ?? templateIntro(snapshot, template, values);
  const homecareDefault = overrides.generatedHomecare ?? templateHomecareTips(template, values, snapshot.species).join('\n');
  const templates = context?.config?.templates ?? [];
  const practiceTemplate = templates.find(tpl => tpl.id === context?.config?.defaultTemplateId) ?? templates[0] ?? template;
  const canCreateTemplate = !!onNewTemplate && templates.length < MAX_TEMPLATES;
  const chosenKnown = !!overrides.templateId && templates.some((tpl) => tpl.id === overrides.templateId);

  // '' is a deliberate customization ("print nothing here"), so edited
  // state is tracked by presence, not truthiness.
  const introEdited = overrides.intro !== undefined && overrides.intro !== introDefault;
  const homecareEdited = overrides.homecare !== undefined && overrides.homecare !== homecareDefault;

  const writeWithAi = async () => {
    if (draftingLock.current || readOnly || !aiEnabled) return;
    draftingLock.current = true;
    setDrafting(true);
    const basis = ownerReportReviewBasis(snapshot, context);
    const isCurrent = () => canApply(basis) && reviewState.current.aiEnabled;
    try {
      if ((introEdited || homecareEdited) && !(await confirmDialog({
        title: t('section.replaceTitle'),
        message: t('section.replaceMessage'),
        confirmLabel: t('section.writeWithAi'),
      }))) return;
      if (!isCurrent() || !(await ensureAiConsent()) || !isCurrent()) return;
      const draft = await draftOwnerReport(snapshot, context);
      if (!isCurrent()) return;

      const fields = ['generatedIntro', 'intro', 'generatedHomecare', 'homecare'] as const;
      const changes: Partial<Record<typeof fields[number], string | null>> = {};
      if (draft.intro) Object.assign(changes, { generatedIntro: draft.intro, intro: null });
      if (draft.homecare) Object.assign(changes, { generatedHomecare: draft.homecare, homecare: null });
      const changedFields = fields.filter(field => changes[field] !== undefined);
      const next = { ...snapshot.ownerReport };
      for (const field of changedFields) {
        const value = changes[field]!;
        if (value === null) delete next[field];
        else next[field] = value;
        onOverrideChange(field, value);
      }
      const appliedBasis = ownerReportReviewBasis({ ...snapshot, ownerReport: next }, context);
      toast(t('section.drafted'), {
        kind: 'success',
        action: {
          label: t('section.undo'),
          onClick: () => {
            if (!canApply(appliedBasis)) return;
            for (const field of changedFields) onOverrideChange(field, overrides[field] ?? null);
          },
        },
      });
    } catch (error) {
      if (isCurrent()) toast(t('section.draftFailed', { reason: friendlyDetail(error) }).trim(), { kind: 'error' });
    } finally {
      draftingLock.current = false;
      if (mounted.current) setDrafting(false);
    }
  };

  const block = (
    field: 'intro' | 'homecare' | 'extraNotes' | GeneratedField,
    label: string,
    hint: string,
    value: string,
    edited: boolean,
    rows: number,
    onChange: (value: string) => void,
    onReset?: () => void,
    onDone?: () => void,
    showRefine = true
  ) => {
    const tracksGeneratedDraft = field === 'intro' || field === 'homecare';
    const showRestore = !readOnly && (tracksGeneratedDraft || (onReset && edited));
    const missingDraft = tracksGeneratedDraft && !onReset;
    const showMissingDraft = !readOnly && edited && missingDraft;
    const missingDraftId = `${fieldPrefix}-${field}-missing-draft`;
    return (
      <div className="patient-form__label owner-report__block">
        <span className="owner-report__block-head">
          <label htmlFor={`${fieldPrefix}-${field}`}>{label}</label>
          <span className="owner-report__block-actions">
            {onDone && <button type="button" className="diagram-view__action" onClick={onDone}>{t('actions.done', { ns: 'common' })}</button>}
            {showRestore && (
              <button
                type="button"
                className="diagram-view__action"
                disabled={!onReset || !edited}
                title={missingDraft ? t('section.noSavedDraft') : undefined}
                aria-describedby={showMissingDraft ? missingDraftId : undefined}
                onClick={() => {
                  if (!onReset || !edited) return;
                  // Undoable rather than a blocking confirm: reset, then offer
                  // the wording back for a few seconds.
                  const previous = value;
                  const forChart = chartId;
                  const targetBasis = ownerReportReviewBasis({
                    ...snapshot, ownerReport: { ...snapshot.ownerReport, [field]: undefined },
                  }, context);
                  onReset();
                  toast(t('section.resetToast', { label }), {
                    kind: 'success',
                    action: { label: t('section.undo'), onClick: () => { if (canApply(targetBasis, forChart)) onChange(previous); } },
                  });
                }}
              >
                {t('section.reset')}
              </button>
            )}
          </span>
        </span>
        <div className="refine-field">
          <textarea
            id={`${fieldPrefix}-${field}`}
            aria-describedby={hint ? `${fieldPrefix}-${field}-hint` : undefined}
            className="patient-form__input owner-report__textarea"
            rows={rows}
            maxLength={OWNER_REPORT_WORDING_LIMIT}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
              {showRefine && <RefineTextAction value={value} onApply={onChange} readOnly={readOnly} enabled={aiEnabled}
                disabled={!edited}
                maxLength={OWNER_REPORT_WORDING_LIMIT} />}
        </div>
        {hint && <span className="patient-form__hint" id={`${fieldPrefix}-${field}-hint`}>{hint}</span>}
        {showMissingDraft && <span className="patient-form__hint" id={missingDraftId}>{t('section.noSavedDraft')}</span>}
      </div>
    );
  };

  const generatedBlock = (field: GeneratedField, label: string, generated: string, custom: string | undefined, rows: number) => {
    const change = (text: string) => onOverrideChange(field, text);
    const setExpanded = (value: boolean) => setExpandedFields(previous => ({ ...previous, [field]: value }));
    const text = custom ?? generated;
    if (!readOnly && expandedFields[field]) {
      return block(field, label, '', text, custom !== undefined, rows, change, () => {
        onOverrideChange(field, null);
        setExpanded(false);
      }, () => setExpanded(false), custom !== undefined);
    }
    return <div className="owner-report__generated">
      <div className="owner-report__block-head">
        <h4>{label}</h4>
        {!readOnly && <div className="owner-report__block-actions">
          {custom !== undefined && <button type="button" className="diagram-view__action"
            onClick={() => onOverrideChange(field, null)}>{t('section.reset')}</button>}
          <button type="button" className="diagram-view__action"
            aria-label={t('section.editGenerated', { label })} onClick={() => {
              setExpanded(true);
              requestAnimationFrame(() => document.getElementById(`${fieldPrefix}-${field}`)?.focus());
            }}>
            {t('actions.edit', { ns: 'common' })}
          </button>
        </div>}
      </div>
      <div className="refine-field">
        <div className="owner-report__generated-text">{text || t('section.noGeneratedText')}</div>
          {custom !== undefined && <RefineTextAction value={text} onApply={change} enabled={aiEnabled} maxLength={OWNER_REPORT_WORDING_LIMIT} />}
      </div>
    </div>;
  };

  const summaryBlock = block(
    'intro',
    t('section.summaryLabel'),
    t('section.summaryHint'),
    overrides.intro ?? introDefault,
    introEdited,
    3,
    (value) => onOverrideChange('intro', value),
    model.generatedOpening !== undefined ? () => onOverrideChange('intro', null) : undefined
  );

  const noteBlock = block(
    'extraNotes',
    t('section.noteLabel'),
    t('section.noteHint'),
    overrides.extraNotes ?? model.extraNotes,
    overrides.extraNotes !== undefined,
    3,
    (value) => onOverrideChange('extraNotes', value),
    () => onOverrideChange('extraNotes', null)
  );

  const homecareBlock = block(
    'homecare',
    t('section.homecareLabel'),
    t('section.homecareHint'),
    overrides.homecare ?? homecareDefault,
    homecareEdited,
    4,
    (value) => onOverrideChange('homecare', value),
    overrides.generatedHomecare !== undefined ? () => onOverrideChange('homecare', null) : undefined
  );

  const generatedSections = [
    { section: 'extractions', field: 'extractionsText', label: t('section.extractionsLabel'), text: defaultWording.extractions, rows: 3 },
    { section: 'findings', field: 'findingsText', label: t('section.findingsLabel'), text: defaultWording.findings, rows: 6 },
    { section: 'examNotes', field: 'examNotesText', label: t('section.examNotesLabel'), text: defaultWording.examNotes, rows: 3 },
  ] as const;
  const visibleSections = generatedSections.filter(({ section }) => hasSection(model, section));
  const showRecheck = hasSection(model, 'recheck') && !!model.recallDate;

  return (
    <section className="patient-form owner-report-editor" ref={editorRef} tabIndex={-1} aria-label={t('section.title')}>
      <SectionHeader title={t('section.title')} onCustomize={onCustomize} customizeTitle={t('section.customizeTitle')}
        titleAction={
          <button type="button" className="diagram-view__action" aria-haspopup="dialog" aria-label={t('section.previewButton')} onClick={onPreview}>
            {t('templates.previewShort')}
          </button>
        } />

      <fieldset className="sidebar-layout__fieldset" disabled={readOnly}>
        <div className="owner-report__template-bar">
          <label className="patient-form__label owner-report__template-picker">
            {t('section.templateLabel')}
            <select
              className="patient-form__input"
              value={templates.length > 1 && chosenKnown ? overrides.templateId : ''}
              disabled={templates.length <= 1 && !canCreateTemplate}
              onChange={(event) => {
                const value = event.target.value;
                if (value === NEW_OWNER_TEMPLATE) onNewTemplate?.();
                else onOverrideChange('templateId', value || null);
              }}
            >
              <option value="">{t('section.practiceDefault', { name: practiceTemplate.name || t('templates.untitled') })}</option>
              {templates.length > 1 && templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.language !== 'en'
                    ? t('section.templateOption', { name: tpl.name, language: t(`languages.${tpl.language}`) })
                    : tpl.name}
                </option>
              ))}
              {canCreateTemplate && <option value={NEW_OWNER_TEMPLATE}>{t('templates.newName')}</option>}
            </select>
          </label>
          {aiEnabled && !readOnly && (
            <button type="button" className="diagram-view__action owner-report__draft"
              title={t('section.writeTitle')} aria-label={t(drafting ? 'section.writing' : 'section.writeWithAi')} disabled={drafting} onClick={() => void writeWithAi()}>
              <span aria-hidden="true">✨</span>
              <span role="status">{t(drafting ? 'section.writing' : 'section.writeWithAi')}</span>
            </button>
          )}
        </div>

        <p className="patient-form__hint">{t('section.intro')}</p>

      {summaryBlock}

      {noteBlock}

      {homecareBlock}

      <section className="owner-report__preview" aria-labelledby={`${fieldPrefix}-report-findings`}>
        <h3 className="ai-settings-subhead" id={`${fieldPrefix}-report-findings`}>{t('section.printTitle')}</h3>
        <p className="patient-form__hint owner-report__generated-hint">{t('section.findingsHint')}</p>
        {visibleSections.map(({ field, label, text, rows }) => <React.Fragment key={field}>
          {generatedBlock(field, label, text, model[field], rows)}
        </React.Fragment>)}
        {showRecheck && (
          <p className="owner-report__preview-line">
            <strong>{t('section.recheck')}</strong> {model.recallDate}
          </p>
        )}
      </section>
      </fieldset>
    </section>
  );
};
