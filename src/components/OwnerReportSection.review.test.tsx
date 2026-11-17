import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { OwnerReportSection } from './OwnerReportSection';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';

it.each([false, true])('allows preview without review for readOnly=%s', (readOnly) => {
  const snapshot = { ...sampleOwnerReportSnapshot(), ownerReport: {} };
  render(<OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={vi.fn()} onPreview={vi.fn()} readOnly={readOnly} />);
  expect(screen.queryByText('Draft — review required')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Confirm review and completion' })).toBeNull();
  expect(screen.getByRole('button', { name: /preview/i })).toBeEnabled();
});
