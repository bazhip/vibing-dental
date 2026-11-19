import { webcrypto } from 'node:crypto';
import { examAttemptKey, openExamOnce, type ExamAttemptStore } from './examAttempts';
import type { PhysicalExamResult } from './types';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const values = new Map<string, unknown>();
  const store: ExamAttemptStore = {
    get: vi.fn(async key => values.get(key)),
    set: vi.fn(async (key, value) => { values.set(key, value); }),
    remove: vi.fn(async key => { values.delete(key); }),
  };
  const execute = vi.fn(async (): Promise<PhysicalExamResult> => ({ ok: false, code: 'physical_exam_outcome_unknown' }));
  return { values, store, execute };
}

it('keys locks by origin and canonical SOAP identifier without storing identifiers', async () => {
  const key = await examAttemptKey('https://app.shepherd.vet', 'ABCD');
  expect(key).toBe(await examAttemptKey('https://app.shepherd.vet', 'abcd'));
  expect(key).not.toBe(await examAttemptKey('https://other.shepherd.vet', 'abcd'));
  expect(key).toMatch(/^pims:exam-attempt:v1:[a-f0-9]{64}$/);
});
it.each(['read', 'write', 'readback'])('never dispatches when durable %s fails', async failure => {
  const { store, execute } = fixture();
  if (failure === 'read') vi.mocked(store.get).mockRejectedValue(new TypeError());
  if (failure === 'write') vi.mocked(store.set).mockRejectedValue(new TypeError());
  if (failure === 'readback') vi.mocked(store.get).mockResolvedValue(undefined);
  expect(await openExamOnce(store, 'key', execute)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
  expect(execute).not.toHaveBeenCalled();
});
it('treats malformed persisted state as a lock rather than overwriting it', async () => {
  const { store, values, execute } = fixture();
  values.set('key', null);
  await openExamOnce(store, 'key', execute);
  expect(execute).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
});
it.each(['patient_changed', 'not_writable', 'physical_exam_template_not_found', 'supervising_doctor_not_set'] as const)('only releases a definite pre-activation %s rejection', async code => {
  const { store, execute, values } = fixture();
  execute.mockResolvedValueOnce({ ok: false, code });
  expect(await openExamOnce(store, 'key', execute)).toEqual({ ok: false, code });
  expect(values.size).toBe(0);
  await openExamOnce(store, 'key', execute);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(values.size).toBe(1);
});
it('retains protection when a storage removal acknowledgement is lost', async () => {
  const { store, execute, values } = fixture();
  execute.mockResolvedValue({ ok: false, code: 'not_writable' });
  vi.mocked(store.remove).mockRejectedValue(new TypeError());
  expect(await openExamOnce(store, 'key', execute)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
  await openExamOnce(store, 'key', execute);
  expect(execute).toHaveBeenCalledOnce();
  expect(values.size).toBe(1);
});
