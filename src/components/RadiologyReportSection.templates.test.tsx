import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';

vi.mock('../hooks/useReportTemplates', () => ({
  useReportTemplates: () => ({ enabled: true, loaded: true, create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    templates: [{ id: 't1', name: 'Full mouth', body: 'Patient {pet}: ' }] }),
}));
vi.mock('../utils/supabaseClient', () => ({ cloudEnabled: true, supabase: null }));
import { RadiologyReportSection } from './RadiologyReportSection';

afterEach(cleanup);

it.each([
  ['radiology', { radiologyReport: 'Patient Rex: ', radiologyReportTemplateId: 't1', radiologyReviewedBasis: '' }],
  ['ct', { ctReport: 'Patient Rex: ', ctReportTemplateId: 't1', ctReviewedBasis: '' }],
] as const)('applies a saved template to the %s report using that report’s own fields', async (kind, expected) => {
  const onChange = vi.fn();
  render(<RadiologyReportSection chartEditor reportKind={kind} snapshot={sampleOwnerReportSnapshot()} onChange={onChange}
    templates={{ chartFields: { pet: 'Rex' } }} />);
  await userEvent.click(screen.getByRole('button', { name: 'Full mouth' }));
  expect(onChange).toHaveBeenCalledWith(expected);
});

it('shows no template controls outside the chart editor or without the templates prop', () => {
  const { rerender } = render(<RadiologyReportSection snapshot={sampleOwnerReportSnapshot()} onChange={vi.fn()} templates={{}} />);
  expect(screen.queryByRole('button', { name: 'Manage templates' })).toBeNull();
  rerender(<RadiologyReportSection chartEditor snapshot={sampleOwnerReportSnapshot()} onChange={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Manage templates' })).toBeNull();
});
