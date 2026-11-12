import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';

describe('AnesthesiaCustomEditor', () => {
  it('adds a nerve block and saves it when the name box loses focus', () => {
    const onBlocksChange = vi.fn();
    render(<AnesthesiaCustomEditor blocks={[]} fields={[]} onBlocksChange={onBlocksChange} onFieldsChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Add nerve block/ }));
    const name = screen.getByRole('textbox', { name: 'Nerve block 1 name' });
    fireEvent.change(name, { target: { value: 'Major palatine' } });
    expect(onBlocksChange).not.toHaveBeenCalled(); // not on every keystroke
    fireEvent.blur(name);
    expect(onBlocksChange.mock.calls[0][0]).toMatchObject([{ label: 'Major palatine' }]);
  });

  it('adds a number field with a unit, and a pick-list with options', () => {
    const onFieldsChange = vi.fn();
    render(<AnesthesiaCustomEditor blocks={[]} fields={[]} onBlocksChange={() => {}} onFieldsChange={onFieldsChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Add field/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Field 1 name' }), { target: { value: 'ET tube' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Field 1 type' }), { target: { value: 'number' } });
    const unit = screen.getByRole('textbox', { name: 'Field 1 unit' });
    fireEvent.change(unit, { target: { value: 'mm' } });
    fireEvent.blur(unit);
    expect(onFieldsChange.mock.calls.at(-1)![0]).toMatchObject([{ label: 'ET tube', type: 'number', unit: 'mm' }]);

    fireEvent.click(screen.getByRole('button', { name: /Add field/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Field 2 name' }), { target: { value: 'ASA status' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Field 2 type' }), { target: { value: 'select' } });
    const opts = screen.getByRole('textbox', { name: 'Field 2 options' });
    fireEvent.change(opts, { target: { value: 'I, II, III' } });
    fireEvent.blur(opts);
    expect(onFieldsChange.mock.calls.at(-1)![0][1]).toMatchObject({ label: 'ASA status', type: 'select', options: ['I', 'II', 'III'] });
  });

  it('removing a field saves right away', () => {
    const onFieldsChange = vi.fn();
    render(<AnesthesiaCustomEditor blocks={[]} fields={[{ id: 'x', label: 'Fluids', type: 'text' }]} onBlocksChange={() => {}} onFieldsChange={onFieldsChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Fluids' }));
    expect(onFieldsChange).toHaveBeenCalledWith([]);
  });
});
