import React from 'react';
import { ExamFindings, ExamFinding, EXAM_ITEMS } from '../types';

interface ExamFormProps {
  exam: ExamFindings;
  onStatusChange: (key: keyof ExamFindings, value: ExamFinding) => void;
  onCommentChange: (key: keyof ExamFindings, value: string) => void;
}

export const ExamForm: React.FC<ExamFormProps> = ({
  exam,
  onStatusChange,
  onCommentChange,
}) => {
  return (
    <div className="dental-grid-section">
      <div className="dental-grid__section-header">
        <h2 className="dental-grid__title">Oral Exam &mdash; Normal / Abnormal</h2>
      </div>

      <table className="exam-table">
        <thead>
          <tr>
            <th></th>
            <th>Normal</th>
            <th>Abnormal</th>
            <th className="exam-table__comment-col">Comment (if abnormal)</th>
          </tr>
        </thead>
        <tbody>
          {EXAM_ITEMS.map(({ key, label }) => {
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
                      aria-label={`${label}: normal`}
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
                      aria-label={`${label}: abnormal`}
                    />
                  </label>
                </td>
                <td className="exam-table__comment-col">
                  {showComment && (
                    <input
                      type="text"
                      className="patient-form__input exam-table__comment"
                      placeholder={`Describe abnormal ${label.toLowerCase()}…`}
                      value={item.comment}
                      onChange={(e) => onCommentChange(key, e.target.value)}
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
