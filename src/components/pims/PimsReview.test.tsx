import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PimsReview } from './PimsReview';
import type { ReviewBackend, ReviewVisit } from '../../utils/pims/review';

const visit: ReviewVisit = { id: 'visit-1', appointment_id: 'appt-1', patient_id: 'patient-1', clinician_id: 'vet-1', encounter_id: null,
  starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T15:30:00Z', version: 3, archived_at: null, archive_kind: null, archive_reason: null };
function setup() {
  const backend: ReviewBackend = {
    connections: vi.fn(async () => [{ id: 'connection-1', provider: 'ezyvet', tenant_id: 'clinic-1', practice_name: 'Clinic', state: 'active' }]),
    page: vi.fn(async () => ({ rows: [visit], next_cursor: null })),
    visit: vi.fn(async () => ({ ...visit, version: 4 })),
    resolve: vi.fn(async () => ({ id: 'issue-1', resolution: 'retain', visit_version: 3 })),
  };
  return backend;
}
beforeEach(() => vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
async function open(backend: ReviewBackend) {
  render(<PimsReview backend={backend} practiceId="practice-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Review PIMS appointments' }));
  await screen.findByText('appt-1');
}
describe('PIMS review', () => {
  it('does not load data until opened and requires a reason and confirmation to archive', async () => {
    const backend = setup();
    render(<PimsReview backend={backend} practiceId="practice-1" />);
    expect(backend.connections).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review PIMS appointments' }));
    await screen.findByText('appt-1');
    expect(backend.connections).toHaveBeenCalledWith('practice-1');
    fireEvent.click(screen.getByRole('button', { name: 'Archive appointment' }));
    expect(backend.visit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm archive' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Duplicate schedule entry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    await waitFor(() => expect(backend.visit).toHaveBeenCalledWith(expect.objectContaining({ connection_id: 'connection-1', visit_id: 'visit-1', expected_version: 3, action: 'archive', reason: 'Duplicate schedule entry', request_id: expect.any(String) })));
  });
  it('offers explicit restore in the archive without clinical deletion', async () => {
    const backend = setup();
    backend.page = vi.fn(async ({ collection }) => ({ rows: collection === 'archived' ? [{ ...visit, archived_at: '2026-11-16T12:00:00Z', archive_kind: 'manual', archive_reason: 'Duplicate' }] : [visit], next_cursor: null }));
    await open(backend);
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore appointment' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Appointment reinstated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    await waitFor(() => expect(backend.visit).toHaveBeenCalledWith(expect.objectContaining({ action: 'restore' })));
    expect(screen.getByText(/Charts, revisions and attachments stay in your clinical library/)).toBeInTheDocument();
  });
  it('displays current and proposed identity and does not offer unsafe acceptance', async () => {
    const backend = setup();
    backend.page = vi.fn(async () => ({ rows: [{ id: 'issue-1', appointment_id: 'appt-1', reason: 'identity_changed', proposed: { ...visit, patient_id: 'another', status: 'active' }, current: visit }], next_cursor: null }));
    await open(backend);
    fireEvent.click(screen.getByRole('button', { name: 'Needs review' }));
    await screen.findByText('another');
    expect(screen.getByText('patient-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept schedule' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep current' }));
    await waitFor(() => expect(backend.resolve).toHaveBeenCalledWith(expect.objectContaining({ issue_id: 'issue-1', action: 'retain', expected_version: 3 })));
  });
  it('does not automatically retry unknown mutations or show raw server messages', async () => {
    const backend = setup();
    backend.visit = vi.fn().mockRejectedValue({ code: 'unknown', message: 'private diagnostics' });
    await open(backend);
    fireEvent.click(screen.getByRole('button', { name: 'Archive appointment' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    await screen.findByRole('alert');
    expect(backend.visit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/private diagnostics/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm archive' })).not.toBeInTheDocument();
  });
  it('does not show a previous practice response after switching practice', async () => {
    const backend = setup();
    let resolve!: (value: Awaited<ReturnType<ReviewBackend['page']>>) => void;
    backend.page = vi.fn(() => new Promise<Awaited<ReturnType<ReviewBackend['page']>>>((done) => { resolve = done; }));
    const view = render(<PimsReview backend={backend} practiceId="old" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review PIMS appointments' }));
    await waitFor(() => expect(backend.page).toHaveBeenCalled());
    view.rerender(<PimsReview backend={backend} practiceId="new" />);
    resolve({ rows: [visit], next_cursor: null });
    await waitFor(() => expect(screen.queryByText('appt-1')).not.toBeInTheDocument());
  });
});
