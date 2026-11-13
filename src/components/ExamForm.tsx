import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExamFindings, ExamFinding, EXAM_ITEMS } from '../types';

interface ExamFormProps {
  exam: ExamFindings;
  onStatusChange: (key: keyof ExamFindings, value: ExamFinding) => void;
  onCommentChange: (key: keyof ExamFindings, value: string) => void;
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
}) => {
  const { t } = useTranslation('forms');
  const unanswered = EXAM_ITEMS.filter(({ key }) => !exam[key].status);
  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">{t('exam.title')}</h2>
        {unanswered.length > 0 && (
          <button
            type="button"
            className="diagram-view__action"
            onClick={() => unanswered.forEach(({ key }) => onStatusChange(key, 'normal'))}
            title={t('exam.markTitle')}
          >
            {unanswered.length === EXAM_ITEMS.length ? t('exam.markAllNormal') : t('exam.markRestNormal')}
          </button>
        )}
      </div>

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
          {EXAM_ITEMS.map(({ key }) => {
            const label = t(`exam.items.${key}`);
            const item = exam[key];
            const groupName = `exam-${key}`;
            const showComment = item.status === 'abnormal';
            return (
              <tr
                key={key}
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
                      onChange={() => onStatusChange(key, 'normal')}
                      // Tapping the selected answer again clears it.
                      onClick={() => { if (item.status === 'normal') onStatusChange(key, ''); }}
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
                      onChange={() => onStatusChange(key, 'abnormal')}
                      onClick={() => { if (item.status === 'abnormal') onStatusChange(key, ''); }}
                      aria-label={t('exam.ariaAbnormal', { label })}
                    />
                  </label>
                </td>
                <td className="exam-table__comment-col">
                  {showComment && (
                    <CommentBox
                      label={label}
                      inline={t(`exam.itemsInline.${key}`)}
                      value={item.comment}
                      onChange={(v) => onCommentChange(key, v)}
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
