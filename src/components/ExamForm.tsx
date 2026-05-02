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
        <span className="dental-grid__title">Oral Exam &mdash; Normal / Abnormal</span>
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
              <tr key={key}>
                <td className="anesthesia-table__label">{label}</td>
                <td className="exam-table__radio">
                  <input
                    type="radio"
                    name={groupName}
                    checked={item.status === 'normal'}
                    onChange={() => onStatusChange(key, 'normal')}
                  />
                </td>
                <td className="exam-table__radio">
                  <input
                    type="radio"
                    name={groupName}
                    checked={item.status === 'abnormal'}
                    onChange={() => onStatusChange(key, 'abnormal')}
                  />
                </td>
                <td className="exam-table__comment-col">
                  {showComment ? (
                    <input
                      type="text"
                      className="patient-form__input exam-table__comment"
                      placeholder={`Describe abnormal ${label.toLowerCase()}…`}
                      value={item.comment}
                      onChange={(e) => onCommentChange(key, e.target.value)}
                    />
                  ) : (
                    <span className="exam-table__comment-placeholder">&mdash;</span>
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
