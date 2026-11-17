import { describe, expect, it, vi } from 'vitest';
import { canAcceptSchedule, createReviewBackend, reviewError } from './review';
import type { ReviewIssue, ReviewVisit } from './review';

const visit: ReviewVisit = { id: 'visit', appointment_id: 'appointment', patient_id: 'patient', clinician_id: 'clinician', encounter_id: null,
  starts_at: '2026-11-16T15:00:00Z', ends_at: '2026-11-16T16:00:00Z', version: 1, archived_at: null, archive_kind: null, archive_reason: null };
const issue: ReviewIssue = { id: 'issue', appointment_id: 'appointment', reason: 'visit_version', current: visit, proposed: { ...visit, status: 'active' } };
function transport(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, backend: createReviewBackend({ rpc }) };
}
describe('PIMS review transport', () => {
  it('passes practice scope and keyset pagination without substituting identities', async () => {
    const { rpc, backend } = transport([]);
    await backend.connections('practice');
    expect(rpc).toHaveBeenCalledWith('pims_review_connections', { payload: { practice_id: 'practice' } });
    rpc.mockResolvedValue({ data: { rows: [visit], next_cursor: 'cursor' }, error: null });
    expect(await backend.page({ connection_id: 'connection', collection: 'archived', cursor: 'before' })).toEqual({ rows: [visit], next_cursor: 'cursor' });
    expect(rpc).toHaveBeenLastCalledWith('pims_review_page', { payload: { connection_id: 'connection', collection: 'archived', cursor: 'before' } });
  });
  it.each([null, { rows: null, next_cursor: null }, { rows: [visit], next_cursor: 42 }, { rows: [{ ...visit, version: 0 }], next_cursor: null }, { rows: Array(51).fill(visit), next_cursor: null }])('rejects malformed pages %j', async (data) => {
    await expect(transport(data).backend.page({ connection_id: 'connection', collection: 'active' })).rejects.toEqual({ code: 'unknown' });
  });
  it('rejects mismatched mutation receipts without retrying', async () => {
    const { rpc, backend } = transport({ id: 'different', version: 2 });
    await expect(backend.visit({ connection_id: 'connection', visit_id: 'visit', expected_version: 1, request_id: 'request', action: 'archive', reason: 'Confirmed' })).rejects.toEqual({ code: 'unknown' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{ code: 'PGRST202' }, 'schema'], [{ code: '42883' }, 'schema'],
    [{ message: 'pims_forbidden' }, 'forbidden'], [{ message: 'pims_conflict' }, 'conflict'], [{ message: 'sensitive backend detail' }, 'unknown'],
  ] as const)('exposes only bounded error categories %j', async (error, category) => {
    try { await transport(null, error).backend.connections(); } catch (cause) {
      expect(reviewError(cause)).toBe(category);
      expect(JSON.stringify(cause)).not.toContain('sensitive backend detail');
      return;
    }
    expect.unreachable();
  });
});
describe('schedule review eligibility', () => {
  it('preserves unknown end times but rejects absent or invalid values', () => {
    expect(canAcceptSchedule({ ...issue, proposed: { ...issue.proposed, ends_at: null } })).toBe(true);
    expect(canAcceptSchedule({ ...issue, proposed: { ...issue.proposed, ends_at: undefined } })).toBe(false);
    expect(canAcceptSchedule({ ...issue, proposed: { ...issue.proposed, ends_at: 'invalid' } })).toBe(false);
  });
  it('allows matching schedule proposals only', () => {
    expect(canAcceptSchedule(issue)).toBe(true);
    expect(canAcceptSchedule({ ...issue, proposed: { ...issue.proposed, appointment_id: 'different' } })).toBe(false);
    expect(canAcceptSchedule({ ...issue, current: { ...visit, archived_at: visit.starts_at } })).toBe(false);
    expect(canAcceptSchedule({ ...issue, proposed: { ...issue.proposed, patient_id: 'different' } })).toBe(false);
  });
});
