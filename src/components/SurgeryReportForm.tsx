import React from 'react';

interface SurgeryReportFormProps {
  value: string;
  onChange: (value: string) => void;
}

export const SurgeryReportForm: React.FC<SurgeryReportFormProps> = ({ value, onChange }) => {
  return (
    <div className="patient-form">
      <div className="patient-form__header">
        <h2 className="patient-form__section-title">Treatment &amp; Surgery Report</h2>
      </div>
      <textarea
        className="patient-form__textarea surgery-report__textarea"
        placeholder="Treatment and surgery details..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
