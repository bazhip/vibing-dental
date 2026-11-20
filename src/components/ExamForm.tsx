import { SectionHeader } from './SectionHeader';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExamFindings, ExamFinding, EXAM_ITEMS, CustomExamValue } from '../types';
import { isNativeApp } from '../native/platform';
import { FormGroup } from '../ios/Form';
import { MAX_EXAM_COMMENT } from '../utils/customExam';
import { EXAM_DIAGNOSTICS_ID, isBuiltInExamArea, isCustomExamText, type ExamLayoutField } from '../utils/examLayout';
import { RefineTextAction } from './RefineTextAction';

const NORMAL = 'normal' as const;
const ABNORMAL = 'abnormal' as const;

interface ExamFormProps {
  exam: ExamFindings;
  layout?: ExamLayoutField[];
  diagnostics?: string;
  onDiagnosticsChange?: (value: string) => void;
  /** Hidden blank rows; answered rows remain visible to protect charted findings. */
  hiddenAreas?: string[];
  onStatusChange: (key: keyof ExamFindings, value: ExamFinding) => void;
  onCommentChange: (key: keyof ExamFindings, value: string) => void;
  /** Values entered on the chart for custom areas and text fields. */
  customRows?: CustomExamValue[];
  /** Answer one custom area (the row carries its label). */
  onCustomChange?: (row: CustomExamValue, patch: Partial<Pick<CustomExamValue, 'status' | 'comment'>>) => void;
  readOnly?: boolean;
  /** Open this page's settings (Customize in the header). */
  onCustomize?: () => void;
}

/** One exam row, built-in or custom, as both layouts render it. */
interface Row {
  kind: 'area';
  id: string;
  label: string;
  /** The area name in running text (the placeholder). */
  inline: string;
  status: ExamFinding;
  retained?: boolean;
  comment: string;
  setStatus: (value: ExamFinding) => void;
  setComment: (value: string) => void;
}

interface TextRow {
  kind: 'text';
  id: string;
  label: string;
  value: string;
  setValue?: (value: string) => void;
}

/** One-line-looking comment box that grows to show everything typed (or
 *  dictated) — a plain input cut long findings off, especially on phones.
 *  Enter doesn't add a newline: findings stay one line on the PDF. */
const CommentBox: React.FC<{
  label: string;
  /** The area name in running text (lower-case in English). */
  inline: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}> = ({ label, inline, value, onChange, readOnly }) => {
  const { t } = useTranslation('forms');
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, []);
  React.useLayoutEffect(fit, [value, fit]);
  // Width changes (rotation, sidebar) change how many lines it needs.
  React.useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="patient-form__input exam-table__comment"
      aria-label={t('exam.ariaComment', { label })}
      placeholder={t('exam.placeholder', { label: inline })}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
    />
  );
};

export const ExamForm: React.FC<ExamFormProps> = ({
  exam,
  layout,
  diagnostics = '',
  onDiagnosticsChange,
  hiddenAreas = [],
  onStatusChange,
  onCommentChange,
  customRows = [],
  onCustomChange,
  onCustomize,
  readOnly = false,
}) => {
  const { t } = useTranslation(['forms', 'visitDocumentation']);
  const textId = React.useId();
  const areas = new Map(customRows.map(row => [row.id, row]));
  const answerPresent = (row?: { status: ExamFinding; comment: string }) => !!(row?.status || row?.comment.trim());
  const hasDiagnostics = !!onDiagnosticsChange || !!diagnostics;
  const visible: ExamLayoutField[] = layout ?? [
    ...EXAM_ITEMS.filter(({ key }) => !hiddenAreas.includes(key)).map(({ key: id }) => ({ id, kind: 'area' as const })),
    ...customRows.filter(row => !hiddenAreas.includes(row.id)).map(({ id, label }) => (
      { id, label, kind: isCustomExamText(id) ? 'text' as const : 'area' as const }
    )),
    ...(hasDiagnostics ? [{ id: EXAM_DIAGNOSTICS_ID, kind: 'text' as const }] : []),
  ];
  const ids = new Set(visible.map(field => field.id));
  const retainedFields: ExamLayoutField[] = [
    ...EXAM_ITEMS.filter(({ key }) => !ids.has(key) && answerPresent(exam[key])).map(({ key: id }) => ({ id, kind: 'area' as const })),
    ...customRows.filter(row => !ids.has(row.id) && answerPresent(row)).map(({ id, label }) => (
      { id, label, kind: isCustomExamText(id) ? 'text' as const : 'area' as const }
    )),
    ...(diagnostics.trim() && !ids.has(EXAM_DIAGNOSTICS_ID) ? [{ id: EXAM_DIAGNOSTICS_ID, kind: 'text' as const }] : []),
  ];
  const fields = [...visible, ...retainedFields];
  if (!layout) {
    const order = [...EXAM_ITEMS.map(({ key }) => key), ...customRows.map(row => row.id), EXAM_DIAGNOSTICS_ID];
    fields.sort((first, second) => order.indexOf(first.id) - order.indexOf(second.id));
  }
  const rows = fields.flatMap(({ id, kind, label }): (Row | TextRow)[] => {
    const retained = !!layout && !ids.has(id);
    if (id === EXAM_DIAGNOSTICS_ID) return hasDiagnostics ? [{
      kind: 'text', id,
      label: label ?? t('visitDocumentation:fields.gpDiagnostics.label'),
      value: diagnostics, setValue: onDiagnosticsChange,
    }] : [];
    if (isBuiltInExamArea(id)) return [{
      kind: 'area', id, label: label ?? t(`exam.items.${id}`), inline: label ?? t(`exam.itemsInline.${id}`),
      ...exam[id], retained, setStatus: value => onStatusChange(id, value), setComment: value => onCommentChange(id, value),
    }];
    if (!label || !onCustomChange) return [];
    const answer = areas.get(id);
    const row = { id, label, status: answer?.status ?? '', comment: answer?.comment ?? '' };
    const setComment = (comment: string) => onCustomChange(row, { comment });
    if (kind === 'text') return [{ kind: 'text', id, label, value: row.comment, setValue: setComment }];
    return [{
      kind: 'area', ...row, inline: label, retained, setComment,
      setStatus: status => onCustomChange(row, { status }),
    }];
  });
  const scored = rows.filter((row): row is Row => row.kind === 'area' && !row.retained);
  const unanswered = scored.filter(row => !row.status);
  const groups: (Row[] | TextRow)[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (row.kind === 'text') groups.push(row);
    else if (Array.isArray(last)) last.push(row);
    else groups.push([row]);
  }
  const textField = (row: TextRow) => {
    const id = `${textId}-${row.id}`;
    const diagnosticsField = row.id === EXAM_DIAGNOSTICS_ID;
    const maxLength = diagnosticsField ? 20000 : MAX_EXAM_COMMENT;
    return (
      <div className="patient-form visit-documentation__field dental-exam__diagnostics" key={row.id}>
        <label className="patient-form__label" htmlFor={id} dir="auto">{row.label}</label>
        {diagnosticsField && <p className="visit-documentation__helper" id={`${id}-help`}>{t('visitDocumentation:fields.gpDiagnostics.helper')}</p>}
        <div className="refine-field">
          <textarea id={id} className="patient-form__textarea" rows={3} maxLength={maxLength}
            aria-describedby={diagnosticsField ? `${id}-help` : undefined} value={row.value} readOnly={readOnly || !row.setValue}
            onChange={event => row.setValue?.(event.target.value)} />
          {diagnosticsField && row.setValue && <RefineTextAction value={row.value} readOnly={readOnly}
            maxLength={maxLength} onApply={row.setValue} />}
        </div>
      </div>
    );
  };
  const showComment = (row: Row) => row.status === 'abnormal' || (row.retained && !!row.comment.trim());
  const header = (
    <SectionHeader title={t('exam.title')} onCustomize={onCustomize} customizeTitle={t(layout ? 'exam.layout.title' : 'exam.customizeTitle')}
      actions={!readOnly && unanswered.length > 0 && (
        <button
          type="button"
          className="diagram-view__action"
          // One custom answer per row: each call reads the chart's latest list.
          onClick={() => unanswered.forEach((r) => r.setStatus('normal'))}
          title={t('exam.markTitle')}
        >
          {unanswered.length === scored.length ? t('exam.markAllNormal') : t('exam.markRestNormal')}
        </button>
      )} />
  );

  // The iOS app: one row per area with a Normal / Abnormal segmented
  // control (the same radios — tapping the chosen answer clears it), and
  // the comment on its own row under an abnormal area.
  const nativeAreaGroup = (group: Row[]) => (
    <FormGroup key={group[0].id}>
      {group.map((item) => {
        const { label } = item;
        const groupName = `exam-${item.id}`;
        const answer = (value: 'normal' | 'abnormal') => (
          <label className={`ios-segmented__segment${item.status === value ? ' ios-segmented__segment--selected' : ''}${value === 'abnormal' ? ' ios-segmented__segment--abnormal' : ''}`}>
            <input
              type="radio"
              disabled={readOnly}
              className="ios-segmented__input"
              name={groupName}
              checked={item.status === value}
              onChange={() => item.setStatus(value)}
              onClick={() => { if (item.status === value) item.setStatus(''); }}
              aria-label={value === 'normal' ? t('exam.ariaNormal', { label }) : t('exam.ariaAbnormal', { label })}
            />
            {value === 'normal' ? t('exam.normal') : t('exam.abnormal')}
          </label>
        );
        return (
          <React.Fragment key={item.id}>
            <div className={`ios-field exam-ios__row${item.status === 'abnormal' ? ' exam-ios__row--abnormal' : ''}`}>
              <span className="ios-field__label">{label}</span>
              <span className="ios-field__control">
                <span className="ios-segmented" role="radiogroup" aria-label={label}>
                  {answer(NORMAL)}
                  {answer(ABNORMAL)}
                </span>
              </span>
            </div>
            {showComment(item) && (
              <div className="ios-field ios-field--stacked ios-field--bare exam-ios__comment">
                <CommentBox label={label} inline={item.inline} value={item.comment} onChange={item.setComment} readOnly={readOnly} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </FormGroup>
  );

  const webAreaGroup = (group: Row[]) => (
    <table className="exam-table" key={group[0].id}>
      <thead>
        <tr>
          <th></th>
          <th>{t('exam.normal')}</th>
          <th>{t('exam.abnormal')}</th>
          <th className="exam-table__comment-col">{t('exam.comment')}</th>
        </tr>
      </thead>
      <tbody>
        {group.map((item) => {
          const { label } = item;
          const groupName = `exam-${item.id}`;
          return (
            <tr
              key={item.id}
              className={item.status === 'abnormal' ? 'exam-table__row--abnormal' : undefined}
            >
              <td className="anesthesia-table__label">{label}</td>
              {/* The whole cell is the hit area — this gets used with
                  gloves on; a bare 13px radio is not a target. */}
              <td className="exam-table__radio">
                <label className="exam-table__radio-hit">
                  <input
                    type="radio"
                    disabled={readOnly}
                    name={groupName}
                    checked={item.status === 'normal'}
                    onChange={() => item.setStatus('normal')}
                    // Tapping the selected answer again clears it.
                    onClick={() => { if (item.status === 'normal') item.setStatus(''); }}
                    aria-label={t('exam.ariaNormal', { label })}
                  />
                </label>
              </td>
              <td className="exam-table__radio">
                <label className="exam-table__radio-hit">
                  <input
                    type="radio"
                    disabled={readOnly}
                    name={groupName}
                    checked={item.status === 'abnormal'}
                    onChange={() => item.setStatus('abnormal')}
                    onClick={() => { if (item.status === 'abnormal') item.setStatus(''); }}
                    aria-label={t('exam.ariaAbnormal', { label })}
                  />
                </label>
              </td>
              <td className="exam-table__comment-col">
                {showComment(item) && (
                  <CommentBox
                    label={label}
                    inline={item.inline}
                    value={item.comment}
                    onChange={item.setComment}
                    readOnly={readOnly}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const native = isNativeApp();
  const areaGroup = native ? nativeAreaGroup : webAreaGroup;
  return (
    <div className={native ? 'dental-grid-section exam-ios' : 'dental-grid-section'}>
      {header}
      {layout && rows.length === 0 && <p className="chart-settings__note" role="status">{t('exam.layout.empty')}</p>}
      {groups.map(group => Array.isArray(group) ? areaGroup(group) : textField(group))}
    </div>
  );
};
