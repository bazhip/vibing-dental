import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const store = vi.hoisted(() => ({
  enabled: true, loaded: true, kinds: [] as string[],
  templates: [{ id: 't1', name: 'Canine full mouth', body: 'Patient: {pet}. Findings: ' }],
  create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock('../hooks/useReportTemplates', () => ({
  useReportTemplates: (_practice: string, kind: string) => { store.kinds.push(kind); return store; },
}));
import { ImagingReportTemplates } from './ImagingReportTemplates';
import { DialogHost } from './ui/dialogs';

beforeEach(() => { vi.clearAllMocks(); store.kinds = []; });

describe('ImagingReportTemplates', () => {
  it.each(['radiology', 'ct'] as const)('loads the %s template list and fills chart codes', async kind => {
    const onApply = vi.fn();
    render(<ImagingReportTemplates kind={kind} value="" chartFields={{ pet: 'Rex' }} onApply={onApply} />);
    expect(store.kinds.every(k => k === kind)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Canine full mouth' }));
    expect(onApply).toHaveBeenCalledWith('Patient: Rex. Findings: ', 't1');
  });

  it('confirms before replacing text, and leaves it alone when declined', async () => {
    const onApply = vi.fn();
    render(<><ImagingReportTemplates kind="ct" value="Existing" onApply={onApply} /><DialogHost /></>);
    await userEvent.click(screen.getByRole('button', { name: 'Canine full mouth' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Replace CT report text?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('does nothing when the active template is chosen again or the visit is read-only', async () => {
    const onApply = vi.fn();
    const { rerender } = render(<ImagingReportTemplates kind="radiology" value="x" templateId="t1" onApply={onApply} />);
    await userEvent.click(screen.getByRole('button', { name: 'Canine full mouth' }));
    rerender(<ImagingReportTemplates kind="radiology" value="" readOnly onApply={onApply} />);
    expect(screen.getByRole('button', { name: 'Canine full mouth' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('opens a report-specific template editor', async () => {
    render(<ImagingReportTemplates kind="ct" value="" onApply={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage templates' }));
    expect(screen.getByRole('dialog', { name: 'CT report templates' })).toBeInTheDocument();
  });
});
