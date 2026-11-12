import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ChartSettingsModal } from './ChartSettingsModal';
import { DEFAULT_CHART_PREFS, ChartPrefs } from '../utils/chartSettings';

function setup(prefs: ChartPrefs = DEFAULT_CHART_PREFS, followsAccount = true) {
  const onChange = vi.fn();
  render(<ChartSettingsModal onClose={() => {}} prefs={prefs} followsAccount={followsAccount} onChange={onChange} />);
  return { onChange };
}

describe('ChartSettingsModal', () => {
  it("starts on today's layout: grid view, one pocket per tooth, every column shown", () => {
    setup();
    expect(screen.getByRole('radio', { name: 'Grid' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'One per tooth' })).toBeChecked();
    for (const name of ['Mobility', 'Recession', 'Pocket', 'Furcation', 'Enlargement', 'Calculus', 'Gingivitis', 'PD Stage']) {
      expect(screen.getAllByRole('checkbox', { name })[0]).toBeChecked();
    }
    expect(screen.getByRole('checkbox', { name: 'Hide the Recheck due field' })).not.toBeChecked();
  });

  it('says the settings follow the account', () => {
    setup();
    expect(screen.getByText(/follow your account on every device/)).toBeInTheDocument();
  });

  it('every change applies immediately', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /One per root/ }));
    expect(onChange).toHaveBeenLastCalledWith({ pocketMode: 'root' });
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Recession' })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ hiddenColumns: ['recession'] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide the Recheck due field' }));
    expect(onChange).toHaveBeenLastCalledWith({ hideRecheck: true });
    fireEvent.click(screen.getByRole('radio', { name: 'By tooth' }));
    expect(onChange).toHaveBeenLastCalledWith({ chartingView: 'tooth' });
  });

  it('beside-the-teeth choices unlock once findings are shown on the diagram', () => {
    setup({ ...DEFAULT_CHART_PREFS, mirrorToDiagnosis: false });
    expect(screen.getAllByRole('checkbox', { name: 'Pocket' })[1]).toBeDisabled();
  });
});

describe('ChartSettingsModal — anesthesia', () => {
  it('toggles nerve blocks and saves the usual anesthetic on blur', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Caudal maxillary' }));
    expect(onChange).toHaveBeenLastCalledWith({ hiddenBlocks: ['caudalMaxillary'] });
    const name = screen.getByRole('combobox', { name: 'Usual anesthetic' });
    fireEvent.change(name, { target: { value: 'Bupivacaine' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Usual anesthetic strength (%)' }), { target: { value: '0.5%' } });
    fireEvent.blur(name);
    expect(onChange).toHaveBeenLastCalledWith({ usualDrug: { name: 'Bupivacaine', concentration: '0.5' } });
  });
});
