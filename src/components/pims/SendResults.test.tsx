import { cleanup, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { SendResults } from './SendResults';

afterEach(cleanup);

describe('transfer results', () => {
  it('counts only confirmed saves and focuses the completion heading', () => {
    render(<SendResults rows={[
      { fieldTitle: 'Plan', code: null },
      { fieldTitle: 'Assessment', code: 'save_not_confirmed' },
      { fieldTitle: 'History', code: 'field_not_found' },
    ]} stampFailed={false} sentOn={null} onCopyDiagnostic={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved fields: 1 · Need attention: 2');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('heading', { name: 'Results' })).toHaveFocus();
    expect(screen.getAllByText('Saved in PIMS')).toHaveLength(1);
    expect(screen.getByText(/PIMS didn’t confirm the save/)).toBeInTheDocument();
  });

  it('does not report a save when every field failed', () => {
    render(<SendResults rows={[{ fieldTitle: 'Plan', code: 'extension_error' }]}
      stampFailed={false} sentOn={null} onCopyDiagnostic={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved fields: 0 · Need attention: 1');
    expect(screen.queryByText('Saved in PIMS')).not.toBeInTheDocument();
  });

  it('separates a successful field save from a failed chart date stamp', () => {
    render(<SendResults rows={[{ fieldTitle: 'Plan', code: null }]}
      stampFailed sentOn={null} onCopyDiagnostic={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved fields: 1 · Need attention: 0');
    expect(screen.getByRole('alert')).toHaveTextContent('couldn’t record the send date');
  });
});
