import React from 'react';
import type { DentalField } from '../types';
import { BlockRowId, ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';
import { ADJUNCT_DRUGS, strengthForInput, withDrugUnit } from '../types';
import type { SettingsSection } from './ChartSettingsModal';

/** Anesthetics offered for "Your usual anesthetic" (drug names, not text). */
export const USUAL_DRUGS = ['Bupivacaine', 'Ropivacaine', 'Lidocaine', 'Mepivacaine'];
/** Offered for "Added to the mix" (drug names, not text). */
export const USUAL_ADJUNCTS = ADJUNCT_DRUGS;

/** Adds or removes `key` in a field list. */
export const toggleField = (list: DentalField[], key: DentalField, on: boolean): DentalField[] =>
  on ? Array.from(new Set([...list, key])) : list.filter((k) => k !== key);

/**
 * The state and rules behind Chart settings, shared by the website's
 * dialog (ChartSettingsModal) and the iOS list (ChartSettingsList): which
 * groups a page's Customize shows, the columns still shown, the nerve-block
 * toggle, and the usual-anesthetic draft (typed locally, saved on blur).
 *
 * `saveDrugOnUnmount`: also save a pending usual-anesthetic edit when the
 * view goes away without a blur (iOS Back / back-swipe / sheet dismiss).
 */
export function useChartSettingsModel(
  prefs: ChartPrefs,
  onChange: (patch: Partial<ChartPrefs>) => void,
  only: SettingsSection | null,
  { saveDrugOnUnmount = false }: { saveDrugOnUnmount?: boolean } = {},
) {
  const showAll = only === null;
  // Which groups a page's Customize shows (everything from the menu).
  const show = {
    charting: showAll || only === 'charting',
    beside: showAll || only === 'charting' || only === 'diagnosis',
    // By-tooth charting (Charting page) and the Diagnosis diagram use them.
    quickCodes: showAll || only === 'charting' || only === 'diagnosis',
    anesthesia: showAll || only === 'anesthesia',
    patient: showAll || only === 'patient',
    exam: showAll || only === 'exam',
    pdfGrid: showAll || only === 'charting',
    pdfImages: showAll || only === 'images',
  };
  const shownColumns = PERIO_FIELDS.filter((f) => !prefs.hiddenColumns.includes(f.key));

  // Usual anesthetic, and what's added to it: typed locally, saved when a
  // field loses focus (not on every keystroke).
  const drug = useUsualDrugDraft(prefs.usualDrug, (usualDrug) => onChange({ usualDrug }));
  const adjunct = useUsualDrugDraft(prefs.usualAdjunct, (usualAdjunct) => onChange({ usualAdjunct }));
  const toggleBlock = (id: BlockRowId, shown: boolean) =>
    onChange({ hiddenBlocks: shown ? prefs.hiddenBlocks.filter((b) => b !== id) : Array.from(new Set([...prefs.hiddenBlocks, id])) });

  const latestSaves = React.useRef([drug, adjunct]);
  latestSaves.current = [drug, adjunct];
  React.useEffect(() => {
    if (!saveDrugOnUnmount) return undefined;
    return () => {
      for (const d of latestSaves.current) if (d.dirty.current) d.save();
    };
  }, [saveDrugOnUnmount]);

  const { name: drugName, setName: setDrugName, strength: drugStrength, setStrength: setDrugStrength, save: saveUsualDrug } = drug;
  const { name: adjunctName, setName: setAdjunctName, strength: adjunctStrength, setStrength: setAdjunctStrength, save: saveUsualAdjunct } = adjunct;

  return {
    showAll, show, shownColumns, toggleBlock,
    drugName, setDrugName, drugStrength, setDrugStrength, saveUsualDrug,
    adjunctName, setAdjunctName, adjunctStrength, setAdjunctStrength, saveUsualAdjunct,
  };
}

type UsualDrug = { name: string; concentration: string } | null;

/** One usual-drug draft (name + strength). The strength box shows the
 *  number; the drug's unit (mg/mL for adjuncts) is added when saved.
 *  `dirty`: edited since the last save — only then may unmount save it (an
 *  untouched or already-saved draft must not overwrite a newer value). */
function useUsualDrugDraft(value: UsualDrug, onSave: (next: UsualDrug) => void) {
  const [name, setNameState] = React.useState(value?.name ?? '');
  const [strength, setStrengthState] = React.useState(value ? strengthForInput(value.name, value.concentration) : '');
  const dirty = React.useRef(false);
  const setName = (v: string) => {
    dirty.current = true;
    setNameState(v);
  };
  const setStrength = (v: string) => {
    dirty.current = true;
    setStrengthState(v);
  };
  const save = () => {
    dirty.current = false;
    const n = name.trim();
    const next = n ? { name: n, concentration: withDrugUnit(n, strength.replace(/%/g, '').trim()) } : null;
    if (JSON.stringify(next) !== JSON.stringify(value)) onSave(next);
  };
  return { name, setName, strength, setStrength, save, dirty };
}
