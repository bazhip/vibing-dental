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
    fireEvent.click(screen.getByRole('button', { name: 'Patient details' }));
    expect(screen.getByRole('checkbox', { name: 'Show the Recheck due field' })).toBeChecked();
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
    fireEvent.click(screen.getByRole('button', { name: 'Patient details' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show the Recheck due field' }));
    expect(onChange).toHaveBeenLastCalledWith({ hideRecheck: true });
    fireEvent.click(screen.getByRole('button', { name: 'Charting' }));
    fireEvent.click(screen.getByRole('radio', { name: 'By tooth' }));
    expect(onChange).toHaveBeenLastCalledWith({ chartingView: 'tooth' });
  });

  it('chooses where a tapped score moves to (next finding by default)', () => {
    const { onChange } = setup();
    expect(screen.getByRole('radio', { name: /next finding on the same tooth/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Go down to the next tooth/ }));
    expect(onChange).toHaveBeenLastCalledWith({ scoreTapMoves: 'tooth' });
    fireEvent.click(screen.getByRole('radio', { name: 'Keep the current cell selected' }));
    expect(onChange).toHaveBeenLastCalledWith({ scoreTapMoves: 'stay' });
  });

  it('beside-the-teeth choices unlock once findings are shown on the diagram', () => {
    setup({ ...DEFAULT_CHART_PREFS, mirrorToDiagnosis: false });
    fireEvent.click(screen.getByRole('button', { name: 'Diagnosis' }));
    expect(screen.getByRole('checkbox', { name: 'Pocket' })).toBeDisabled();
  });
});

describe('ChartSettingsModal — anesthesia', () => {
  it('toggles nerve blocks and saves the usual anesthetic on blur', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Anesthesia' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Caudal maxillary' }));
    expect(onChange).toHaveBeenLastCalledWith({ hiddenBlocks: ['caudalMaxillary'] });
    const name = screen.getByRole('combobox', { name: 'Preferred local anesthetic' });
    fireEvent.change(name, { target: { value: 'Bupivacaine' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Local anesthetic concentration (%)' }), { target: { value: '0.5%' } });
    fireEvent.blur(name);
    expect(onChange).toHaveBeenLastCalledWith({ usualDrug: { name: 'Bupivacaine', concentration: '0.5' } });
  });
});

describe('ChartSettingsModal — opened from the Anesthesia page', () => {
  it('shows anesthesia settings with persistent category navigation', () => {
    render(<ChartSettingsModal onClose={() => {}} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={() => {}} section="anesthesia" />);
    expect(screen.getByRole('heading', { name: 'Anesthesia settings' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Caudal maxillary' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'One per tooth' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Hide the Recheck due field' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Charting' }));
    expect(screen.getByRole('heading', { name: 'Chart settings' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'One per tooth' })).toBeInTheDocument();
  });
});

describe('ChartSettingsModal — each page\'s Customize shows only its settings', () => {
  const present = (name: string, role: 'checkbox' | 'radio' = 'checkbox') => screen.queryAllByRole(role, { name }).length > 0;
  const open = (section: 'patient' | 'anesthesia' | 'charting' | 'diagnosis' | 'images') =>
    render(<ChartSettingsModal onClose={() => {}} prefs={{ ...DEFAULT_CHART_PREFS, mirrorToDiagnosis: true }} followsAccount onChange={() => {}} section={section} />);

  it('Charting: layout and input controls without other category controls', () => {
    open('charting');
    expect(screen.getByRole('heading', { name: 'Charting settings' })).toBeInTheDocument();
    expect(present('One per tooth', 'radio')).toBe(true);
    expect(present('Show findings on the Diagnosis diagram (and in the PDF)')).toBe(false);
    expect(present('Include the charting grid Required when diagram findings are off, so recorded measurements remain in the PDF.')).toBe(false);
    expect(present('Caudal maxillary')).toBe(false);
    expect(present('Hide the Recheck due field')).toBe(false);
    expect(present('Include images (4 per page, after the chart)')).toBe(false);
  });

  it('Patient: just the recheck field', () => {
    open('patient');
    expect(present('Show the Recheck due field')).toBe(true);
    expect(present('One per tooth', 'radio')).toBe(false);
    expect(present('Caudal maxillary')).toBe(false);
  });

  it('Diagnosis: just beside the teeth', () => {
    open('diagnosis');
    expect(present('Show findings on the Diagnosis diagram (and in the PDF)')).toBe(true);
    expect(present('One per tooth', 'radio')).toBe(false);
    expect(present('Include the charting grid Required when diagram findings are off, so recorded measurements remain in the PDF.')).toBe(false);
  });

  it('Imaging and PDF: both output controls', () => {
    open('images');
    expect(present('Include images (4 per page, after the chart)')).toBe(true);
    expect(present('Include the charting grid Required when diagram findings are off, so recorded measurements remain in the PDF.')).toBe(true);
    expect(present('Hide the Recheck due field')).toBe(false);
  });

  it('the Settings menu defaults to charting with categories for every area', () => {
    render(<ChartSettingsModal onClose={() => {}} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={() => {}} />);
    for (const n of ['Show the Recheck due field', 'Caudal maxillary', 'Include images (4 per page, after the chart)']) expect(present(n)).toBe(false);
    for (const name of ['Patient details', 'Oral exam', 'Anesthesia', 'Charting', 'Diagnosis', 'Imaging and PDF']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(present('One per tooth', 'radio')).toBe(true);
    expect(screen.queryByRole('button', { name: 'All chart settings' })).not.toBeInTheDocument();
  });
});

it('flushes an anesthetic draft on Escape before closing', () => {
  const onChange = vi.fn(), onClose = vi.fn();
  render(<ChartSettingsModal prefs={DEFAULT_CHART_PREFS} followsAccount onChange={onChange} onClose={onClose} section="anesthesia" />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Preferred local anesthetic' }), { target: { value: 'Lidocaine' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onChange).toHaveBeenCalledWith({ usualDrug: { name: 'Lidocaine', concentration: '' } });
  expect(onClose).toHaveBeenCalledOnce();
});

it('offers persistent categories and saves a draft when changing categories', () => {
  const onChange = vi.fn();
  render(<ChartSettingsModal prefs={DEFAULT_CHART_PREFS} followsAccount onChange={onChange} onClose={() => {}} section="anesthesia" />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Preferred local anesthetic' }), { target: { value: 'Lidocaine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Patient details' }));
  expect(onChange).toHaveBeenCalledWith({ usualDrug: { name: 'Lidocaine', concentration: '' } });
  expect(screen.getByRole('checkbox', { name: 'Show the Recheck due field' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
});

it('keeps the final chart column enabled and forces PDF grid when diagram findings are off', () => {
  render(<ChartSettingsModal prefs={{ ...DEFAULT_CHART_PREFS, hiddenColumns: ['recession', 'pocket', 'furcation', 'hyperplasia', 'calculus', 'gingivitis', 'pdstate'], mirrorToDiagnosis: false, pdfIncludeGrid: false }} followsAccount onChange={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('checkbox', { name: 'Mobility' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Imaging and PDF' }));
  const grid = screen.getByRole('checkbox', { name: /Include the charting grid/ });
  expect(grid).toBeChecked();
  expect(grid).toBeDisabled();
});

it('switches categories with the compact mobile selector', () => {
  setup();
  fireEvent.change(screen.getByRole('combobox', { name: 'Chart settings categories' }), { target: { value: 'patient' } });
  expect(screen.getByRole('checkbox', { name: 'Show the Recheck due field' })).toBeChecked();
});

it('procedure customization edits its own quick codes without changing diagnosis codes', () => {
  const onChange = vi.fn();
  render(<ChartSettingsModal prefs={{ ...DEFAULT_CHART_PREFS, quickCodes: ['T/SN'], procedureQuickCodes: ['EXT'] }} followsAccount onChange={onChange} onClose={() => {}} section="procedure" />);
  expect(screen.getByRole('heading', { name: 'Procedure settings' })).toBeInTheDocument();
  expect(screen.getByText('Procedure shortcuts')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Remove EXT' }));
  expect(onChange).toHaveBeenLastCalledWith({ procedureQuickCodes: [] });
  expect(screen.queryByRole('button', { name: 'Remove T/SN' })).toBeNull();
});

it('defaults autosave on and lets the user switch to manual saving', () => {
  const { onChange } = setup();
  const toggle = screen.getByRole('checkbox', { name: 'Autosave' });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(onChange).toHaveBeenCalledWith({ autosave: false });
});
