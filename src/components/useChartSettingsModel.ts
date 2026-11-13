import React from 'react';
import type { DentalField } from '../types';
import { BlockRowId, ChartPrefs, PERIO_FIELDS } from '../utils/chartSettings';
import type { SettingsSection } from './ChartSettingsModal';

/** Anesthetics offered for "Your usual anesthetic" (drug names, not text). */
export const USUAL_DRUGS = ['Bupivacaine', 'Ropivacaine', 'Lidocaine', 'Mepivacaine'];

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
    anesthesia: showAll || only === 'anesthesia',
    patient: showAll || only === 'patient',
    pdfGrid: showAll || only === 'charting',
    pdfImages: showAll || only === 'images',
  };
  const shownColumns = PERIO_FIELDS.filter((f) => !prefs.hiddenColumns.includes(f.key));

  // Usual anesthetic: typed locally, saved when a field loses focus (not
  // on every keystroke).
  const [drugName, setDrugName] = React.useState(prefs.usualDrug?.name ?? '');
  const [drugStrength, setDrugStrength] = React.useState(prefs.usualDrug?.concentration ?? '');
  const saveUsualDrug = () => {
    const name = drugName.trim();
    const next = name ? { name, concentration: drugStrength.replace(/%/g, '').trim() } : null;
    if (JSON.stringify(next) !== JSON.stringify(prefs.usualDrug)) onChange({ usualDrug: next });
  };
  const toggleBlock = (id: BlockRowId, shown: boolean) =>
    onChange({ hiddenBlocks: shown ? prefs.hiddenBlocks.filter((b) => b !== id) : Array.from(new Set([...prefs.hiddenBlocks, id])) });

  const latestSave = React.useRef(saveUsualDrug);
  latestSave.current = saveUsualDrug;
  React.useEffect(() => {
    if (!saveDrugOnUnmount) return undefined;
    return () => latestSave.current();
  }, [saveDrugOnUnmount]);

  return { showAll, show, shownColumns, drugName, setDrugName, drugStrength, setDrugStrength, saveUsualDrug, toggleBlock };
}
