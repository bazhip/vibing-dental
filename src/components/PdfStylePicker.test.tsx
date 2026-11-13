import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

import { PdfStylePicker } from './PdfStylePicker';
import { PDF_STYLES } from '../utils/pdf/styles';
import pdfuiEn from '../locales/en/pdfui.json';

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

  it('app: the button opens a pull-down menu of presets (checkmark on the current one), not a sheet', () => {
    flags.native = true;
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="iris" onChange={onChange} compact />);
    expect(screen.queryByText('▾')).toBeNull();
    const button = screen.getByRole('button', { name: /Iris/ });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(button);
    expect(screen.getByRole('menu', { name: 'PDF style' })).toBeInTheDocument();
    expect(document.querySelector('.ios-sheet')).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: /Iris/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /Iris/ }).querySelector('.pdf-style-swatch')).not.toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Journal/ }));
    expect(onChange).toHaveBeenLastCalledWith('journal');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('app: Custom Color… opens the system color picker; picking a color applies it', () => {
    flags.native = true;
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="clinic" onChange={onChange} compact />);
    const input = screen.getByLabelText('Choose custom color') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /Clinic Teal/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Custom Color…' }));
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenLastCalledWith('custom:clinic:#ff0000');
  });

  it('every preset has a translated name and description in the pdfui catalog', () => {
    const styles = pdfuiEn.presets as Record<string, { name?: string; description?: string }>;
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
