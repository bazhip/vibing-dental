import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

import { PdfStylePicker } from './PdfStylePicker';
import { PDF_STYLES } from '../utils/pdf/styles';
import chartEn from '../locales/en/chart.json';

beforeEach(() => { flags.native = false; });

describe('PdfStylePicker', () => {
  it('lists presets plus a custom color on wide screens', () => {
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="clinic" onChange={onChange} compact={false} />);
    expect(screen.getByRole('radio', { name: /^Clinic Teal/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /Slate/ }));
    expect(onChange).toHaveBeenLastCalledWith('slate');
    fireEvent.change(screen.getByLabelText('Choose custom color'), { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenLastCalledWith('custom:clinic:#ff0000');
  });

  it('collapses to a button that opens a sheet on phones', () => {
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="iris" onChange={onChange} compact />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    expect(screen.getByRole('dialog', { name: 'PDF style' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^Journal/ }));
    expect(onChange).toHaveBeenLastCalledWith('journal');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'PDF style' })).toBeNull();
  });

  it('website phone sheet keeps its own markup (no iOS sheet)', () => {
    render(<PdfStylePicker styleId="iris" onChange={() => {}} compact />);
    expect(screen.getByText('▾')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    expect(document.querySelector('.pdf-style-sheet-backdrop .pdf-style-sheet')).not.toBeNull();
    expect(document.querySelector('.ios-sheet')).toBeNull();
  });

  it('app: the picker is a kit sheet (grabber, Done) and the button has an icon, not a ▾ glyph', async () => {
    flags.native = true;
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="iris" onChange={onChange} compact />);
    expect(screen.queryByText('▾')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }));
    const sheet = screen.getByRole('dialog', { name: 'PDF style' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(document.querySelector('.pdf-style-sheet-backdrop')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /^Journal/ }));
    expect(onChange).toHaveBeenLastCalledWith('journal');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'PDF style' })).toBeNull());
  });

  it('every preset has a translated name and description in the chart catalog', () => {
    const styles = chartEn.pdfStyle.styles as Record<string, { name?: string; description?: string }>;
    for (const s of PDF_STYLES) {
      expect(styles[s.id]?.name, s.id).toBeTruthy();
      expect(styles[s.id]?.description, s.id).toBeTruthy();
    }
  });

  it('custom colors keep the layout of the preset they were picked on', () => {
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="custom:journal:#123456" onChange={onChange} compact={false} />);
    expect(screen.getByRole('radio', { name: /Custom color/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Choose custom color'), { target: { value: '#00aa00' } });
    expect(onChange).toHaveBeenLastCalledWith('custom:journal:#00aa00');
  });
});
