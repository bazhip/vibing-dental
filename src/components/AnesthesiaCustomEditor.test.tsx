import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AnesthesiaCustomEditor } from './AnesthesiaCustomEditor';

describe('AnesthesiaCustomEditor', () => {
  it('reorders nerve blocks and fields independently and keeps their values and settings', () => {
    const blocks = [{ id: 'a', label: 'Mental' }, { id: 'b', label: 'Major palatine' }];
    const fields = [
      { id: 'x', label: 'Tube', type: 'number', unit: 'mm' },
      { id: 'y', label: 'ASA status', type: 'select', options: ['I', 'II'] },
    ] as const;
    const onBlocksChange = vi.fn();
    const onFieldsChange = vi.fn();
    render(<AnesthesiaCustomEditor blocks={blocks} fields={[{ ...fields[0] }, { ...fields[1], options: [...fields[1].options] }]}
      onBlocksChange={onBlocksChange} onFieldsChange={onFieldsChange} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Mental' }), { key: 'ArrowDown' });
    expect(onBlocksChange).toHaveBeenCalledExactlyOnceWith([blocks[1], blocks[0]]);
    expect(onFieldsChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ASA status' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder ASA status' }), { key: 'ArrowUp' });
    expect(onFieldsChange).toHaveBeenCalledExactlyOnceWith([fields[1], fields[0]]);
    expect(screen.getByRole('textbox', { name: 'Field 1 options' })).toHaveValue('I, II');
  });

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
    expect(screen.queryByRole('button', { name: 'Remove Fluids' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fluids' }));
    expect(screen.getByRole('textbox', { name: 'Field 1 name' })).toHaveValue('Fluids');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Fluids' }));
    expect(onFieldsChange).toHaveBeenCalledWith([]);
    expect(screen.getByRole('button', { name: 'Add field' })).toHaveFocus();
  });
});
