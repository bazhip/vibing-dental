import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PimsDrafts } from './PimsDrafts';
import { PimsReview } from './PimsReview';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it.each([undefined, '', 'false', '1', 'TRUE'])('hides unreleased PIMS features with rollout=%s', (value) => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', value);
  const { container } = render(<><PimsDrafts chartId="chart" backend={null} /><PimsReview practiceId="practice" backend={null} /></>);
  expect(container).toBeEmptyDOMElement();
});

it('exposes manual preparation and review only with explicit opt-in', () => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  render(<><PimsDrafts chartId="chart" backend={null} /><PimsReview practiceId="practice" backend={null} /></>);
  expect(screen.getByRole('button', { name: 'Prepare history or radiology notes' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review PIMS appointments' })).toBeInTheDocument();
});
