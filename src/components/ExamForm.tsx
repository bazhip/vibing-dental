import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExamFindings, ExamFinding, EXAM_ITEMS, CustomExamValue } from '../types';
import { isNativeApp } from '../native/platform';
import { FormGroup } from '../ios/Form';

const NORMAL = 'normal' as const;
const ABNORMAL = 'abnormal' as const;

interface ExamFormProps {
  exam: ExamFindings;
  onStatusChange: (key: keyof ExamFindings, value: ExamFinding) => void;
  onCommentChange: (key: keyof ExamFindings, value: string) => void;
  /** The person's own areas, after the built-in ones (customExamRows). */
  customRows?: CustomExamValue[];
  /** Answer one custom area (the row carries its label). */
  onCustomChange?: (row: CustomExamValue, patch: Partial<Pick<CustomExamValue, 'status' | 'comment'>>) => void;
  /** Open this page's settings (Customize in the header). */
  onCustomize?: () => void;
}

/** One exam row, built-in or custom, as both layouts render it. */
interface Row {
  id: string;
  label: string;
  /** The area name in running text (the placeholder). */
  inline: string;
  status: ExamFinding;
  comment: string;
  setStatus: (value: ExamFinding) => void;
  setComment: (value: string) => void;
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
}> = ({ label, inline, value, onChange }) => {
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
      onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
    />
  );
};

export const ExamForm: React.FC<ExamFormProps> = ({
  exam,
  onStatusChange,
  onCommentChange,
  customRows = [],
  onCustomChange,
  onCustomize,
}) => {
  const { t } = useTranslation('forms');
  const rows: Row[] = [
    ...EXAM_ITEMS.map(({ key }): Row => ({
      id: key,
      label: t(`exam.items.${key}`),
      inline: t(`exam.itemsInline.${key}`),
      status: exam[key].status,
      comment: exam[key].comment,
      setStatus: (v) => onStatusChange(key, v),
      setComment: (v) => onCommentChange(key, v),
    })),
    ...(onCustomChange
      ? customRows.map((r): Row => ({
          id: `custom-${r.id}`,
          label: r.label,
          inline: r.label,
          status: r.status,
          comment: r.comment,
          setStatus: (status) => onCustomChange(r, { status }),
          setComment: (comment) => onCustomChange(r, { comment }),
        }))
      : []),
  ];
  const unanswered = rows.filter((r) => !r.status);
  const header = (
    <div className="dental-grid__section-header">
      <h2 className="dental-grid__title">{t('exam.title')}</h2>
      {unanswered.length > 0 && (
        <button
          type="button"
          className="diagram-view__action"
          // One custom answer per row: each call reads the chart's latest list.
          onClick={() => unanswered.forEach((r) => r.setStatus('normal'))}
          title={t('exam.markTitle')}
        >
          {unanswered.length === rows.length ? t('exam.markAllNormal') : t('exam.markRestNormal')}
        </button>
      )}
      {onCustomize && (
        <button type="button" className="diagram-view__action" onClick={onCustomize} title={t('exam.customizeTitle')}>
          {t('anesthesia.customize')}
        </button>
      )}
    </div>
  );

  // The iOS app: one row per area with a Normal / Abnormal segmented
  // control (the same radios — tapping the chosen answer clears it), and
  // the comment on its own row under an abnormal area.
  if (isNativeApp()) {
    return (
      <div className="dental-grid-section exam-ios">
        {header}
        <FormGroup>
          {rows.map((item) => {
            const { label } = item;
            const groupName = `exam-${item.id}`;
            const answer = (value: 'normal' | 'abnormal') => (
              <label className={`ios-segmented__segment${item.status === value ? ' ios-segmented__segment--selected' : ''}${value === 'abnormal' ? ' ios-segmented__segment--abnormal' : ''}`}>
                <input
                  type="radio"
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
                {item.status === 'abnormal' && (
                  <div className="ios-field ios-field--stacked ios-field--bare exam-ios__comment">
                    <CommentBox label={label} inline={item.inline} value={item.comment} onChange={item.setComment} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </FormGroup>
      </div>
    );
  }

  return (
    <div className="dental-grid-section">
      {header}

      <table className="exam-table">
        <thead>
          <tr>
            <th></th>
            <th>{t('exam.normal')}</th>
            <th>{t('exam.abnormal')}</th>
            <th className="exam-table__comment-col">{t('exam.comment')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const { label } = item;
            const groupName = `exam-${item.id}`;
            const showComment = item.status === 'abnormal';
            return (
              <tr
                key={item.id}
                className={showComment ? 'exam-table__row--abnormal' : undefined}
              >
                <td className="anesthesia-table__label">{label}</td>
                {/* The whole cell is the hit area — this gets used with
                    gloves on; a bare 13px radio is not a target. */}
                <td className="exam-table__radio">
                  <label className="exam-table__radio-hit">
                    <input
                      type="radio"
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
                      name={groupName}
                      checked={item.status === 'abnormal'}
                      onChange={() => item.setStatus('abnormal')}
                      onClick={() => { if (item.status === 'abnormal') item.setStatus(''); }}
                      aria-label={t('exam.ariaAbnormal', { label })}
                    />
                  </label>
                </td>
                <td className="exam-table__comment-col">
                  {showComment && (
                    <CommentBox
                      label={label}
                      inline={item.inline}
                      value={item.comment}
                      onChange={item.setComment}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
