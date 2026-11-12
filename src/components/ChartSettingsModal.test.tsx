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

describe('ChartSettingsModal — opened from the Anesthesia page', () => {
  it('shows only the anesthesia settings, with a way to see everything', () => {
    render(<ChartSettingsModal onClose={() => {}} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={() => {}} section="anesthesia" />);
    expect(screen.getByRole('heading', { name: 'Anesthesia settings' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Caudal maxillary' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'One per tooth' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Hide the Recheck due field' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All chart settings' }));
    expect(screen.getByRole('heading', { name: 'Chart settings' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'One per tooth' })).toBeInTheDocument();
  });
});

describe('ChartSettingsModal — each page\'s Customize shows only its settings', () => {
  const present = (name: string, role: 'checkbox' | 'radio' = 'checkbox') => screen.queryAllByRole(role, { name }).length > 0;
  const open = (section: 'patient' | 'anesthesia' | 'charting' | 'diagnosis' | 'images') =>
    render(<ChartSettingsModal onClose={() => {}} prefs={{ ...DEFAULT_CHART_PREFS, mirrorToDiagnosis: true }} followsAccount onChange={() => {}} section={section} />);

  it('Charting: charting, beside the teeth, PDF grid — no anesthesia, recheck or images', () => {
    open('charting');
    expect(screen.getByRole('heading', { name: 'Charting settings' })).toBeInTheDocument();
    expect(present('One per tooth', 'radio')).toBe(true);
    expect(present('Show findings on the Diagnosis diagram (and in the PDF)')).toBe(true);
    expect(present('Include the charting grid (optional while findings are on the diagram)')).toBe(true);
    expect(present('Caudal maxillary')).toBe(false);
    expect(present('Hide the Recheck due field')).toBe(false);
    expect(present('Include images (4 per page, after the chart)')).toBe(false);
  });

  it('Patient: just the recheck field', () => {
    open('patient');
    expect(present('Hide the Recheck due field')).toBe(true);
    expect(present('One per tooth', 'radio')).toBe(false);
    expect(present('Caudal maxillary')).toBe(false);
  });

  it('Diagnosis: just beside the teeth', () => {
    open('diagnosis');
    expect(present('Show findings on the Diagnosis diagram (and in the PDF)')).toBe(true);
    expect(present('One per tooth', 'radio')).toBe(false);
    expect(present('Include the charting grid (optional while findings are on the diagram)')).toBe(false);
  });

  it('Images: just images in the PDF', () => {
    open('images');
    expect(present('Include images (4 per page, after the chart)')).toBe(true);
    expect(present('Include the charting grid (optional while findings are on the diagram)')).toBe(false);
    expect(present('Hide the Recheck due field')).toBe(false);
  });

  it('the Settings menu shows everything', () => {
    render(<ChartSettingsModal onClose={() => {}} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={() => {}} />);
    for (const n of ['Hide the Recheck due field', 'Caudal maxillary', 'Include images (4 per page, after the chart)']) expect(present(n)).toBe(true);
    expect(present('One per tooth', 'radio')).toBe(true);
    expect(screen.queryByRole('button', { name: 'All chart settings' })).not.toBeInTheDocument();
  });
});
