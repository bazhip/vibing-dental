import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHART_PREFS, type ChartPrefs } from '../utils/chartSettings';
import { useChartSettingsModel } from './useChartSettingsModel';

const withDrug = (name: string, concentration: string): ChartPrefs => ({ ...DEFAULT_CHART_PREFS, usualDrug: { name, concentration } });

function mount(prefs: ChartPrefs, onChange = vi.fn()) {
  const hook = renderHook(({ p }) => useChartSettingsModel(p, onChange, null, { saveDrugOnUnmount: true }), {
    initialProps: { p: prefs },
  });
  return { ...hook, onChange };
}

describe('useChartSettingsModel: usual anesthetic saved on unmount', () => {
  it('an untouched draft never overwrites a newer usualDrug', () => {
    const { rerender, unmount, onChange } = mount(withDrug('Lidocaine', '2'));
    // Changed elsewhere (another device / screen) while this view is open.
    rerender({ p: withDrug('Bupivacaine', '0.5') });
    unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a draft already saved on blur is not saved again over a newer value', () => {
    const { result, rerender, unmount, onChange } = mount(withDrug('Lidocaine', '2'));
    act(() => result.current.setDrugName('Ropivacaine'));
    act(() => result.current.saveUsualDrug());
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender({ p: withDrug('Bupivacaine', '0.5') });
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('an edited draft is saved on unmount', () => {
    const { result, unmount, onChange } = mount(withDrug('Lidocaine', '2'));
    act(() => result.current.setDrugStrength('1'));
    unmount();
    expect(onChange).toHaveBeenCalledWith({ usualDrug: { name: 'Lidocaine', concentration: '1' } });
  });
});
