import { vi, beforeEach, expect, it } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabaseClient', () => ({ supabase: { rpc } }));
import { reservePatientNumber } from './patientNumberAllocation';
beforeEach(() => { rpc.mockReset(); });
it('shares an in-flight reservation for the same patient and practice', async () => {
  let finish!: (value: unknown) => void;
  rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = reservePatientNumber('patient-1', 'practice-1');
  const second = reservePatientNumber('patient-1', 'practice-1');
  expect(first).toBe(second);
  finish({ data: '1001', error: null });
  expect(await first).toBe('1001');
  expect(rpc).toHaveBeenCalledWith('reserve_patient_number', { p_patient_id: 'patient-1', p_practice_id: 'practice-1' });
});
it('allows retry after failure without inventing a local patient number', async () => {
  rpc.mockResolvedValueOnce({ error: { message: 'offline' }, data: null }).mockResolvedValueOnce({ error: null, data: '1002' });
  await expect(reservePatientNumber('patient-2', '')).rejects.toThrow();
  expect(await reservePatientNumber('patient-2', '')).toBe('1002');
});
