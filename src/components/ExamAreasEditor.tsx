import React from 'react';
import { useTranslation } from 'react-i18next';
import { EXAM_ITEMS } from '../types';
import { useReorderList } from '../hooks/useReorderList';
import { ReorderHandle } from './ui/ReorderHandle';
import {
  CustomExamAreaDef,
  EXAM_PRESET_KEYS,
  MAX_CUSTOM_EXAM_AREAS,
  MAX_EXAM_LABEL,
  newExamAreaId,
} from '../utils/customExam';

/** Choose visible exam areas; existing chart findings are always retained. */
export const ExamAreasEditor: React.FC<{
  areas: CustomExamAreaDef[];
  hiddenAreas?: string[];
  onHiddenChange?: (next: string[]) => void;
  onChange: (next: CustomExamAreaDef[]) => void;
}> = ({ areas, onChange, hiddenAreas = [], onHiddenChange }) => {
  const { t } = useTranslation(['settings', 'forms', 'visitDocumentation']);
  // Edited locally, like the custom anesthesia editor.
  const [draft, setDraft] = React.useState(areas);

  const save = (next = draft) => {
    const clean = next.filter((a) => a.label.trim()).map((a) => ({ ...a, label: a.label.trim() }));
    if (JSON.stringify(clean) !== JSON.stringify(areas)) onChange(clean);
  };
  const reorder = useReorderList('.exam-areas__list', 'data-custom-exam-row', draft.length, (from, to) => {
    const next = [...draft];
    const [area] = next.splice(from, 1);
    next.splice(to, 0, area);
    setDraft(next);
    save(next);
  });

  const room = MAX_CUSTOM_EXAM_AREAS - draft.length;
  const toggle = (id: string) => onHiddenChange?.(
    hiddenAreas.includes(id) ? hiddenAreas.filter((key) => key !== id) : [...hiddenAreas, id],
  );
  const suggestions = EXAM_PRESET_KEYS.filter((key) => !draft.some((area) =>
    area.id === `preset-${key}` || area.label.trim().toLocaleLowerCase() === t(`chart.exam.presets.${key}`).toLocaleLowerCase(),
  ));

  return (
    <fieldset className="chart-settings__field">
      <legend>{t('chart.exam.areas')}</legend>
      <p className="chart-settings__note">{t('chart.exam.areasNote')}</p>
      {EXAM_ITEMS.map(({ key }) => (
        <label key={key} className="chart-settings__choice">
          <input type="checkbox" checked={!hiddenAreas.includes(key)} onChange={() => toggle(key)} />
          {t(`exam.items.${key}`, { ns: 'forms' })}
        </label>
      ))}
      <p className="chart-settings__note">{t('chart.exam.customCount', { used: draft.filter((area) => area.label.trim()).length, max: MAX_CUSTOM_EXAM_AREAS })}</p>
      <div className="exam-areas__list">{draft.map((a, i) => (
        <div key={a.id} className="custom-def exam-areas__row" data-custom-exam-row={i} data-reorder-drop={reorder.dropAt(i)}>
          <ReorderHandle index={i} reorder={reorder} disabled={draft.length < 2}
            label={t('visitDocumentation:consultation.templates.builder.dragField', { field: a.label.trim() || t('chart.exam.areaN', { n: i + 1 }) })} />
          <input type="checkbox" checked={!hiddenAreas.includes(a.id)}
            aria-label={t('chart.exam.showArea', { name: a.label.trim() || t('chart.exam.areaN', { n: i + 1 }) })}
            onChange={() => toggle(a.id)} />
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
      ))}</div>
      {suggestions.length > 0 && (
        <>
          <p className="chart-settings__note">{t('chart.exam.suggestions')}</p>
          {suggestions.map((key) => (
            <label key={key} className="chart-settings__choice">
              <input type="checkbox" checked={false} disabled={room <= 0} onChange={() => {
                const id = `preset-${key}`;
                const next = [...draft, { id, label: t(`chart.exam.presets.${key}`) }];
                setDraft(next);
                save(next);
                if (hiddenAreas.includes(id)) onHiddenChange?.(hiddenAreas.filter((area) => area !== id));
              }} />
              {t(`chart.exam.presets.${key}`)}
            </label>
          ))}
        </>
      )}
      {room > 0 && (
        <div className="exam-areas__actions">
          <button type="button" className="anesthesia-drug__add" onClick={() => setDraft([...draft, { id: newExamAreaId(), label: '' }])}>
            <span aria-hidden="true">+</span> {t('chart.exam.add')}
          </button>
        </div>
      )}
      {room === 0 && <p className="chart-settings__note">{t('chart.list.limit')}</p>}
    </fieldset>
  );
};
