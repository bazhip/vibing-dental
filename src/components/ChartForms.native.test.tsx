import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

// The chart's form sections in the iOS app (inset-grouped label/value
// rows, segmented choices, switches for booleans) and on the website
// (unchanged markup).
const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native }));
vi.mock('../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock('../native/camera', () => ({ takePhoto: vi.fn() }));
const store = vi.hoisted(() => ({
  items: [] as unknown[], loaded: true, maxImages: 10, dicomEnabled: false,
  upload: () => {}, remove: () => {}, updateCaption: () => {},
}));
vi.mock('../hooks/useAttachments', () => ({ useAttachments: () => store }));

import { PatientForm } from './PatientForm';
import { ExamForm } from './ExamForm';
import { AnesthesiaForm } from './AnesthesiaForm';
import { ImagingSection } from './ImagingSection';
import { SurgeryReportForm } from './SurgeryReportForm';
import { DiagramView } from './DiagramView';
import { DentalGrid } from './DentalGrid';
import { getInitialToothData } from '../constants';
import { installScopeSelectorFallback } from '../utils/scopeSelector';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type PatientInfo } from '../types';

const patientInfo: PatientInfo = {
  patientName: 'Biscuit', patientNumber: '12', ownerName: '', ownerPhone: '', ownerEmail: '',
  doctor: '', tech: '', date: '2026-11-13', complaint: '', treatmentReport: '', recallDate: '',
  nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
};

beforeEach(() => {
  flags.native = false;
});
beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  installScopeSelectorFallback();
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

describe('PatientForm', () => {
  const renderIt = (onChange = vi.fn(), onSpecies = vi.fn()) =>
    render(<PatientForm patientInfo={patientInfo} species="canine" onPatientInfoChange={onChange} onSpeciesChange={onSpecies} />);

  it('app: inset-grouped label/value rows; same fields and handlers', () => {
    flags.native = true;
    const onChange = vi.fn();
    const onSpecies = vi.fn();
    const { container } = renderIt(onChange, onSpecies);
    expect(container.querySelectorAll('.ios-form__group').length).toBeGreaterThanOrEqual(4);
    const name = screen.getByPlaceholderText('Enter patient name');
    expect(name.closest('.ios-field')).not.toBeNull();
    expect(name.closest('.ios-field')!.querySelector('.ios-field__label')).toHaveTextContent('Patient Name');
    fireEvent.change(name, { target: { value: 'Rex' } });
    expect(onChange).toHaveBeenCalledWith('patientName', 'Rex');
    // Species is a segmented control (radio semantics kept).
    const species = screen.getByRole('radiogroup', { name: 'Species' });
    expect(species).toHaveClass('ios-segmented');
    fireEvent.click(within(species).getByRole('radio', { name: 'Feline' }));
    expect(onSpecies).toHaveBeenCalledWith('feline');
    // No web card grid in the app.
    expect(container.querySelector('.patient-form__row')).toBeNull();
    // Words, not a "+" glyph, on the recheck interval picker.
    expect(screen.getByRole('combobox', { name: /common interval/ }).querySelector('option')!.textContent).toBe('Add interval');
  });

  it('app: no Customize in the section header (it is in the Chart bar\'s More menu)', () => {
    flags.native = true;
    render(<PatientForm patientInfo={patientInfo} species="canine" onPatientInfoChange={vi.fn()} onSpeciesChange={vi.fn()} onCustomize={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull();
  });

  it('website: unchanged markup', () => {
    const { container } = renderIt();
    expect(screen.getByRole('combobox', { name: /common interval/ }).querySelector('option')!.textContent).toBe('+ interval');
    expect(container.querySelector('.ios-form__group')).toBeNull();
    expect(container.querySelectorAll('.patient-form__row').length).toBe(4);
    expect(container.querySelectorAll('.species-tab').length).toBe(4);
    expect(container.querySelector('.patient-form__header .diagram-view__action')).toBeNull();
  });
});

describe('ExamForm', () => {
  const renderIt = (onStatus = vi.fn()) =>
    render(<ExamForm exam={{ ...EMPTY_EXAM_FINDINGS }} onStatusChange={onStatus} onCommentChange={vi.fn()} />);

  it('app: each area is a row with a Normal / Abnormal segmented control', () => {
    flags.native = true;
    const onStatus = vi.fn();
    const { container } = renderIt(onStatus);
    expect(container.querySelector('table.exam-table')).toBeNull();
    const rows = container.querySelectorAll('.ios-form__group .ios-field');
    expect(rows.length).toBeGreaterThan(3);
    const firstRadio = rows[0].querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(firstRadio.length).toBe(2);
    expect(rows[0].querySelector('.ios-segmented')).not.toBeNull();
    fireEvent.click(firstRadio[1]);
    expect(onStatus).toHaveBeenCalledWith(expect.any(String), 'abnormal');
  });

  it('website: the table', () => {
    const { container } = renderIt();
    expect(container.querySelector('table.exam-table')).not.toBeNull();
    expect(container.querySelector('.ios-segmented')).toBeNull();
  });
});

describe('AnesthesiaForm', () => {
  const base = { onNerveBlockChange: () => {}, onDrugsChange: () => {}, logo: 'socal' as const, nerveBlocks: { ...EMPTY_NERVE_BLOCKS } };
  const fields = [{ id: 'c', label: 'IV catheter', type: 'checkbox' as const }];

  it('app: a yes/no field is a switch', () => {
    flags.native = true;
    const onCustomValuesChange = vi.fn();
    render(<AnesthesiaForm {...base} customFieldDefs={fields} onCustomValuesChange={onCustomValuesChange} />);
    const sw = screen.getByRole('switch', { name: 'IV catheter' });
    expect(sw).toHaveClass('ios-switch');
    fireEvent.click(sw);
    expect(onCustomValuesChange).toHaveBeenLastCalledWith({ blocks: [], fields: [{ id: 'c', label: 'IV catheter', type: 'checkbox', value: 'yes' }] });
  });

  it('app: Add anesthetic and Remove use icons, not text glyphs', () => {
    flags.native = true;
    const { container } = render(
      <AnesthesiaForm {...base} nerveBlocks={{ ...EMPTY_NERVE_BLOCKS, drugs: [{ name: 'Lidocaine', concentration: '2' }, { name: 'Bupivacaine', concentration: '0.5' }] }} />
    );
    const remove = screen.getByRole('button', { name: 'Remove Lidocaine' });
    expect(remove.querySelector('[data-icon="xmark"]')).not.toBeNull();
    expect(remove.textContent).toBe('');
    expect(screen.getByRole('button', { name: /Add anesthetic/ }).querySelector('[data-icon="plus"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/×/);
  });

  it('app: short section title that fits on one line', () => {
    flags.native = true;
    render(<AnesthesiaForm {...base} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Nerve blocks$/);
  });

  it('website: checkbox and text glyphs as before', () => {
    render(<AnesthesiaForm {...base} customFieldDefs={fields} nerveBlocks={{ ...EMPTY_NERVE_BLOCKS, drugs: [{ name: 'A', concentration: '' }, { name: 'B', concentration: '' }] }} />);
    expect(screen.getByRole('checkbox', { name: 'IV catheter' })).not.toHaveClass('ios-switch');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove A' }).textContent).toBe('×');
    expect(screen.getByRole('button', { name: /Add anesthetic/ }).textContent).toBe('+ Add anesthetic');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Anesthesia — Nerve Blocks');
  });
});

describe('ImagingSection', () => {
  const renderIt = () => render(<ImagingSection chartId="c1" cloudActive onIncludeInPdfChange={vi.fn()} includeInPdf={false} />);
  it('app: "Add images to the PDF" is a switch', () => {
    flags.native = true;
    renderIt();
    expect(screen.getByRole('switch', { name: /Add images to the PDF/ })).toHaveClass('ios-switch');
  });
  it('website: a checkbox', () => {
    renderIt();
    expect(screen.getByRole('checkbox', { name: /Add images to the PDF/ })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('SurgeryReportForm', () => {
  it('app and website render the same textarea', () => {
    flags.native = true;
    const { unmount } = render(<SurgeryReportForm value="" onChange={vi.fn()} cloudActive={false} />);
    expect(screen.getByRole('textbox', { name: 'Treatment report' })).toBeInTheDocument();
    unmount();
    flags.native = false;
    render(<SurgeryReportForm value="" onChange={vi.fn()} cloudActive={false} />);
    expect(screen.getByRole('textbox', { name: 'Treatment report' })).toBeInTheDocument();
  });
});

describe('DiagramView toolbar', () => {
  const renderIt = () =>
    render(
      <DiagramView
        title="Diagnosis"
        species="canine"
        toothMarks={{}}
        onToothMarksChange={vi.fn()}
        comments={[]}
        onCommentsChange={vi.fn()}
        strokes={[]}
        onStrokesChange={vi.fn()}
      />
    );
  it('app: Undo / Redo are icons', () => {
    flags.native = true;
    renderIt();
    expect(screen.getByRole('button', { name: 'Undo' }).querySelector('[data-icon="arrow-uturn-backward"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Redo' }).querySelector('[data-icon="arrow-uturn-forward"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' }).textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Numbers' })).toBeInTheDocument();
  });
  it('website: Undo / Redo glyphs', () => {
    renderIt();
    expect(screen.getByRole('button', { name: 'Undo' }).textContent).toBe('↶');
    expect(screen.getByRole('button', { name: 'Redo' }).textContent).toBe('↷');
    expect(screen.getByRole('button', { name: '# Numbers' })).toBeInTheDocument();
  });
});

describe('DentalGrid selection tip', () => {
  const renderIt = () =>
    render(<DentalGrid toothData={getInitialToothData('canine')} onToothDataChange={vi.fn()} toothMarks={{}} onToggleMissing={vi.fn()} />);
  it('app: touch wording, no Shift-click', () => {
    flags.native = true;
    const { container } = renderIt();
    expect(container.querySelector('.dental-grid__bulk-hint')).toHaveTextContent('Tip: tap tooth numbers to select several teeth, then set one value on all of them.');
    expect(container.innerHTML).not.toMatch(/Shift-click/);
  });
  it('website: unchanged wording', () => {
    const { container } = renderIt();
    expect(container.querySelector('.dental-grid__bulk-hint')).toHaveTextContent('Tip: click tooth numbers to select several teeth (Shift-click for a range), then set one value on all of them.');
  });
});
