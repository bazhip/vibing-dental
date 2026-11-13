import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PdfStylePicker } from './PdfStylePicker';

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

  it('custom colors keep the layout of the preset they were picked on', () => {
    const onChange = vi.fn();
    render(<PdfStylePicker styleId="custom:journal:#123456" onChange={onChange} compact={false} />);
    expect(screen.getByRole('radio', { name: /Custom color/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Choose custom color'), { target: { value: '#00aa00' } });
    expect(onChange).toHaveBeenLastCalledWith('custom:journal:#00aa00');
  });
});
