import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AnesthesiaForm } from './AnesthesiaForm';
import { EMPTY_NERVE_BLOCKS } from '../types';

const base = { onNerveBlockChange: () => {}, onDrugsChange: () => {}, logo: 'socal' as const, nerveBlocks: { ...EMPTY_NERVE_BLOCKS } };

describe('AnesthesiaForm — custom blocks and fields', () => {
  it('adds your blocks as rows and saves doses with their label', () => {
    const onCustomValuesChange = vi.fn();
    render(<AnesthesiaForm {...base} customBlockDefs={[{ id: 'b1', label: 'Major palatine' }]} onCustomValuesChange={onCustomValuesChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Major palatine right (mL)' }), { target: { value: '0.2' } });
    expect(onCustomValuesChange).toHaveBeenCalledWith({ blocks: [{ id: 'b1', label: 'Major palatine', right: '0.2', left: '' }], fields: [] });
  });

  it('renders each field type', () => {
    const onCustomValuesChange = vi.fn();
    render(
      <AnesthesiaForm
        {...base}
        customFieldDefs={[
          { id: 't', label: 'Premedication', type: 'text' },
          { id: 'n', label: 'ET tube', type: 'number', unit: 'mm' },
          { id: 'c', label: 'IV catheter', type: 'checkbox' },
          { id: 's', label: 'ASA status', type: 'select', options: ['I', 'II'] },
        ]}
        onCustomValuesChange={onCustomValuesChange}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Anesthesia record' })).toBeInTheDocument();
    expect(screen.getByText('mm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'IV catheter' }));
    expect(onCustomValuesChange).toHaveBeenLastCalledWith({ blocks: [], fields: [{ id: 'c', label: 'IV catheter', type: 'checkbox', value: 'yes' }] });
    fireEvent.change(screen.getByRole('combobox', { name: 'ASA status' }), { target: { value: 'II' } });
    expect(onCustomValuesChange.mock.calls.at(-1)![0].fields[0]).toMatchObject({ id: 's', value: 'II' });
  });

  it("shows values a colleague charted, even without their field set up", () => {
    render(
      <AnesthesiaForm
        {...base}
        customValues={{ blocks: [], fields: [{ id: 'x', label: 'Fluids', type: 'text', value: 'LRS 5 mL/kg/h' }] }}
      />,
    );
    expect(screen.getByDisplayValue('LRS 5 mL/kg/h')).toBeInTheDocument();
  });
});
