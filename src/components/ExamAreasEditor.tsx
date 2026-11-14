import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CustomExamAreaDef,
  EXAM_PRESET_KEYS,
  MAX_CUSTOM_EXAM_AREAS,
  MAX_EXAM_LABEL,
  newExamAreaId,
} from '../utils/customExam';

/**
 * Chart settings → Exam: your own exam areas after the six built-in ones,
 * plus one tap to add the structures of a full oral exam that the built-in
 * areas don't cover. Names save when a field loses focus (add / remove
 * save right away). Removing an area never touches charts: charted
 * answers carry their own label.
 */
export const ExamAreasEditor: React.FC<{
  areas: CustomExamAreaDef[];
  onChange: (next: CustomExamAreaDef[]) => void;
}> = ({ areas, onChange }) => {
  const { t } = useTranslation('settings');
  // Edited locally, like the custom anesthesia editor.
  const [draft, setDraft] = React.useState(areas);

  const save = (next = draft) => {
    const clean = next.filter((a) => a.label.trim()).map((a) => ({ ...a, label: a.label.trim() }));
    if (JSON.stringify(clean) !== JSON.stringify(areas)) onChange(clean);
  };

  const presetLabels = EXAM_PRESET_KEYS.map((k) => t(`chart.exam.presets.${k}`));
  const have = new Set(draft.map((a) => a.label.trim().toLowerCase()));
  const missingPreset = presetLabels.filter((l) => !have.has(l.toLowerCase()));
  const room = MAX_CUSTOM_EXAM_AREAS - draft.length;

  const addPreset = () => {
    const next = [...draft, ...missingPreset.slice(0, room).map((label) => ({ id: newExamAreaId(), label }))];
    setDraft(next);
    save(next);
  };

  return (
    <fieldset className="chart-settings__field">
      <legend>{t('chart.exam.areas')}</legend>
      <p className="chart-settings__note">{t('chart.exam.areasNote')}</p>
      {draft.map((a, i) => (
        <div key={a.id} className="custom-def">
          <input
            type="text"
            className="patient-form__input custom-def__label exam-areas__label"
            placeholder={t('chart.exam.areaPlaceholder')}
            aria-label={t('chart.exam.areaAria', { n: i + 1 })}
            value={a.label}
            maxLength={MAX_EXAM_LABEL}
            onChange={(e) => setDraft(draft.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)))}
            onBlur={() => save()}
          />
          <button
            type="button"
            className="diagram-view__action custom-def__remove"
            aria-label={t('chart.exam.removeAria', { name: a.label.trim() || t('chart.exam.areaN', { n: i + 1 }) })}
            onClick={() => {
              const next = draft.filter((x) => x.id !== a.id);
              setDraft(next);
              save(next);
            }}
          >
            {t('chart.exam.remove')}
          </button>
        </div>
      ))}
      {room > 0 && (
        <div className="exam-areas__actions">
          <button type="button" className="anesthesia-drug__add" onClick={() => setDraft([...draft, { id: newExamAreaId(), label: '' }])}>
            <span aria-hidden="true">+</span> {t('chart.exam.add')}
          </button>
          {missingPreset.length > 0 && (
            <button type="button" className="anesthesia-drug__add" onClick={addPreset} title={presetLabels.join(' · ')}>
              <span aria-hidden="true">+</span> {t('chart.exam.addPreset')}
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
};
