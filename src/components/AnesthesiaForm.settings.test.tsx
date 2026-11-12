import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AnesthesiaForm } from './AnesthesiaForm';
import { EMPTY_NERVE_BLOCKS } from '../types';

const base = { onNerveBlockChange: () => {}, logo: 'socal' as const };

describe('AnesthesiaForm — chart settings', () => {
  it('shows every block by default', () => {
    render(<AnesthesiaForm {...base} nerveBlocks={{ ...EMPTY_NERVE_BLOCKS }} onDrugsChange={() => {}} />);
    for (const l of ['Infraorbital', 'Caudal Maxillary', 'Inferior Alveolar', 'Mental', 'Other']) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
  });

  it('hides chosen blocks, but never one that holds a dose', () => {
    render(
      <AnesthesiaForm
        {...base}
        nerveBlocks={{ ...EMPTY_NERVE_BLOCKS, mentalLeft: '0.2' }}
        onDrugsChange={() => {}}
        hiddenBlocks={['caudalMaxillary', 'mental', 'other']}
      />,
    );
    expect(screen.queryByText('Caudal Maxillary')).not.toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
    expect(screen.getByText('Mental')).toBeInTheDocument(); // has a dose
    expect(screen.getByText('Infraorbital')).toBeInTheDocument();
  });

  it('offers the usual anesthetic in one tap when none is set', () => {
    const onDrugsChange = vi.fn();
    render(
      <AnesthesiaForm {...base} nerveBlocks={{ ...EMPTY_NERVE_BLOCKS }} onDrugsChange={onDrugsChange}
        usualDrug={{ name: 'Ropivacaine', concentration: '0.75' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use my usual: 0.75% Ropivacaine' }));
    expect(onDrugsChange.mock.calls[0][0]([])).toEqual([{ name: 'Ropivacaine', concentration: '0.75' }]);
  });

  it('no usual button once a drug is charted; Customize opens settings', () => {
    const onCustomize = vi.fn();
    render(
      <AnesthesiaForm {...base} nerveBlocks={{ ...EMPTY_NERVE_BLOCKS, drugs: [{ name: 'Lidocaine', concentration: '2' }] }}
        onDrugsChange={() => {}} usualDrug={{ name: 'Ropivacaine', concentration: '0.75' }} onCustomize={onCustomize} />,
    );
    expect(screen.queryByRole('button', { name: /Use my usual/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(onCustomize).toHaveBeenCalled();
  });
});
